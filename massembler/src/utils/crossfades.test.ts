import { describe, expect, it } from 'vitest';
import { AudioClip, AudioFile, Track, TrackClip } from '../types';
import { clipBefore, crossfadeHalf, crossfadeReach, heardCrossfade } from './crossfades';

// Two clips cut from different parts of a 60 s file: A plays 10-14, B 30-33.
const clipA: AudioClip = { id: 'A', name: 'A', audioFileId: 'f', startTime: 10, endTime: 14, duration: 4 };
const clipB: AudioClip = { id: 'B', name: 'B', audioFileId: 'f', startTime: 30, endTime: 33, duration: 3 };
const file: AudioFile = { id: 'f', name: 'f', duration: 60, buffer: {} as AudioBuffer };
const clips = [clipA, clipB];

const placed = (id: string, clipId: string, position: number, extra: Partial<TrackClip> = {}): TrackClip => ({
  id, clipId, position, repeat: false, ...extra,
});
const track = (...trackClips: TrackClip[]): Track => ({
  id: 't', name: 't', volume: 1, muted: false, clips: trackClips,
});
const side = (trackClip: TrackClip, clip: AudioClip) => ({ trackClip, clip, fileDuration: 60 });

describe('clipBefore', () => {
  it('finds the clip that ends exactly where this one starts', () => {
    const b = placed('b', 'B', 4);
    expect(clipBefore(track(placed('a', 'A', 0), b), b, clips)?.id).toBe('a');
  });

  it('counts a repeating clip to the end of its last repetition', () => {
    const b = placed('b', 'B', 8);
    const repeating = placed('a', 'A', 0, { repeat: true, repeatCount: 2 });
    expect(clipBefore(track(repeating, b), b, clips)?.id).toBe('a');
  });

  it('finds nothing across a gap', () => {
    const b = placed('b', 'B', 4.5);
    expect(clipBefore(track(placed('a', 'A', 0), b), b, clips)).toBeNull();
  });
});

describe('crossfadeHalf', () => {
  const a = placed('a', 'A', 0);
  const b = placed('b', 'B', 4);

  it('is half of what was asked for, when there is audio on both sides of the cut', () => {
    expect(crossfadeHalf(side(a, clipA), side(b, clipB), 1)).toBe(0.5);
  });

  it('is cut down to the audio there is past the earlier clip', () => {
    const nearEnd = { ...clipA, startTime: 56, endTime: 59.8, duration: 3.8 };
    expect(crossfadeHalf(side(a, nearEnd), side(b, clipB), 1)).toBeCloseTo(0.2);
  });

  it('is cut down to the audio there is before the later clip', () => {
    const fromTheTop = { ...clipB, startTime: 0.1, endTime: 3.1 };
    expect(crossfadeHalf(side(a, clipA), side(b, fromTheTop), 1)).toBeCloseTo(0.1);
  });

  it('never takes more than half of either clip', () => {
    expect(crossfadeHalf(side(a, clipA), side(b, clipB), 10)).toBe(1.5); // B is 3 s long
  });

  it('reads past the cut the way the clip plays', () => {
    // Reversed, A plays 14 down to 10: what follows its end is before second 10.
    const reversedEarly = { ...clipA, startTime: 0.3, endTime: 4.3 };
    expect(crossfadeHalf(side(placed('a', 'A', 0, { effect: 'reverse' }), reversedEarly), side(b, clipB), 1))
      .toBeCloseTo(0.3);
    // Pitched down, A reads 10 to 13 at 0.75 s a second: 47 s of file are left,
    // which last 62.7 s at that rate.
    expect(crossfadeHalf(side(placed('a', 'A', 0, { effect: 'deep' }), clipA), side(b, clipB), 1)).toBe(0.5);
  });
});

describe('heardCrossfade', () => {
  it('is the length heard at a clip\'s start, or nothing without a touching clip', () => {
    const a = placed('a', 'A', 0);
    const b = placed('b', 'B', 4, { crossfade: 0.6 });
    expect(heardCrossfade(track(a, b), b, clips, [file])).toBeCloseTo(0.6);
    expect(heardCrossfade(track(a, b), a, clips, [file])).toBe(0); // asks for none

    const apart = { ...b, position: 6 };
    expect(heardCrossfade(track(a, apart), apart, clips, [file])).toBe(0);
  });
});

describe('crossfadeReach', () => {
  it('lets the earlier clip reach on and the later one reach back, by the same amount', () => {
    const reach = crossfadeReach(
      track(placed('a', 'A', 0), placed('b', 'B', 4, { crossfade: 0.6 })),
      clips,
      [file]
    );
    expect(reach.get('a')).toEqual({ before: 0, after: 0.3 });
    expect(reach.get('b')).toEqual({ before: 0.3, after: 0 });
  });

  it('ignores a crossfade with no clip touching it', () => {
    const reach = crossfadeReach(
      track(placed('a', 'A', 0), placed('b', 'B', 6, { crossfade: 0.6 })),
      clips,
      [file]
    );
    expect(reach.size).toBe(0);
  });
});
