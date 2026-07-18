export interface AudioFile {
  id: string;
  name: string;
  buffer: AudioBuffer;
  duration: number;
}

export interface AudioClip {
  id: string;
  name: string;
  audioFileId: string;
  startTime: number; // Start time in the source audio file
  endTime: number;   // End time in the source audio file
  duration: number;
}

export interface TrackClip {
  id: string;
  clipId: string;
  position: number;  // Position on the timeline (in seconds)
  repeat: boolean;
  repeatCount?: number;
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
