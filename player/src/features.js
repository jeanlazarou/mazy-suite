import _ from "lodash";

import packageInfo from "../package.json";

import { LocalStorage } from "./LocalStorage";

export const featuresStorage = new LocalStorage("player-features");

export const ALBUMS_FILE = undefined;

// players built with their own mode (`vite build --mode single-album`) start
// from these options rather than the defaults; saved preferences still win
export const MODE_FEATURES = {
  // one album deployed at its own URL, its data folder beside the player:
  // reads ./data and plays default.json, no albums browser
  "single-album": { isolatedPlayer: true, defaultList: true },
};

export function defaultFeatures(mode) {
  return {
    isolatedPlayer: false,
    includeRating: true,
    saveEnabled: false,
    saveToClipboard: true,
    includeTour: true,
    tourStartsOnLoad: false,
    includeDescription: true,
    defaultList: false,
    ...MODE_FEATURES[mode],
  };
}

const features = defaultFeatures(import.meta.env.MODE);

const current = featuresStorage.restore();

_.forEach(current, (value, key) => {
  features[key] = value;
});

Object.defineProperty(global, "features", {
  value: features,
});

Object.defineProperty(global, "version", {
  value: packageInfo.version,
});

export const VERSION = { name: packageInfo.name, version: packageInfo.version }