export type AnimationType =
  | "carousel"
  | "constellation"
  | "default"
  | "fade"
  | "falling"
  | "manuscript"
  | "none"
  | "grid"
  | "teletype"
  | "spiral"
  | "wall"
  | "wave"
  | "typography"
  | "typewriter";

export interface Theme {
  name: string;
  backgroundColor: string;
  textColors: string[] | "random";
}

export interface Album {
  id: string;
  name: string;
  title: string;
  coverImage: string;
}

export interface Track {
  id: string;
  url: string;
  title: string;
  creationDate: string;
  authors: string[];
  volume: number;
  albumId: string;
  theme: string;
  animationType: AnimationType;
  animationDelay: number;
}

export interface PerformanceData {
  title: string;
  date: string;
  albums: Album[];
  tracks: Track[];
  themes: Theme[];
}

export interface Lyric {
  start: number;
  end: number;
  text: string;
}
