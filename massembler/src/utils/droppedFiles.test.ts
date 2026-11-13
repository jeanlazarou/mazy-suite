import { describe, expect, it } from 'vitest';
import { sortDroppedFiles } from './droppedFiles';

const file = (name: string) => new File(['x'], name);

describe('sortDroppedFiles', () => {
  it('uploads every audio file dropped', () => {
    const dropped = [file('a.mp3'), file('b.wav')];
    expect(sortDroppedFiles(dropped)).toEqual({ project: null, audio: dropped, ignored: 0 });
  });

  it('opens a project, leaving out whatever came with it', () => {
    const project = file('Song.MASS');
    const result = sortDroppedFiles([file('a.mp3'), project, file('other.mass')]);
    expect(result.project).toBe(project);
    expect(result.audio).toEqual([]);
    expect(result.ignored).toBe(2);
  });
});
