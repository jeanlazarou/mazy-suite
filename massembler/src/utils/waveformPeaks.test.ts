import { describe, expect, it } from 'vitest';
import { drawWaveform } from './waveformPeaks';

// 1280 samples a second makes exactly 10 peak bins a second. The first second
// swings from -0.25 (one channel) to +0.5 (the other); the second is silent.
const RATE = 1280;
const loudThenSilent = (level: number) =>
  new Float32Array(RATE * 2).map((_, i) => (i < RATE ? level : 0));

function makeBuffer() {
  const channels = [loudThenSilent(0.5), loudThenSilent(-0.25)];
  let reads = 0;
  const buffer = {
    numberOfChannels: 2,
    length: RATE * 2,
    sampleRate: RATE,
    getChannelData: (channel: number) => {
      reads++;
      return channels[channel];
    },
  } as unknown as AudioBuffer;
  return { buffer, reads: () => reads };
}

function makeCanvas(width: number, height: number) {
  const rects: number[][] = [];
  const canvas = {
    width,
    height,
    getContext: () => ({
      clearRect() {},
      fillRect: (...rect: number[]) => rects.push(rect),
      fillStyle: '',
    }),
  } as unknown as HTMLCanvasElement;
  return { canvas, rects };
}

describe('drawWaveform', () => {
  it('draws each pixel from the lowest to the highest sample across channels', () => {
    const { buffer } = makeBuffer();
    const { canvas, rects } = makeCanvas(20, 100);

    drawWaveform(canvas, buffer, 0, 2, 'blue');

    expect(rects).toHaveLength(20);
    expect(rects[0]).toEqual([0, 25, 1, 37.5]); // +0.5 down to -0.25, around the middle
    expect(rects[15]).toEqual([15, 50, 1, 1]); // silence: a hairline
  });

  it('draws a later stretch of the buffer across the whole canvas', () => {
    const { buffer } = makeBuffer();
    const { canvas, rects } = makeCanvas(20, 100);

    drawWaveform(canvas, buffer, 1, 2, 'blue');

    expect(rects[0]).toEqual([0, 50, 1, 1]);
  });

  it('reads the samples once per buffer, however often it draws', () => {
    const { buffer, reads } = makeBuffer();
    const { canvas } = makeCanvas(20, 100);

    drawWaveform(canvas, buffer, 0, 2, 'blue');
    drawWaveform(canvas, buffer, 0.5, 1.5, 'blue');

    expect(reads()).toBe(2); // one read per channel, the first time only
  });
});
