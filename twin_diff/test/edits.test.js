import { describe, it, expect } from 'vitest';
import {
  freeGap,
  clampToFree,
  addPair,
  addOneSided,
  removeSegment,
  toggleKind,
  setFields,
  resizeSegment,
  segmentAt,
} from '../src/model/edits.js';
import { parseTwinDoc, serializeTwinDoc } from '../src/model/twin.js';

const segments = [
  { kind: 'same', a: [0, 20], b: [0, 24], label: null, note: null },
  { kind: 'changed', a: [40, 60], b: [44, 70], label: 'verse 2', note: null },
];

describe('freeGap', () => {
  it('finds the stretch between two segments', () => {
    expect(freeGap(segments, 'a', 30, 100)).toEqual({ start: 20, end: 40 });
    expect(freeGap(segments, 'b', 30, 100)).toEqual({ start: 24, end: 44 });
  });

  it('finds the stretch after the last segment', () => {
    expect(freeGap(segments, 'a', 80, 100)).toEqual({ start: 60, end: 100 });
  });

  it('finds nothing inside a classified segment', () => {
    expect(freeGap(segments, 'a', 10, 100)).toBeNull();
  });

  it('ignores a segment being resized, so its own range is free to it', () => {
    expect(freeGap(segments, 'a', 10, 100, { ignore: 0 })).toEqual({ start: 0, end: 40 });
  });

  it('treats a side the segment does not name as free', () => {
    const oneSided = [{ kind: 'removed', a: [10, 20], b: null }];
    expect(freeGap(oneSided, 'b', 15, 100)).toEqual({ start: 0, end: 100 });
  });
});

describe('clampToFree', () => {
  it('trims a drag to the gap it started in', () => {
    expect(clampToFree(segments, 'a', [15, 50], 100)).toEqual([20, 40]);
  });

  it('accepts a drag made backwards', () => {
    expect(clampToFree(segments, 'a', [50, 15], 100)).toEqual([20, 40]);
  });

  it('refuses a drag inside a segment that is already classified', () => {
    expect(clampToFree(segments, 'a', [5, 15], 100)).toBeNull();
  });
});

describe('addPair and addOneSided', () => {
  it('inserts a pair in order', () => {
    const next = addPair(segments, [20, 30], [24, 36]);
    expect(next.map((s) => s.a[0])).toEqual([0, 20, 40]);
    expect(next[1].kind).toBe('same');
  });

  it('inserts an added segment by its position on B', () => {
    const next = addOneSided(segments, 'b', [24, 40], 'bridge');
    expect(next.map((s) => s.label ?? s.kind)).toEqual(['same', 'bridge', 'verse 2']);
    expect(next[1]).toMatchObject({ kind: 'added', a: null, b: [24, 40] });
  });

  it('makes a range on A a removed segment', () => {
    expect(addOneSided(segments, 'a', [20, 30])[1]).toMatchObject({
      kind: 'removed',
      b: null,
      a: [20, 30],
    });
  });

  it('keeps the document valid — the parser finds nothing to complain about', () => {
    const edited = addOneSided(addPair(segments, [20, 30], [24, 36]), 'a', [30, 38]);
    const { problems } = parseTwinDoc({
      version: 1,
      title: 'x',
      sides: { a: { url: 'a.mp3' }, b: { url: 'b.mp3' } },
      segments: serializeTwinDoc({
        title: 'x',
        sides: {
          a: { label: 'a', url: 'a.mp3', ai: false },
          b: { label: 'b', url: 'b.mp3', ai: false },
        },
        segments: edited,
      }).segments,
    });
    expect(problems).toEqual([]);
  });
});

describe('toggleKind', () => {
  it('flips same to changed and back', () => {
    expect(toggleKind(segments, 0)[0].kind).toBe('changed');
    expect(toggleKind(toggleKind(segments, 0), 0)[0].kind).toBe('same');
  });

  it('leaves a one-sided segment alone — an added bridge is not "the same as" anything', () => {
    const oneSided = [{ kind: 'added', a: null, b: [0, 10] }];
    expect(toggleKind(oneSided, 0)).toBe(oneSided);
  });
});

describe('removeSegment and setFields', () => {
  it('drops a segment back to an unclassified gap', () => {
    expect(removeSegment(segments, 0)).toHaveLength(1);
  });

  it('writes a label and a note', () => {
    const next = setFields(segments, 0, { label: 'intro', note: 'four bars longer' });
    expect(next[0]).toMatchObject({ label: 'intro', note: 'four bars longer' });
    expect(next[1]).toBe(segments[1]);
  });
});

describe('resizeSegment', () => {
  it('moves an edge into free space', () => {
    expect(resizeSegment(segments, 0, 'a', 'end', 35, 100)[0].a).toEqual([0, 35]);
  });

  it('stops an edge at the next segment', () => {
    expect(resizeSegment(segments, 0, 'a', 'end', 90, 100)[0].a).toEqual([0, 40]);
  });

  it('stops an edge at the end of the song', () => {
    expect(resizeSegment(segments, 1, 'a', 'end', 200, 100)[1].a).toEqual([40, 100]);
  });

  it('never turns a range inside out', () => {
    const next = resizeSegment(segments, 0, 'a', 'start', 999, 100);
    expect(next[0].a[0]).toBeLessThan(next[0].a[1]);
  });

  it('moves a start edge', () => {
    expect(resizeSegment(segments, 1, 'b', 'start', 30, 100)[1].b).toEqual([30, 70]);
  });
});

describe('segmentAt', () => {
  it('finds the segment under a time', () => {
    expect(segmentAt(segments, 'a', 50)).toBe(1);
    expect(segmentAt(segments, 'a', 30)).toBe(-1);
  });

  it('does not find a side the segment does not name', () => {
    expect(segmentAt([{ kind: 'added', a: null, b: [0, 10] }], 'a', 5)).toBe(-1);
  });
});
