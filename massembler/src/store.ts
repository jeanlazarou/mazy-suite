import { create } from 'zustand';
import { AudioFile, AudioClip, Track, TrackClip, PlaybackState } from './types';
import { UndoAction, UndoRedoManager, batchActions } from './utils/undoRedo';
import { getTrackClipDuration, getTrackClipEnd } from './utils/clipTiming';
import {
  TrackClipMove,
  TrackClipPatch,
  TrackClipRef,
  findTrackClip,
  getGroupRefs,
  getLinkedRefs,
} from './utils/clipLinks';

interface AppState {
  // Audio files
  audioFiles: AudioFile[];
  addAudioFile: (file: AudioFile) => void;
  removeAudioFile: (id: string) => void;

  // Clips
  clips: AudioClip[];
  addClip: (clip: AudioClip) => void;
  removeClip: (id: string, addToHistory?: boolean) => void;
  updateClip: (id: string, updates: Partial<AudioClip>) => void;

  // Tracks
  tracks: Track[];
  addTrack: () => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  addClipToTrack: (trackId: string, clipId: string, position: number) => void;
  removeClipFromTrack: (trackId: string, trackClipId: string, addToHistory?: boolean) => void;
  updateTrackClip: (trackId: string, trackClipId: string, updates: Partial<TrackClip>, addToHistory?: boolean) => void;
  moveTrackClip: (trackId: string, trackClipId: string, oldPosition: number, newPosition: number) => void;
  moveClipBetweenTracks: (sourceTrackId: string, targetTrackId: string, trackClipId: string, position: number, addToHistory?: boolean) => void;
  /**
   * Record a completed cross-track drag in the undo history. The clip has
   * already been moved; this only files the action, mirroring moveTrackClip.
   */
  recordClipMovedBetweenTracks: (sourceTrackId: string, targetTrackId: string, trackClipId: string, oldPosition: number, newPosition: number) => void;

  // Linked clips
  /** Put every given clip in one group, merging any groups they already had. */
  linkTrackClips: (refs: TrackClipRef[]) => void;
  /** Take the given clips out of their groups, dissolving any left with one member. */
  unlinkTrackClips: (refs: TrackClipRef[]) => void;
  /** Remove a clip and, if it is linked, the rest of its group with it. */
  removeTrackClipGroup: (trackId: string, trackClipId: string) => void;
  /** Apply one edit to each of several clips, as a single change. */
  applyTrackClipPatches: (patches: TrackClipPatch[], addToHistory?: boolean) => void;
  /** Move several clips at once, across tracks if need be, as a single change. */
  applyTrackClipMoves: (moves: TrackClipMove[], addToHistory?: boolean) => void;

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
  setAudioContext: (ctx: AudioContext) => void;

  // Timeline zoom
  pixelsPerSecond: number;
  setPixelsPerSecond: (pps: number) => void;

  // Undo/Redo
  undoManager: UndoRedoManager;
  undo: () => void;
  redo: () => void;
  /**
   * Apply one recorded action. Called by undo/redo, and by themselves for the
   * members of a BATCH - the entry a linked gesture files.
   */
  applyUndoAction: (action: UndoAction) => void;
  applyRedoAction: (action: UndoAction) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /**
   * Whether anything is on the stacks, mirrored into the store.
   *
   * canUndo/canRedo read stacks held outside it, so calling them during
   * render gives an answer nothing re-renders on. Anything displaying
   * availability should read these instead.
   */
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

const undoManager = new UndoRedoManager();

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

    const existingStart = trackClip.position;
    const existingEnd = getTrackClipEnd(trackClip, clip);

    // Check if ranges overlap
    return newStart < existingEnd && newEnd > existingStart;
  });
}

export const useStore = create<AppState>((set, get) => ({
  audioFiles: [],
  addAudioFile: (file) =>
    set((state) => ({ audioFiles: [...state.audioFiles, file] })),
  removeAudioFile: (id) =>
    set((state) => ({
      audioFiles: state.audioFiles.filter((f) => f.id !== id),
    })),

  clips: [],
  addClip: (clip) =>
    set((state) => ({ clips: [...state.clips, clip] })),
  removeClip: (id, addToHistory = true) =>
    set((state) => {
      const clip = state.clips.find((s) => s.id === id);
      if (clip && addToHistory) {
        undoManager.addAction({
          type: 'REMOVE_CLIP',
          clipId: id,
          clip: { ...clip },
        });
      }
      return {
        clips: state.clips.filter((s) => s.id !== id),
      };
    }),
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
    set((state) => {
      const trackIndex = state.tracks.findIndex((t) => t.id === id);
      const track = state.tracks[trackIndex];

      if (track) {
        undoManager.addAction({
          type: 'DELETE_TRACK',
          track: { ...track, clips: [...track.clips] },
          trackIndex,
        });
      }

      return {
        tracks: state.tracks.filter((t) => t.id !== id),
      };
    }),
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

    set((state) => {
      const newTrackClip = {
        id: `tc-${++nextTrackClipId}`,
        clipId,
        position,
        repeat: false,
      };

      // Record to undo history
      undoManager.addAction({
        type: 'ADD_TRACK_CLIP',
        trackId,
        trackClipId: newTrackClip.id,
        trackClip: { ...newTrackClip },
      });

      return {
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: [...t.clips, newTrackClip],
              }
            : t
        ),
      };
    });
  },
  removeClipFromTrack: (trackId, trackClipId, addToHistory = true) =>
    set((state) => {
      const track = state.tracks.find((t) => t.id === trackId);
      const trackClip = track?.clips.find((s) => s.id === trackClipId);

      if (trackClip && addToHistory) {
        undoManager.addAction({
          type: 'REMOVE_TRACK_CLIP',
          trackId,
          trackClipId,
          trackClip: { ...trackClip },
        });
      }

      return {
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.filter((s) => s.id !== trackClipId),
              }
            : t
        ),
      };
    }),
  updateTrackClip: (trackId, trackClipId, updates, addToHistory = true) =>
    set((state) => {
      // Find the track and clip to get old values
      const track = state.tracks.find((t) => t.id === trackId);
      const trackClip = track?.clips.find((s) => s.id === trackClipId);

      if (trackClip && addToHistory) {
        // Record old values for properties being updated
        const oldValues: Partial<TrackClip> = {};
        (Object.keys(updates) as (keyof TrackClip)[]).forEach((key) => {
          Object.assign(oldValues, { [key]: trackClip[key] });
        });

        // Add to undo history
        undoManager.addAction({
          type: 'UPDATE_TRACK_CLIP_OPTIONS',
          trackId,
          trackClipId,
          oldValues,
          newValues: updates,
        });
      }

      return {
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
      };
    }),
  recordClipMovedBetweenTracks: (
    sourceTrackId,
    targetTrackId,
    trackClipId,
    oldPosition,
    newPosition
  ) => {
    undoManager.addAction({
      type: 'MOVE_CLIP_BETWEEN_TRACKS',
      sourceTrackId,
      targetTrackId,
      trackClipId,
      oldPosition,
      newPosition,
    });
  },

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
      [...members.values()].map((ref) => ({ ...ref, updates: { linkId } })),
      true
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

    if (patches.size > 0) state.applyTrackClipPatches([...patches.values()], true);
  },
  removeTrackClipGroup: (trackId, trackClipId) => {
    const state = get();
    const group = getLinkedRefs(state.tracks, { trackId, trackClipId });
    const doomed = group.length > 0 ? group : [{ trackId, trackClipId }];

    const actions: UndoAction[] = [];

    set((state) => ({
      tracks: state.tracks.map((t) => {
        const removing = doomed.filter((ref) => ref.trackId === t.id);
        if (removing.length === 0) return t;

        for (const ref of removing) {
          const trackClip = t.clips.find((tc) => tc.id === ref.trackClipId);
          if (trackClip) {
            actions.push({
              type: 'REMOVE_TRACK_CLIP',
              trackId: t.id,
              trackClipId: ref.trackClipId,
              trackClip: { ...trackClip },
            });
          }
        }

        return {
          ...t,
          clips: t.clips.filter(
            (tc) => !removing.some((ref) => ref.trackClipId === tc.id)
          ),
        };
      }),
    }));

    const batched = batchActions(actions);
    if (batched) undoManager.addAction(batched);
  },
  applyTrackClipPatches: (patches, addToHistory = true) => {
    if (patches.length === 0) return;

    const actions: UndoAction[] = [];

    set((state) => ({
      tracks: state.tracks.map((t) => {
        const mine = patches.filter((p) => p.trackId === t.id);
        if (mine.length === 0) return t;

        return {
          ...t,
          clips: t.clips.map((tc) => {
            const patch = mine.find((p) => p.trackClipId === tc.id);
            if (!patch) return tc;

            if (addToHistory) {
              const oldValues: Partial<TrackClip> = {};
              (Object.keys(patch.updates) as (keyof TrackClip)[]).forEach((key) => {
                Object.assign(oldValues, { [key]: tc[key] });
              });
              actions.push({
                type: 'UPDATE_TRACK_CLIP_OPTIONS',
                trackId: t.id,
                trackClipId: tc.id,
                oldValues,
                newValues: patch.updates,
              });
            }

            return { ...tc, ...patch.updates };
          }),
        };
      }),
    }));

    const batched = batchActions(actions);
    if (batched) undoManager.addAction(batched);
  },
  applyTrackClipMoves: (moves, addToHistory = true) => {
    if (moves.length === 0) return;

    const actions: UndoAction[] = [];

    set((state) => {
      // Lift every mover out first, so clips swapping tracks do not collide
      // with the slots each other are leaving.
      const lifted = new Map<string, TrackClip>();
      for (const move of moves) {
        const trackClip = findTrackClip(state.tracks, move);
        if (!trackClip) continue;
        lifted.set(move.trackClipId, trackClip);

        if (addToHistory) {
          actions.push(
            move.targetTrackId === move.trackId
              ? {
                  type: 'MOVE_TRACK_CLIP',
                  trackId: move.trackId,
                  trackClipId: move.trackClipId,
                  oldPosition: trackClip.position,
                  newPosition: move.position,
                }
              : {
                  type: 'MOVE_CLIP_BETWEEN_TRACKS',
                  sourceTrackId: move.trackId,
                  targetTrackId: move.targetTrackId,
                  trackClipId: move.trackClipId,
                  oldPosition: trackClip.position,
                  newPosition: move.position,
                }
          );
        }
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

    const batched = batchActions(actions);
    if (batched) undoManager.addAction(batched);
  },
  moveTrackClip: (trackId, trackClipId, oldPosition, newPosition) => {
    // Only record the undo action - position is already updated by updateTrackClip
    const state = useStore.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    const trackClip = track?.clips.find((s) => s.id === trackClipId);

    if (trackClip) {
      undoManager.addAction({
        type: 'MOVE_TRACK_CLIP',
        trackId,
        trackClipId,
        oldPosition,
        newPosition,
      });
    }
  },
  moveClipBetweenTracks: (sourceTrackId, targetTrackId, trackClipId, position, addToHistory = true) => {
    const state = get();
    // Find the clip to move
    const sourceTrack = state.tracks.find((t) => t.id === sourceTrackId);
    const targetTrack = state.tracks.find((t) => t.id === targetTrackId);
    const trackClip = sourceTrack?.clips.find((tc) => tc.id === trackClipId);

    if (!trackClip || !targetTrack) return;

    // Get the clip to find its duration
    const clip = state.clips.find((c) => c.id === trackClip.clipId);
    if (!clip) return;

    // What it occupies on the timeline, repetitions included: the same
    // measure the existing clips are compared against.
    const occupied = getTrackClipDuration(trackClip, clip);

    // Check for overlap on target track
    if (checkOverlap(targetTrack, position, occupied, trackClipId)) {
      // A drag calls this on every mouse move and shows nothing when the clip
      // simply will not fit; only a committed move is worth a toast.
      if (addToHistory) {
        state.showToast('Cannot move clip here - it would overlap with another clip', 'error');
      }
      return;
    }

    set((state) => {
      const sourceTrack = state.tracks.find((t) => t.id === sourceTrackId);
      const trackClip = sourceTrack?.clips.find((tc) => tc.id === trackClipId);

      if (!trackClip) return state;

      // A drag crosses tracks repeatedly, so the caller suppresses this and
      // files one action for the whole gesture when the mouse is released.
      if (addToHistory) {
        undoManager.addAction({
          type: 'MOVE_CLIP_BETWEEN_TRACKS',
          sourceTrackId,
          targetTrackId,
          trackClipId,
          oldPosition: trackClip.position,
          newPosition: position,
        });
      }

      // Remove from source track and add to target track
      return {
        tracks: state.tracks.map((t) => {
          if (t.id === sourceTrackId) {
            // Remove from source
            return {
              ...t,
              clips: t.clips.filter((tc) => tc.id !== trackClipId),
            };
          } else if (t.id === targetTrackId) {
            // Add to target with new position
            return {
              ...t,
              clips: [
                ...t.clips,
                {
                  ...trackClip,
                  position,
                },
              ],
            };
          }
          return t;
        }),
      };
    });
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
  setAudioContext: (ctx) => set({ audioContext: ctx }),

  pixelsPerSecond: 50,
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: pps }),

  // Undo/Redo
  undoManager,
  undo: () => {
    const action = undoManager.undo();
    if (action) get().applyUndoAction(action);
  },
  applyUndoAction: (action) => {
    const state = get();

    switch (action.type) {
      case 'BATCH':
        // Back to front: the gesture's last edit is the first one undone.
        [...action.actions].reverse().forEach((member) => {
          get().applyUndoAction(member);
        });
        break;

      case 'REMOVE_CLIP':
        // Restore the clip
        set({ clips: [...state.clips, action.clip] });
        break;

      case 'REMOVE_TRACK_CLIP':
        // Restore the track clip
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: [...t.clips, action.trackClip],
                }
              : t
          ),
        });
        break;

      case 'MOVE_TRACK_CLIP':
        // Restore the old position
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: t.clips.map((s) =>
                    s.id === action.trackClipId
                      ? { ...s, position: action.oldPosition }
                      : s
                  ),
                }
              : t
          ),
        });
        break;

      case 'DELETE_TRACK':
        // Restore the deleted track at its original position
        set({
          tracks: [
            ...state.tracks.slice(0, action.trackIndex),
            action.track,
            ...state.tracks.slice(action.trackIndex),
          ],
        });
        break;

      case 'RESIZE_CLIP':
        // Restore the old trim values and position
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: t.clips.map((tc) =>
                    tc.id === action.trackClipId
                      ? {
                          ...tc,
                          trimStart: action.oldTrimStart,
                          trimEnd: action.oldTrimEnd,
                          position: action.oldPosition,
                        }
                      : tc
                  ),
                }
              : t
          ),
        });
        break;

      case 'ADD_TRACK_CLIP':
        // Remove the added clip (undo the addition)
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: t.clips.filter((tc) => tc.id !== action.trackClipId),
                }
              : t
          ),
        });
        break;

      case 'MOVE_CLIP_BETWEEN_TRACKS':
        // Move the clip back to the source track with old position
        set({
          tracks: state.tracks.map((t) => {
            if (t.id === action.targetTrackId) {
              // Remove from target track
              return {
                ...t,
                clips: t.clips.filter((tc) => tc.id !== action.trackClipId),
              };
            } else if (t.id === action.sourceTrackId) {
              // Add back to source track
              const trackClip = state.tracks
                .find((track) => track.id === action.targetTrackId)
                ?.clips.find((tc) => tc.id === action.trackClipId);
              if (trackClip) {
                return {
                  ...t,
                  clips: [
                    ...t.clips,
                    {
                      ...trackClip,
                      position: action.oldPosition,
                    },
                  ],
                };
              }
            }
            return t;
          }),
        });
        break;

      case 'UPDATE_TRACK_CLIP_OPTIONS':
        // Restore old values
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: t.clips.map((tc) =>
                    tc.id === action.trackClipId
                      ? { ...tc, ...action.oldValues }
                      : tc
                  ),
                }
              : t
          ),
        });
        break;
    }
  },
  redo: () => {
    const action = undoManager.redo();
    if (action) get().applyRedoAction(action);
  },
  applyRedoAction: (action) => {
    const state = get();

    switch (action.type) {
      case 'BATCH':
        // Front to back: the gesture replays in the order it happened.
        action.actions.forEach((member) => {
          get().applyRedoAction(member);
        });
        break;

      case 'REMOVE_CLIP':
        // Remove the clip again (without adding to history)
        state.removeClip(action.clipId, false);
        break;

      case 'REMOVE_TRACK_CLIP':
        // Remove the track clip again (without adding to history)
        state.removeClipFromTrack(action.trackId, action.trackClipId, false);
        break;

      case 'MOVE_TRACK_CLIP':
        // Move to the new position again
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: t.clips.map((s) =>
                    s.id === action.trackClipId
                      ? { ...s, position: action.newPosition }
                      : s
                  ),
                }
              : t
          ),
        });
        break;

      case 'DELETE_TRACK':
        // Delete the track again
        set({
          tracks: state.tracks.filter((t) => t.id !== action.track.id),
        });
        break;

      case 'RESIZE_CLIP':
        // Apply the new trim values and position
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: t.clips.map((tc) =>
                    tc.id === action.trackClipId
                      ? {
                          ...tc,
                          trimStart: action.newTrimStart,
                          trimEnd: action.newTrimEnd,
                          position: action.newPosition,
                        }
                      : tc
                  ),
                }
              : t
          ),
        });
        break;

      case 'ADD_TRACK_CLIP':
        // Add the clip again
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: [...t.clips, action.trackClip],
                }
              : t
          ),
        });
        break;

      case 'MOVE_CLIP_BETWEEN_TRACKS':
        // Move the clip to the target track with new position
        set({
          tracks: state.tracks.map((t) => {
            if (t.id === action.sourceTrackId) {
              // Remove from source track
              return {
                ...t,
                clips: t.clips.filter((tc) => tc.id !== action.trackClipId),
              };
            } else if (t.id === action.targetTrackId) {
              // Add to target track
              const trackClip = state.tracks
                .find((track) => track.id === action.sourceTrackId)
                ?.clips.find((tc) => tc.id === action.trackClipId);
              if (trackClip) {
                return {
                  ...t,
                  clips: [
                    ...t.clips,
                    {
                      ...trackClip,
                      position: action.newPosition,
                    },
                  ],
                };
              }
            }
            return t;
          }),
        });
        break;

      case 'UPDATE_TRACK_CLIP_OPTIONS':
        // Apply new values
        set({
          tracks: state.tracks.map((t) =>
            t.id === action.trackId
              ? {
                  ...t,
                  clips: t.clips.map((tc) =>
                    tc.id === action.trackClipId
                      ? { ...tc, ...action.newValues }
                      : tc
                  ),
                }
              : t
          ),
        });
        break;
    }
  },
  canUndo: () => undoManager.canUndo(),
  canRedo: () => undoManager.canRedo(),
  undoAvailable: false,
  redoAvailable: false,

  // Project management
  projectName: 'Untitled Project',
  setProjectName: (name) => set({ projectName: name }),
  loadProjectState: (tracks, clips, audioFiles, pixelsPerSecond, projectName) => {
    // History belongs to the project that was open. Track and track-clip ids
    // are sequential counters, so every project reuses the same id space and
    // a leftover action would resolve against whatever the loaded project
    // happens to have under that id - silently editing the wrong clip.
    undoManager.clear();

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
  },
  clearProject: () => {
    // Same reasoning as loadProjectState: nothing the history refers to
    // survives, and the ids it names will be handed out again.
    undoManager.clear();

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

// Make history changes visible to the UI. Queued as a microtask because
// actions are usually recorded from inside a set() updater, and updating the
// store again mid-update is asking for trouble.
undoManager.onChange = () => {
  queueMicrotask(() => {
    useStore.setState({
      undoAvailable: undoManager.canUndo(),
      redoAvailable: undoManager.canRedo(),
    });
  });
};
