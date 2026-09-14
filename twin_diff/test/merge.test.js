import { describe, it, expect } from 'vitest';
import { canMerge, mergeNeighbour, mergeSegments, isSliver, TOUCH } from '../src/model/edits.js';
import { buildBands } from '../src/model/bands.js';

const seg = (kind, a, b, extra = {}) => ({ kind, a, b, label: null, note: null, ...extra });

describe('canMerge', () => {
  it('merges two same segments touching on both sides', () => {
    expect(canMerge(seg('same', [0, 10], [0, 12]), seg('same', [10, 20], [12, 30]))).toBe(true);
  });

  it('refuses two segments of different kinds', () => {
    expect(canMerge(seg('same', [0, 10], [0, 12]), seg('changed', [10, 20], [12, 30]))).toBe(false);
  });

  it('refuses two pairs that touch on one side only — that would swallow what lies between', () => {
    // touching on B, but A has a gap where a removed solo sits
    expect(canMerge(seg('same', [0, 10], [0, 12]), seg('same', [20, 30], [12, 30]))).toBe(false);
  });

  it('merges two added stretches touching on B', () => {
    expect(canMerge(seg('added', null, [40, 50]), seg('added', null, [50, 58]))).toBe(true);
  });

  it('refuses an added and a removed stretch, even at the same moment', () => {
    expect(canMerge(seg('removed', [40, 50], null), seg('added', null, [50, 58]))).toBe(false);
  });

  it('counts a hair of a gap as touching', () => {
    const almost = 10 + TOUCH * 0.8;
    expect(canMerge(seg('same', [0, 10], [0, 12]), seg('same', [almost, 20], [12, 30]))).toBe(true);
  });

  it('does not count a real gap as touching', () => {
    expect(canMerge(seg('same', [0, 10], [0, 12]), seg('same', [10.5, 20], [12, 30]))).toBe(false);
  });
});

describe('mergeNeighbour', () => {
  it('finds the touching segment below', () => {
    const segments = [seg('same', [0, 10], [0, 12]), seg('same', [10, 20], [12, 30])];
    expect(mergeNeighbour(segments, 0, 1)).toBe(1);
    expect(mergeNeighbour(segments, 1, -1)).toBe(0);
  });

  it('finds nothing past the ends', () => {
    const segments = [seg('same', [0, 10], [0, 12])];
    expect(mergeNeighbour(segments, 0, 1)).toBe(-1);
    expect(mergeNeighbour(segments, 0, -1)).toBe(-1);
  });

  it('steps over a segment that shares no side with it', () => {
    // a removed solo written between two added bridges is on another timeline
    const segments = [
      seg('added', null, [78, 96]),
      seg('removed', [70, 92], null),
      seg('added', null, [96, 110]),
    ];
    expect(mergeNeighbour(segments, 0, 1)).toBe(2);
  });

  it('stops at the first segment on a shared side, even when it cannot merge', () => {
    const segments = [
      seg('same', [0, 10], [0, 12]),
      seg('changed', [10, 20], [12, 30]),
      seg('same', [20, 30], [30, 40]),
    ];
    expect(mergeNeighbour(segments, 0, 1)).toBe(-1);
  });
});

describe('isSliver', () => {
  it('calls the gap two almost-touching segments leave a sliver', () => {
    const bands = buildBands([seg('same', [0, 10], [0, 12]), seg('same', [10, 20], [12.02, 25])], 20, 25);
    expect(bands.map((b) => [b.kind, isSliver(b)])).toEqual([
      ['same', false],
      ['unknown', true],
      ['same', false],
    ]);
  });

  it('does not call a real gap a sliver', () => {
    const bands = buildBands([seg('same', [0, 10], [0, 12]), seg('same', [11, 20], [13, 25])], 20, 25);
    expect(isSliver(bands[1])).toBe(false);
  });
});

describe('mergeSegments', () => {
  it('makes one segment spanning both, where the first stood', () => {
    const segments = [
      seg('same', [0, 10], [0, 12]),
      seg('same', [10, 20], [12, 30]),
      seg('changed', [20, 40], [30, 55]),
    ];
    const merged = mergeSegments(segments, 0, 1);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ kind: 'same', a: [0, 20], b: [0, 30] });
    expect(merged[1].kind).toBe('changed');
  });

  it('works whichever order the two are given in', () => {
    const segments = [seg('added', null, [40, 50]), seg('added', null, [50, 58])];
    expect(mergeSegments(segments, 1, 0)[0]).toMatchObject({ kind: 'added', a: null, b: [40, 58] });
  });

  it('closes a hair of a gap', () => {
    const segments = [seg('same', [0, 10], [0, 12]), seg('same', [10.02, 20], [12.01, 30])];
    const merged = mergeSegments(segments, 0, 1);
    expect(buildBands(merged, 20, 30).map((b) => b.kind)).toEqual(['same']);
  });

  it('keeps what was written, joining labels and notes that differ', () => {
    const segments = [
      seg('changed', [0, 10], [0, 12], { label: 'verse 1', note: 'new drums' }),
      seg('changed', [10, 20], [12, 30], { label: 'chorus', note: 'vocal up' }),
    ];
    expect(mergeSegments(segments, 0, 1)[0]).toMatchObject({
      label: 'verse 1 / chorus',
      note: 'new drums · vocal up',
    });
  });

  it('keeps one copy of a label both had', () => {
    const segments = [
      seg('same', [0, 10], [0, 12], { label: 'verse' }),
      seg('same', [10, 20], [12, 30], { label: 'verse' }),
    ];
    expect(mergeSegments(segments, 0, 1)[0].label).toBe('verse');
  });

  it('leaves the list alone when the two cannot merge', () => {
    const segments = [seg('same', [0, 10], [0, 12]), seg('changed', [10, 20], [12, 30])];
    expect(mergeSegments(segments, 0, 1)).toBe(segments);
  });
});
