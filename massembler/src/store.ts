import { create } from 'zustand';
import { AudioFile, AudioClip, Track, PlaybackState } from './types';
import { UndoRedoManager } from './utils/undoRedo';

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
  updateTrackClip: (trackId: string, trackClipId: string, updates: any, addToHistory?: boolean) => void;
  moveTrackClip: (trackId: string, trackClipId: string, oldPosition: number, newPosition: number) => void;
  moveClipBetweenTracks: (sourceTrackId: string, targetTrackId: string, trackClipId: string, position: number) => void;

  // Playback
  playbackState: PlaybackState;
  setPlaybackState: (state: Partial<PlaybackState>) => void;

  // Selected clip for editing
  selectedClipId: string | null;
  setSelectedClip: (id: string | null) => void;

  // Selected track clip for properties panel
  selectedTrackClip: { trackId: string; trackClipId: string } | null;
  setSelectedTrackClip: (selection: { trackId: string; trackClipId: string } | null) => void;

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
  canUndo: () => boolean;
  canRedo: () => boolean;

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

    // Calculate effective duration (considering trim values)
    const effectiveStartTime = trackClip.trimStart ?? clip.startTime;
    const effectiveEndTime = trackClip.trimEnd ?? clip.endTime;
    const effectiveDuration = effectiveEndTime - effectiveStartTime;

    // Calculate total duration including repeats
    const totalDuration = effectiveDuration * (trackClip.repeatCount || 1);

    const existingStart = trackClip.position;
    const existingEnd = trackClip.position + totalDuration;

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
        const oldValues: any = {};
        Object.keys(updates).forEach((key) => {
          oldValues[key] = (trackClip as any)[key];
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
  moveClipBetweenTracks: (sourceTrackId, targetTrackId, trackClipId, position) => {
    const state = get();
    // Find the clip to move
    const sourceTrack = state.tracks.find((t) => t.id === sourceTrackId);
    const targetTrack = state.tracks.find((t) => t.id === targetTrackId);
    const trackClip = sourceTrack?.clips.find((tc) => tc.id === trackClipId);

    if (!trackClip || !targetTrack) return;

    // Get the clip to find its duration
    const clip = state.clips.find((c) => c.id === trackClip.clipId);
    if (!clip) return;

    // Calculate effective duration
    const effectiveStartTime = trackClip.trimStart ?? clip.startTime;
    const effectiveEndTime = trackClip.trimEnd ?? clip.endTime;
    const effectiveDuration = effectiveEndTime - effectiveStartTime;

    // Check for overlap on target track
    if (checkOverlap(targetTrack, position, effectiveDuration, trackClipId)) {
      state.showToast('Cannot move clip here - it would overlap with another clip', 'error');
      return;
    }

    set((state) => {
      const sourceTrack = state.tracks.find((t) => t.id === sourceTrackId);
      const trackClip = sourceTrack?.clips.find((tc) => tc.id === trackClipId);

      if (!trackClip) return state;

      // Record to undo history
      undoManager.addAction({
        type: 'MOVE_CLIP_BETWEEN_TRACKS',
        sourceTrackId,
        targetTrackId,
        trackClipId,
        oldPosition: trackClip.position,
        newPosition: position,
      });

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
  setSelectedTrackClip: (selection) => set({ selectedTrackClip: selection }),

  audioContext: null,
  setAudioContext: (ctx) => set({ audioContext: ctx }),

  pixelsPerSecond: 50,
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: pps }),

  // Undo/Redo
  undoManager,
  undo: () => {
    const action = undoManager.undo();
    if (!action) return;

    const state = get();

    switch (action.type) {
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
    if (!action) return;

    const state = get();

    switch (action.type) {
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

  // Project management
  projectName: 'Untitled Project',
  setProjectName: (name) => set({ projectName: name }),
  loadProjectState: (tracks, clips, audioFiles, pixelsPerSecond, projectName) => {
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
      });
    });

    set({
      tracks,
      clips,
      audioFiles,
      pixelsPerSecond,
      projectName,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      },
    });
  },
  clearProject: () =>
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
    }),

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
