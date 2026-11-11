import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { AudioFile, AudioClip, Track, TrackClip, PlaybackState } from './types';
import { History, Snapshot, snapshotsDiffer } from './utils/undoRedo';
import { getTrackClipDuration, getTrackClipEnd, spansOverlap } from './utils/clipTiming';
import {
  TrackClipMove,
  TrackClipPatch,
  TrackClipRef,
  findTrackClip,
  getGroupRefs,
  getLinkedRefs,
  removeTrackClips,
} from './utils/clipLinks';

interface AppState {
  // Audio files
  audioFiles: AudioFile[];
  addAudioFile: (file: AudioFile) => void;
  /** Remove an audio file, the clips made from it, and their track clips. */
  removeAudioFile: (id: string) => void;

  // Clips
  clips: AudioClip[];
  addClip: (clip: AudioClip) => void;
  /** Remove a library clip, and every track clip that places it. */
  removeClip: (id: string) => void;
  updateClip: (id: string, updates: Partial<AudioClip>) => void;

  // Tracks
  tracks: Track[];
  addTrack: () => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  addClipToTrack: (trackId: string, clipId: string, position: number) => void;
  updateTrackClip: (trackId: string, trackClipId: string, updates: Partial<TrackClip>) => void;
  /**
   * Carry a clip to another track. Refused silently when it would overlap
   * there: a drag calls this on every mouse move.
   */
  moveClipBetweenTracks: (sourceTrackId: string, targetTrackId: string, trackClipId: string, position: number) => void;

  // Linked clips
  /** Put every given clip in one group, merging any groups they already had. */
  linkTrackClips: (refs: TrackClipRef[]) => void;
  /** Take the given clips out of their groups, dissolving any left with one member. */
  unlinkTrackClips: (refs: TrackClipRef[]) => void;
  /** Remove a clip and, if it is linked, the rest of its group with it. */
  removeTrackClipGroup: (trackId: string, trackClipId: string) => void;
  /** Apply one edit to each of several clips. */
  applyTrackClipPatches: (patches: TrackClipPatch[]) => void;
  /** Move several clips at once, across tracks if need be. */
  applyTrackClipMoves: (moves: TrackClipMove[]) => void;

  // Playback
  playbackState: PlaybackState;
  setPlaybackState: (state: Partial<PlaybackState>) => void;

  // Selected clip for editing
  selectedClipId: string | null;
  setSelectedClip: (id: string | null) => void;

  // Selected track clip for properties panel: the last one clicked.
  selectedTrackClip: { trackId: string; trackClipId: string } | null;
  setSelectedTrackClip: (selection: { trackId: string; trackClipId: string } | null) => void;
  /**
   * Everything currently selected, in click order. selectedTrackClip is the
   * last of these; the panel still works off that one, and only linking reads
   * the whole list.
   */
  selectedTrackClips: TrackClipRef[];
  /** Add to or remove from the selection, as ctrl/cmd-click does. */
  toggleTrackClipSelection: (ref: TrackClipRef) => void;

  // Audio context
  audioContext: AudioContext | null;
  /**
   * The app's one audio context, made on first use. Everything that decodes
   * or plays goes through it: each context holds on to an audio device, and
   * browsers limit how many may be open.
   */
  ensureAudioContext: () => AudioContext;

  // Timeline zoom
  pixelsPerSecond: number;
  setPixelsPerSecond: (pps: number) => void;

  // Snapping (see utils/snapping.ts). The setting is remembered per browser.
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  /** Where a drag has just snapped to, for the guide line; null when it has not. */
  snapGuide: number | null;
  setSnapGuide: (time: number | null) => void;

  // Undo/Redo - see utils/undoRedo.ts and the `history` export below
  undo: () => void;
  redo: () => void;
  /** Whether undo/redo is possible, mirrored from the history so buttons re-render. */
  undoAvailable: boolean;
  redoAvailable: boolean;

  // Project management
  projectName: string;
  setProjectName: (name: string) => void;
  loadProjectState: (
    tracks: Track[],
    clips: AudioClip[],
    audioFiles: AudioFile[],
    pixelsPerSecond: number,
    projectName: string
  ) => void;
  clearProject: () => void;

  // Toast notifications
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
  removeToast: (id: string) => void;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration: number;
}

let nextTrackId = 1;
let nextTrackClipId = 1;
let nextLinkId = 0;

const SNAP_PREFERENCE_KEY = 'massembler.snap';

function readSnapPreference(): boolean {
  try {
    return localStorage.getItem(SNAP_PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

// Helper function to check if a clip overlaps with existing clips on a track
function checkOverlap(
  track: Track,
  newPosition: number,
  newDuration: number,
  excludeClipId?: string
): boolean {
  const newStart = newPosition;
  const newEnd = newPosition + newDuration;

  return track.clips.some((trackClip) => {
    if (excludeClipId && trackClip.id === excludeClipId) {
      return false; // Skip the clip being moved/resized
    }

    // Get the clip to find its duration
    const state = useStore.getState();
    const clip = state.clips.find((c) => c.id === trackClip.clipId);
    if (!clip) return false;

    return spansOverlap(newStart, newEnd, trackClip.position, getTrackClipEnd(trackClip, clip));
  });
}

export const useStore = create<AppState>((set, get) => ({
  audioFiles: [],
  addAudioFile: (file) =>
    set((state) => ({ audioFiles: [...state.audioFiles, file] })),
  removeAudioFile: (id) => {
    const state = get();
    if (!state.audioFiles.some((f) => f.id === id)) return;

    // Its clips, and their track clips, would be left pointing at nothing.
    const doomedClips = new Set(state.clips.filter((c) => c.audioFileId === id).map((c) => c.id));
    set({
      audioFiles: state.audioFiles.filter((f) => f.id !== id),
      clips: doomedClips.size ? state.clips.filter((c) => !doomedClips.has(c.id)) : state.clips,
      tracks: removeTrackClips(state.tracks, (tc) => doomedClips.has(tc.clipId)),
    });
  },

  clips: [],
  addClip: (clip) =>
    set((state) => ({ clips: [...state.clips, clip] })),
  removeClip: (id) => {
    const state = get();
    if (!state.clips.some((c) => c.id === id)) return;

    set({
      clips: state.clips.filter((c) => c.id !== id),
      // Its track clips go with it; left behind they would be invisible and silent.
      tracks: removeTrackClips(state.tracks, (tc) => tc.clipId === id),
    });
  },
  updateClip: (id, updates) =>
    set((state) => ({
      clips: state.clips.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  tracks: [
    {
      id: 'track-1',
      name: 'Track 1',
      clips: [],
      volume: 0.8,
      muted: false,
    },
  ],
  addTrack: () =>
    set((state) => ({
      tracks: [
        ...state.tracks,
        {
          id: `track-${++nextTrackId}`,
          name: `Track ${nextTrackId}`,
          clips: [],
          volume: 0.8,
          muted: false,
        },
      ],
    })),
  removeTrack: (id) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== id),
    })),
  updateTrack: (id, updates) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  addClipToTrack: (trackId, clipId, position) => {
    const state = get();
    const track = state.tracks.find((t) => t.id === trackId);
    const clip = state.clips.find((c) => c.id === clipId);

    if (!track || !clip) return;

    // Check for overlap
    if (checkOverlap(track, position, clip.duration)) {
      state.showToast('Cannot place clip here - it would overlap with another clip', 'error');
      return;
    }

    const newTrackClip: TrackClip = {
      id: `tc-${++nextTrackClipId}`,
      clipId,
      position,
      repeat: false,
    };

    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, newTrackClip] } : t
      ),
    }));
  },
  updateTrackClip: (trackId, trackClipId, updates) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              clips: t.clips.map((s) =>
                s.id === trackClipId ? { ...s, ...updates } : s
              ),
            }
          : t
      ),
    })),

  linkTrackClips: (refs) => {
    if (refs.length < 2) return;

    const state = get();

    // Linking a clip that is already in a group brings its whole group along,
    // rather than quietly tearing it in half.
    const members = new Map<string, TrackClipRef>();
    for (const ref of refs) {
      const trackClip = findTrackClip(state.tracks, ref);
      if (!trackClip) continue;
      const group = trackClip.linkId
        ? getGroupRefs(state.tracks, trackClip.linkId)
        : [ref];
      for (const member of group) members.set(member.trackClipId, member);
    }

    if (members.size < 2) return;

    const linkId = `link-${++nextLinkId}`;
    state.applyTrackClipPatches(
      [...members.values()].map((ref) => ({ ...ref, updates: { linkId } }))
    );
  },
  unlinkTrackClips: (refs) => {
    const state = get();
    const patches = new Map<string, TrackClipPatch>();

    for (const ref of refs) {
      const trackClip = findTrackClip(state.tracks, ref);
      if (!trackClip?.linkId) continue;

      patches.set(ref.trackClipId, { ...ref, updates: { linkId: undefined } });

      // A group of one is no group at all.
      const remaining = getGroupRefs(state.tracks, trackClip.linkId).filter(
        (member) =>
          !refs.some((r) => r.trackClipId === member.trackClipId) &&
          !patches.has(member.trackClipId)
      );
      if (remaining.length === 1) {
        patches.set(remaining[0].trackClipId, {
          ...remaining[0],
          updates: { linkId: undefined },
        });
      }
    }

    if (patches.size > 0) state.applyTrackClipPatches([...patches.values()]);
  },
  removeTrackClipGroup: (trackId, trackClipId) => {
    const { tracks } = get();
    const group = getLinkedRefs(tracks, { trackId, trackClipId });
    const doomed = new Set(
      group.length > 0 ? group.map((ref) => ref.trackClipId) : [trackClipId]
    );

    set({ tracks: removeTrackClips(tracks, (tc) => doomed.has(tc.id)) });
  },
  applyTrackClipPatches: (patches) => {
    if (patches.length === 0) return;

    set((state) => ({
      tracks: state.tracks.map((t) => {
        const mine = patches.filter((p) => p.trackId === t.id);
        if (mine.length === 0) return t;

        return {
          ...t,
          clips: t.clips.map((tc) => {
            const patch = mine.find((p) => p.trackClipId === tc.id);
            return patch ? { ...tc, ...patch.updates } : tc;
          }),
        };
      }),
    }));
  },
  applyTrackClipMoves: (moves) => {
    if (moves.length === 0) return;

    set((state) => {
      // Lift every mover out first, so clips swapping tracks do not collide
      // with the slots each other are leaving.
      const lifted = new Map<string, TrackClip>();
      for (const move of moves) {
        const trackClip = findTrackClip(state.tracks, move);
        if (trackClip) lifted.set(move.trackClipId, trackClip);
      }

      return {
        tracks: state.tracks.map((t) => {
          const arriving = moves.filter(
            (m) => m.targetTrackId === t.id && lifted.has(m.trackClipId)
          );

          const kept = t.clips.filter((tc) => !lifted.has(tc.id));
          if (arriving.length === 0) {
            return kept.length === t.clips.length ? t : { ...t, clips: kept };
          }

          return {
            ...t,
            clips: [
              ...kept,
              ...arriving.map((m) => ({
                ...(lifted.get(m.trackClipId) as TrackClip),
                position: m.position,
              })),
            ],
          };
        }),
      };
    });
  },
  moveClipBetweenTracks: (sourceTrackId, targetTrackId, trackClipId, position) => {
    const state = get();
    const sourceTrack = state.tracks.find((t) => t.id === sourceTrackId);
    const targetTrack = state.tracks.find((t) => t.id === targetTrackId);
    const trackClip = sourceTrack?.clips.find((tc) => tc.id === trackClipId);
    if (!trackClip || !targetTrack) return;

    const clip = state.clips.find((c) => c.id === trackClip.clipId);
    if (!clip) return;

    // What it occupies on the timeline, repetitions included: the same
    // measure the existing clips are compared against.
    const occupied = getTrackClipDuration(trackClip, clip);
    if (checkOverlap(targetTrack, position, occupied, trackClipId)) return;

    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id === sourceTrackId) {
          return { ...t, clips: t.clips.filter((tc) => tc.id !== trackClipId) };
        }
        if (t.id === targetTrackId) {
          return { ...t, clips: [...t.clips, { ...trackClip, position }] };
        }
        return t;
      }),
    }));
  },

  playbackState: {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  },
  setPlaybackState: (state) =>
    set((prev) => ({
      playbackState: { ...prev.playbackState, ...state },
    })),

  selectedClipId: null,
  setSelectedClip: (id) => set({ selectedClipId: id }),

  selectedTrackClip: null,
  setSelectedTrackClip: (selection) =>
    set({
      selectedTrackClip: selection,
      selectedTrackClips: selection ? [selection] : [],
    }),

  selectedTrackClips: [],
  toggleTrackClipSelection: (ref) =>
    set((state) => {
      const without = state.selectedTrackClips.filter(
        (s) => s.trackClipId !== ref.trackClipId
      );
      const selected =
        without.length === state.selectedTrackClips.length
          ? [...without, ref]
          : without;

      return {
        selectedTrackClips: selected,
        selectedTrackClip: selected[selected.length - 1] ?? null,
      };
    }),

  audioContext: null,
  ensureAudioContext: () => {
    let ctx = get().audioContext;
    if (!ctx) {
      ctx = new AudioContext();
      set({ audioContext: ctx });
    }
    return ctx;
  },

  pixelsPerSecond: 50,
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: pps }),

  snapEnabled: readSnapPreference(),
  setSnapEnabled: (enabled) => {
    try {
      localStorage.setItem(SNAP_PREFERENCE_KEY, enabled ? 'on' : 'off');
    } catch {
      // storage unavailable: the setting just lasts for this visit
    }
    set({ snapEnabled: enabled });
  },
  snapGuide: null,
  setSnapGuide: (time) => {
    if (get().snapGuide !== time) set({ snapGuide: time });
  },

  undo: () => history.undo(),
  redo: () => history.redo(),
  undoAvailable: false,
  redoAvailable: false,

  // Project management
  projectName: 'Untitled Project',
  setProjectName: (name) => set({ projectName: name }),
  loadProjectState: (loadedTracks, clips, audioFiles, pixelsPerSecond, projectName) => {
    // Earlier builds left a deleted clip's track clips behind.
    const clipIds = new Set(clips.map((c) => c.id));
    const tracks = removeTrackClips(loadedTracks, (tc) => !clipIds.has(tc.clipId));

    // Update ID counters to prevent collisions
    tracks.forEach((track) => {
      const trackIdNum = parseInt(track.id.replace('track-', ''));
      if (!isNaN(trackIdNum) && trackIdNum >= nextTrackId) {
        nextTrackId = trackIdNum + 1;
      }
      track.clips.forEach((tc) => {
        const tcIdNum = parseInt(tc.id.replace('tc-', ''));
        if (!isNaN(tcIdNum) && tcIdNum >= nextTrackClipId) {
          nextTrackClipId = tcIdNum + 1;
        }
        if (tc.linkId) {
          const linkIdNum = parseInt(tc.linkId.replace('link-', ''));
          if (!isNaN(linkIdNum) && linkIdNum > nextLinkId) {
            nextLinkId = linkIdNum;
          }
        }
      });
    });

    set({
      tracks,
      clips,
      audioFiles,
      pixelsPerSecond,
      projectName,
      // Ids are reused across projects, so a leftover selection would point
      // at whatever clip inherits its id here.
      selectedTrackClip: null,
      selectedTrackClips: [],
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      },
    });

    // History belongs to the project that was open: undoing into it would
    // put the old arrangement back over the new project's audio.
    history.clear();
  },
  clearProject: () => {
    set({
      tracks: [],
      clips: [],
      audioFiles: [],
      projectName: 'Untitled Project',
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      },
      selectedClipId: null,
      selectedTrackClip: null,
      selectedTrackClips: [],
    });

    history.clear();
  },

  // Toast notifications
  toasts: [],
  showToast: (message, type = 'info', duration = 3000) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id: `toast-${Date.now()}-${Math.random()}`,
          message,
          type,
          duration,
        },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

/**
 * Subscribe a component to just these fields of the store: it re-renders only
 * when one of them changes. Reading the whole store instead (`useStore()`)
 * re-renders on every change - 60 times a second while the playhead moves.
 */
export function useStoreFields<K extends keyof AppState>(...keys: K[]): Pick<AppState, K> {
  return useStore(
    useShallow((state) => {
      const picked = {} as Pick<AppState, K>;
      for (const key of keys) picked[key] = state[key];
      return picked;
    })
  );
}

/**
 * The undo history. Every change to tracks, clips or audio files is recorded
 * through the subscription below; components group a drag into one entry with
 * beginGesture/endGesture, and a burst of edits to one control with coalesced.
 */
const snapshotOf = ({ tracks, clips, audioFiles }: AppState): Snapshot => ({
  tracks,
  clips,
  audioFiles,
});

export const history = new History(
  () => snapshotOf(useStore.getState()),
  (snapshot) => useStore.setState(snapshot)
);

useStore.subscribe((state, previous) => {
  if (snapshotsDiffer(snapshotOf(state), snapshotOf(previous))) {
    history.record(snapshotOf(previous));
  }
});

// Queued as a microtask because changes are recorded from inside a set(),
// and updating the store again mid-update is asking for trouble.
history.onChange = () => {
  queueMicrotask(() => {
    useStore.setState({
      undoAvailable: history.canUndo(),
      redoAvailable: history.canRedo(),
    });
  });
};
