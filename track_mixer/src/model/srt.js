// Lean SRT reader for timeline markers, adapted from player_editor's
// srt_parser.js. The mixer only needs each cue's start time and text —
// malformed blocks are skipped, not rejected (markers are a convenience).

function parseTime(str) {
  const parts = String(str).trim().split(':');
  if (parts.length !== 3) return NaN;
  const [h, m, s] = parts;
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s.replace(',', '.'));
}

export function parseSrtMarkers(content) {
  const lines = String(content).split(/\r?\n/);
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('-->')) continue;
    const t = parseTime(lines[i].split('-->')[0]);
    const text = [];
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ''; j++) {
      if (lines[j].includes('-->')) break;
      text.push(lines[j].trim());
      i = j;
    }
    if (Number.isFinite(t)) markers.push({ t, label: text.join(' ') });
  }
  return markers.sort((a, b) => a.t - b.t);
}
