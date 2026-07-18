import { atom } from "jotai";

import { oneIsOpen, saveRequest } from "./requests";
import { toRegions, toSMPTETimecode } from "../utils";

import { currentSong } from "../Lyrics";

export const srtSubtitles = atom("");

function toSrtFormat(lyrics, timings) {
  return timings
    .sort((a, b) => a.start - b.start)
    .map((e, i) => {
      const start = toSMPTETimecode(e.start);
      const end = toSMPTETimecode(e.end);

      return `${i + 1}\n${start} --> ${end}\n${lyrics[i]}\n`;
    })
    .join("\n");
}

export const requestSave = async (get, set) => {
  if (await oneIsOpen(get)) return;

  const song = get(currentSong);

  const { lyrics, timings } = song;

  const content = toSrtFormat(lyrics, toRegions(timings));

  set(srtSubtitles, content);
  set(saveRequest, true);
};
