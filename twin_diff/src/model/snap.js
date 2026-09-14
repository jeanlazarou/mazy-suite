// Magnetism. Marking a region by eye is a losing game: the edge you want is
// almost always somewhere the audio already tells you about — where the
// previous region ended, where the playhead is, or the quiet moment between
// two sections. So an edge being placed looks around itself and settles on
// the best of those, unless the user turns it off.
//
// Pure — no DOM, no audio, no store.

const EPS = 1e-6;

// How far the magnet reaches, in seconds: a constant number of pixels, so it
// feels the same at every zoom, and never so wide that it takes over.
export function snapRadius(pxPerSec, pixels = 9) {
  return Math.min(Math.max(pixels / Math.max(pxPerSec, 0.001), 0.03), 1.5);
}

// Every time an edge could sensibly land on: the song's ends, and the edges
// of the segments already marked on that side.
export function boundaryTimes(segments, side, duration) {
  const times = [0, duration];
  for (const segment of segments) {
    const r = side === 'a' ? segment.a : segment.b;
    if (r) times.push(r[0], r[1]);
  }
  return [...new Set(times)].sort((x, y) => x - y);
}

// The quietest moment near `t` — a section boundary usually sits in a dip,
// and a dip is where a cut is least audible. Only counts when it is properly
// quieter than its surroundings; in the middle of a loud passage there is no
// dip to find and the magnet should stay out of the way.
export function quietestNear(peaks, t, radius) {
  if (!peaks?.rms?.length || radius <= 0) return null;
  const { rms, bucketsPerSecond } = peaks;
  const first = Math.max(0, Math.floor((t - radius) * bucketsPerSecond));
  const last = Math.min(rms.length - 1, Math.ceil((t + radius) * bucketsPerSecond));
  if (last <= first) return null;

  let quietest = Infinity;
  let at = -1;
  let total = 0;
  for (let i = first; i <= last; i += 1) {
    total += rms[i];
    if (rms[i] < quietest) {
      quietest = rms[i];
      at = i;
    }
  }
  const mean = total / (last - first + 1);
  if (at < 0 || quietest > mean * 0.5) return null;
  return at / bucketsPerSecond;
}

// Returns { time, to } where `to` names what it stuck to, so the UI can say
// so. `to` is null when nothing was near enough and the time is unchanged.
export function snapTime(
  t,
  { boundaries = [], lyrics = [], peaks = null, playhead = null, radius = 0.25 } = {},
) {
  const candidates = [];

  for (const boundary of boundaries) {
    if (Math.abs(boundary - t) <= radius) candidates.push({ time: boundary, to: 'boundary', rank: 0 });
  }
  // Where a sung line starts or ends — the most musical place for an edge.
  for (const edge of lyrics) {
    if (Math.abs(edge - t) <= radius) candidates.push({ time: edge, to: 'lyric', rank: 1 });
  }
  if (playhead !== null && Math.abs(playhead - t) <= radius) {
    candidates.push({ time: playhead, to: 'playhead', rank: 2 });
  }
  const quiet = quietestNear(peaks, t, radius);
  if (quiet !== null && Math.abs(quiet - t) <= radius) {
    candidates.push({ time: quiet, to: 'quiet', rank: 3 });
  }
  if (!candidates.length) return { time: t, to: null };

  // A boundary beats a lyric line beats the playhead beats a dip; between
  // equals, the nearest.
  candidates.sort((x, y) => x.rank - y.rank || Math.abs(x.time - t) - Math.abs(y.time - t));
  return candidates[0];
}

// One click, one region: the click gives an edge and the neighbouring region
// gives the other, so marking "from where the last one ended to here" costs a
// click instead of a drag the length of a chorus.
//
// `reach` says which way: 'back' to the previous boundary (the common case —
// you hear the change and click), 'forward' to the next one.
export function rangeToBoundary(boundaries, t, reach = 'back') {
  const sorted = [...boundaries].sort((x, y) => x - y);
  if (reach === 'forward') {
    const next = sorted.find((time) => time > t + EPS);
    return next === undefined ? null : [t, next];
  }
  const previous = [...sorted].reverse().find((time) => time < t - EPS);
  return previous === undefined ? null : [previous, t];
}
