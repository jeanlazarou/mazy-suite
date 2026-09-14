import { describe, it, expect } from 'vitest';
import {
  gapKinds,
  gapOptions,
  applyGapOption,
  classifyGap,
  addOneSided,
  addPair,
  clampToFree,
  fitsDocument,
  TOUCH,
} from '../src/model/edits.js';
import { buildBands } from '../src/model/bands.js';
import { parseTwinDoc, orderSegments } from '../src/model/twin.js';

// What the layout relies on: on each side, the segments naming it are in time
// order, and the bands built from them tile that side without going backwards.
function sidesInOrder(segments, durations = { a: 1000, b: 1000 }) {
  for (const side of ['a', 'b']) {
    const starts = segments.filter((s) => s[side]).map((s) => s[side][0]);
    if (starts.some((start, k) => k > 0 && start < starts[k - 1])) return false;
    let cursor = 0;
    for (const band of buildBands(segments, durations.a, durations.b)) {
      if (band[side][0] < cursor - 1e-6) return false;
      cursor = band[side][1];
    }
  }
  return true;
}

const seg = (kind, a, b) => ({ kind, a, b, label: null, note: null });
const problemsOf = (segments) =>
  parseTwinDoc({ version: 1, title: 'x', sides: { a: { url: 'a' }, b: { url: 'b' } }, segments }).problems;

describe('orderSegments', () => {
  it('places a new added bridge before a later added one, whatever removed segments sit around', () => {
    // the case that duplicated a segment: a pairwise sort called the new
    // bridge "equal" to the removed segment and stopped there
    const segments = [
      seg('same', [0, 10], [0, 12]),
      seg('added', null, [20, 30]),
      seg('removed', [25, 35], null),
      seg('changed', [40, 60], [45, 70]),
      seg('added', null, [12, 20]),
    ];
    const ordered = orderSegments(segments);
    const onB = ordered.filter((s) => s.b).map((s) => s.b[0]);
    expect(onB).toEqual([0, 12, 20, 45]);
    expect(sidesInOrder(ordered)).toBe(true);
  });

  it('keeps the given order where no shared side decides it', () => {
    const removed = seg('removed', [10, 20], null);
    const added = seg('added', null, [10, 20]);
    expect(orderSegments([removed, added])).toEqual([removed, added]);
    expect(orderSegments([added, removed])).toEqual([added, removed]);
  });

  it('lets a crossing pair be caught before it is added', () => {
    const existing = [seg('same', [20, 30], [20, 30])];
    expect(fitsDocument(existing, seg('same', [5, 15], [40, 50]))).toBe(false);
    expect(fitsDocument(existing, seg('same', [5, 15], [5, 15]))).toBe(true);
  });

  it('survives a document whose constraints contradict each other', () => {
    const crossing = [seg('same', [20, 30], [0, 10]), seg('same', [0, 10], [20, 30])];
    expect(orderSegments(crossing)).toHaveLength(2);
  });

  it('keeps both sides in order through any sequence of edits', () => {
    // a small deterministic pseudo-random walk of one-sided and paired edits
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let run = 0; run < 25; run += 1) {
      let segments = [];
      for (let step = 0; step < 30; step += 1) {
        const side = random() < 0.5 ? 'a' : 'b';
        const from = random() * 950;
        const range = clampToFree(segments, side, [from, from + 5 + random() * 40], 1000);
        if (!range) continue;
        if (random() < 0.6) {
          segments = addOneSided(segments, side, range);
        } else {
          const other = side === 'a' ? 'b' : 'a';
          const at = random() * 950;
          const counterpart = clampToFree(segments, other, [at, at + 5 + random() * 40], 1000);
          if (!counterpart) continue;
          const pair = { kind: 'same', a: side === 'a' ? range : counterpart, b: side === 'b' ? range : counterpart };
          // the app refuses a pair that crosses an existing one; so does the walk
          if (!fitsDocument(segments, pair)) continue;
          segments = addPair(segments, pair.a, pair.b);
        }
        expect(sidesInOrder(segments)).toBe(true);
      }
    }
  });
});

describe('gapKinds', () => {
  it('offers same or changed for a gap with music on both sides', () => {
    const [gap] = buildBands([], 100, 120);
    expect(gapKinds(gap)).toEqual(['same', 'changed']);
  });

  it('offers only removed for a gap only the original has', () => {
    const bands = buildBands([seg('same', [0, 10], [0, 10]), seg('same', [20, 30], [10, 30])], 30, 30);
    expect(bands[1]).toMatchObject({ kind: 'unknown', hasA: true, hasB: false });
    expect(gapKinds(bands[1])).toEqual(['removed']);
  });

  it('offers only added for a gap only the rework has', () => {
    const bands = buildBands([seg('same', [0, 10], [0, 10]), seg('same', [10, 30], [25, 40])], 30, 40);
    expect(gapKinds(bands[1])).toEqual(['added']);
  });

  it('offers nothing for a segment, or for a sliver of a gap', () => {
    const bands = buildBands([seg('same', [0, 10], [0, 10]), seg('same', [10 + TOUCH / 2, 20], [10, 20])], 20, 20);
    expect(gapKinds(bands[0])).toEqual([]); // a segment
    expect(gapKinds(bands[1])).toEqual([]); // the sliver between the two
  });
});

describe('gapOptions and applyGapOption', () => {
  // The recording's opening, left out of the first `same`: the case that
  // prompted these options.
  const opening = [seg('same', [31.7, 50.3], [0, 55.5])];
  const openingGap = buildBands(opening, 211.7, 248.2)[0];

  it('offers removed, or extending the same it touches, for the recording’s opening', () => {
    expect(openingGap).toMatchObject({ kind: 'unknown', hasA: true, hasB: false });
    expect(gapOptions(opening, openingGap)).toEqual([
      { kind: 'removed', extend: null },
      { kind: 'same', extend: 'after' },
    ]);
  });

  it('extends that same back to the start of the song', () => {
    const extended = applyGapOption(opening, openingGap, { kind: 'same', extend: 'after' });
    expect(extended).toEqual([seg('same', [0, 50.3], [0, 55.5])]);
    expect(buildBands(extended, 211.7, 248.2)[0].kind).toBe('same');
  });

  it('or marks the opening removed', () => {
    const marked = applyGapOption(opening, openingGap, { kind: 'removed', extend: null });
    expect(marked[0]).toEqual(seg('removed', [0, 31.7], null));
    expect(problemsOf(marked)).toEqual([]);
  });

  it('offers extending a changed segment the gap follows', () => {
    const segments = [seg('changed', [0, 20], [0, 25])];
    const tail = buildBands(segments, 40, 25).at(-1); // the recording runs on alone
    expect(gapOptions(segments, tail)).toEqual([
      { kind: 'removed', extend: null },
      { kind: 'changed', extend: 'before' },
    ]);
    expect(applyGapOption(segments, tail, { kind: 'changed', extend: 'before' })).toEqual([
      seg('changed', [0, 40], [0, 25]),
    ]);
  });

  it('joins a gap and the same segments on both sides of it into one', () => {
    const segments = [seg('same', [0, 10], [0, 10]), seg('same', [20, 30], [10, 20])];
    const gap = buildBands(segments, 30, 20)[1];
    expect(gapOptions(segments, gap)).toContainEqual({ kind: 'same', extend: 'both' });
    expect(applyGapOption(segments, gap, { kind: 'same', extend: 'both' })).toEqual([
      seg('same', [0, 30], [0, 20]),
    ]);
  });

  it('offers each kind that touches when the neighbours differ', () => {
    const segments = [seg('same', [0, 10], [0, 10]), seg('changed', [20, 30], [10, 20])];
    const gap = buildBands(segments, 30, 20)[1];
    expect(gapOptions(segments, gap)).toEqual([
      { kind: 'removed', extend: null },
      { kind: 'same', extend: 'before' },
      { kind: 'changed', extend: 'after' },
    ]);
  });

  it('does not offer extending across a segment of the other side in between', () => {
    // an added bridge on B sits between the same and the recording's gap
    const segments = [seg('same', [0, 10], [0, 10]), seg('added', null, [10, 15]), seg('same', [20, 30], [15, 25])];
    const gap = buildBands(segments, 30, 25).find((b) => b.kind === 'unknown' && b.hasA);
    expect(gapOptions(segments, gap).filter((o) => o.extend)).toEqual([{ kind: 'same', extend: 'after' }]);
  });

  it('keeps the plain same / changed choice for a gap with music on both sides', () => {
    const [gap] = buildBands([], 100, 120);
    expect(gapOptions([], gap)).toEqual([
      { kind: 'same', extend: null },
      { kind: 'changed', extend: null },
    ]);
  });
});

describe('classifyGap', () => {
  it('turns a two-sided gap into the chosen correspondence', () => {
    const [gap] = buildBands([], 100, 120);
    expect(classifyGap([], gap, 'changed')).toEqual([seg('changed', [0, 100], [0, 120])]);
  });

  it('turns a one-sided gap into what that side has alone', () => {
    const segments = [seg('same', [0, 10], [0, 10]), seg('same', [20, 30], [10, 30])];
    const gap = buildBands(segments, 30, 30)[1];
    expect(classifyGap(segments, gap, 'removed')[1]).toEqual(seg('removed', [10, 20], null));
  });

  it('refuses a kind the gap cannot be', () => {
    const [gap] = buildBands([], 100, 120);
    const segments = [];
    expect(classifyGap(segments, gap, 'added')).toBe(segments);
  });

  it('can classify every gap of a mixed document, leaving it valid and fully classified', () => {
    let segments = [
      seg('same', [0, 10], [0, 12]),
      seg('added', null, [20, 30]),
      seg('removed', [25, 35], null),
      seg('changed', [40, 60], [45, 70]),
    ];
    for (let guard = 0; guard < 20; guard += 1) {
      const gap = buildBands(segments, 80, 90).find((band) => gapKinds(band).length);
      if (!gap) break;
      segments = classifyGap(segments, gap, gapKinds(gap)[0]);
      expect(problemsOf(segments)).toEqual([]);
    }
    expect(buildBands(segments, 80, 90).filter((band) => band.kind === 'unknown')).toEqual([]);
  });
});
