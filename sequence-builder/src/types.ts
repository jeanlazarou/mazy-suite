/**
 * Type definitions for Sequence Builder
 */

export interface Track {
  /** URL the audio is fetched from */
  url: string;
  /** url as written in the album file, kept for saving */
  sourceUrl?: string;
  title: string;
  authors?: string[];
  rating?: number;
  enabled?: boolean;
  duration?: number;
  volume?: string;
  creationDate?: string;
}

/** A track as the grid shows it, with its place in the album (for its color) */
export interface DisplayedTrack {
  track: Track;
  index: number;
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

/** An entry of the suite's albums.json, with its title read from the album */
export interface Album {
  name: string;
  title: string;
  trackCount: number;
  cover: string;
  color?: string;
}

export interface AudioSegments {
  start: AudioBuffer;
  end: AudioBuffer;
}

export type PlaybackState = 'idle' | 'playing' | 'stopped';
