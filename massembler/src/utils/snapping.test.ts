import { describe, expect, it } from 'vitest';
import { AudioClip, Track } from '../types';
import { spansOverlap } from './clipTiming';
import { snapPoint, snapSpan, snapTargets } from './snapping';

const clips: AudioClip[] = [
  { id: 'A', name: 'A', audioFileId: 'f', startTime: 0, endTime: 2, duration: 2 },
  { id: 'B', name: 'B', audioFileId: 'f', startTime: 0, endTime: 1, duration: 1 },
];

const tracks: Track[] = [
  {
    id: 'track-1', name: 'T1', volume: 0.8, muted: false,
    clips: [
      { id: 'tc-1', clipId: 'A', position: 1, repeat: false },
      { id: 'tc-2', clipId: 'B', position: 5, repeat: true, repeatCount: 3 },
    ],
  },
  {
    id: 'track-2', name: 'T2', volume: 0.8, muted: false,
    clips: [{ id: 'tc-3', clipId: 'A', position: 10, repeat: false }],
  },
];

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

describe('snapTargets', () => {
  it('offers zero, the playhead, and every clip start and end, repeats included', () => {
    expect(sorted(snapTargets(tracks, clips, 4.5))).toEqual([0, 1, 3, 4.5, 5, 8, 10, 12]);
  });

  it('leaves out the clips being moved', () => {
    expect(sorted(snapTargets(tracks, clips, 0, new Set(['tc-2', 'tc-3'])))).toEqual([0, 1, 3]);
  });
});

describe('snapPoint', () => {
  it('pulls a value onto a target within reach', () => {
    expect(snapPoint(2.9, [0, 3, 5], 0.2)).toBe(3);
  });

  it('leaves a value alone when nothing is within reach', () => {
    expect(snapPoint(2.7, [0, 3, 5], 0.2)).toBeNull();
  });

  it('picks the nearest of several targets', () => {
    expect(snapPoint(4.07, [4, 4.1], 0.2)).toBe(4.1);
  });
});

describe('snapSpan', () => {
  it('snaps by the start edge', () => {
    expect(snapSpan(2.9, 1, [0, 3, 10], 0.2)).toEqual({ start: 3, at: 3 });
  });

  it('snaps by the end edge', () => {
    expect(snapSpan(8.85, 1, [0, 10], 0.2)).toEqual({ start: 9, at: 10 });
  });

  it('lets the nearer edge decide', () => {
    expect(snapSpan(4.95, 1, [5, 6.1], 0.2)).toEqual({ start: 5, at: 5 });
  });

  it('never pulls a span to before zero, falling back to the other edge', () => {
    expect(snapSpan(0.1, 2, [0, 1.95], 0.2)).toEqual({ start: 0, at: 0 });
    expect(snapSpan(0.1, 3, [2.95], 0.2)).toBeNull();
  });
});

describe('spansOverlap', () => {
  it('does not count clips butted edge to edge, despite float arithmetic', () => {
    const start = 5.3 - 2.1; // a span snapped to end exactly where the next begins
    expect(spansOverlap(start, start + 2.1, 5.3, 7)).toBe(false);
  });

  it('still counts a real overlap', () => {
    expect(spansOverlap(3, 5.31, 5.3, 7)).toBe(true);
  });
});
