import { beforeEach, describe, expect, it, vi } from 'vitest';
import { history, useStore } from './store';
import { MockContext } from './test/mockAudio';
import { AudioClip, AudioFile, Track, TrackClip } from './types';

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

describe('removing an audio file', () => {
  const file = (id: string): AudioFile => ({
    id, name: `${id}.mp3`, duration: 10, buffer: {} as AudioBuffer,
  });

  // A comes from f1 and is placed twice, once linked with B, which comes from f2.
  beforeEach(() => {
    const tracks: Track[] = [
      {
        id: 'track-1', name: 'T1', volume: 0.8, muted: false,
        clips: [placed('tc-1', 'A', 0, 'link-1'), placed('tc-2', 'B', 2, 'link-1'), placed('tc-3', 'A', 4)],
      },
    ];
    s().loadProjectState(
      tracks,
      [{ ...clip('A'), audioFileId: 'f1' }, { ...clip('B'), audioFileId: 'f2' }],
      [file('f1'), file('f2')],
      50,
      'files'
    );
  });

  it('takes its clips and their track clips with it, unlinking a partner left alone', () => {
    s().removeAudioFile('f1');

    expect(s().audioFiles.map((f) => f.id)).toEqual(['f2']);
    expect(clipOrder()).toBe('B');
    expect(find('tc-1')).toBeNull();
    expect(find('tc-3')).toBeNull();
    expect(find('tc-2')?.linkId).toBeUndefined();
  });

  it('undoes in one step, file, clips and track clips together', () => {
    s().removeAudioFile('f1');
    s().undo();

    expect(s().audioFiles.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(clipOrder()).toBe('A,B');
    expect(find('tc-1')?.linkId).toBe('link-1');
    expect(find('tc-3')).not.toBeNull();
  });

  it('leaves clips and tracks untouched when the file gave no clips', () => {
    s().addAudioFile(file('f3'));
    const { clips, tracks } = s();

    s().removeAudioFile('f3');

    expect(s().audioFiles.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(s().clips).toBe(clips);
    expect(s().tracks).toBe(tracks);
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

describe('the audio context', () => {
  it('is made once, on first use, and shared after that', () => {
    vi.stubGlobal('AudioContext', MockContext);
    const before = MockContext.created.length;

    const first = s().ensureAudioContext();
    const second = s().ensureAudioContext();

    expect(second).toBe(first);
    expect(MockContext.created.length).toBe(before + 1);
    vi.unstubAllGlobals();
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
