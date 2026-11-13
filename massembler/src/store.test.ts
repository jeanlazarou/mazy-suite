import { beforeEach, describe, expect, it, vi } from 'vitest';
import { history, useStore } from './store';
import { MockContext, last } from './test/mockAudio';
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

describe('editing the selected clips', () => {
  // From the shared project: clips are 1 s long; tc-1 (A) at 0 and tc-2 (B)
  // at 2 on track 1 are linked; tc-3 (C) at 4 is linked with tc-5 and tc-6.
  const select = (...ids: string[]) =>
    useStore.setState({
      selectedTrackClips: ids.map((id) => ({ trackId: find(id)!.trackId, trackClipId: id })),
    });
  const ids = () => s().selectedTrackClips.map((r) => r.trackClipId);

  it('splits at the playhead in one undo step, selecting the second part', () => {
    select('tc-4');
    expect(s().splitSelectedAt(0.25)).toEqual({ split: 1, repeating: 0 });

    const second = find(ids()[0])!;
    expect(second.position).toBe(0.25);
    expect(find('tc-4')?.trimEnd).toBe(0.25);

    s().undo();
    expect(find('tc-4')?.trimEnd).toBeUndefined();
    expect(s().tracks[1].clips).toHaveLength(3);
  });

  it('reports a repeating clip under the playhead rather than splitting it', () => {
    s().updateTrackClip('track-2', 'tc-4', { repeat: true, repeatCount: 3 });
    select('tc-4');
    expect(s().splitSelectedAt(1.5)).toEqual({ split: 0, repeating: 1 });
  });

  it('pastes copies at a time, selecting them; the clipboard survives undo', () => {
    select('tc-4');
    expect(s().copySelected()).toBe(1);
    expect(s().pasteAt(10)).toBe(true);

    const [pasted] = ids();
    expect(pasted).not.toBe('tc-4');
    expect(find(pasted)?.position).toBe(10);

    s().undo();
    expect(find(pasted)).toBeNull();
    expect(s().clipboard).toHaveLength(1);
    expect(s().pasteAt(0.5)).toBe(false); // over tc-4 itself
    expect(s().pasteAt(1)).toBe(true); // just after it is fine
  });

  it('duplicates straight after the selection, again and again', () => {
    select('tc-4');
    expect(s().duplicateSelected()).toBe(true);
    expect(find(ids()[0])?.position).toBe(1);
    expect(s().duplicateSelected()).toBe(true);
    expect(find(ids()[0])?.position).toBe(2);
    expect(s().duplicateSelected()).toBe(true); // 3-4 ends exactly where tc-5 starts
    expect(s().duplicateSelected()).toBe(false); // 4-5 is tc-5's
  });

  it('deletes the selected clips with the rest of their linked groups', () => {
    select('tc-1', 'tc-4');
    s().deleteSelected();

    expect(find('tc-1')).toBeNull();
    expect(find('tc-2')).toBeNull(); // tc-1's partner
    expect(find('tc-4')).toBeNull();
    expect(find('tc-3')).not.toBeNull();
    expect(ids()).toEqual([]);
  });

  it('copies a whole group in place, as a group of its own', () => {
    s().copyInPlace([
      { trackId: 'track-1', trackClipId: 'tc-1' },
      { trackId: 'track-1', trackClipId: 'tc-2' },
    ]);

    const copies = s().tracks[0].clips.filter((tc) => !['tc-1', 'tc-2', 'tc-3'].includes(tc.id));
    expect(copies.map((tc) => tc.position)).toEqual([0, 2]);
    expect(copies[0].linkId).toBe(copies[1].linkId);
    expect(copies[0].linkId).not.toBe('link-1');
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

describe('tracks', () => {
  it('move to another place in the list, as one undo step', () => {
    s().addTrack();
    const third = s().tracks[2].id;

    s().moveTrack(third, 0);
    expect(s().tracks.map((t) => t.id)).toEqual([third, 'track-1', 'track-2']);

    s().undo();
    expect(s().tracks.map((t) => t.id)).toEqual(['track-1', 'track-2', third]);
  });

  it('stay put when moved to where they are, or nowhere', () => {
    const before = s().tracks;
    s().moveTrack('track-1', 0);
    s().moveTrack('no-such-track', 1);
    expect(s().tracks).toBe(before);
  });
});

describe('a new project', () => {
  it('starts as a first visit does: one empty track, nothing else, a fresh history', () => {
    s().setMasterVolume(0.5);
    s().setLoopRegion({ start: 1, end: 3 });
    useStore.setState({ selectedTrackClips: [{ trackId: 'track-1', trackClipId: 'tc-1' }] });
    s().copySelected();
    s().addTrack();

    s().clearProject();

    expect(s().tracks).toEqual([
      { id: 'track-1', name: 'Track 1', clips: [], volume: 0.8, muted: false },
    ]);
    expect(s().clips).toEqual([]);
    expect(s().audioFiles).toEqual([]);
    expect(s().clipboard).toEqual([]);
    expect(s().masterVolume).toBe(1);
    expect(s().loopRegion).toBeNull();
    expect(history.canUndo()).toBe(false);

    s().addTrack();
    expect(last(s().tracks)?.id).toBe('track-2'); // ids start again
  });
});

describe('loop and master', () => {
  it('only loops once there is a region, and stops looping when it is cleared', () => {
    s().setLoopEnabled(true);
    expect(s().loopEnabled).toBe(false);

    s().setLoopRegion({ start: 1, end: 3 });
    s().setLoopEnabled(true);
    expect(s().loopEnabled).toBe(true);

    s().setLoopRegion(null);
    expect(s().loopEnabled).toBe(false);
  });

  it('takes the master volume from a loaded project, and leaves the loop behind', () => {
    s().setLoopRegion({ start: 1, end: 3 });
    s().loadProjectState([], [], [], 50, 'quiet', 0.6);

    expect(s().masterVolume).toBe(0.6);
    expect(s().loopRegion).toBeNull();

    s().loadProjectState([], [], [], 50, 'older'); // saved before master volume existed
    expect(s().masterVolume).toBe(1);
  });

  it('keeps the master volume and the loop out of the undo history', () => {
    s().setMasterVolume(0.3);
    s().setLoopRegion({ start: 1, end: 3 });
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
