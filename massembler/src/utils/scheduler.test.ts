import { describe, expect, it } from 'vitest';
import { AudioClip, AudioFile, Track, TrackClip } from '../types';
import {
  MockBuffer,
  MockContext,
  MockNode,
  MockSource,
  asAudioBuffer,
  asAudioContext,
  last,
} from '../test/mockAudio';
import { fadeEnvelope, fadeGainAt, scheduleArrangement } from './scheduler';

// A 10 s file; the clip plays its seconds 1 to 4, placed at timeline second 2.
const audioFile: AudioFile = {
  id: 'f',
  name: 'f',
  duration: 10,
  buffer: asAudioBuffer(new MockBuffer(1, 100, 10)),
};
const clip: AudioClip = { id: 'c', name: 'c', audioFileId: 'f', startTime: 1, endTime: 4, duration: 3 };
const placed = (extra: Partial<TrackClip> = {}): TrackClip => ({
  id: 'tc', clipId: 'c', position: 2, repeat: false, ...extra,
});
const track = (clips: TrackClip[]): Track => ({ id: 't1', name: 'T', volume: 0.8, muted: false, clips });

/** Schedule one track clip so that timeline time `from` plays at context time `at`. */
function schedule(trackClip: TrackClip, from: number, at = 10) {
  const ctx = new MockContext();
  const output = new MockNode() as unknown as AudioNode;
  scheduleArrangement(asAudioContext(ctx), [track([trackClip])], [clip], [audioFile], () => output, from, at);
  return ctx;
}

function expectStart(source: MockSource, [when, offset, duration]: number[]) {
  expect(source.startArgs).not.toBeNull();
  const [w, o, d] = source.startArgs as number[];
  expect(w).toBeCloseTo(when);
  expect(o).toBeCloseTo(offset);
  expect(d).toBeCloseTo(duration);
}

describe('fadeEnvelope', () => {
  it('is flat without fades', () => {
    expect(fadeEnvelope(3, 0, 0)).toEqual([{ time: 0, gain: 1 }, { time: 3, gain: 1 }]);
  });

  it('meets in a peak below one when the fades overlap', () => {
    expect(fadeEnvelope(2, 2, 2).map((p) => [p.time, p.gain])).toEqual([[0, 0], [1, 0.5], [2, 0]]);
  });

  it('ramps across the whole clip when a fade is longer than it', () => {
    const [first, last] = fadeEnvelope(2, 3, 0);
    expect(first).toEqual({ time: 0, gain: 0 });
    expect(last.time).toBe(2);
    expect(last.gain).toBeCloseTo(2 / 3);
  });

  it('gives the level anywhere in between', () => {
    expect(fadeGainAt(3, 1, 1, 2.5)).toBe(0.5);
  });
});

describe('scheduleArrangement', () => {
  it('starts a clip ahead of the playhead when the playhead reaches it', () => {
    expectStart(schedule(placed(), 0).sources[0], [12, 1, 3]);
  });

  it('starts a clip the playhead is inside part-way through', () => {
    expectStart(schedule(placed(), 3).sources[0], [10, 2, 2]);
  });

  it('leaves out a clip that is already over', () => {
    expect(schedule(placed(), 6).sources).toHaveLength(0);
  });

  it('schedules every repetition still to come', () => {
    const { sources } = schedule(placed({ repeat: true, repeatCount: 3 }), 4);
    expect(sources).toHaveLength(3);
    expectStart(sources[0], [10, 3, 1]); // the first, a second from its end
    expectStart(sources[1], [11, 1, 3]);
    expectStart(sources[2], [14, 1, 3]);

    expect(schedule(placed({ repeat: true, repeatCount: 3 }), 9).sources).toHaveLength(1);
  });

  it('reads the mirrored region of a reversed clip', () => {
    expectStart(schedule(placed({ effect: 'reverse' }), 3).sources[0], [10, 7, 2]);
  });

  it('reads a pitched-down clip at its slower rate', () => {
    expectStart(schedule(placed({ effect: 'deep' }), 3).sources[0], [10, 1.75, 1.5]);
  });

  it('cuts passes short at `until`, and leaves out those starting at or after it', () => {
    const ctx = new MockContext();
    const output = new MockNode() as unknown as AudioNode;
    const repeating = placed({ repeat: true, repeatCount: 3 }); // passes at 2, 5 and 8
    scheduleArrangement(asAudioContext(ctx), [track([repeating])], [clip], [audioFile], () => output, 3, 10, 6);

    expect(ctx.sources).toHaveLength(2);
    expectStart(ctx.sources[0], [10, 2, 2]); // the first plays out: it ends at 5
    expectStart(ctx.sources[1], [12, 1, 1]); // the second stops at 6, a second in
  });

  it('leaves out tracks the caller has no input for', () => {
    const ctx = new MockContext();
    scheduleArrangement(asAudioContext(ctx), [track([placed()])], [clip], [audioFile], () => null, 0, 0);
    expect(ctx.sources).toHaveLength(0);
  });
});

describe('scheduled fades', () => {
  const fades = { fadeIn: 1, fadeOut: 1 };
  const automation = (from: number) => schedule(placed(fades), from).gains[0].gain.events;

  it('adds no automation to a clip without fades', () => {
    expect(schedule(placed(), 0).gains[0].gain.events).toEqual([]);
  });

  it('runs the whole envelope when the clip is reached from before', () => {
    const events = automation(0);
    expect(events[0]).toEqual(['set', 0, 12]);
    expect(last(events)).toEqual(['ramp', 0, 15]);
  });

  it('picks a fade-out up at its level, not at full volume', () => {
    const events = automation(4.5);
    expect(events[0]).toEqual(['set', 0.5, 10]);
    expect(last(events)).toEqual(['ramp', 0, 10.5]);
  });

  it("scales the envelope by the clip's own volume", () => {
    const events = schedule(placed({ ...fades, gain: 1.5 }), 4.5).gains[0].gain.events;
    expect(events[0]).toEqual(['set', 0.75, 10]); // half way down the fade-out, at 1.5
  });

  it("sets a clip's volume directly when it has no fades", () => {
    const fade = schedule(placed({ gain: 0.5 }), 0).gains[0];
    expect(fade.gain.value).toBe(0.5);
    expect(fade.gain.events).toEqual([]);
  });

  it('picks a fade-in up part-way, not from silence', () => {
    const events = automation(2.5);
    expect(events[0]).toEqual(['set', 0.5, 10]);
    expect(events[1]).toEqual(['ramp', 1, 10.5]);
    expect(last(events)).toEqual(['ramp', 0, 12.5]);
  });
});
