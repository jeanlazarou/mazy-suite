export type AnimationType =
  | "carousel"
  | "cloud"
  | "constellation"
  | "default"
  | "echo"
  | "fade"
  | "falling"
  | "glitch"
  | "manuscript"
  | "mosaic"
  | "neon"
  | "none"
  | "grid"
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
