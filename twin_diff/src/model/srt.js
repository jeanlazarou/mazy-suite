// SRT reading, adapted from player_editor's srt_parser.js (the suite's
// reference parser) the way track_mixer adapted it: copied, not imported —
// the suite's tools share formats, not code.
//
// Twin Diff needs each cue's range and text. It reads forgivingly and
// reports rather than rejects: a draft transcript straight out of
// srt_generator is exactly the kind of file it will be given, and a
// half-usable lyric track is still worth showing.
//
// Pure — no DOM.

function parseTime(text) {
  const match = /^\s*(\d+):(\d+):(\d+)[,.](\d+)\s*$/.exec(text ?? '');
  if (!match) return NaN;
  const [, h, m, s, fraction] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${fraction}`);
}

// Returns { cues: [{ from, to, text }], problems: [string] }. Cues come out
// ordered by start; one that cannot be read is skipped and named.
export function parseSrt(content) {
  const cues = [];
  const problems = [];
  const blocks = String(content ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n\s*\r?\n/);

  blocks.forEach((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) {
      problems.push(`no timing line in "${lines[0].slice(0, 40)}"`);
      return;
    }
    const [start, end] = lines[timingIndex].split('-->');
    const from = parseTime(start);
    const to = parseTime(end);
    const text = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>|\{[^}]+\}/g, '').trim();
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      problems.push(`unreadable timing "${lines[timingIndex]}"`);
      return;
    }
    if (to <= from) {
      problems.push(`cue "${text.slice(0, 30)}" ends before it starts`);
      return;
    }
    cues.push({ from, to, text });
  });

  cues.sort((x, y) => x.from - y.from);
  for (let i = 1; i < cues.length; i += 1) {
    if (cues[i].from < cues[i - 1].to - 1e-6) {
      problems.push(`cue "${cues[i].text.slice(0, 30)}" overlaps the one before`);
    }
  }
  return { cues, problems };
}
