import { describe, it, expect } from 'vitest';
import { placeInSet } from '../src/model/sets.js';

const twins = [
  { file: 'skip-on-back/Sister Goodbye — recording vs Suno no lyrics.twin.json', set: 'Skip On Back ↔ Suno' },
  { file: 'back-to-normal/Big Three — album vs live.twin.json' },
  { file: 'skip-on-back/Sister Goodbye — recording vs Suno same style.twin.json', set: 'Skip On Back ↔ Suno' },
  { file: 'skip-on-back/Sister Goodbye — recording vs Suno free jazz.twin.json', set: 'Skip On Back ↔ Suno' },
];

describe('placeInSet', () => {
  it('places a twin among the members of its set, in index order', () => {
    const place = placeInSet(twins, twins[2].file);
    expect(place).toMatchObject({ set: 'Skip On Back ↔ Suno', index: 1, count: 3 });
    expect(place.previous.file).toBe(twins[0].file);
    expect(place.next.file).toBe(twins[3].file);
  });

  it('skips twins of other sets, or of none, when looking for neighbours', () => {
    expect(placeInSet(twins, twins[0].file).next.file).toBe(twins[2].file);
  });

  it('has no neighbour past either end of the set', () => {
    expect(placeInSet(twins, twins[0].file).previous).toBeNull();
    expect(placeInSet(twins, twins[3].file).next).toBeNull();
  });

  it('has nothing to step through for a twin with no set, or not in the index', () => {
    expect(placeInSet(twins, twins[1].file)).toBeNull();
    expect(placeInSet(twins, 'elsewhere.twin.json')).toBeNull();
    expect(placeInSet(twins, null)).toBeNull();
  });
});
