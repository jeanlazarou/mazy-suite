import { describe, it, expect } from 'vitest';
import {
  snapRadius,
  boundaryTimes,
  quietestNear,
  snapTime,
  rangeToBoundary,
} from '../src/model/snap.js';
import { computePeaks } from '../src/model/peaks.js';

const segments = [
  { kind: 'same', a: [10, 20], b: [12, 24] },
  { kind: 'added', a: null, b: [30, 40] },
];

describe('snapRadius', () => {
  it('is a constant number of pixels, so the magnet feels the same at every zoom', () => {
    expect(snapRadius(10)).toBeCloseTo(0.9, 6);
    expect(snapRadius(90)).toBeCloseTo(0.1, 6);
  });

  it('never grows or shrinks without limit', () => {
    expect(snapRadius(0.01)).toBe(1.5);
    expect(snapRadius(10000)).toBe(0.03);
  });
});

describe('boundaryTimes', () => {
  it('collects the song ends and every segment edge on that side', () => {
    expect(boundaryTimes(segments, 'a', 100)).toEqual([0, 10, 20, 100]);
    expect(boundaryTimes(segments, 'b', 100)).toEqual([0, 12, 24, 30, 40, 100]);
  });

  it('does not repeat a time two segments share', () => {
    const touching = [
      { kind: 'same', a: [0, 10], b: null },
      { kind: 'removed', a: [10, 20], b: null },
    ];
    expect(boundaryTimes(touching, 'a', 20)).toEqual([0, 10, 20]);
  });
});

// Two loud seconds, a quiet gap, two loud seconds.
function loudQuietLoud(sampleRate = 8000) {
  const data = new Float32Array(sampleRate * 5);
  for (let i = 0; i < data.length; i += 1) {
    const second = i / sampleRate;
    const level = second > 2 && second < 3 ? 0.01 : 0.8;
    data[i] = level * Math.sin((i / sampleRate) * 2 * Math.PI * 220);
  }
  return computePeaks([data], sampleRate, 100);
}

describe('quietestNear', () => {
  const peaks = loudQuietLoud();

  it('finds the dip between two sections', () => {
    const found = quietestNear(peaks, 2.4, 0.8);
    expect(found).toBeGreaterThan(2);
    expect(found).toBeLessThan(3);
  });

  it('finds nothing in the middle of a loud passage', () => {
    expect(quietestNear(peaks, 0.8, 0.3)).toBeNull();
  });

  it('finds nothing without peaks', () => {
    expect(quietestNear(null, 1, 0.5)).toBeNull();
  });
});

describe('snapTime', () => {
  const boundaries = [0, 10, 20, 100];

  it('sticks to a nearby boundary', () => {
    expect(snapTime(20.2, { boundaries, radius: 0.5 })).toEqual({
      time: 20,
      to: 'boundary',
      rank: 0,
    });
  });

  it('leaves a time alone when nothing is near', () => {
    expect(snapTime(50, { boundaries, radius: 0.5 })).toEqual({ time: 50, to: null });
  });

  it('prefers a boundary to the playhead', () => {
    const result = snapTime(20.2, { boundaries, playhead: 20.3, radius: 0.5 });
    expect(result.to).toBe('boundary');
  });

  it('sticks to the start or end of a sung line', () => {
    expect(snapTime(33.1, { boundaries, lyrics: [32.9, 36], radius: 0.5 })).toMatchObject({
      time: 32.9,
      to: 'lyric',
    });
  });

  it('prefers a marked boundary to a lyric line, and a lyric line to the playhead', () => {
    expect(snapTime(20.1, { boundaries, lyrics: [20.2], radius: 0.5 }).to).toBe('boundary');
    expect(snapTime(50.1, { boundaries, lyrics: [50.2], playhead: 50, radius: 0.5 }).to).toBe('lyric');
  });

  it('takes the playhead when no boundary is in reach', () => {
    expect(snapTime(50.1, { boundaries, playhead: 50, radius: 0.5 })).toMatchObject({
      time: 50,
      to: 'playhead',
    });
  });

  it('falls back to the quiet moment between sections', () => {
    const result = snapTime(2.4, { boundaries: [], peaks: loudQuietLoud(), radius: 0.8 });
    expect(result.to).toBe('quiet');
    expect(result.time).toBeGreaterThan(2);
    expect(result.time).toBeLessThan(3);
  });

  it('does nothing at all when the magnet is given nothing to stick to', () => {
    expect(snapTime(7.77, {})).toEqual({ time: 7.77, to: null });
  });
});

describe('rangeToBoundary', () => {
  const boundaries = [0, 10, 20, 100];

  it('reaches back to the previous boundary — one click, one region', () => {
    expect(rangeToBoundary(boundaries, 35)).toEqual([20, 35]);
  });

  it('reaches forward to the next one', () => {
    expect(rangeToBoundary(boundaries, 35, 'forward')).toEqual([35, 100]);
  });

  it('reaches back to the start of the song when nothing is marked yet', () => {
    expect(rangeToBoundary([0, 200], 42)).toEqual([0, 42]);
  });

  it('has nowhere to reach past the last boundary', () => {
    expect(rangeToBoundary(boundaries, 100, 'forward')).toBeNull();
    expect(rangeToBoundary(boundaries, 0)).toBeNull();
  });
});
