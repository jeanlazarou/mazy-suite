// Editing the segment list. Pure — no DOM, no audio, no store.
//
// Every edit keeps the document's invariants: segments ordered, ranges on a
// side neither overlapping nor going backwards, and each kind naming the
// sides it is allowed to name. The rest of the app can then read a segment
// list without checking anything.

import { orderSegments } from './twin.js';

const EPS = 1e-6;

const range = (segment, side) => (side === 'a' ? segment.a : segment.b);

const sort = (segments) => orderSegments(segments);

function blank(kind, a, b, extra = {}) {
  return { kind, a, b, label: extra.label ?? null, note: extra.note ?? null };
}

// The stretch of one side that is free around `t`: from the end of the
// classified segment before it to the start of the one after. This is what a
// drag is allowed to claim, so a gesture can never overlap a decision the
// user already made.
export function freeGap(segments, side, t, duration, { ignore = -1 } = {}) {
  let start = 0;
  let end = duration;
  segments.forEach((segment, index) => {
    const r = range(segment, side);
    if (!r || index === ignore) return;
    if (r[1] <= t + EPS) start = Math.max(start, r[1]);
    if (r[0] >= t - EPS) end = Math.min(end, r[0]);
    if (t > r[0] + EPS && t < r[1] - EPS) {
      start = NaN; // inside a classified segment: nothing free here
    }
  });
  if (Number.isNaN(start) || end - start <= EPS) return null;
  return { start, end };
}

// A dragged range, trimmed to the free stretch it started in. Returns null
// when there is nothing free to claim.
export function clampToFree(segments, side, [from, to], duration, options) {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const gap = freeGap(segments, side, (low + high) / 2, duration, options);
  if (!gap) return null;
  const start = Math.max(low, gap.start);
  const end = Math.min(high, gap.end);
  return end - start <= EPS ? null : [start, end];
}

// Where two segments sit relative to each other on one side: before, after,
// overlapping, or null when one of them does not name that side.
function relation(x, y, side) {
  const rx = x[side];
  const ry = y[side];
  if (!rx || !ry) return null;
  if (rx[1] <= ry[0] + 1e-6) return 'before';
  if (rx[0] >= ry[1] - 1e-6) return 'after';
  return 'overlap';
}

// A new segment may join a document only if it contradicts nothing in it: no
// overlap with an existing segment on any side, and on the same side of it on
// every timeline they share. Each side of a pair can be free on its own and
// the pair still be impossible — an early stretch of A paired with a late
// stretch of B crosses every correspondence in between.
export function fitsWith(segment, existing) {
  const relations = ['a', 'b'].map((side) => relation(segment, existing, side)).filter(Boolean);
  if (relations.includes('overlap')) return false;
  return new Set(relations).size <= 1;
}

export const fitsDocument = (segments, segment) => segments.every((existing) => fitsWith(segment, existing));

export function addPair(segments, aRange, bRange, kind = 'same') {
  return sort([...segments, blank(kind, aRange, bRange)]);
}

export function addOneSided(segments, side, r, label) {
  const kind = side === 'a' ? 'removed' : 'added';
  return sort([
    ...segments,
    blank(kind, side === 'a' ? r : null, side === 'b' ? r : null, { label }),
  ]);
}

export function removeSegment(segments, index) {
  return segments.filter((_, i) => i !== index);
}

// same ↔ changed. The one-sided kinds have nothing to toggle: an added
// bridge is not "the same as" anything.
export function toggleKind(segments, index) {
  const segment = segments[index];
  if (!segment || (segment.kind !== 'same' && segment.kind !== 'changed')) return segments;
  return segments.map((s, i) =>
    i === index ? { ...s, kind: s.kind === 'same' ? 'changed' : 'same' } : s,
  );
}

export function setFields(segments, index, fields) {
  return segments.map((s, i) => (i === index ? { ...s, ...fields } : s));
}

// Moving one edge of one side of a segment. The new range is clamped to what
// its neighbours on that side leave free, so dragging an edge can push into a
// gap but never over another segment.
export function resizeSegment(segments, index, side, edge, t, duration) {
  const segment = segments[index];
  if (!segment) return segments;
  const current = range(segment, side);
  if (!current) return segments;

  const gap = freeGap(segments, side, edge === 'start' ? current[1] - EPS : current[0] + EPS, duration, {
    ignore: index,
  });
  const bounds = gap ?? { start: 0, end: duration };
  const next =
    edge === 'start'
      ? [Math.min(Math.max(t, bounds.start), current[1] - EPS), current[1]]
      : [current[0], Math.max(Math.min(t, bounds.end), current[0] + EPS)];

  if (next[1] - next[0] <= EPS) return segments;
  return sort(segments.map((s, i) => (i === index ? { ...s, [side]: next } : s)));
}

// Merging. Two segments merge when they are the same kind, name the same
// sides, and touch on every side they name. "Every side" is the point: two
// `same` segments can touch on B while a removed solo sits between them on A,
// and merging those would swallow the solo. A hair of a gap still counts as
// touching — an edge placed by hand is rarely exact — and the merge closes it.
export const TOUCH = 0.05; // seconds

// An unclassified gap too small to be a gap: what two hand-placed edges that
// almost meet leave behind. It stays in the layout, which must cover both
// songs whole, but it is not worth a row in the list or a label.
export const isSliver = (band) =>
  band.kind === 'unknown' && Math.max(band.durA, band.durB) < TOUCH;

function touches(first, second, side) {
  const x = range(first, side);
  const y = range(second, side);
  return !!x && !!y && Math.abs(y[0] - x[1]) <= TOUCH;
}

export function canMerge(first, second) {
  if (!first || !second || first.kind !== second.kind) return false;
  for (const side of ['a', 'b']) {
    const names = !!range(first, side);
    if (names !== !!range(second, side)) return false;
    if (names && !touches(first, second, side)) return false;
  }
  return true;
}

const sharesASide = (x, y) => (!!x.a && !!y.a) || (!!x.b && !!y.b);

// The segment `index` would merge with, looking `direction` (+1 below, -1
// above) — or -1. Segments that share no side with it (a removed solo beside
// an added bridge) are stepped over: they are not between the two on any
// timeline the two occupy.
export function mergeNeighbour(segments, index, direction) {
  const segment = segments[index];
  if (!segment) return -1;
  for (let i = index + direction; i >= 0 && i < segments.length; i += direction) {
    if (!sharesASide(segment, segments[i])) continue;
    const [first, second] = direction > 0 ? [segment, segments[i]] : [segments[i], segment];
    return canMerge(first, second) ? i : -1;
  }
  return -1;
}

const joinText = (x, y, separator) => {
  if (!x) return y ?? null;
  if (!y || x === y) return x;
  return `${x}${separator}${y}`;
};

// One segment covering both, where the first stood. Labels and notes are
// kept, joined when they differ, so nothing written is lost.
export function mergeSegments(segments, i, j) {
  const [first, second] = i < j ? [segments[i], segments[j]] : [segments[j], segments[i]];
  if (!canMerge(first, second)) return segments;
  const span = (side) => {
    const x = range(first, side);
    const y = range(second, side);
    return x && y ? [Math.min(x[0], y[0]), Math.max(x[1], y[1])] : null;
  };
  const merged = {
    ...first,
    a: span('a'),
    b: span('b'),
    label: joinText(first.label, second.label, ' / '),
    note: joinText(first.note, second.note, ' · '),
  };
  const keep = Math.min(i, j);
  const drop = Math.max(i, j);
  return segments.flatMap((s, index) => (index === keep ? [merged] : index === drop ? [] : [s]));
}

// Classifying a gap. An `unknown` band already knows what it can become: with
// music on both sides it is a correspondence (`same` or `changed` — the user's
// call), with music on one side only it can only be what that side has alone
// (`removed` for A, `added` for B). The band's ranges are exactly the free
// stretch between its neighbours, so the new segment cannot overlap anything.
export function gapKinds(band) {
  if (!band || band.kind !== 'unknown' || isSliver(band)) return [];
  if (band.hasA && band.hasB) return ['same', 'changed'];
  if (band.hasA) return ['removed'];
  if (band.hasB) return ['added'];
  return [];
}

export function classifyGap(segments, band, kind) {
  const kinds = gapKinds(band);
  if (!kinds.includes(kind)) return segments;
  return sort([
    ...segments,
    blank(kind, band.hasA ? [...band.a] : null, band.hasB ? [...band.b] : null),
  ]);
}

const near = (x, y) => Math.abs(x - y) <= TOUCH;

// The correspondence a one-sided gap touches, before or after it. Touching
// means on both timelines: on the gap's side its edge meets the gap, and on the
// other side — where the gap has no length — its edge meets the point the gap
// stands at. A segment of the other side's own in between (an `added` bridge
// beside a `removed` gap) is not touching.
function touchingPair(segments, band, where) {
  const side = band.hasA ? 'a' : 'b';
  const other = side === 'a' ? 'b' : 'a';
  const edge = where === 'before' ? 1 : 0;
  const gapEdge = where === 'before' ? 0 : 1;
  return segments.findIndex(
    (segment) =>
      (segment.kind === 'same' || segment.kind === 'changed') &&
      segment[side] &&
      segment[other] &&
      near(segment[side][edge], band[side][gapEdge]) &&
      near(segment[other][edge], band[other][gapEdge]),
  );
}

// What a gap can become, as options: { kind, extend } where `extend` is null
// for a new segment, or 'before' / 'after' / 'both' for a correspondence the
// gap is folded into.
//
// A gap with music on both sides is a correspondence of its own (`same` or
// `changed`). A gap with music on one side only has two readings: music that
// side has alone (`removed` for A, `added` for B) — or more of a correspondence
// it touches, which the edges were simply placed too tight around. The second
// is what an opening left out of the first `same` usually is.
export function gapOptions(segments, band) {
  const kinds = gapKinds(band);
  if (!kinds.length) return [];
  if (kinds.length === 2) return kinds.map((kind) => ({ kind, extend: null }));

  const options = [{ kind: kinds[0], extend: null }];
  const before = touchingPair(segments, band, 'before');
  const after = touchingPair(segments, band, 'after');
  for (const kind of ['same', 'changed']) {
    const beforeFits = before >= 0 && segments[before].kind === kind;
    const afterFits = after >= 0 && segments[after].kind === kind;
    if (beforeFits || afterFits) {
      options.push({ kind, extend: beforeFits && afterFits ? 'both' : beforeFits ? 'before' : 'after' });
    }
  }
  return options;
}

export function applyGapOption(segments, band, option) {
  if (!option.extend) return classifyGap(segments, band, option.kind);
  const side = band.hasA ? 'a' : 'b';
  const before = touchingPair(segments, band, 'before');
  const after = touchingPair(segments, band, 'after');

  if (option.extend === 'both' && before >= 0 && after >= 0) {
    const first = segments[before];
    const last = segments[after];
    const merged = {
      ...first,
      a: [first.a[0], last.a[1]],
      b: [first.b[0], last.b[1]],
      label: joinText(first.label, last.label, ' / '),
      note: joinText(first.note, last.note, ' · '),
    };
    return sort(segments.flatMap((s, i) => (i === before ? [merged] : i === after ? [] : [s])));
  }
  if (option.extend === 'before' && before >= 0) {
    return sort(
      segments.map((s, i) => (i === before ? { ...s, [side]: [s[side][0], band[side][1]] } : s)),
    );
  }
  if (option.extend === 'after' && after >= 0) {
    return sort(
      segments.map((s, i) => (i === after ? { ...s, [side]: [band[side][0], s[side][1]] } : s)),
    );
  }
  return segments;
}

// Which segment a time falls in, on one side — the click target for editing.
export function segmentAt(segments, side, t) {
  return segments.findIndex((segment) => {
    const r = range(segment, side);
    return r && t >= r[0] - EPS && t <= r[1] + EPS;
  });
}
