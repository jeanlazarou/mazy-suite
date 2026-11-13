import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioClip, AudioFile } from '../types';
import { MockBuffer, MockContext, asAudioBuffer, last } from '../test/mockAudio';
import { previewClip, stopClipPreview } from './clipPreview';

const file: AudioFile = { id: 'f', name: 'f', duration: 10, buffer: asAudioBuffer(new MockBuffer(1, 100, 10)) };
const clip = (id: string, start: number): AudioClip => ({
  id, name: id, audioFileId: 'f', startTime: start, endTime: start + 2, duration: 2,
});

beforeEach(() => vi.stubGlobal('AudioContext', MockContext));
afterEach(() => {
  stopClipPreview();
  vi.unstubAllGlobals();
});

const sources = () => last(MockContext.created)!.sources;

describe('previewClip', () => {
  it("plays the clip's region once", () => {
    previewClip(clip('a', 3), file, () => {});
    expect(last(sources())?.startArgs).toEqual([0, 3, 2]);
  });

  it('stops the preview already playing when another starts', () => {
    previewClip(clip('a', 3), file, () => {});
    const first = last(sources())!;
    previewClip(clip('b', 6), file, () => {});

    expect(first.stops).toHaveLength(1);
    expect(last(sources())?.startArgs).toEqual([0, 6, 2]);
  });

  it('stops on demand', () => {
    previewClip(clip('a', 3), file, () => {});
    const playing = last(sources())!;
    stopClipPreview();
    expect(playing.stops).toHaveLength(1);
  });
});
