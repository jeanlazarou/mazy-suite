// Loudness along a track, for the level meter: RMS over 10 ms, measured
// every millisecond, the loudest channel winning. Levels are in dBFS.
// Same measure as vox_noise_gate's gate, without its detector high-pass.

export const HOP_MS = 1;
export const WINDOW_MS = 10;
export const LEVEL_FLOOR = -120; // level of digital silence
export const METER_FLOOR = -90; // left end of the meter

// Mean square of each hop, the loudest channel winning
function hopPowers(channels, hop) {
  const length = channels[0].length;
  const power = new Float64Array(Math.ceil(length / hop));

  for (const data of channels) {
    for (let h = 0; h < power.length; h++) {
      const a = h * hop;
      const b = Math.min(length, a + hop);
      let sum = 0;

      for (let i = a; i < b; i++) sum += data[i] * data[i];

      const ms = sum / (b - a);

      if (ms > power[h]) power[h] = ms;
    }
  }

  return power;
}

// -> { levels: Float32Array (dBFS per hop), hopSeconds }
export function analyzeLevels(channels, sampleRate) {
  const hop = Math.max(1, Math.round((sampleRate * HOP_MS) / 1000));
  const power = hopPowers(channels, hop);

  const hops = power.length;
  const window = Math.max(1, Math.round(WINDOW_MS / HOP_MS));
  const before = Math.floor(window / 2);
  const after = window - before;

  const levels = new Float32Array(hops);

  // centred moving average, so the levels are not shifted in time
  let sum = 0;
  let from = 0;
  let to = 0;

  for (let h = 0; h < hops; h++) {
    const a = Math.max(0, h - before);
    const b = Math.min(hops, h + after);

    while (to < b) sum += power[to++];
    while (from < a) sum -= power[from++];

    const ms = Math.max(0, sum / (b - a));

    levels[h] = ms > 1e-12 ? Math.max(LEVEL_FLOOR, 10 * Math.log10(ms)) : LEVEL_FLOOR;
  }

  return { levels, hopSeconds: hop / sampleRate };
}

export function levelAt(analysis, time) {
  if (!analysis) return LEVEL_FLOOR;

  const { levels, hopSeconds } = analysis;
  const i = Math.floor(time / hopSeconds);

  return levels[Math.max(0, Math.min(levels.length - 1, i))] ?? LEVEL_FLOOR;
}

// dB level mapped linearly onto the meter: quiet passages stay visible
export const levelToWidth = (db) =>
  Math.max(0, Math.min(1, (db - METER_FLOOR) / -METER_FLOOR));
