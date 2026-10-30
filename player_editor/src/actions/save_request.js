import { atom } from "jotai";

import { oneIsOpen, saveReport, saveRequest } from "./requests";
import { hasSrtProblems, toSMPTETimecode, toSrtEntries } from "../utils";

import { currentSong } from "../Lyrics";

export const srtSubtitles = atom("");

function toSrtFormat(entries) {
  return entries
    .map((e, i) => {
      const start = toSMPTETimecode(e.start);
      const end = toSMPTETimecode(e.end);

      return `${i + 1}\n${start} --> ${end}\n${e.text}\n`;
    })
    .join("\n");
}

export const requestSave = async (get, set) => {
  if (await oneIsOpen(get)) return;

  const song = get(currentSong);

  const srt = toSrtEntries(song);

  set(srtSubtitles, toSrtFormat(srt.entries));

  if (hasSrtProblems(srt)) {
    set(saveReport, srt);
  } else {
    set(saveRequest, true);
  }
};
