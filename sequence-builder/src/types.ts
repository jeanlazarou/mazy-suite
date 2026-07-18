/**
 * Type definitions for Sequence Builder
 */

export interface Track {
  url: string;
  title: string;
  authors?: string[];
  rating?: number;
  enabled?: boolean;
  duration?: number;
  volume?: string;
  creationDate?: string;
}

export interface Playlist {
  title: string;
  tracks: Track[];
}

/** Raw playlist format from file (uses "playlist" instead of "tracks") */
export interface RawPlaylist {
  title: string;
  playlist: Track[];
  period?: {
    from: string;
    to: string;
  };
}

export interface AudioSegments {
  start: AudioBuffer;
  end: AudioBuffer;
}

export type PlaybackState = 'idle' | 'playing' | 'stopped';
