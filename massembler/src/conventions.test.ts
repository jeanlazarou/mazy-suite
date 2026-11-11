import { describe, expect, it } from 'vitest';

// Rules the code relies on that no single behaviour test would notice
// breaking. Read from the sources themselves.

const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.ts', '!./test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const filesMatching = (pattern: RegExp) =>
  Object.entries(sources)
    .filter(([, source]) => pattern.test(source))
    .map(([path]) => path)
    .sort();

describe('conventions', () => {
  it('reads the sources', () => {
    expect(Object.keys(sources)).toContain('./store.ts');
  });

  it('makes audio contexts in one place only: the store', () => {
    expect(filesMatching(/new AudioContext\(/)).toEqual(['./store.ts']);
  });
});
