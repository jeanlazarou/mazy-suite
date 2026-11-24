// Time axis of the gate diagram: the two edges of a silence, where the voice
// stops and where it comes back, at one scale. The middle of a long silence
// is squeezed into a break, so 20 ms fades stay visible next to 2 s silences.

export const CONTEXT = 0.25; // seconds of voice shown either side
export const BREAK_PX = 36;

const MIN_SIDE = 0.35; // seconds shown inside the silence at each edge
const MARGIN = 0.12;

// -> { from, to, cutFrom, cutTo, scale } in seconds and px per second; cutFrom
// and cutTo are null when the whole silence fits
export function timeAxis(silence, params, duration, width) {
  const { silenceStart, silenceEnd } = silence;

  const left = Math.max(MIN_SIDE, (params.keepAfter + params.fadeOut) / 1000 + MARGIN, params.minSilence / 1000 + 0.1);
  const right = Math.max(MIN_SIDE, (params.keepBefore + params.fadeIn) / 1000 + MARGIN);

  const from = Math.max(0, silenceStart - CONTEXT);
  const to = Math.min(duration, silenceEnd + CONTEXT);

  const cutFrom = silenceStart + left;
  const cutTo = silenceEnd - right;

  if (cutFrom >= cutTo || width <= BREAK_PX * 4) {
    return { from, to, cutFrom: null, cutTo: null, scale: width / Math.max(1e-3, to - from) };
  }

  return { from, to, cutFrom, cutTo, scale: (width - BREAK_PX) / (cutFrom - from + (to - cutTo)) };
}

export function toX(axis, time) {
  const { from, to, cutFrom, cutTo, scale } = axis;
  const t = Math.max(from, Math.min(to, time));

  if (cutFrom === null || t <= cutFrom) return (t - from) * scale;

  const cutX = (cutFrom - from) * scale;

  if (t < cutTo) return cutX + ((t - cutFrom) / (cutTo - cutFrom)) * BREAK_PX;

  return cutX + BREAK_PX + (t - cutTo) * scale;
}

export function toTime(axis, x) {
  const { from, to, cutFrom, cutTo, scale } = axis;

  if (cutFrom === null) return Math.max(from, Math.min(to, from + x / scale));

  const cutX = (cutFrom - from) * scale;

  if (x <= cutX) return Math.max(from, from + x / scale);
  if (x < cutX + BREAK_PX) return cutFrom + ((x - cutX) / BREAK_PX) * (cutTo - cutFrom);

  return Math.min(to, cutTo + (x - cutX - BREAK_PX) / scale);
}
