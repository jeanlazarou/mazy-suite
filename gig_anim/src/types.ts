export type AnimationType =
  | "blinds"
  | "carousel"
  | "cloud"
  | "constellation"
  | "default"
  | "echo"
  | "fade"
  | "falling"
  | "filings"
  | "glitch"
  | "manuscript"
  | "mosaic"
  | "neon"
  | "none"
  | "grid"
  | "scatter"
  | "splitflap"
  | "spotlight"
  | "teletype"
  | "spiral"
  | "wall"
  | "warp"
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
  // In time with the song, or the lines at random; for the animations that
  // can do both
  followSong?: boolean;
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
