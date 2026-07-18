import { describe, it, expect } from 'vitest';
import { serializeMix, parseMixDoc, slugify } from '../src/model/mixdoc';
import { MICRO_FADE } from '../src/model/envelope';

const lane = (over = {}) => ({ env: [], regions: [], mute: false, ...over });
const flatEq = { low: 0, mid: 0, high: 0 };

describe('serializeMix', () => {
  it('writes the spec shape: version, stems, tracks, groups, master', () => {
    const doc = serializeMix({
      tracks: [
        lane({
          name: 'Drums',
          fileName: 'drums.mp3',
          env: [{ id: 'a', t: 0, v: 1 }, { id: 'b', t: 152.5, v: 0.6 }],
          regions: [{ id: 'r', start: 34.2, end: 41, fade: 0.5 }],
          eq: { low: 0, mid: -2, high: 1.5 },
          mute: false,
        }),
      ],
      groups: [],
      master: lane({ env: [{ id: 'm', t: 0, v: 1 }] }),
    });
    expect(doc).toEqual({
      version: 1,
      stems: [{ id: 'drums', file: 'drums.mp3' }],
      tracks: {
        drums: {
          envelope: [[0, 1], [152.5, 0.6]],
          regions: [{ start: 34.2, end: 41, fade: 0.5, shape: 'linear', mode: 'mute' }],
          eq: { low: 0, mid: -2, high: 1.5 },
          mute: false,
        },
      },
      groups: {},
      master: { envelope: [[0, 1]] },
    });
  });

  it('writes group lanes and stem membership', () => {
    const doc = serializeMix({
      tracks: [
        lane({ name: 'Drums', group: 'g1' }),
        lane({ name: 'Vox', group: null }),
      ],
      groups: [lane({ id: 'g1', name: 'Rhythm', env: [{ id: 'p', t: 0, v: 0.8 }] })],
      master: lane(),
    });
    expect(doc.groups).toEqual({ rhythm: { envelope: [[0, 0.8]] } });
    expect(doc.stems[0]).toEqual({ id: 'drums', file: null, group: 'rhythm' });
    expect(doc.stems[1]).toEqual({ id: 'vox', file: null });
  });

  it('keeps stem ids unique and null files for demo stems', () => {
    const doc = serializeMix({
      tracks: [lane({ name: 'Pad' }), lane({ name: 'pad!' })],
      master: lane(),
    });
    expect(doc.stems.map((s) => s.id)).toEqual(['pad', 'pad-2']);
    expect(doc.stems[0].file).toBeNull();
  });
});

describe('parseMixDoc', () => {
  it('round-trips what serializeMix wrote', () => {
    const doc = serializeMix({
      tracks: [
        lane({
          name: 'Bass',
          fileName: 'bass.wav',
          env: [{ id: 'a', t: 3, v: 0.25 }],
          regions: [{ id: 'r', start: 1, end: 2, fade: 0.5, shape: 'smooth', mode: 'fade-out', enabled: false }],
          pan: [{ id: 'p', t: 0, v: -0.5 }, { id: 'q', t: 4, v: 2 }], // 2 → clamped
          eq: { low: 3, mid: 0, high: -6 },
          mute: true,
          group: 'g1',
        }),
      ],
      groups: [lane({ id: 'g1', name: 'Rhythm', env: [{ id: 'p', t: 0, v: 0.8 }] })],
      master: lane({ env: [{ id: 'm', t: 10, v: 0.9 }] }),
    });
    const parsed = parseMixDoc(doc);
    expect(parsed.stems).toEqual([{ id: 'bass', file: 'bass.wav', group: 'rhythm' }]);
    expect(parsed.tracks.bass.envelope).toEqual([[3, 0.25]]);
    expect(parsed.tracks.bass.regions).toEqual([
      { start: 1, end: 2, fade: 0.5, shape: 'smooth', mode: 'fade-out', enabled: false },
    ]);
    expect(parsed.tracks.bass.pan).toEqual([[0, -0.5], [4, 1]]);
    expect(parsed.tracks.bass.eq).toEqual({ low: 3, mid: 0, high: -6 });
    expect(parsed.tracks.bass.mute).toBe(true);
    expect(parsed.groups).toEqual([{ id: 'rhythm', envelope: [[0, 0.8]] }]);
    expect(parsed.master.envelope).toEqual([[10, 0.9]]);
  });

  it('rejects wrong versions', () => {
    expect(() => parseMixDoc({ version: 2 })).toThrow(/version/);
    expect(() => parseMixDoc(null)).toThrow();
  });

  it('normalizes sloppy input', () => {
    const parsed = parseMixDoc({
      version: 1,
      stems: [{ id: 'x' }, { bad: true }],
      tracks: {
        x: {
          envelope: [[5, 2], [1, -3], ['nope'], null],
          regions: [
            { start: 9, end: 3 }, // inverted → dropped
            { start: 1, end: 4 }, // no fade → micro-fade
          ],
          eq: { low: 99, mid: 'x', high: -40 }, // out of range / junk → clamped
        },
      },
    });
    expect(parsed.stems).toEqual([{ id: 'x', file: null, group: null }]);
    expect(parsed.tracks.x.envelope).toEqual([[1, 0], [5, 1]]); // sorted + clamped
    expect(parsed.tracks.x.regions).toEqual([
      { start: 1, end: 4, fade: MICRO_FADE, shape: 'linear', mode: 'mute', enabled: true },
    ]);
    expect(parsed.tracks.x.pan).toEqual([]);
    expect(parsed.tracks.x.eq).toEqual({ low: 12, mid: 0, high: -12 });
    expect(parsed.tracks.x.mute).toBe(false);
    expect(parsed.groups).toEqual([]);
    expect(parsed.master.envelope).toEqual([]);
  });

  it('round-trips song identity and marker source', () => {
    const doc = serializeMix({
      tracks: [],
      groups: [],
      master: lane(),
      song: { album: 'demo-album', title: 'Demo Song' },
      markersSource: 'Demo Song.srt',
    });
    expect(doc.song).toEqual({ album: 'demo-album', title: 'Demo Song' });
    expect(doc.markers).toEqual({ source: 'Demo Song.srt' });
    const parsed = parseMixDoc(doc);
    expect(parsed.song).toEqual({ album: 'demo-album', title: 'Demo Song' });
    expect(parsed.markersSource).toBe('Demo Song.srt');
    // absent in older docs → null
    const bare = parseMixDoc({ version: 1, stems: [], tracks: {} });
    expect(bare.song).toBeNull();
    expect(bare.markersSource).toBeNull();
  });

  it('drops stem group references that point at unknown groups', () => {
    const parsed = parseMixDoc({
      version: 1,
      stems: [{ id: 'a', group: 'ghost' }],
      tracks: {},
    });
    expect(parsed.stems[0].group).toBeNull();
  });
});
