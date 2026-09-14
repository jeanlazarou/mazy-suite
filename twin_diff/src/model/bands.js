// Bands: the layout model. Segments are correspondences between the two
// timelines; bands are those correspondences plus the gaps between them, in
// order, covering both songs whole. Each band occupies one vertical slice of
// the page and each side is scaled to fill it on its own — which is what puts
// corresponding music at the same eye level while the two clocks disagree.
//
// Pure — no DOM, no audio. See SPECIFICATION.md "Time is what we know...".

const EPS = 1e-6;

// A band always carries a range on both sides. Where a segment names no
// counterpart (added / removed), the missing side gets a zero-length range at
// the point its timeline has reached: nothing to draw, and a playhead that
// stands still there while the other side plays on.
function band(kind, a, b, hasA, hasB, extra = {}) {
  return {
    kind,
    a,
    b,
    hasA,
    hasB,
    durA: a[1] - a[0],
    durB: b[1] - b[0],
    label: extra.label ?? null,
    note: extra.note ?? null,
    segment: extra.segment ?? null,
  };
}

export function buildBands(segments, durationA, durationB) {
  const bands = [];
  let ca = 0;
  let cb = 0;

  const fillTo = (aEnd, bEnd) => {
    const hasA = aEnd > ca + EPS;
    const hasB = bEnd > cb + EPS;
    if (!hasA && !hasB) return;
    bands.push(band('unknown', [ca, Math.max(ca, aEnd)], [cb, Math.max(cb, bEnd)], hasA, hasB));
    ca = Math.max(ca, aEnd);
    cb = Math.max(cb, bEnd);
  };

  segments.forEach((s, index) => {
    fillTo(s.a ? s.a[0] : ca, s.b ? s.b[0] : cb);
    bands.push(
      band(s.kind, s.a ?? [ca, ca], s.b ?? [cb, cb], !!s.a, !!s.b, {
        label: s.label,
        note: s.note,
        segment: index,
      }),
    );
    if (s.a) ca = s.a[1];
    if (s.b) cb = s.b[1];
  });

  fillTo(durationA, durationB);
  if (!bands.length) bands.push(band('unknown', [0, 0], [0, 0], false, false));
  return bands;
}

// Heights, for the 'aligned' view (see model/view.js). A band is as tall as
// its longer side at the current zoom, so no side is ever squeezed below true
// time scale — the shorter one is stretched up to meet it.
export function layoutBands(bands, pxPerSec, minHeight = 28) {
  let top = 0;
  return bands.map((b) => {
    const height = Math.max(Math.max(b.durA, b.durB) * pxPerSec, minHeight);
    const laid = { ...b, top, height };
    top += height;
    return laid;
  });
}

export const layoutHeight = (layout) =>
  layout.length ? layout[layout.length - 1].top + layout[layout.length - 1].height : 0;

const range = (b, side) => (side === 'a' ? b.a : b.b);
const duration = (b, side) => (side === 'a' ? b.durA : b.durB);

// The band a time falls in, on one side. Zero-length ranges (the silent side
// of an added/removed band) are skipped: a time never belongs to them, it
// belongs to the band that actually spans it.
export function bandAt(layout, side, t) {
  let last = null;
  for (const b of layout) {
    const [start, end] = range(b, side);
    if (end - start <= EPS) continue;
    if (t < end - EPS) return b;
    last = b;
  }
  return last ?? layout[0] ?? null;
}

export function timeToY(layout, side, t) {
  const b = bandAt(layout, side, t);
  if (!b) return 0;
  const dur = duration(b, side);
  if (dur <= EPS) return b.top;
  const fraction = (t - range(b, side)[0]) / dur;
  return b.top + Math.min(Math.max(fraction, 0), 1) * b.height;
}

export function yToTime(layout, side, y) {
  if (!layout.length) return 0;
  let b = layout.find((x) => y < x.top + x.height) ?? layout[layout.length - 1];
  // A zero-length side has no time of its own at that height; the nearest
  // band that does is the honest answer for a click.
  if (duration(b, side) <= EPS) {
    const spanning = layout.filter((x) => duration(x, side) > EPS);
    if (!spanning.length) return 0;
    b = spanning.reduce((best, x) => (Math.abs(x.top - y) < Math.abs(best.top - y) ? x : best));
    return range(b, side)[y < b.top ? 0 : 1];
  }
  const fraction = b.height > 0 ? (y - b.top) / b.height : 0;
  return range(b, side)[0] + Math.min(Math.max(fraction, 0), 1) * duration(b, side);
}

// The heart of it: a time on one side becomes a time on the other, through
// the band that spans it. Inside a band the mapping is linear, which is as
// precise as a correspondence between two ranges can honestly be.
export function mapTime(layout, from, to, t) {
  const b = bandAt(layout, from, t);
  if (!b) return 0;
  const [fromStart] = range(b, from);
  const [toStart, toEnd] = range(b, to);
  const fromDur = duration(b, from);
  const toDur = duration(b, to);
  if (fromDur <= EPS || toDur <= EPS) return toStart;
  const fraction = Math.min(Math.max((t - fromStart) / fromDur, 0), 1);
  return Math.min(toStart + fraction * toDur, toEnd);
}
