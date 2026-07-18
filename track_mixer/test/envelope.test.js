import { describe, it, expect } from 'vitest';
import {
  envelopeAt,
  regionMask,
  effectiveGain,
  buildCurve,
  buildPanCurve,
  shapeGain,
  MICRO_FADE,
  CURVE_RATE,
} from '../src/model/envelope';

const pt = (t, v) => ({ id: `p${t}`, t, v });

describe('envelopeAt', () => {
  it('is unity with no points', () => {
    expect(envelopeAt([], 5)).toBe(1);
  });

  it('holds flat before the first and after the last point', () => {
    const env = [pt(2, 0.8), pt(4, 0.2)];
    expect(envelopeAt(env, 0)).toBe(0.8);
    expect(envelopeAt(env, 10)).toBe(0.2);
  });

  it('interpolates linearly between points', () => {
    const env = [pt(0, 0), pt(10, 1)];
    expect(envelopeAt(env, 5)).toBeCloseTo(0.5);
    expect(envelopeAt(env, 2.5)).toBeCloseTo(0.25);
  });

  it('handles coincident point times without dividing by zero', () => {
    const env = [pt(5, 0.2), { id: 'x', t: 5, v: 0.9 }];
    expect(Number.isFinite(envelopeAt(env, 5))).toBe(true);
  });
});

describe('regionMask', () => {
  const region = { id: 'r', start: 10, end: 20, fade: 2 };

  it('is unity outside the region', () => {
    expect(regionMask(region, 5)).toBe(1);
    expect(regionMask(region, 25)).toBe(1);
    expect(regionMask(region, 10)).toBe(1);
    expect(regionMask(region, 20)).toBe(1);
  });

  it('is zero in the fully muted middle', () => {
    expect(regionMask(region, 15)).toBe(0);
  });

  it('ramps down and up inside the fades', () => {
    expect(regionMask(region, 11)).toBeCloseTo(0.5);
    expect(regionMask(region, 19)).toBeCloseTo(0.5);
  });

  it('caps the fade at half the region length', () => {
    const shorty = { id: 'r2', start: 0, end: 1, fade: 5 };
    expect(regionMask(shorty, 0.5)).toBeCloseTo(0);
    expect(regionMask(shorty, 0.25)).toBeCloseTo(0.5);
  });

  it('has no effect when disabled', () => {
    expect(regionMask({ ...region, enabled: false }, 15)).toBe(1);
  });

  it('fade-in mode ramps 0→1 across the region, no effect outside', () => {
    const r = { id: 'r', start: 10, end: 20, fade: 0.5, mode: 'fade-in' };
    expect(regionMask(r, 9)).toBe(1); // untouched before
    expect(regionMask(r, 15)).toBeCloseTo(0.5); // mid-ramp
    expect(regionMask(r, 19)).toBeCloseTo(0.9);
    expect(regionMask(r, 21)).toBe(1); // untouched after
    // micro-drop just inside the start edge keeps the boundary click-free
    expect(regionMask(r, 10.001)).toBeGreaterThan(0.9);
    expect(regionMask(r, 10.02)).toBeLessThan(0.01);
  });

  it('fade-out mode ramps 1→0 across the region', () => {
    const r = { id: 'r', start: 10, end: 20, fade: 0.5, mode: 'fade-out' };
    expect(regionMask(r, 9)).toBe(1);
    expect(regionMask(r, 15)).toBeCloseTo(0.5);
    expect(regionMask(r, 11)).toBeCloseTo(0.9);
    expect(regionMask(r, 21)).toBe(1);
    // micro-rise just inside the end edge
    expect(regionMask(r, 19.999)).toBeGreaterThan(0.9);
    expect(regionMask(r, 19.98)).toBeLessThan(0.01);
  });

  it('fade modes honor the shape', () => {
    const r = { id: 'r', start: 10, end: 20, fade: 0.5, mode: 'fade-in', shape: 'log' };
    expect(regionMask(r, 15)).toBeCloseTo(0.25); // 0.5²
  });

  it('applies the fade shape', () => {
    const smooth = { id: 'r', start: 10, end: 20, fade: 2, shape: 'smooth' };
    const log = { id: 'r', start: 10, end: 20, fade: 2, shape: 'log' };
    // halfway into the entry fade, linear gain fraction is 0.5
    expect(regionMask(smooth, 11)).toBeCloseTo(0.5); // smoothstep(0.5) = 0.5
    expect(regionMask(smooth, 10.5)).toBeCloseTo(shapeGain(0.75, 'smooth'));
    expect(regionMask(log, 11)).toBeCloseTo(0.25); // 0.5²
  });
});

describe('shapeGain', () => {
  it('is monotone with fixed endpoints for every shape', () => {
    for (const shape of ['linear', 'smooth', 'log']) {
      expect(shapeGain(0, shape)).toBe(0);
      expect(shapeGain(1, shape)).toBe(1);
      expect(shapeGain(0.6, shape)).toBeGreaterThan(shapeGain(0.4, shape));
    }
  });
});

describe('buildPanCurve', () => {
  it('defaults to center when no pan points', () => {
    const curve = buildPanCurve({ pan: [] }, 0, 1);
    expect(curve.every((v) => v === 0)).toBe(true);
  });

  it('interpolates pan and clamps to [-1, 1]', () => {
    const track = { pan: [{ id: 'a', t: 0, v: -1 }, { id: 'b', t: 1, v: 1 }] };
    const curve = buildPanCurve(track, 0, 1);
    expect(curve[0]).toBeCloseTo(-1);
    expect(curve[Math.floor(curve.length / 2)]).toBeCloseTo(0, 1);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 1);
  });

  it('is centered when flat (bypass)', () => {
    const track = { pan: [{ id: 'a', t: 0, v: 1 }] };
    expect(buildPanCurve(track, 0, 1, { flat: true }).every((v) => v === 0)).toBe(true);
  });
});

describe('envelopeAt fallback', () => {
  it('uses the provided fallback for empty point lists', () => {
    expect(envelopeAt([], 5)).toBe(1);
    expect(envelopeAt([], 5, 0)).toBe(0);
  });
});

describe('effectiveGain', () => {
  it('multiplies envelope by region masks', () => {
    const lane = {
      env: [pt(0, 0.5)],
      regions: [{ id: 'r', start: 10, end: 20, fade: MICRO_FADE }],
    };
    expect(effectiveGain(lane, 5)).toBeCloseTo(0.5);
    expect(effectiveGain(lane, 15)).toBeCloseTo(0);
  });
});

describe('buildCurve', () => {
  const lane = { env: [pt(0, 0), pt(1, 1)], regions: [] };

  it('samples at the curve rate', () => {
    const curve = buildCurve(lane, 0, 2);
    expect(curve.length).toBe(2 * CURVE_RATE);
    expect(curve[0]).toBeCloseTo(0);
    expect(curve[CURVE_RATE / 2]).toBeCloseTo(0.5, 1);
    expect(curve[curve.length - 1]).toBeCloseTo(1);
  });

  it('starts sampling at the given offset', () => {
    const curve = buildCurve(lane, 0.5, 1);
    expect(curve[0]).toBeCloseTo(0.5, 1);
  });

  it('is all ones when flat (bypass)', () => {
    const curve = buildCurve(lane, 0, 1, { flat: true });
    expect(curve.every((v) => v === 1)).toBe(true);
  });

  it('is all zeros when silent (muted / not soloed)', () => {
    const curve = buildCurve(lane, 0, 1, { silent: true });
    expect(curve.every((v) => v === 0)).toBe(true);
  });

  it('never returns fewer than two samples', () => {
    expect(buildCurve(lane, 0, 0.001).length).toBeGreaterThanOrEqual(2);
  });
});
