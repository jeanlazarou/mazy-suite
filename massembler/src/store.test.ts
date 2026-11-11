import { beforeEach, describe, expect, it } from 'vitest';
import { history, useStore } from './store';
import { AudioClip, Track, TrackClip } from './types';

const clip = (id: string): AudioClip => ({
  id, name: id, audioFileId: 'f', startTime: 0, endTime: 1, duration: 1,
});
const placed = (id: string, clipId: string, position: number, linkId?: string): TrackClip => ({
  id, clipId, position, repeat: false, ...(linkId ? { linkId } : {}),
});

const s = () => useStore.getState();
const clipOrder = () => s().clips.map((c) => c.id).join(',');
const find = (trackClipId: string) => {
  for (const track of s().tracks) {
    const trackClip = track.clips.find((tc) => tc.id === trackClipId);
    if (trackClip) return { trackId: track.id, ...trackClip };
  }
  return null;
};

// tc-1/tc-2 are one linked pair; tc-3, tc-5 and tc-6 a group of three.
function loadProject() {
  const tracks: Track[] = [
    {
      id: 'track-1', name: 'T1', volume: 0.8, muted: false,
      clips: [placed('tc-1', 'A', 0, 'link-1'), placed('tc-2', 'B', 2, 'link-1'), placed('tc-3', 'C', 4, 'link-2')],
    },
    {
      id: 'track-2', name: 'T2', volume: 0.8, muted: false,
      clips: [placed('tc-4', 'A', 0), placed('tc-5', 'B', 4, 'link-2'), placed('tc-6', 'B', 6, 'link-2')],
    },
  ];
  s().loadProjectState(tracks, [clip('A'), clip('B'), clip('C'), clip('D')], [], 50, 'test');
}

beforeEach(loadProject);

describe('deleting a library clip', () => {
  it('takes its track clips with it, and unlinks a partner left on its own', () => {
    s().removeClip('A');

    expect(clipOrder()).toBe('B,C,D');
    expect(find('tc-1')).toBeNull();
    expect(find('tc-4')).toBeNull();
    expect(find('tc-2')?.linkId).toBeUndefined();
  });

  it('keeps a group linked while it still has two members', () => {
    s().removeClip('C');

    expect(find('tc-3')).toBeNull();
    expect(find('tc-5')?.linkId).toBe('link-2');
    expect(find('tc-6')?.linkId).toBe('link-2');
  });

  it('undoes in one step, putting the clip back in its place', () => {
    s().removeClip('A');
    s().undo();

    expect(clipOrder()).toBe('A,B,C,D');
    expect(find('tc-1')?.linkId).toBe('link-1');
    expect(find('tc-2')?.linkId).toBe('link-1');
    expect(find('tc-4')?.trackId).toBe('track-2');

    s().redo();
    expect(clipOrder()).toBe('B,C,D');
    expect(find('tc-1')).toBeNull();
  });

  it('leaves the tracks untouched when the clip was not placed', () => {
    const before = s().tracks;
    s().removeClip('D');
    expect(s().tracks).toBe(before);
  });
});

describe('loading a project', () => {
  it('drops track clips whose library clip is gone, unlinking what that leaves alone', () => {
    const tracks: Track[] = [
      {
        id: 'track-1', name: 'T1', volume: 0.8, muted: false,
        clips: [placed('tc-8', 'gone', 20, 'link-3'), placed('tc-9', 'B', 22, 'link-3'), placed('tc-2', 'B', 2, 'link-1'), placed('tc-1', 'A', 0, 'link-1')],
      },
    ];
    s().loadProjectState(tracks, [clip('A'), clip('B')], [], 50, 'old');

    expect(find('tc-8')).toBeNull();
    expect(find('tc-9')?.linkId).toBeUndefined();
    expect(find('tc-2')?.linkId).toBe('link-1');
  });

  it('starts a fresh undo history', () => {
    s().addTrack();
    expect(history.canUndo()).toBe(true);

    loadProject();
    expect(history.canUndo()).toBe(false);
  });
});

describe('snap setting', () => {
  it('is on by default and remembered when changed', () => {
    expect(s().snapEnabled).toBe(true);

    s().setSnapEnabled(false);
    expect(s().snapEnabled).toBe(false);
    expect(localStorage.getItem('massembler.snap')).toBe('off');

    s().setSnapEnabled(true);
    expect(localStorage.getItem('massembler.snap')).toBe('on');
  });
});
