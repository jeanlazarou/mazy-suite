// The noise gate, independent of the browser: level analysis, silence
// detection and rendering. Times are in seconds, durations in the params in
// milliseconds, levels in dBFS.
//
// A region is a stretch that ends up silent. Its fades happen inside it, so
// everything outside the regions is left sample for sample as recorded.

export const DEFAULT_PARAMS = {
  threshold: -50, // a stretch quieter than this is silence
  minSilence: 300, // shorter silences (gaps between words) stay as they are
  keepBefore: 40, // audio kept before the voice comes back (consonants)
  keepAfter: 150, // audio kept after the voice stops (tails, reverb)
  fade: 20, // fade out at the start of a region, fade in at its end
  floorDb: null, // level inside a region: null for silence, else dB
  lowCut: 80, // the detector ignores rumble below this (Hz, 0 = off)
};

export const HOP_MS = 1; // resolution of the level analysis
export const WINDOW_MS = 10; // RMS window the level is measured on
export const MIN_REGION = 0.01; // shorter regions are dropped
export const LEVEL_FLOOR = -120; // level of digital silence

// RBJ cookbook high-pass, Butterworth Q
function highPassCoefficients(frequency, sampleRate) {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;

  return {
    b0: (1 + cos) / 2 / a0,
    b1: -(1 + cos) / a0,
    b2: (1 + cos) / 2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

// Mean square of each hop, the loudest channel winning
function hopPowers(channels, sampleRate, hop, lowCut) {
  const length = channels[0].length;
  const hops = Math.ceil(length / hop);
  const power = new Float64Array(hops);

  const filter =
    lowCut > 0 && lowCut < sampleRate / 2
      ? highPassCoefficients(lowCut, sampleRate)
      : null;

  for (const data of channels) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let h = 0; h < hops; h++) {
      const a = h * hop;
      const b = Math.min(length, a + hop);
      let sum = 0;

      for (let i = a; i < b; i++) {
        let x = data[i];

        if (filter) {
          const y =
            filter.b0 * x + filter.b1 * x1 + filter.b2 * x2 -
            filter.a1 * y1 - filter.a2 * y2;

          x2 = x1;
          x1 = x;
          y2 = y1;
          y1 = y;
          x = y;
        }

        sum += x * x;
      }

      const ms = sum / (b - a);

      if (ms > power[h]) power[h] = ms;
    }
  }

  return power;
}

// -> { levels: Float32Array (dBFS per hop), hopSeconds }
export function analyzeLevels(channels, sampleRate, { lowCut = 0 } = {}) {
  const hop = Math.max(1, Math.round((sampleRate * HOP_MS) / 1000));
  const power = hopPowers(channels, sampleRate, hop, lowCut);

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

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

// Noise floor and voice level, and a threshold between them. Digital silence
// (already cleaned stretches) is not noise and is left out.
export function levelStats(levels) {
  const sorted = Float32Array.from(levels.filter((l) => l > LEVEL_FLOOR + 1)).sort();

  if (sorted.length === 0) {
    return { noiseFloor: LEVEL_FLOOR, voiceLevel: LEVEL_FLOOR, threshold: DEFAULT_PARAMS.threshold };
  }

  const noiseFloor = percentile(sorted, 0.1);
  const voiceLevel = percentile(sorted, 0.95);
  const margin = Math.max(6, Math.min(20, (voiceLevel - noiseFloor) * 0.3));

  return {
    noiseFloor,
    voiceLevel,
    threshold: Math.round((noiseFloor + margin) * 2) / 2,
  };
}

// The hops [i, j) quieter than the threshold, as a silence
const silenceOf = (i, j, n, hopSeconds, duration) => ({
  silenceStart: i * hopSeconds,
  silenceEnd: Math.min(duration, j * hopSeconds),
  atStart: i === 0,
  atEnd: j >= n,
});

// The region a silence becomes, or null when the gate leaves it alone: too
// short, or nothing left once the audio around the voice is kept
export function regionOfSilence(silence, duration, params) {
  const { silenceStart, silenceEnd, atStart, atEnd } = silence;

  if ((silenceEnd - silenceStart) * 1000 < params.minSilence) return null;

  // no voice before the first silence, nor after the last one
  const start = atStart ? 0 : silenceStart + params.keepAfter / 1000;
  const end = atEnd ? duration : silenceEnd - params.keepBefore / 1000;

  return end - start >= MIN_REGION ? { start, end } : null;
}

// Stretches quieter than the threshold for at least minSilence, minus the
// audio kept around the voice. -> [{ start, end }] sorted, disjoint
export function detectSilences(levels, hopSeconds, duration, params) {
  const n = levels.length;
  const regions = [];

  let i = 0;

  while (i < n) {
    if (levels[i] >= params.threshold) {
      i++;
      continue;
    }

    let j = i;

    while (j < n && levels[j] < params.threshold) j++;

    const region = regionOfSilence(silenceOf(i, j, n, hopSeconds, duration), duration, params);

    if (region) regions.push(region);

    i = j;
  }

  return regions;
}

// The silence holding time, whether long enough or not: { silenceStart,
// silenceEnd, atStart, atEnd }, or null where the level reaches the threshold
export function silenceAround(analysis, duration, threshold, time) {
  const { levels, hopSeconds } = analysis;
  const n = levels.length;
  const h = Math.floor(time / hopSeconds);

  if (h < 0 || h >= n || levels[h] >= threshold) return null;

  let i = h;
  let j = h + 1;

  while (i > 0 && levels[i - 1] < threshold) i--;
  while (j < n && levels[j] < threshold) j++;

  return silenceOf(i, j, n, hopSeconds, duration);
}

// How many hops fall in each dB step from `from` to `to`, quieter ones in the
// first; digital silence is left out
export function levelHistogram(levels, { from = -90, to = 0, step = 1 } = {}) {
  const bins = new Uint32Array(Math.ceil((to - from) / step));

  for (const level of levels) {
    if (level <= LEVEL_FLOOR + 1) continue;

    const bin = Math.floor((level - from) / step);

    bins[Math.max(0, Math.min(bins.length - 1, bin))]++;
  }

  return bins;
}

export const floorGain = (floorDb) =>
  floorDb === null || floorDb === undefined ? 0 : Math.pow(10, floorDb / 20);

// The gain at time, by the same curve renderChannel applies sample by sample
export function gainAt(region, time, params, duration) {
  if (!region || time < region.start || time >= region.end) return 1;

  const floor = floorGain(params.floorDb);
  const range = 1 - floor;
  const fade = Math.min(params.fade / 1000, (region.end - region.start) / 2);
  const fadeOut = region.start <= 0 ? 0 : fade;
  const fadeIn = region.end >= duration ? 0 : fade;

  if (time < region.start + fadeOut) {
    return floor + range * 0.5 * (1 + Math.cos((Math.PI * (time - region.start)) / fadeOut));
  }

  if (time >= region.end - fadeIn) {
    return floor + range * 0.5 * (1 - Math.cos((Math.PI * (time - region.end + fadeIn)) / fadeIn));
  }

  return floor;
}

// Gain of each sample of a region: fade out, floor, fade in (raised cosine).
// No fade where the region meets the start or the end of the recording.
function forEachRegionGain(region, sampleRate, length, fadeMs, floor, callback) {
  const a = Math.max(0, Math.round(region.start * sampleRate));
  const b = Math.min(length, Math.round(region.end * sampleRate));

  if (b <= a) return;

  const fade = Math.min(Math.round((fadeMs / 1000) * sampleRate), Math.floor((b - a) / 2));
  const fadeOut = a === 0 ? 0 : fade;
  const fadeIn = b === length ? 0 : fade;
  const range = 1 - floor;
  const fadeInStart = b - fadeIn;

  for (let i = a; i < b; i++) {
    let g = floor;

    if (i < a + fadeOut) {
      g = floor + range * 0.5 * (1 + Math.cos((Math.PI * (i - a)) / fadeOut));
    } else if (i >= fadeInStart) {
      g = floor + range * 0.5 * (1 - Math.cos((Math.PI * (i - fadeInStart + 1)) / fadeIn));
    }

    callback(i, g);
  }
}

// mode: "gated" (the result), "removed" (only what the gate takes away) or
// "original". regions must be disjoint (see mergeForRender).
export function renderChannel(input, output, sampleRate, regions, params, mode = "gated") {
  const length = input.length;

  if (mode === "removed") {
    output.fill(0);
  } else if (output !== input) {
    output.set(input);
  }

  if (mode === "original") return output;

  const floor = floorGain(params.floorDb);

  for (const region of regions) {
    if (mode === "removed") {
      forEachRegionGain(region, sampleRate, length, params.fade, floor, (i, g) => {
        output[i] = input[i] * (1 - g);
      });
    } else {
      forEachRegionGain(region, sampleRate, length, params.fade, floor, (i, g) => {
        output[i] = input[i] * g;
      });
    }
  }

  return output;
}

export function renderGate(channels, sampleRate, regions, params, mode = "gated") {
  return channels.map((input) =>
    renderChannel(input, new Float32Array(input.length), sampleRate, regions, params, mode)
  );
}

// Index of the region holding time, or -1 (regions sorted, disjoint)
export function regionIndexAt(regions, time) {
  let lo = 0;
  let hi = regions.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = regions[mid];

    if (time < r.start) hi = mid - 1;
    else if (time >= r.end) lo = mid + 1;
    else return mid;
  }

  return -1;
}

export function levelAt(analysis, time) {
  if (!analysis) return LEVEL_FLOOR;

  const { levels, hopSeconds } = analysis;
  const i = Math.floor(time / hopSeconds);

  return levels[Math.max(0, Math.min(levels.length - 1, i))] ?? LEVEL_FLOOR;
}
