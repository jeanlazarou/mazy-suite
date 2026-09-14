import { describe, it, expect } from 'vitest';
import {
  parseTwinDoc,
  serializeTwinDoc,
  adHocTwinDoc,
  twinFileName,
  twinPath,
} from '../src/model/twin.js';

const minimal = (segments = []) => ({
  version: 1,
  title: 'Sister Goodbye',
  sides: {
    a: { label: 'recording', url: '/music/files/Skip On Back/Sister Goodbye.mp3' },
    b: { label: 'Suno', url: '/music/files/Suno reworks/Sister Goodbye (No Lyrics).mp3', ai: true },
  },
  segments,
});

describe('parseTwinDoc', () => {
  it('accepts a document with no segments — the unclassified twin', () => {
    const { doc, problems } = parseTwinDoc(minimal());
    expect(problems).toEqual([]);
    expect(doc.segments).toEqual([]);
    expect(doc.sides.b.ai).toBe(true);
    expect(doc.sides.a.ai).toBe(false);
  });

  it('defaults the optional side fields', () => {
    const { doc } = parseTwinDoc(minimal());
    expect(doc.sides.a).toMatchObject({ srt: null, album: null, track: null });
  });

  it('reports a missing side instead of guessing one', () => {
    const raw = minimal();
    delete raw.sides.b;
    const { doc, problems } = parseTwinDoc(raw);
    expect(doc).toBeNull();
    expect(problems).toContain('sides.b is missing');
  });

  it('reports an unsupported version but still reads the document', () => {
    const { doc, problems } = parseTwinDoc({ ...minimal(), version: 2 });
    expect(doc).not.toBeNull();
    expect(problems[0]).toMatch(/version 2/);
  });

  it('sorts segments by their position on A', () => {
    const { doc } = parseTwinDoc(
      minimal([
        { kind: 'same', a: [30, 40], b: [30, 40] },
        { kind: 'same', a: [0, 10], b: [0, 12] },
      ]),
    );
    expect(doc.segments.map((s) => s.a[0])).toEqual([0, 30]);
  });

  it('sorts an added segment by its position on B, not to the end of the song', () => {
    const { doc, problems } = parseTwinDoc(
      minimal([
        { kind: 'added', a: null, b: [14, 30], label: 'bridge' },
        { kind: 'same', a: [0, 12], b: [0, 14] },
        { kind: 'same', a: [12, 40], b: [30, 60] },
      ]),
    );
    expect(doc.segments.map((s) => s.label ?? s.kind)).toEqual(['same', 'bridge', 'same']);
    expect(problems).toEqual([]);
  });

  it('keeps the written order for an added and a removed segment that share no axis', () => {
    const { doc, problems } = parseTwinDoc(
      minimal([
        { kind: 'same', a: [0, 70], b: [0, 78] },
        { kind: 'added', a: null, b: [78, 96], label: 'bridge' },
        { kind: 'removed', a: [70, 92], b: null, label: 'solo' },
        { kind: 'same', a: [92, 180], b: [96, 200] },
      ]),
    );
    expect(doc.segments.map((s) => s.label ?? s.kind)).toEqual(['same', 'bridge', 'solo', 'same']);
    expect(problems).toEqual([]);
  });

  it('drops a segment with an unknown kind', () => {
    const { doc, problems } = parseTwinDoc(minimal([{ kind: 'moved', a: [0, 1], b: [0, 1] }]));
    expect(doc.segments).toEqual([]);
    expect(problems[0]).toMatch(/"moved" is not one of/);
  });

  it('drops an empty range', () => {
    const { doc, problems } = parseTwinDoc(minimal([{ kind: 'same', a: [5, 5], b: [0, 3] }]));
    expect(doc.segments).toEqual([]);
    expect(problems.join(' ')).toMatch(/is empty/);
  });

  it('lets the kind win over a contradicting range', () => {
    const { doc, problems } = parseTwinDoc(minimal([{ kind: 'added', a: [0, 5], b: [0, 5] }]));
    expect(problems.join(' ')).toMatch(/"added" but has a range on A/);
    expect(doc.segments[0]).toMatchObject({ kind: 'added', a: null, b: [0, 5] });
  });

  it('drops a same/changed segment naming only one side', () => {
    const { doc, problems } = parseTwinDoc(minimal([{ kind: 'changed', a: [0, 5], b: null }]));
    expect(problems.join(' ')).toMatch(/"changed" but names only one side/);
    expect(doc.segments).toEqual([]);
  });

  it('reports overlapping ranges on a side', () => {
    const { problems } = parseTwinDoc(
      minimal([
        { kind: 'same', a: [0, 20], b: [0, 20] },
        { kind: 'same', a: [10, 30], b: [20, 40] },
      ]),
    );
    expect(problems.join(' ')).toMatch(/starts at 10 before/);
  });

  it('keeps added and removed segments, each naming one side', () => {
    const { doc, problems } = parseTwinDoc(
      minimal([
        { kind: 'removed', a: [10, 20], b: null },
        { kind: 'added', a: null, b: [30, 45], label: 'bridge' },
      ]),
    );
    expect(problems).toEqual([]);
    expect(doc.segments[0]).toMatchObject({ kind: 'removed', b: null });
    expect(doc.segments[1]).toMatchObject({ kind: 'added', a: null, label: 'bridge' });
  });
});

describe('serializeTwinDoc', () => {
  it('round-trips a document', () => {
    const raw = minimal([{ kind: 'changed', a: [0, 10], b: [0, 12], note: 'new drums' }]);
    const { doc } = parseTwinDoc(raw);
    const { doc: again } = parseTwinDoc(serializeTwinDoc(doc));
    expect(again).toEqual(doc);
  });

  it('leaves out the fields that were never set', () => {
    const { doc } = parseTwinDoc(minimal());
    const json = serializeTwinDoc(doc);
    expect(json.sides.a).not.toHaveProperty('srt');
    expect(json).not.toHaveProperty('seededFrom');
  });
});

describe('twinPath', () => {
  const doc = (over = {}) => parseTwinDoc({ ...minimal(), ...over }).doc;

  it('names the file after the song and the two renditions', () => {
    expect(twinFileName(doc())).toBe('Sister Goodbye — recording vs Suno.twin.json');
  });

  it('files a twin under side A’s album', () => {
    const withAlbum = doc({
      sides: {
        a: { label: 'recording', url: 'a.mp3', album: 'skip-on-back' },
        b: { label: 'Suno', url: 'b.mp3', album: 'suno-reworks' },
      },
    });
    expect(twinPath(withAlbum)).toBe(
      'skip-on-back/Sister Goodbye — recording vs Suno.twin.json',
    );
  });

  it('files a twin with no album under _adhoc', () => {
    expect(twinPath(doc())).toBe('_adhoc/Sister Goodbye — recording vs Suno.twin.json');
  });

  it('strips a variant marker from the title, as the SRT convention does', () => {
    expect(twinFileName(doc({ title: 'Sister Goodbye*' }))).toMatch(/^Sister Goodbye — /);
  });

  it('never lets a title or label escape its folder', () => {
    const nasty = doc({ title: '../../etc/passwd', sides: {
      a: { label: 'a/b', url: 'a.mp3', album: '../..' },
      b: { label: 'c\\d', url: 'b.mp3' },
    } });
    expect(twinPath(nasty).split('/')).toHaveLength(2);
    expect(twinPath(nasty)).not.toMatch(/\.\./);
  });
});

describe('adHocTwinDoc', () => {
  it('makes a valid unclassified twin from two files', () => {
    const doc = adHocTwinDoc({
      title: 'take 3 vs take 7',
      a: { url: 'blob:a', label: 'take 3' },
      b: { url: 'blob:b', label: 'take 7' },
    });
    const { doc: parsed, problems } = parseTwinDoc(serializeTwinDoc(doc));
    expect(problems).toEqual([]);
    expect(parsed.segments).toEqual([]);
  });
});
