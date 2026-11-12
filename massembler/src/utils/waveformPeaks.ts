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

/**
 * Draw the stretch [start, end] of a buffer (in seconds) across the whole
 * canvas, at `gain` - the volume it will play at - clipped to the canvas.
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  start: number,
  end: number,
  color: string,
  gain = 1
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (width === 0 || end <= start) return;

  const mid = height / 2;
  const samplesPerPixel = ((end - start) * buffer.sampleRate) / width;
  const rangeAt = samplesPerPixel < SAMPLES_PER_BIN ? rawRange(buffer) : peakRange(buffer);

  ctx.fillStyle = color;
  for (let x = 0; x < width; x++) {
    const [low, high] = rangeAt(start + (x * (end - start)) / width, start + ((x + 1) * (end - start)) / width);
    const lo = Math.max(-1, low * gain);
    const hi = Math.min(1, high * gain);
    ctx.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid));
  }
}

type RangeAt = (from: number, to: number) => [lo: number, hi: number];

/** Lowest and highest level between two times, from the cached peaks. */
function peakRange(buffer: AudioBuffer): RangeAt {
  const peaks = getPeaks(buffer);
  return (from, to) => {
    const first = Math.floor(from * peaks.binsPerSecond);
    const last = Math.min(peaks.min.length, Math.max(first + 1, Math.floor(to * peaks.binsPerSecond)));
    let lo = 0;
    let hi = 0;
    for (let bin = first; bin < last; bin++) {
      if (peaks.min[bin] < lo) lo = peaks.min[bin];
      if (peaks.max[bin] > hi) hi = peaks.max[bin];
    }
    return [lo, hi];
  };
}

/**
 * The same from the samples themselves, for views zoomed in past what a peak
 * bin can tell apart. Only the samples on screen are read.
 */
function rawRange(buffer: AudioBuffer): RangeAt {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const rate = buffer.sampleRate;
  return (from, to) => {
    const first = Math.floor(from * rate);
    const last = Math.max(first + 1, Math.floor(to * rate));
    let lo = 0;
    let hi = 0;
    for (const data of channels) {
      for (let i = first; i < last && i < data.length; i++) {
        if (data[i] < lo) lo = data[i];
        else if (data[i] > hi) hi = data[i];
      }
    }
    return [lo, hi];
  };
}
