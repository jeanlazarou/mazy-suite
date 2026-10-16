// EQ band model and biquad math mirrored from the Go engine
// (pkg/dsp/eq.go, pkg/dsp/biquad.go). The curve views draw the exact
// response from these coefficients, and the live EQ preview runs them in
// Web Audio IIR filters, so both must stay identical to the Go formulas.

export type BandType = 'highpass' | 'lowshelf' | 'peak' | 'highshelf' | 'lowpass';

export const EQ_NAME = 'Parametric EQ';
export const BAND_TYPES: BandType[] = ['highpass', 'lowshelf', 'peak', 'peak', 'highshelf', 'lowpass'];
const DEFAULT_FREQ = [30, 100, 500, 2000, 8000, 18000];
const DEFAULT_Q = [0.707, 0.707, 1, 1, 0.707, 0.707];
const DEFAULT_ENABLED = [false, true, true, true, true, false];

export interface EQBand {
  type: BandType;
  freq: number;
  gain: number;
  q: number;
  enabled: boolean;
}

export interface Biquad {
  b: [number, number, number];
  a: [number, number, number]; // a[0] === 1
}

/** Bands from the store's EQ params, falling back to the Go defaults. */
export function readBands(params: Record<string, number> | undefined): EQBand[] {
  const p = params ?? {};
  return BAND_TYPES.map((type, i) => ({
    type,
    freq: p[`band.${i}.freq`] ?? DEFAULT_FREQ[i],
    gain: p[`band.${i}.gain`] ?? 0,
    q: p[`band.${i}.q`] ?? DEFAULT_Q[i],
    enabled: (p[`band.${i}.enabled`] ?? (DEFAULT_ENABLED[i] ? 1 : 0)) > 0.5,
  }));
}

/** True when the band changes the signal at all. */
export function bandIsActive(band: EQBand): boolean {
  if (!band.enabled) return false;
  if (band.type === 'highpass' || band.type === 'lowpass') return true;
  return band.gain !== 0;
}

export function biquad(band: EQBand, sampleRate: number): Biquad {
  // Clamp below Nyquist: the browser context may run at a lower rate than
  // the file, and an 18 kHz low-pass must not fold over at 32 kHz.
  const freq = Math.min(band.freq, sampleRate * 0.49);
  const w0 = 2 * Math.PI * freq / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * band.q);
  const A = Math.pow(10, band.gain / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (band.type) {
    case 'lowpass':
      b1 = 1 - cos; b0 = b1 / 2; b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'peak':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cos + s);
      b1 = 2 * A * ((A - 1) - (A + 1) * cos);
      b2 = A * ((A + 1) - (A - 1) * cos - s);
      a0 = (A + 1) + (A - 1) * cos + s;
      a1 = -2 * ((A - 1) + (A + 1) * cos);
      a2 = (A + 1) + (A - 1) * cos - s;
      break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cos + s);
      b1 = -2 * A * ((A - 1) + (A + 1) * cos);
      b2 = A * ((A + 1) + (A - 1) * cos - s);
      a0 = (A + 1) - (A - 1) * cos + s;
      a1 = 2 * ((A - 1) - (A + 1) * cos);
      a2 = (A + 1) - (A - 1) * cos - s;
      break;
    }
  }
  return { b: [b0 / a0, b1 / a0, b2 / a0], a: [1, a1 / a0, a2 / a0] };
}

/** Inverse filter (b and a swapped). Only peaks and shelves have one: their
 *  zeros are inside the unit circle, so the inverse is stable. High- and
 *  low-pass zeros sit on the circle and can't be undone. */
export function inverseBiquad(band: EQBand, sampleRate: number): Biquad | null {
  if (band.type === 'highpass' || band.type === 'lowpass') return null;
  const { b, a } = biquad(band, sampleRate);
  return { b: [a[0] / b[0], a[1] / b[0], a[2] / b[0]], a: [1, b[1] / b[0], b[2] / b[0]] };
}

/** Magnitude response in dB of one biquad at a frequency. */
export function biquadDB(f: Biquad, freq: number, sampleRate: number): number {
  const w = 2 * Math.PI * freq / sampleRate;
  const c1 = Math.cos(w), s1 = Math.sin(w);
  const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = f.b[0] + f.b[1] * c1 + f.b[2] * c2;
  const ni = -(f.b[1] * s1 + f.b[2] * s2);
  const dr = f.a[0] + f.a[1] * c1 + f.a[2] * c2;
  const di = -(f.a[1] * s1 + f.a[2] * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di) + 1e-30);
}

/** Combined response in dB of the active bands at a frequency. */
export function eqResponseDB(bands: EQBand[], freq: number, sampleRate: number, eqEnabled = true): number {
  if (!eqEnabled) return 0;
  let db = 0;
  for (const band of bands) {
    if (bandIsActive(band)) db += biquadDB(biquad(band, sampleRate), freq, sampleRate);
  }
  return db;
}

function sameBand(a: EQBand, b: EQBand): boolean {
  return a.enabled === b.enabled && a.freq === b.freq && a.gain === b.gain && a.q === b.q;
}

/** Filters that turn audio rendered with `rendered` into (approximately)
 *  audio rendered with `current`: undo each changed band, apply its new
 *  setting. Exact for the EQ itself; the processors after it would react
 *  slightly differently, which the next full render corrects. A moved or
 *  removed high/low-pass can't be undone, so its old setting stays in. */
export function eqDeltaFilters(
  rendered: EQBand[], renderedOn: boolean,
  current: EQBand[], currentOn: boolean,
  sampleRate: number,
): Biquad[] {
  const out: Biquad[] = [];
  for (let i = 0; i < current.length; i++) {
    const was = rendered[i], now = current[i];
    const wasActive = renderedOn && bandIsActive(was);
    const nowActive = currentOn && bandIsActive(now);
    if (wasActive && nowActive && sameBand(was, now)) continue;
    if (wasActive) {
      const inv = inverseBiquad(was, sampleRate);
      if (inv) out.push(inv);
    }
    if (nowActive) out.push(biquad(now, sampleRate));
  }
  return out;
}

// Frequency axis shared by the curve views: log scale 20 Hz – 20 kHz.
export const F_MIN = 20;
export const F_MAX = 20000;
export const freqToX = (f: number, w: number) => Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN) * w;
export const xToFreq = (x: number, w: number) => F_MIN * Math.pow(F_MAX / F_MIN, x / w);
