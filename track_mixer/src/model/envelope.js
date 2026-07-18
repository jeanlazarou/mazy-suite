// The internal model: everything that affects a lane's level is one gain curve.
// A lane is { env: [{ id, t, v }] sorted by t,
//             regions: [{ id, start, end, fade, shape }] }.
// Tracks additionally carry pan: [{ id, t, v }] with v in [-1, 1] (0 = center).

export const FADE_PRESETS = { // fast / medium / slow, per spec
  1: { fade: 0.05, shape: 'linear' },
  2: { fade: 0.5, shape: 'smooth' },
  3: { fade: 2.0, shape: 'log' },
};
export const FADE_SHAPES = ['linear', 'smooth', 'log'];
export const MICRO_FADE = 0.015; // default ramp on every hard edge (s)
export const CURVE_RATE = 200; // samples per second for setValueCurveAtTime

// x is the linear gain fraction (0..1); returns the shaped gain.
// 'log' is a power curve: fast drop, long quiet tail.
export function shapeGain(x, shape) {
  if (shape === 'smooth') return x * x * (3 - 2 * x); // smoothstep S-curve
  if (shape === 'log') return x * x;
  return x;
}

export function envelopeAt(points, t, fallback = 1) {
  if (!points.length) return fallback;
  if (t <= points[0].t) return points[0].v;
  const last = points[points.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].t) {
      const a = points[i - 1];
      const b = points[i];
      return a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t || 1e-9));
    }
  }
  return last.v;
}

export const REGION_MODES = ['mute', 'fade-in', 'fade-out'];

// Gain multiplier of a region at time t. Three modes:
//  - 'mute' (default): fades at both edges (length `fade`), silent middle.
//  - 'fade-in':  ramp 0→1 across the whole region; no effect outside. The
//    level jump at the start edge is softened by a micro-drop inside the
//    region, so it never clicks.
//  - 'fade-out': mirrored — ramp 1→0 across the region, micro-rise at the
//    end edge.
// A disabled region (enabled === false) has no effect at all.
// All ramps follow the region's shape (linear / smooth / log).
export function regionMask(region, t) {
  if (region.enabled === false) return 1;
  if (t <= region.start || t >= region.end) return 1;
  const len = region.end - region.start;
  const mode = region.mode ?? 'mute';
  if (mode === 'fade-in') {
    const ramp = shapeGain((t - region.start) / len, region.shape);
    const edge = 1 - (t - region.start) / Math.min(MICRO_FADE, len / 2);
    return Math.max(ramp, Math.min(1, Math.max(0, edge)));
  }
  if (mode === 'fade-out') {
    const ramp = shapeGain(1 - (t - region.start) / len, region.shape);
    const edge = 1 - (region.end - t) / Math.min(MICRO_FADE, len / 2);
    return Math.max(ramp, Math.min(1, Math.max(0, edge)));
  }
  const fade = Math.min(region.fade, len / 2);
  if (t < region.start + fade) return shapeGain(1 - (t - region.start) / fade, region.shape);
  if (t > region.end - fade) return shapeGain((t - (region.end - fade)) / fade, region.shape);
  return 0;
}

// The effective gain (envelope × regions) — what is drawn and what plays.
export function effectiveGain(lane, t) {
  let gain = envelopeAt(lane.env, t);
  for (const region of lane.regions) gain *= regionMask(region, t);
  return gain;
}

export function buildCurve(lane, from, duration, { flat = false, silent = false, rate = CURVE_RATE } = {}) {
  const n = Math.max(2, Math.ceil(duration * rate));
  const curve = new Float32Array(n);
  if (silent) return curve;
  for (let i = 0; i < n; i++) {
    curve[i] = flat ? 1 : effectiveGain(lane, from + i / rate);
  }
  return curve;
}

// Pan curve for StereoPannerNode: -1..1, 0 (center) when unset or bypassed.
export function buildPanCurve(track, from, duration, { flat = false, rate = CURVE_RATE } = {}) {
  const n = Math.max(2, Math.ceil(duration * rate));
  const curve = new Float32Array(n);
  if (flat || !track.pan?.length) return curve;
  for (let i = 0; i < n; i++) {
    curve[i] = Math.max(-1, Math.min(1, envelopeAt(track.pan, from + i / rate, 0)));
  }
  return curve;
}
