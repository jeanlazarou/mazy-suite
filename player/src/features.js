import _ from "lodash";

import packageInfo from "../package.json";

import { LocalStorage } from "./LocalStorage";

export const featuresStorage = new LocalStorage("player-features");

export const ALBUMS_FILE = undefined;

const features = {
  isolatedPlayer: false,
  includeRating: true,
  saveEnabled: false,
  saveToClipboard: true,
  includeTour: true,
  tourStartsOnLoad: false,
  includeDescription: true,
  defaultList: false,
};

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