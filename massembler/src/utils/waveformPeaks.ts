/**
 * Waveform peaks for drawing clips on the timeline.
 *
 * Each audio buffer is reduced once to a min/max pair per bin of samples,
 * across all channels. Drawing then reads bins instead of samples, so
 * redrawing every clip on a zoom step stays cheap.
 */

const SAMPLES_PER_BIN = 128;

interface Peaks {
  min: Float32Array;
  max: Float32Array;
  binsPerSecond: number;
}

const cache = new WeakMap<AudioBuffer, Peaks>();

function getPeaks(buffer: AudioBuffer): Peaks {
  const cached = cache.get(buffer);
  if (cached) return cached;

  const bins = Math.ceil(buffer.length / SAMPLES_PER_BIN);
  const min = new Float32Array(bins);
  const max = new Float32Array(bins);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let bin = 0; bin < bins; bin++) {
      let lo = min[bin];
      let hi = max[bin];
      const end = Math.min(data.length, (bin + 1) * SAMPLES_PER_BIN);
      for (let i = bin * SAMPLES_PER_BIN; i < end; i++) {
        const sample = data[i];
        if (sample < lo) lo = sample;
        else if (sample > hi) hi = sample;
      }
      min[bin] = lo;
      max[bin] = hi;
    }
  }

  const peaks = { min, max, binsPerSecond: buffer.sampleRate / SAMPLES_PER_BIN };
  cache.set(buffer, peaks);
  return peaks;
}

/** Draw the stretch [start, end] of a buffer (in seconds) across the whole canvas. */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  start: number,
  end: number,
  color: string
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (width === 0 || end <= start) return;

  const peaks = getPeaks(buffer);
  const firstBin = start * peaks.binsPerSecond;
  const binsPerPixel = ((end - start) * peaks.binsPerSecond) / width;
  const mid = height / 2;

  ctx.fillStyle = color;
  for (let x = 0; x < width; x++) {
    const from = Math.floor(firstBin + x * binsPerPixel);
    const to = Math.min(peaks.min.length, Math.max(from + 1, Math.floor(firstBin + (x + 1) * binsPerPixel)));

    let lo = 0;
    let hi = 0;
    for (let bin = from; bin < to; bin++) {
      if (peaks.min[bin] < lo) lo = peaks.min[bin];
      if (peaks.max[bin] > hi) hi = peaks.max[bin];
    }

    const top = mid - hi * mid;
    ctx.fillRect(x, top, 1, Math.max(1, (hi - lo) * mid));
  }
}
