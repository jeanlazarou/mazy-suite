import { Theme } from "./types";

export const defaultTheme: Theme = {
  name: "random",
  backgroundColor: "black",
  textColors: "random",
};

export const themes: Theme[] = [
  defaultTheme,
  {
    name: "reds",
    backgroundColor: "black",
    textColors: [
      "#ff2e2e",
      "#ff2400",
      "#d9381e",
      "#a30000",
      "#722f37",
      "#800020",
      "#750000",
    ],
  },
  {
    name: "yellows",
    backgroundColor: "black",
    textColors: [
      "#ffff00",
      "#ffea00",
      "#ffd700",
      "#ffc300",
      "#ffab00",
      "#ff9500",
      "#ff8c00",
    ],
  },
  {
    name: "greens",
    backgroundColor: "black",
    textColors: [
      "#39ff14",
      "#32cd32",
      "#00ff00",
      "#228b22",
      "#008000",
      "#006400",
      "#004d00",
    ],
  },
  {
    name: "blues",
    backgroundColor: "black",
    textColors: [
      "#00ffff",
      "#1e90ff",
      "#0000ff",
      "#0000cd",
      "#00008b",
      "#000080",
      "#191970",
    ],
  },
  {
    name: "magentas",
    backgroundColor: "black",
    textColors: [
      "#ff00ff",
      "#ff00bf",
      "#ff0080",
      "#c71585",
      "#8b008b",
      "#800080",
      "#4b0082",
    ],
  },
  {
    name: "sunny",
    backgroundColor: "#87CEEB", // Sky blue
    textColors: [
      "#FFD700", // Gold
      "#FF6347", // Tomato
      "#32CD32", // Lime green
      "#FF69B4", // Hot pink
      "#FFA500", // Orange
      "#00CED1", // Dark turquoise
      "#FFFF00", // Yellow
    ],
  },
  {
    name: "melancholy",
    backgroundColor: "#2F4F4F", // Dark slate gray
    textColors: [
      "#778899", // Light slate gray
      "#708090", // Slate gray
      "#4682B4", // Steel blue
      "#5F9EA0", // Cadet blue
      "#7B68EE", // Medium slate blue
      "#6A5ACD", // Slate blue
      "#483D8B", // Dark slate blue
    ],
  },
  {
    name: "warm",
    backgroundColor: "#300000",
    textColors: ["#FFD700", "#FFA500", "#FF4500", "#FF6347"],
  },
  {
    name: "cool",
    backgroundColor: "#001930",
    textColors: ["#00FFFF", "#87CEEB", "#E0FFFF", "#B0E0E6"],
  },
  {
    name: "forest",
    backgroundColor: "#0B3B0B",
    textColors: ["#98FB98", "#90EE90", "#00FA9A", "#7CFC00"],
  },
  {
    name: "sunset",
    backgroundColor: "#4B0082",
    textColors: ["#FF69B4", "#FFB6C1", "#FFA07A", "#FF1493"],
  },
  {
    name: "neon",
    backgroundColor: "#000000",
    textColors: ["#FF00FF", "#00FF00", "#FF00FF", "#FFFF00"],
  },
  {
    name: "pastel",
    backgroundColor: "#434134",
    textColors: ["#FFB6C1", "#98FB98", "#87CEFA", "#DDA0DD"],
  },
  {
    name: "monochrome",
    backgroundColor: "#000000",
    textColors: ["#FFFFFF", "#D3D3D3", "#A9A9A9", "#808080"],
  },
  {
    name: "ocean",
    backgroundColor: "#000080",
    textColors: ["#00FFFF", "#48D1CC", "#40E0D0", "#7FFFD4"],
  },
  {
    name: "autumn",
    backgroundColor: "#8B4513",
    textColors: ["#FFA500", "#FF8C00", "#DAA520", "#CD853F"],
  },
  {
    name: "cyberpunk",
    backgroundColor: "#0C0C0C",
    textColors: ["#00FF00", "#FF00FF", "#00FFFF", "#FF1493"],
  },
  {
    name: "vintage",
    backgroundColor: "#FAEBD7",
    textColors: ["#8B4513", "#DEB887", "#D2691E", "#CD853F"],
  },
  {
    name: "galaxy",
    backgroundColor: "#191970",
    textColors: ["#9370DB", "#8A2BE2", "#9932CC", "#BA55D3"],
  },
  {
    name: "fire",
    backgroundColor: "#8B0000",
    textColors: ["#FF4500", "#FF6347", "#FF7F50", "#FFA07A"],
  },
  {
    name: "arctic",
    backgroundColor: "#F0F8FF",
    textColors: ["#1E90FF", "#87CEFA", "#00BFFF", "#4169E1"],
  },
].sort((a, b) => a.name.localeCompare(b.name));
