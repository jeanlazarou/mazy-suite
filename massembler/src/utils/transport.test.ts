import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { AudioClip, AudioFile, Track } from '../types';
import { MockBuffer, MockContext, asAudioBuffer, last } from '../test/mockAudio';
import { AudioEngine } from './audioEngine';
import { play, seek, stop, toggleLoop, togglePlay } from './transport';

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
// Ends at 12 s: tc-3 runs from 10 to 12.
const audioFile: AudioFile = {
  id: 'f', name: 'f', duration: 20, buffer: asAudioBuffer(new MockBuffer(1, 200, 10)),
};

const s = () => useStore.getState();
const load = (name = 'p') =>
  s().loadProjectState(structuredClone(tracks), clips, [audioFile], 50, name);

/** Move the audio clock on, and let the playhead loop catch up. */
function advance(seconds: number) {
  const ctx = MockContext.created[0];
  if (ctx) ctx.currentTime += seconds;
  vi.advanceTimersByTime(seconds * 1000);
}

const spies = {
  play: vi.spyOn(AudioEngine.prototype, 'play'),
  replay: vi.spyOn(AudioEngine.prototype, 'replay'),
  setTrackLevels: vi.spyOn(AudioEngine.prototype, 'setTrackLevels'),
  stop: vi.spyOn(AudioEngine.prototype, 'stop'),
  setMasterVolume: vi.spyOn(AudioEngine.prototype, 'setMasterVolume'),
};
const playedFrom = () => last(spies.play.mock.calls)?.[3];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', MockContext);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  stop();
  load();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('transport', () => {
  it('moves the playhead without playing while stopped', () => {
    seek(4);
    expect(s().playbackState.currentTime).toBe(4);
    expect(spies.play).not.toHaveBeenCalled();
  });

  it('plays from the playhead, and the playhead follows the audio', () => {
    seek(4);
    togglePlay();

    expect(s().playbackState.isPlaying).toBe(true);
    expect(s().playbackState.duration).toBe(12);
    expect(playedFrom()).toBe(4);

    advance(0.5);
    expect(s().playbackState.currentTime).toBeGreaterThan(4.4);
  });

  it('carries on from where a seek lands while playing', () => {
    play();
    seek(9);
    expect(playedFrom()).toBe(9);
  });

  it('pauses where it is', () => {
    play();
    advance(1);
    togglePlay();

    expect(s().playbackState.isPlaying).toBe(false);
    expect(spies.stop).toHaveBeenCalled();
    expect(s().playbackState.currentTime).toBeGreaterThan(0.9);
  });

  it('starts over when played from the end', () => {
    s().setPlaybackState({ currentTime: 12 });
    play();
    expect(playedFrom()).toBe(0);
  });

  it('applies track settings at once while playing, without rescheduling', () => {
    play();
    s().updateTrack('track-1', { volume: 0.2 });

    expect(spies.setTrackLevels).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(spies.replay).not.toHaveBeenCalled();
  });

  it('reschedules clip edits once they pause, not on every move', () => {
    play();
    s().updateTrackClip('track-1', 'tc-1', { position: 2 });
    vi.advanceTimersByTime(50);
    s().updateTrackClip('track-1', 'tc-1', { position: 2.5 });
    vi.advanceTimersByTime(50);
    expect(spies.replay).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(spies.replay).toHaveBeenCalledTimes(1);
  });

  it('stops when a project is loaded over the one playing', () => {
    play();
    load('other');
    advance(0.05);

    expect(spies.stop).toHaveBeenCalled();
  });

  it('plays round the loop region while looping is on, never reaching the end', () => {
    s().setLoopRegion({ start: 2, end: 4 });
    s().setLoopEnabled(true);
    play();
    expect(last(spies.play.mock.calls)?.[4]).toEqual({ start: 2, end: 4 });

    advance(30); // well past the 12 s the project lasts
    expect(s().playbackState.isPlaying).toBe(true);
    expect(s().playbackState.currentTime).toBeGreaterThanOrEqual(2);
    expect(s().playbackState.currentTime).toBeLessThan(4);
  });

  it('reschedules when looping is switched while playing', () => {
    s().setLoopRegion({ start: 2, end: 4 });
    play();
    toggleLoop();
    vi.advanceTimersByTime(200);
    expect(last(spies.replay.mock.calls)?.[3]).toEqual({ start: 2, end: 4 });

    toggleLoop();
    vi.advanceTimersByTime(200);
    expect(last(spies.replay.mock.calls)?.[3]).toBeNull();
  });

  it('says how to mark a region when there is none to loop', () => {
    toggleLoop();
    expect(s().loopEnabled).toBe(false);
    expect(last(s().toasts)?.message).toMatch(/Shift-drag on the ruler/);
  });

  it('follows the master volume', () => {
    play();
    s().setMasterVolume(0.5);
    expect(spies.setMasterVolume).toHaveBeenCalledWith(0.5);
  });

  it('keeps to one audio context', () => {
    play();
    stop();
    play();
    expect(MockContext.created).toHaveLength(1);
  });
});
