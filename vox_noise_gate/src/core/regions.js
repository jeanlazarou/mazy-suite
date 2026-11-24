// What ends up silent: the regions the gate detects, overridden by the
// edits made by hand. Edits survive any change of the gate settings:
//
//   manual  ranges muted by hand (drawn, resized, moved, split), with their
//           own fades when set (fadeOut at the start, fadeIn at the end, ms)
//   keeps   ranges the gate must leave alone (a region deleted, or the part
//           of a region given back by shrinking or moving it)
//
// Detected regions are cut around both; what remains joins the manual ones.
// A fade belongs to its edge: it goes wherever that edge goes.

import { MIN_REGION } from "./gate";

export const NO_EDITS = { manual: [], keeps: [], next: 1 };

const byStart = (a, b) => a.start - b.start;

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

const fadeOutOf = (r) => (r.fadeOut === undefined ? {} : { fadeOut: r.fadeOut });
const fadeInOf = (r) => (r.fadeIn === undefined ? {} : { fadeIn: r.fadeIn });

// A range's own fades, when it has some
export const fadesOf = (r) => ({ ...fadeOutOf(r), ...fadeInOf(r) });

// Parts of range outside every blocker
export function subtract(range, blockers) {
  let pieces = [{ start: range.start, end: range.end, ...fadesOf(range) }];

  for (const b of blockers) {
    pieces = pieces.flatMap((p) => {
      if (!overlaps(p, b)) return [p];

      const left = { start: p.start, end: Math.min(p.end, b.start), ...fadeOutOf(p) };
      const right = { start: Math.max(p.start, b.end), end: p.end, ...fadeInOf(p) };

      return [left, right].filter((r) => r.end - r.start > 1e-9);
    });
  }

  return pieces;
}

// The range ending last brings its fade in to the merge
function extend(last, r) {
  if (r.end <= last.end) return;

  last.end = r.end;
  delete last.fadeIn;
  Object.assign(last, fadeInOf(r));
}

// Merges ranges that overlap; touching ranges stay apart (a split keeps both
// halves). The merged range keeps the id of its first range.
export function mergeOverlapping(ranges) {
  const sorted = [...ranges].sort(byStart);
  const merged = [];

  for (const r of sorted) {
    const last = merged[merged.length - 1];

    if (last && r.start < last.end) {
      extend(last, r);
    } else {
      merged.push({ ...r });
    }
  }

  return merged;
}

// Disjoint ranges to render: overlapping and touching ranges become one, so
// no fade happens where two regions meet
export function mergeForRender(regions) {
  const sorted = [...regions].sort(byStart);
  const merged = [];

  for (const r of sorted) {
    const last = merged[merged.length - 1];

    if (last && r.start <= last.end + 1e-6) {
      extend(last, r);
    } else {
      merged.push({ start: r.start, end: r.end, ...fadesOf(r) });
    }
  }

  return merged;
}

// -> [{ id, start, end, origin: "auto" | "manual" }] sorted
export function combineRegions(detected, edits) {
  const blockers = [...edits.manual, ...edits.keeps];

  const auto = detected
    .flatMap((r) => subtract(r, blockers))
    .filter((r) => r.end - r.start >= MIN_REGION)
    .map((r, i) => ({ id: `auto-${i}`, start: r.start, end: r.end, origin: "auto" }));

  const manual = edits.manual.map((r) => ({ ...r, origin: "manual" }));

  return [...auto, ...manual].sort(byStart);
}

const newId = (edits, kind) => `${kind}-${edits.next}`;

function addKeeps(keeps, ranges, edits) {
  let next = edits.next;

  const added = ranges.map((r) => ({ id: `keep-${next++}`, start: r.start, end: r.end }));

  return { keeps: mergeOverlapping([...keeps, ...added]), next };
}

// The active region accepted with its new bounds and fades. region: { id,
// origin, start, end, fadeOut?, fadeIn?, original } where original is the
// range it had when selected (none for a new region). -> { edits, id } id of
// the accepted region
export function acceptRegion(edits, region) {
  const id = newId(edits, "manual");
  const range = { id, start: region.start, end: region.end, ...fadesOf(region) };

  const others = edits.manual.filter((m) => m.id !== region.id);
  const manual = mergeOverlapping([...others, range]);

  // muting a range takes it out of the keep zones
  let keeps = edits.keeps.flatMap((k) =>
    subtract(k, [range]).map((p, i) => ({ id: i ? `${k.id}b` : k.id, ...p }))
  );

  let next = edits.next + 1;

  if (region.original) {
    const given = subtract(region.original, [range]);
    const added = addKeeps(keeps, given, { next });

    keeps = added.keeps;
    next = added.next;
  }

  const holder = manual.find((m) => m.start <= range.start && range.end <= m.end);

  return { edits: { manual, keeps, next }, id: holder ? holder.id : id };
}

// A region deleted: its range is no longer muted, even by the gate
export function deleteRegion(edits, region) {
  const manual = edits.manual.flatMap((m) =>
    subtract(m, [region]).map((p, i) => ({ id: i ? `${m.id}b` : m.id, ...p }))
  );

  const { keeps, next } = addKeeps(edits.keeps, [region], edits);

  return { manual, keeps, next };
}

export function removeKeep(edits, id) {
  return { ...edits, keeps: edits.keeps.filter((k) => k.id !== id) };
}

export const MIN_SPLIT = 0.05;

// A region split in two at time, both halves becoming manual
export function splitRegion(edits, region, time) {
  if (time - region.start < MIN_SPLIT || region.end - time < MIN_SPLIT) return edits;

  const manual = edits.manual.flatMap((m) =>
    subtract(m, [region]).map((p, i) => ({ id: i ? `${m.id}b` : m.id, ...p }))
  );
  const keeps = edits.keeps.flatMap((k) =>
    subtract(k, [region]).map((p, i) => ({ id: i ? `${k.id}b` : k.id, ...p }))
  );

  const first = { id: `manual-${edits.next}`, start: region.start, end: time, ...fadeOutOf(region) };
  const second = { id: `manual-${edits.next + 1}`, start: time, end: region.end, ...fadeInOf(region) };

  return {
    manual: [...manual, first, second].sort(byStart),
    keeps,
    next: edits.next + 2,
  };
}

export const hasEdits = (edits) => edits.manual.length > 0 || edits.keeps.length > 0;

// Region after (or before) time, for stepping through them
export function nextRegion(regions, time) {
  return regions.find((r) => r.start > time + 1e-3);
}

export function previousRegion(regions, time) {
  for (let i = regions.length - 1; i >= 0; i--) {
    if (regions[i].start < time - 1e-3) return regions[i];
  }

  return undefined;
}
