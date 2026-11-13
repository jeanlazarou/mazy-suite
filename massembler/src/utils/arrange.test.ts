import { describe, expect, it } from 'vitest';
import { AudioClip, Track, TrackClip } from '../types';
import { last } from '../test/mockAudio';
import { copiedSpan, copyTrackClips, placeCopies, splitTrackClip } from './arrange';

// The clip plays seconds 1 to 5 of its file; placed at timeline second 10.
const clip: AudioClip = { id: 'c', name: 'c', audioFileId: 'f', startTime: 1, endTime: 5, duration: 4 };
const placed = (extra: Partial<TrackClip> = {}): TrackClip => ({
  id: 'tc', clipId: 'c', position: 10, repeat: false, ...extra,
});

describe('splitTrackClip', () => {
  it('cuts a clip in two where the playhead is, each keeping its own audio', () => {
    const [first, second] = splitTrackClip(placed(), clip, 11.5, 'tc-new')!;

    expect(first).toMatchObject({ id: 'tc', position: 10, trimStart: 1, trimEnd: 2.5 });
    expect(second).toMatchObject({ id: 'tc-new', position: 11.5, trimStart: 2.5, trimEnd: 5 });
  });

  it('gives the fade-in to the first part and the fade-out to the second', () => {
    const [first, second] = splitTrackClip(placed({ fadeIn: 0.5, fadeOut: 3 }), clip, 11, 'x')!;

    expect(first.fadeIn).toBe(0.5);
    expect(first.fadeOut).toBeUndefined();
    expect(second.fadeIn).toBeUndefined();
    expect(second.fadeOut).toBe(3); // the fade still ends where it did
  });

  it('cuts a reversed clip where its audio actually is', () => {
    // Reversed, the clip plays from second 5 down to 1: 1.5 s in, it is at 3.5.
    const [first, second] = splitTrackClip(placed({ effect: 'reverse' }), clip, 11.5, 'x')!;

    expect(first).toMatchObject({ trimStart: 3.5, trimEnd: 5 });
    expect(second).toMatchObject({ trimStart: 1, trimEnd: 3.5 });
  });

  it('cuts a pitched-down clip where its slower read has got to', () => {
    // Deep reads 0.75 s of file per second: 2 s in, it has read up to 2.5.
    const [first, second] = splitTrackClip(placed({ effect: 'deep' }), clip, 12, 'x')!;

    expect(first).toMatchObject({ trimStart: 1, trimEnd: 3 });
    expect(second).toMatchObject({ position: 12, trimStart: 2.5, trimEnd: 4.5 });
  });

  it('keeps the effect, volume and link on both parts', () => {
    const [first, second] = splitTrackClip(
      placed({ effect: 'telephone', gain: 1.5, linkId: 'link-1' }), clip, 11, 'x'
    )!;
    for (const part of [first, second]) {
      expect(part).toMatchObject({ effect: 'telephone', gain: 1.5, linkId: 'link-1' });
    }
  });

  it('leaves a crossfade with the clip before on the first part only', () => {
    const [first, second] = splitTrackClip(placed({ crossfade: 0.4 }), clip, 11, 'x')!;
    expect(first.crossfade).toBe(0.4);
    expect(second.crossfade).toBeUndefined();
  });

  it('does nothing outside the clip or at its very edges', () => {
    expect(splitTrackClip(placed(), clip, 9, 'x')).toBeNull();
    expect(splitTrackClip(placed(), clip, 10, 'x')).toBeNull();
    expect(splitTrackClip(placed(), clip, 14, 'x')).toBeNull();
  });

  it('leaves a repeating clip alone', () => {
    expect(splitTrackClip(placed({ repeat: true, repeatCount: 3 }), clip, 11, 'x')).toBeNull();
  });
});

describe('copying and placing clips', () => {
  const tracks: Track[] = [
    {
      id: 't1', name: 'T1', volume: 1, muted: false,
      clips: [placed({ id: 'a', position: 2, linkId: 'link-1' }), placed({ id: 'b', position: 20 })],
    },
    {
      id: 't2', name: 'T2', volume: 1, muted: false,
      clips: [placed({ id: 'c', position: 4, linkId: 'link-1' }), placed({ id: 'd', position: 8, linkId: 'link-2' })],
    },
    {
      id: 't3', name: 'T3', volume: 1, muted: false,
      clips: [placed({ id: 'e', position: 30, linkId: 'link-2' })],
    },
  ];
  let next = 0;
  const newId = () => `tc-${++next}`;
  const newLinkId = () => `copy-link-${++next}`;

  it('remembers each clip relative to the earliest, on its own track', () => {
    const copied = copyTrackClips(tracks, [
      { trackId: 't1', trackClipId: 'a' },
      { trackId: 't2', trackClipId: 'c' },
    ]);
    expect(copied.map((c) => [c.trackId, c.offset])).toEqual([['t1', 0], ['t2', 2]]);
    expect(copiedSpan(copied, [clip])).toBe(6); // c ends 2 + 4 s after a starts
  });

  it('keeps a link only when the whole group is copied', () => {
    const copied = copyTrackClips(tracks, [
      { trackId: 't1', trackClipId: 'a' },
      { trackId: 't2', trackClipId: 'c' },
      { trackId: 't2', trackClipId: 'd' }, // its partner e is left behind
    ]);
    expect(copied.map((c) => c.trackClip.linkId)).toEqual(['link-1', 'link-1', undefined]);
  });

  it('places copies at a new time, on their own tracks, as a new group', () => {
    const copied = copyTrackClips(tracks, [
      { trackId: 't1', trackClipId: 'a' },
      { trackId: 't2', trackClipId: 'c' },
    ]);
    const result = placeCopies(tracks, [clip], copied, 40, newId, newLinkId)!;

    const a = last(result.tracks[0].clips)!;
    const c = last(result.tracks[1].clips)!;
    expect([a.position, c.position]).toEqual([40, 42]);
    expect(a.id).not.toBe('a');
    expect(a.linkId).toBe(c.linkId);
    expect(a.linkId).not.toBe('link-1');
    expect(result.placed).toEqual([
      { trackId: 't1', trackClipId: a.id },
      { trackId: 't2', trackClipId: c.id },
    ]);
  });

  it('refuses to place a copy over another clip', () => {
    const copied = copyTrackClips(tracks, [{ trackId: 't1', trackClipId: 'a' }]);
    expect(placeCopies(tracks, [clip], copied, 18, newId, newLinkId)).toBeNull(); // b sits at 20-24
    expect(placeCopies(tracks, [clip], copied, 16, newId, newLinkId)).not.toBeNull(); // ends as b starts
  });

  it('refuses when the track a copy came from is gone', () => {
    const copied = copyTrackClips(tracks, [{ trackId: 't3', trackClipId: 'e' }]);
    expect(placeCopies(tracks.slice(0, 2), [clip], copied, 50, newId, newLinkId)).toBeNull();
  });
});
