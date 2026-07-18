// Snap a time to the nearest marker within tolerance (both in seconds);
// returns the time unchanged when no marker is close enough.
export function snapTime(t, markers, tolerance) {
  let best = null;
  let bestDistance = tolerance;
  for (const m of markers) {
    const d = Math.abs(m.t - t);
    if (d <= bestDistance) {
      bestDistance = d;
      best = m.t;
    }
  }
  return best ?? t;
}
