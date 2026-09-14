import { describe, it, expect } from 'vitest';
import {
  buildBands,
  layoutBands,
  layoutHeight,
  bandAt,
  timeToY,
  yToTime,
  mapTime,
} from '../src/model/bands.js';

const kinds = (bands) => bands.map((b) => b.kind);

describe('buildBands', () => {
  it('turns an empty segment list into one unknown band covering both songs', () => {
    const bands = buildBands([], 211.7, 248.2);
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ kind: 'unknown', a: [0, 211.7], b: [0, 248.2] });
  });

  it('fills the gaps between segments with unknown bands', () => {
    const bands = buildBands([{ kind: 'same', a: [10, 20], b: [12, 24] }], 30, 36);
    expect(kinds(bands)).toEqual(['unknown', 'same', 'unknown']);
    expect(bands[0]).toMatchObject({ a: [0, 10], b: [0, 12] });
    expect(bands[2]).toMatchObject({ a: [20, 30], b: [24, 36] });
  });

  it('covers both timelines completely and without overlap', () => {
    const bands = buildBands(
      [
        { kind: 'same', a: [0, 12.4], b: [0, 11.9] },
        { kind: 'changed', a: [12.4, 45], b: [11.9, 47.8] },
        { kind: 'added', a: null, b: [47.8, 62] },
        { kind: 'removed', a: [45, 58.2], b: null },
        { kind: 'same', a: [58.2, 121], b: [62, 130.4] },
      ],
      121,
      130.4,
    );
    for (const side of ['a', 'b']) {
      let cursor = 0;
      for (const b of bands) {
        expect(b[side][0]).toBeCloseTo(cursor, 6);
        cursor = b[side][1];
      }
      expect(cursor).toBeCloseTo(side === 'a' ? 121 : 130.4, 6);
    }
  });

  it('gives the absent side a zero-length range where its timeline stands', () => {
    const bands = buildBands(
      [
        { kind: 'same', a: [0, 10], b: [0, 10] },
        { kind: 'added', a: null, b: [10, 25] },
      ],
      10,
      25,
    );
    expect(bands[1]).toMatchObject({ kind: 'added', a: [10, 10], hasA: false, hasB: true, durA: 0 });
  });

  it('keeps the segment index so a band can point back at the document', () => {
    const bands = buildBands([{ kind: 'same', a: [5, 10], b: [5, 10] }], 10, 10);
    expect(bands.map((b) => b.segment)).toEqual([null, 0]);
  });
});

describe('layoutBands', () => {
  it('makes a band as tall as its longer side', () => {
    const layout = layoutBands(buildBands([{ kind: 'same', a: [0, 10], b: [0, 20] }], 10, 20), 10);
    expect(layout[0].height).toBe(200);
  });

  it('stacks bands without gaps', () => {
    const layout = layoutBands(
      buildBands([{ kind: 'same', a: [0, 10], b: [0, 10] }], 30, 30),
      10,
    );
    expect(layout[0]).toMatchObject({ top: 0, height: 100 });
    expect(layout[1]).toMatchObject({ top: 100, height: 200 });
    expect(layoutHeight(layout)).toBe(300);
  });

  it('gives a band with no duration on either side a minimum height', () => {
    const layout = layoutBands(buildBands([{ kind: 'added', a: null, b: [0, 0.1] }], 0, 0.1), 10, 28);
    expect(layout[0].height).toBe(28);
  });
});

describe('bandAt', () => {
  const layout = layoutBands(
    buildBands(
      [
        { kind: 'same', a: [0, 10], b: [0, 12] },
        { kind: 'removed', a: [10, 20], b: null },
        { kind: 'same', a: [20, 30], b: [12, 24] },
      ],
      30,
      24,
    ),
    10,
  );

  it('finds the band spanning a time', () => {
    expect(bandAt(layout, 'a', 5).kind).toBe('same');
    expect(bandAt(layout, 'a', 15).kind).toBe('removed');
  });

  it('never returns a band that is empty on that side', () => {
    // B has no time inside the removed band: 12 s belongs to the band after it.
    expect(bandAt(layout, 'b', 12)).toMatchObject({ b: [12, 24] });
  });

  it('clamps past the end to the last band holding that side', () => {
    expect(bandAt(layout, 'a', 999)).toMatchObject({ a: [20, 30] });
  });
});

describe('timeToY and yToTime (the aligned layout)', () => {
  const layout = layoutBands(
    buildBands([{ kind: 'same', a: [0, 10], b: [0, 20] }], 20, 20),
    10, // band 0 is 200 px tall (B is longer), band 1 covers A 10→20, B 20→20
  );

  it('stretches the shorter side over the band height', () => {
    expect(timeToY(layout, 'a', 5)).toBe(100); // half of A's range, half the band
    expect(timeToY(layout, 'b', 10)).toBe(100); // half of B's range, same height
  });

  it('puts corresponding music at the same height', () => {
    expect(timeToY(layout, 'a', 9.999)).toBeCloseTo(timeToY(layout, 'b', 19.999), 1);
  });

  it('round-trips a time through its height', () => {
    expect(yToTime(layout, 'a', timeToY(layout, 'a', 7.5))).toBeCloseTo(7.5, 6);
    expect(yToTime(layout, 'b', timeToY(layout, 'b', 15))).toBeCloseTo(15, 6);
  });

  it('pins a side with no range in the band to the band top', () => {
    const removed = layoutBands(
      buildBands([{ kind: 'removed', a: [0, 10], b: null }], 10, 0),
      10,
    );
    expect(timeToY(removed, 'b', 0)).toBe(removed[0].top);
  });
});

describe('mapTime', () => {
  const layout = layoutBands(
    buildBands(
      [
        { kind: 'same', a: [0, 12], b: [0, 12] },
        { kind: 'changed', a: [12, 44], b: [12, 48] },
        { kind: 'removed', a: [44, 60], b: null },
        { kind: 'added', a: null, b: [48, 60] },
        { kind: 'same', a: [60, 100], b: [60, 100] },
      ],
      100,
      100,
    ),
    10,
  );

  it('maps a time inside a matching band unchanged', () => {
    expect(mapTime(layout, 'a', 'b', 6)).toBeCloseTo(6, 6);
  });

  it('scales across a band whose sides differ in length', () => {
    // half way through A's 32 s is half way through B's 36 s
    expect(mapTime(layout, 'a', 'b', 28)).toBeCloseTo(30, 6);
  });

  it('freezes the other side through a one-sided band', () => {
    // while A plays the removed solo, B stands at the point it had reached
    expect(mapTime(layout, 'a', 'b', 50)).toBeCloseTo(48, 6);
    expect(mapTime(layout, 'a', 'b', 59)).toBeCloseTo(48, 6);
    // and the added bridge maps back to where A waits
    expect(mapTime(layout, 'b', 'a', 55)).toBeCloseTo(60, 6);
  });

  it('is its own inverse where both sides have a range', () => {
    // 44 → 60 is A's removed solo: B stands still through it, so those times
    // have no distinct counterpart to come back from.
    for (const t of [0, 3, 12, 30, 43.9, 60, 70, 100]) {
      const there = mapTime(layout, 'a', 'b', t);
      expect(mapTime(layout, 'b', 'a', there)).toBeCloseTo(t, 6);
    }
  });

  it('reads a boundary as the start of the band below it', () => {
    // 44 ends the changed band and starts the removed one. Both readings are
    // defensible; the later band wins, the way a text cursor sits before the
    // character it precedes. A one-sided band then swallows the round trip,
    // which is why the inverse above stops short of it.
    expect(mapTime(layout, 'a', 'b', 44)).toBeCloseTo(48, 6);
    expect(mapTime(layout, 'a', 'b', 43.999)).toBeCloseTo(47.999, 3);
  });

  it('maps the whole unclassified twin proportionally', () => {
    const flat = layoutBands(buildBands([], 211.7, 248.2), 10);
    expect(mapTime(flat, 'a', 'b', 0)).toBeCloseTo(0, 6);
    expect(mapTime(flat, 'a', 'b', 211.7)).toBeCloseTo(248.2, 6);
    expect(mapTime(flat, 'a', 'b', 105.85)).toBeCloseTo(124.1, 6);
  });
});
