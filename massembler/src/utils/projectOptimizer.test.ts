import { describe, expect, it } from 'vitest';
import { AudioClip, AudioFile, Track } from '../types';
import { computeUsedSegments, contiguousRange, remapTime, unmapTime } from './projectOptimizer';

// An optimized file keeps seconds 10-14 and 30-33 of a 60 s recording,
// joined end to end: 0-4 then 4-7 in the optimized buffer.
const kept = [
  { start: 10, end: 14 },
  { start: 30, end: 33 },
];
const optimized: AudioFile = {
  id: 'f',
  name: 'f',
  duration: 7,
  buffer: {} as AudioBuffer,
  optimization: { originalName: 'f.wav', originalDuration: 60, segments: kept },
};

describe('contiguousRange', () => {
  it('is the whole file for a file that was never optimized', () => {
    const plain: AudioFile = { id: 'p', name: 'p', duration: 20, buffer: {} as AudioBuffer };
    expect(contiguousRange(plain, 5, 6)).toEqual({ start: 0, end: 20 });
  });

  it('is the kept segment the clip sits in, so it cannot reach the next one', () => {
    expect(contiguousRange(optimized, 1, 2)).toEqual({ start: 0, end: 4 });
    expect(contiguousRange(optimized, 4.5, 6)).toEqual({ start: 4, end: 7 });
  });

  it('never cuts into a clip that already spans a join', () => {
    expect(contiguousRange(optimized, 3, 4.6)).toEqual({ start: 0, end: 4.6 });
  });
});

describe('optimized time', () => {
  it('maps kept original times into the joined buffer and back', () => {
    for (const time of [10, 12.5, 14, 30.5, 31.25, 33]) {
      expect(unmapTime(remapTime(time, kept), kept)).toBeCloseTo(time);
    }
    expect(remapTime(31, kept)).toBe(5);
  });

  it('reads the join itself as the end of the first segment', () => {
    expect(remapTime(30, kept)).toBe(4);
    expect(unmapTime(4, kept)).toBe(14);
  });
});

describe('computeUsedSegments', () => {
  const clips: AudioClip[] = [
    { id: 'a', name: 'a', audioFileId: 'f', startTime: 10, endTime: 12, duration: 2 },
    { id: 'b', name: 'b', audioFileId: 'f', startTime: 13, endTime: 14, duration: 1 },
    { id: 'c', name: 'c', audioFileId: 'f', startTime: 40, endTime: 41, duration: 1 },
  ];
  const tracks: Track[] = [
    {
      id: 't', name: 't', volume: 1, muted: false,
      // placed with its end trimmed out further than the library clip goes
      clips: [{ id: 'tc', clipId: 'c', position: 0, repeat: false, trimEnd: 44 }],
    },
  ];

  it('keeps every region in use, widened by trims, padded and merged', () => {
    expect(computeUsedSegments('f', clips, tracks, 60, 2)).toEqual([
      { start: 8, end: 16 },
      { start: 38, end: 46 },
    ]);
  });

  it('keeps nothing of a file no clip uses', () => {
    expect(computeUsedSegments('other', clips, tracks, 60)).toEqual([]);
  });
});
