// Lyrics for each side: an SRT file, found the suite's way or picked by hand.
//
// A side's lyrics are the file its `srt` names, or else the suite convention
// — data/lyrics/<track title>.srt, with the audio file's name standing in for
// a side that came from no album. Not finding one is normal and silent: most
// twins will start without lyrics.

import { useTwinStore } from '../state/store.js';
import { loadText } from '../api.js';
import { parseSrt } from '../model/srt.js';
import { cueWordMarks } from '../model/lyrics_diff.js';
import { showToast } from './show_toast.js';

const fileStem = (url) => decodeURIComponent(String(url).split('/').pop() ?? '').replace(/\.[^.]+$/, '');

export function lyricsPath(side) {
  if (side.srt) return side.srt;
  const title = (side.track ?? fileStem(side.url)).replace(/[*+]$/, '').trim();
  return `/data/lyrics/${title}.srt`;
}

// Both sides' words, marked against each other — recomputed whenever either
// side's lyrics change.
function refreshWordMarks() {
  const { lyrics } = useTwinStore.getState();
  useTwinStore.setState({
    wordMarks: lyrics.a && lyrics.b ? cueWordMarks(lyrics.a.cues, lyrics.b.cues) : null,
  });
}

function setLyrics(side, value) {
  const { lyrics } = useTwinStore.getState();
  useTwinStore.setState({ lyrics: { ...lyrics, [side]: value } });
  refreshWordMarks();
}

export async function loadLyricsFor(doc) {
  useTwinStore.setState({ lyrics: { a: null, b: null }, wordMarks: null });
  await Promise.all(
    ['a', 'b'].map(async (side) => {
      const path = lyricsPath(doc.sides[side]);
      const text = await loadText(path);
      if (text === null) return;
      const { cues, problems } = parseSrt(text);
      if (cues.length) setLyrics(side, { cues, problems, source: path });
    }),
  );
}

export async function loadLyricsFile(side, file) {
  const { cues, problems } = parseSrt(await file.text());
  if (!cues.length) {
    showToast(`no lyrics could be read from ${file.name}`);
    return;
  }
  setLyrics(side, { cues, problems, source: file.name });
  const label = useTwinStore.getState().doc?.sides[side].label ?? side.toUpperCase();
  showToast(
    `${cues.length} lines on ${label}${problems.length ? ` — ${problems.length} could not be read` : ''}`,
  );
}

export function toggleLyrics() {
  useTwinStore.setState({ showLyrics: !useTwinStore.getState().showLyrics });
}
