import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { history, useStore } from '../store';
import { AudioClip, Track } from '../types';

// The history is exercised through the store, which records every change to
// tracks and clips by itself.

const clip = (id: string): AudioClip => ({
  id, name: id, audioFileId: 'f', startTime: 0, endTime: 1, duration: 1,
});
const s = () => useStore.getState();
const trackIds = () => s().tracks.map((t) => t.id).join(',');
const position = () => s().tracks.flatMap((t) => t.clips).find((tc) => tc.id === 'tc-1')?.position;
const trackOf = (trackClipId: string) =>
  s().tracks.find((t) => t.clips.some((tc) => tc.id === trackClipId))?.id;

/** How many steps can be undone, counted by undoing them all and redoing them. */
function depth() {
  let steps = 0;
  while (history.canUndo()) {
    history.undo();
    steps++;
  }
  for (let i = 0; i < steps; i++) history.redo();
  return steps;
}

let clock = 1_000_000;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  const tracks: Track[] = [
    {
      id: 'track-1', name: 'T1', volume: 0.8, muted: false,
      clips: [{ id: 'tc-1', clipId: 'A', position: 4, repeat: false }],
    },
    { id: 'track-2', name: 'T2', volume: 0.8, muted: false, clips: [] },
  ];
  s().loadProjectState(tracks, [clip('A')], [], 50, 'test');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what can be undone', () => {
  it('adding a track', async () => {
    s().addTrack();
    await Promise.resolve();
    expect(s().undoAvailable).toBe(true); // mirrored into the store for the buttons

    s().undo();
    expect(trackIds()).toBe('track-1,track-2');
    s().redo();
    expect(s().tracks).toHaveLength(3);
  });

  it('creating and renaming a library clip, one step each', () => {
    s().addClip(clip('E'));
    s().updateClip('E', { name: 'renamed' });

    s().undo();
    expect(s().clips.find((c) => c.id === 'E')?.name).toBe('E');
    s().undo();
    expect(s().clips.map((c) => c.id)).toEqual(['A']);
  });

  it('mute and solo, as separate steps', () => {
    s().updateTrack('track-1', { muted: true });
    s().updateTrack('track-1', { solo: true });

    s().undo();
    expect(s().tracks[0].solo).toBeUndefined();
    expect(s().tracks[0].muted).toBe(true);
    s().undo();
    expect(s().tracks[0].muted).toBe(false);
  });

  it('not the project name, the zoom or the selection', () => {
    s().setProjectName('renamed');
    s().setPixelsPerSecond(120);
    s().setSelectedTrackClip({ trackId: 'track-1', trackClipId: 'tc-1' });
    expect(history.canUndo()).toBe(false);
  });
});

describe('bursts', () => {
  const turnKnob = (trackId: string, volume: number) => {
    clock += 200;
    history.coalesced(`volume:${trackId}`, () => s().updateTrack(trackId, { volume }));
  };

  it('a run of edits to one control is one step', () => {
    turnKnob('track-1', 0.7);
    turnKnob('track-1', 0.6);
    turnKnob('track-1', 0.5);
    expect(depth()).toBe(1);

    s().undo();
    expect(s().tracks[0].volume).toBe(0.8);
  });

  it('another control, or a pause, starts a new step', () => {
    turnKnob('track-1', 0.7);
    turnKnob('track-2', 0.3);
    expect(depth()).toBe(2);

    clock += 5000;
    turnKnob('track-2', 0.2);
    expect(depth()).toBe(3);
  });

  it('an unrelated edit in between ends the burst', () => {
    turnKnob('track-1', 0.4);
    s().updateTrack('track-1', { muted: true });
    turnKnob('track-1', 0.3);

    s().undo();
    expect(s().tracks[0].volume).toBe(0.4);
  });
});

describe('gestures', () => {
  it('a drag is one step, and undoes back to where it started', () => {
    history.beginGesture();
    for (const p of [5, 6, 7]) s().updateTrackClip('track-1', 'tc-1', { position: p });
    s().moveClipBetweenTracks('track-1', 'track-2', 'tc-1', 8);
    history.endGesture();

    expect(depth()).toBe(1);
    s().undo();
    expect(trackOf('tc-1')).toBe('track-1');
    expect(position()).toBe(4);
  });

  it('a click that changes nothing files nothing', () => {
    history.beginGesture();
    history.endGesture();
    expect(history.canUndo()).toBe(false);
  });

  it('undo is ignored while a drag is still writing', () => {
    history.beginGesture();
    s().updateTrackClip('track-1', 'tc-1', { position: 9 });
    s().undo();
    expect(position()).toBe(9);
    history.endGesture();
  });

  it('a gesture whose mouseup never came is closed by the next one', () => {
    history.beginGesture();
    s().updateTrackClip('track-1', 'tc-1', { position: 9 });
    history.beginGesture();
    s().updateTrackClip('track-1', 'tc-1', { position: 10 });
    history.endGesture();

    s().undo();
    expect(position()).toBe(9);
    s().undo();
    expect(position()).toBe(4);
  });
});

describe('the stacks', () => {
  it('a new edit drops what could have been redone', () => {
    s().addTrack();
    s().undo();
    expect(history.canRedo()).toBe(true);

    s().updateTrack('track-1', { name: 'x' });
    expect(history.canRedo()).toBe(false);
  });

  it('keeps the last 100 steps', () => {
    for (let i = 0; i < 130; i++) s().updateTrack('track-1', { volume: i / 200 });
    expect(depth()).toBe(100);
  });
});
