import { describe, it, expect } from 'vitest';
import { keepInBrowser, readFromBrowser, forgetInBrowser } from '../src/state/local_twins.js';

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const path = 'skip-on-back/Sister Goodbye — recording vs Suno no lyrics.twin.json';
const document = { version: 1, title: 'Sister Goodbye', segments: [{ kind: 'same', a: [0, 3], b: [0, 2] }] };

describe('twin documents kept in the browser', () => {
  it('keeps a document and gives it back, with when it was saved', () => {
    const storage = fakeStorage();
    expect(keepInBrowser(path, document, { storage, now: 1234 })).toBe(1234);
    expect(readFromBrowser(path, { storage })).toEqual({ savedAt: 1234, document });
  });

  it('keeps each twin under its own path', () => {
    const storage = fakeStorage();
    keepInBrowser(path, document, { storage });
    expect(readFromBrowser('other/path.twin.json', { storage })).toBeNull();
  });

  it('forgets a document', () => {
    const storage = fakeStorage();
    keepInBrowser(path, document, { storage });
    expect(forgetInBrowser(path, { storage })).toBe(true);
    expect(readFromBrowser(path, { storage })).toBeNull();
  });

  it('fails soft when the browser refuses to store (a full quota, a private window)', () => {
    const refusing = { ...fakeStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(keepInBrowser(path, document, { storage: refusing })).toBeNull();
  });

  it('ignores an entry it cannot read', () => {
    const storage = fakeStorage();
    storage.setItem(`twin_diff:twin:${path}`, '{not json');
    expect(readFromBrowser(path, { storage })).toBeNull();
    storage.setItem(`twin_diff:twin:${path}`, JSON.stringify({ savedAt: 1 }));
    expect(readFromBrowser(path, { storage })).toBeNull();
  });

  it('does nothing without a path — a twin not yet named has no place to go', () => {
    const storage = fakeStorage();
    expect(keepInBrowser(null, document, { storage })).toBeNull();
    expect(storage.map.size).toBe(0);
  });
});
