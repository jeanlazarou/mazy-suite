import { describe, expect, it } from 'vitest';
import { PROJECT_FORMAT_VERSION, upgradeProjectData } from './projectManager';

const base = { name: 'p', tracks: [], clips: [], pixelsPerSecond: 50 };

describe('upgradeProjectData', () => {
  it('opens version 1, which wrote its version as text and every file as <id>.wav', () => {
    const project = upgradeProjectData({
      ...base,
      version: '1.0.0',
      audioFiles: [{ id: 'audio-1', name: 'a.mp3', duration: 3 }],
    });

    expect(project.version).toBe(PROJECT_FORMAT_VERSION);
    expect(project.audioFiles[0].storedFile).toBe('audio-1.wav');
  });

  it('opens version 2, keeping the stored file names', () => {
    const project = upgradeProjectData({
      ...base,
      version: 2,
      audioFiles: [{ id: 'audio-1', name: 'a.mp3', duration: 3, storedFile: 'audio-1.mp3' }],
    });

    expect(project.audioFiles[0].storedFile).toBe('audio-1.mp3');
  });

  it('opens the current version as it is', () => {
    const optimization = { originalName: 'x.wav', originalDuration: 9, segments: [] };
    const project = upgradeProjectData({
      ...base,
      version: PROJECT_FORMAT_VERSION,
      audioFiles: [{ id: 'a', name: 'a', duration: 1, storedFile: 'a.wav', optimization }],
    });

    expect(project.audioFiles[0].optimization).toEqual(optimization);
  });

  it('refuses a project from a newer build, saying so', () => {
    expect(() => upgradeProjectData({ ...base, version: PROJECT_FORMAT_VERSION + 1 })).toThrow(
      /newer Massembler/
    );
  });

  it('refuses anything it does not recognise', () => {
    expect(() => upgradeProjectData(base)).toThrow(/Unsupported/);
    expect(() => upgradeProjectData({ ...base, version: '2.0' })).toThrow(/Unsupported/);
  });
});
