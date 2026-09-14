// Waveform peaks. Computed once per file at a fixed resolution, then sliced
// per band — a band's scale changes with the zoom and with its counterpart's
// length, so nothing here may depend on either.
//
// Two numbers per bucket, because one is not enough to compare two mixes:
// the peak saturates (a row of a loud master is at full scale nearly
// everywhere, which draws a block, not a shape), while the RMS keeps the
// dynamics that make two renditions of the same song tell themselves apart.
// The drawing fills the RMS and outlines the peak.
//
// Pure: takes channel arrays, not an AudioBuffer.

export const BUCKETS_PER_SECOND = 120;

export function computePeaks(channels, sampleRate, bucketsPerSecond = BUCKETS_PER_SECOND) {
  const frames = channels[0]?.length ?? 0;
  const samplesPerBucket = Math.max(1, Math.round(sampleRate / bucketsPerSecond));
  const count = Math.ceil(frames / samplesPerBucket);
  const peak = new Float32Array(count);
  const rms = new Float32Array(count);
  let rmsMax = 0;
  let peakMax = 0;

  for (let bucket = 0; bucket < count; bucket += 1) {
    const start = bucket * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, frames);
    let loudest = 0;
    let sum = 0;
    let n = 0;
    for (const data of channels) {
      for (let i = start; i < end; i += 1) {
        const value = data[i];
        const magnitude = Math.abs(value);
        if (magnitude > loudest) loudest = magnitude;
        sum += value * value;
        n += 1;
      }
    }
    peak[bucket] = loudest;
    rms[bucket] = n ? Math.sqrt(sum / n) : 0;
    if (rms[bucket] > rmsMax) rmsMax = rms[bucket];
    if (loudest > peakMax) peakMax = loudest;
  }

  return { peak, rms, rmsMax, peakMax, bucketsPerSecond, duration: frames / sampleRate };
}

// The amplitudes to draw for one band: `rows` pixel rows covering [from, to).
// Each row takes the loudest bucket it spans, so a quiet row never hides a
// transient that a lower zoom would have shown.
export function rowsFor(peaks, from, to, rows) {
  const count = Math.max(0, rows);
  const out = { peak: new Float32Array(count), rms: new Float32Array(count) };
  if (!peaks || count === 0 || to <= from) return out;
  const { peak, rms, bucketsPerSecond } = peaks;
  const span = (to - from) / count;

  for (let row = 0; row < count; row += 1) {
    const start = Math.floor((from + row * span) * bucketsPerSecond);
    const end = Math.max(start + 1, Math.ceil((from + (row + 1) * span) * bucketsPerSecond));
    let loudest = 0;
    let loudestRms = 0;
    for (let i = start; i < end && i < peak.length; i += 1) {
      if (peak[i] > loudest) loudest = peak[i];
      if (rms[i] > loudestRms) loudestRms = rms[i];
    }
    out.peak[row] = loudest;
    out.rms[row] = loudestRms;
  }
  return out;
}

// One scale per measure, shared by both sides, so the width a waveform
// reaches stays comparable: if the rework was mastered louder, that is
// something to see, not to normalise away. The two measures need separate
// scales because they live at different levels — a mix that peaks at full
// scale sits around a fifth of it in RMS, and one scale for both would
// either flatten the shape or drive every transient into the column edge.
export function sharedScale(peaksA, peaksB) {
  const loudest = (key) => Math.max(peaksA?.[key] ?? 0, peaksB?.[key] ?? 0);
  const rms = loudest('rmsMax');
  const peak = loudest('peakMax');
  return { rms: rms > 0 ? 1 / rms : 1, peak: peak > 0 ? 1 / peak : 1 };
}
