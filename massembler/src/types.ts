/** A span of an audio file, in seconds of the original recording. */
export interface UsedSegment {
  start: number;
  end: number;
}

/**
 * Record of an optimization pass. Kept so the original recording can be
 * relinked later: `segments` is what survived, in original-file time, and the
 * optimized buffer is those segments concatenated in order.
 */
export interface AudioFileOptimization {
  originalName: string;
  originalDuration: number;
  segments: UsedSegment[];
}

export interface AudioFile {
  id: string;
  name: string;
  buffer: AudioBuffer;
  duration: number;
  /** Set when this file has been trimmed to the regions actually in use. */
  optimization?: AudioFileOptimization;
  /**
   * The bytes the audio was originally decoded from, kept so projects can be
   * saved in the source encoding instead of re-encoded PCM. A Blob rather
   * than an ArrayBuffer: it stays backed by disk and survives decodeAudioData
   * detaching its input.
   */
  sourceBlob?: Blob;
  /** Original upload filename, used to pick the extension inside the .mass */
  sourceFileName?: string;
}

export interface AudioClip {
  id: string;
  name: string;
  audioFileId: string;
  startTime: number; // Start time in the source audio file
  endTime: number;   // End time in the source audio file
  duration: number;
}

// One-click clip treatments. Deliberately preset-only: no parameters to tune.
export type ClipEffectId =
  | 'none'
  | 'reverse'
  | 'underwater'
  | 'telephone'
  | 'cathedral'
  | 'distant'
  | 'tremolo'
  | 'lofi'
  | 'deep';

export interface TrackClip {
  id: string;
  clipId: string;
  position: number;  // Position on the timeline (in seconds)
  repeat: boolean;
  repeatCount?: number;
  effect?: ClipEffectId;
  // Optional trim overrides - if set, these override the clip's default start/end times
  trimStart?: number; // Start time in the source audio file (overrides clip.startTime)
  trimEnd?: number;   // End time in the source audio file (overrides clip.endTime)
  // Fade settings
  fadeIn?: number;    // Fade-in duration in seconds
  fadeOut?: number;   // Fade-out duration in seconds
}

export interface Track {
  id: string;
  name: string;
  clips: TrackClip[];
  volume: number;    // 0 to 1
  muted: boolean;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}
