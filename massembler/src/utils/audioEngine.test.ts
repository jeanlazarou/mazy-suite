import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioClip, AudioFile, Track, TrackClip } from '../types';
import {
  MockBuffer,
  MockContext,
  MockSource,
  asAudioBuffer,
  asAudioContext,
  last,
} from '../test/mockAudio';
import { AudioEngine } from './audioEngine';

const audioFile: AudioFile = {
  id: 'f',
  name: 'f',
  duration: 10,
  buffer: asAudioBuffer(new MockBuffer(1, 100, 10)),
};
const clip: AudioClip = { id: 'c', name: 'c', audioFileId: 'f', startTime: 1, endTime: 4, duration: 3 };
const placed = (id: string): TrackClip => ({ id, clipId: 'c', position: 2, repeat: false });

// Track 2 is muted.
const tracks: Track[] = [
  { id: 't1', name: 'T1', volume: 0.8, muted: false, clips: [placed('tc1')] },
  { id: 't2', name: 'T2', volume: 0.8, muted: true, clips: [placed('tc2')] },
];

const lastEvent = (events: unknown[][]) => last(events)?.slice(0, 3);

function expectStart(source: MockSource, expected: number[]) {
  (source.startArgs as number[]).forEach((value, i) => expect(value).toBeCloseTo(expected[i]));
}

let ctx: MockContext;
let engine: AudioEngine;

/** Play, and hand back the run's bus and track gains, made in that order. */
function play(from: number) {
  const first = ctx.gains.length;
  engine.play(tracks, [clip], [audioFile], from);
  const [bus, track1, track2] = ctx.gains.slice(first);
  return { bus, track1, track2 };
}

beforeEach(() => {
  vi.useFakeTimers();
  ctx = new MockContext();
  ctx.currentTime = 100;
  engine = new AudioEngine(asAudioContext(ctx));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AudioEngine', () => {
  it('gives every track its gain, muted ones at zero but still scheduled', () => {
    const { track1, track2 } = play(1);

    expect(engine.playing).toBe(true);
    expect(track1.gain.value).toBe(0.8);
    expect(track2.gain.value).toBe(0);
    expect(ctx.sources).toHaveLength(2);
    expectStart(ctx.sources[0], [100.02 + 1, 1, 3]);
  });

  it('fades in from silence, slightly ahead of the clock', () => {
    const { bus } = play(1);
    expect(bus.gain.events[0]).toEqual(['set', 0, 100.02]);
  });

  it('follows the clock, but never reads before where it started', () => {
    play(5);
    expect(engine.getCurrentTime()).toBe(5); // the lookahead has not run out yet

    ctx.currentTime = 101;
    expect(engine.getCurrentTime()).toBeCloseTo(5.98);
  });

  it('follows volume, mute and solo while playing', () => {
    const { track1, track2 } = play(1);

    engine.setTrackLevels([{ ...tracks[0], solo: true }, { ...tracks[1], muted: false }]);
    expect(lastEvent(track1.gain.events)?.[1]).toBe(0.8);
    expect(lastEvent(track2.gain.events)?.[1]).toBe(0); // unmuted, but silenced by solo

    engine.setTrackLevels([{ ...tracks[0], volume: 0.3 }, { ...tracks[1], muted: false }]);
    expect(lastEvent(track1.gain.events)?.[1]).toBe(0.3);
    expect(lastEvent(track2.gain.events)?.[1]).toBe(0.8);
  });

  it('reschedules an edit mid-play from the same spot, crossfaded', () => {
    const { bus } = play(1);
    ctx.currentTime = 102; // timeline 2.98: nearly a second into the clip
    const before = engine.getCurrentTime();
    const oldSources = [...ctx.sources];
    const firstNew = ctx.gains.length;

    engine.replay(tracks, [clip], [audioFile]);

    expect(engine.getCurrentTime()).toBeCloseTo(before);
    expect(lastEvent(bus.gain.events)).toEqual(['target', 0, 102.02]);
    expect(ctx.gains[firstNew].gain.events[0]).toEqual(['set', 0, 102.02]);
    oldSources.forEach((source) => expect(source.stops[0]).toBeCloseTo(102.05));
    expectStart(ctx.sources[2], [102.02, 2, 2]);
  });

  it('stops with a short fade, then tears the run down', () => {
    const { bus } = play(1);
    ctx.currentTime = 103;

    engine.stop();

    expect(engine.playing).toBe(false);
    expect(engine.getCurrentTime()).toBe(0);
    expect(lastEvent(bus.gain.events)).toEqual(['target', 0, 103]);
    ctx.sources.forEach((source) => expect(source.stops[0]).toBeCloseTo(103.03));

    expect(bus.disconnected).toBe(false);
    vi.advanceTimersByTime(200);
    expect(bus.disconnected).toBe(true);
  });

  it('at the natural end, lets reverb tails ring out before tearing down', () => {
    const { bus } = play(0);

    engine.stop(true);

    expect(bus.gain.events.filter(([kind, value]) => kind === 'target' && value === 0)).toEqual([]);
    ctx.sources.forEach((source) => expect(source.stops).toEqual([]));

    vi.advanceTimersByTime(1000);
    expect(bus.disconnected).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(bus.disconnected).toBe(true);
  });
});
