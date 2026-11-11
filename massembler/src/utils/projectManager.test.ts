import { describe, expect, it } from 'vitest';
import { MockBuffer, asAudioBuffer } from '../test/mockAudio';
import { PROJECT_FORMAT_VERSION, preventClipping, upgradeProjectData } from './projectManager';

function mix(...channels: number[][]) {
  const buffer = new MockBuffer(channels.length, channels[0].length, 10);
  channels.forEach((samples, c) => buffer.getChannelData(c).set(samples));
  return buffer;
}
const peakOf = (buffer: MockBuffer) =>
  Math.max(...[0, 1].flatMap((c) => [...buffer.getChannelData(c)].map(Math.abs)));

describe('preventClipping', () => {
  it('leaves a mix that fits untouched', () => {
    const buffer = mix([0.5, -1, 0.2], [0.9, 0, -0.3]);
    expect(preventClipping(asAudioBuffer(buffer))).toBe(1);
    expect(buffer.getChannelData(0)).toEqual(Float32Array.from([0.5, -1, 0.2]));
  });

  it('turns a mix that would clip down as a whole, to just under full scale', () => {
    const buffer = mix([0.6, -1.5, 0.3], [1.2, 0, -0.75]);
    const gain = preventClipping(asAudioBuffer(buffer));

    expect(gain).toBeCloseTo(0.98 / 1.5);
    expect(peakOf(buffer)).toBeCloseTo(0.98);
    // the balance between samples and channels is kept
    expect(buffer.getChannelData(1)[0] / buffer.getChannelData(0)[0]).toBeCloseTo(2);
  });
});

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
