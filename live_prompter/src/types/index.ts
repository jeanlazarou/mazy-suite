export interface Album {
  name: string;
}

export interface Track {
  url: string;
  title: string;
  rating?: number;
  authors: string[];
  volume: number;
}

export interface AlbumData {
  title: string;
  playlist: Track[];
  hidden?: Track[];
}

export interface LyricLine {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

export interface CustomPlaylistTrack {
  id: string;
  track: Track;
  sourceAlbum: string;
}