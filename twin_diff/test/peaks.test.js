import { describe, it, expect } from 'vitest';
import { computePeaks, rowsFor, sharedScale } from '../src/model/peaks.js';

// One second of a full-scale tone, then one second of silence.
function toneThenSilence(sampleRate = 8000, level = 1) {
  const data = new Float32Array(sampleRate * 2);
  for (let i = 0; i < sampleRate; i += 1) {
    data[i] = level * Math.sin((i / sampleRate) * 2 * Math.PI * 100);
  }
  return data;
}

describe('computePeaks', () => {
  it('reports the duration and one bucket per slice of time', () => {
    const peaks = computePeaks([toneThenSilence()], 8000, 100);
    expect(peaks.duration).toBeCloseTo(2, 6);
    expect(peaks.peak).toHaveLength(200);
    expect(peaks.rms).toHaveLength(200);
  });

  it('keeps the loudest sample of each bucket as its peak', () => {
    const peaks = computePeaks([toneThenSilence()], 8000, 100);
    expect(peaks.peak[10]).toBeGreaterThan(0.9);
    expect(peaks.peak[150]).toBe(0);
  });

  it('keeps a level below the peak as the RMS — the shape a mix has', () => {
    const peaks = computePeaks([toneThenSilence()], 8000, 100);
    // a full-scale sine sits at 1/√2
    expect(peaks.rms[10]).toBeCloseTo(Math.SQRT1_2, 1);
    expect(peaks.rms[10]).toBeLessThan(peaks.peak[10]);
    expect(peaks.rmsMax).toBeCloseTo(peaks.rms[10], 1);
  });

  it('takes the loudest of all channels', () => {
    const loud = new Float32Array([1, 1, 1, 1]);
    const quiet = new Float32Array([0.1, 0.1, 0.1, 0.1]);
    const peaks = computePeaks([quiet, loud], 4, 1);
    expect(peaks.peak[0]).toBe(1);
  });
});

describe('rowsFor', () => {
  const peaks = computePeaks([toneThenSilence()], 8000, 100);

  it('returns one amplitude per pixel row', () => {
    const rows = rowsFor(peaks, 0, 2, 50);
    expect(rows.peak).toHaveLength(50);
    expect(rows.rms).toHaveLength(50);
  });

  it('shows the tone in the first half and silence in the second', () => {
    const rows = rowsFor(peaks, 0, 2, 20);
    expect(rows.peak[2]).toBeGreaterThan(0.9);
    expect(rows.peak[15]).toBe(0);
  });

  it('reads only the window it was asked for', () => {
    expect(Array.from(rowsFor(peaks, 1, 2, 10).peak).every((v) => v === 0)).toBe(true);
  });

  it('never loses a transient to a low zoom', () => {
    // one row covering the whole file still shows the loud half
    expect(rowsFor(peaks, 0, 2, 1).peak[0]).toBeGreaterThan(0.9);
  });

  it('is empty for a zero-length window — the silent side of a band', () => {
    expect(Array.from(rowsFor(peaks, 5, 5, 4).peak)).toEqual([0, 0, 0, 0]);
  });
});

describe('sharedScale', () => {
  const loud = computePeaks([toneThenSilence(8000, 1)], 8000, 100);
  const quiet = computePeaks([toneThenSilence(8000, 0.25)], 8000, 100);

  it('fills the column with the louder of the two sides', () => {
    const scale = sharedScale(loud, quiet);
    expect(loud.rmsMax * scale.rms).toBeCloseTo(1, 6);
    expect(loud.peakMax * scale.peak).toBeCloseTo(1, 6);
  });

  it('leaves the quieter side visibly quieter, rather than normalising the difference away', () => {
    const scale = sharedScale(loud, quiet);
    expect(quiet.rmsMax * scale.rms).toBeCloseTo(0.25, 1);
    expect(quiet.peakMax * scale.peak).toBeCloseTo(0.25, 1);
  });

  it('scales the two measures apart, so neither flattens nor clips the other', () => {
    const scale = sharedScale(loud, loud);
    // a full-scale sine: RMS at 1/√2 of the peak, and both reach the edge
    expect(scale.rms).toBeGreaterThan(scale.peak);
    expect(loud.rms[10] * scale.rms).toBeCloseTo(1, 1);
    expect(loud.peak[10] * scale.peak).toBeCloseTo(1, 1);
  });

  it('survives a side with no audio at all', () => {
    expect(sharedScale(null, null)).toEqual({ rms: 1, peak: 1 });
  });
});
