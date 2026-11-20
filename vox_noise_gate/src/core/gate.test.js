import { describe, expect, it } from "vitest";

import {
  DEFAULT_PARAMS,
  LEVEL_FLOOR,
  analyzeLevels,
  detectSilences,
  levelStats,
  regionIndexAt,
  renderChannel,
  renderGate,
} from "./gate";

const SR = 8000;

// "voice" as a 440 Hz tone at -12 dBFS, over noise at about -60 dBFS
function take(sections) {
  const length = sections.reduce((n, [seconds]) => n + Math.round(seconds * SR), 0);
  const data = new Float32Array(length);
  let seed = 1;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };

  let i = 0;
  for (const [seconds, kind] of sections) {
    const n = Math.round(seconds * SR);
    for (let k = 0; k < n; k++, i++) {
      const voice = kind === "voice" ? 0.35 * Math.sin((2 * Math.PI * 440 * i) / SR) : 0;
      data[i] = voice + 0.0017 * noise();
    }
  }

  return data;
}

const params = (overrides = {}) => ({ ...DEFAULT_PARAMS, ...overrides });

describe("analyzeLevels", () => {
  it("measures the voice and the noise apart", () => {
    const data = take([[1, "noise"], [1, "voice"], [1, "noise"]]);
    const { levels, hopSeconds } = analyzeLevels([data], SR);

    expect(hopSeconds).toBeCloseTo(0.001, 6);
    expect(levels.length).toBe(3000);
    expect(levels[500]).toBeLessThan(-55);
    expect(levels[1500]).toBeGreaterThan(-15);
    expect(levels[2500]).toBeLessThan(-55);
  });

  it("listens to the loudest channel", () => {
    const silent = new Float32Array(SR);
    const loud = take([[1, "voice"]]);

    const { levels } = analyzeLevels([silent, loud], SR);

    expect(levels[500]).toBeGreaterThan(-15);
  });

  it("ignores rumble below the low cut", () => {
    const rumble = Float32Array.from({ length: SR }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 30 * i) / SR));

    // a 10 ms window is shorter than a 30 Hz period: average over many hops
    const mean = (levels) => levels.subarray(200, 800).reduce((s, l) => s + l, 0) / 600;

    const open = mean(analyzeLevels([rumble], SR, { lowCut: 0 }).levels);
    const cut = mean(analyzeLevels([rumble], SR, { lowCut: 150 }).levels);

    expect(open).toBeGreaterThan(-30);
    expect(cut).toBeLessThan(open - 20);
  });

  it("puts digital silence at the level floor", () => {
    const { levels } = analyzeLevels([new Float32Array(800)], SR);

    expect(levels[50]).toBe(LEVEL_FLOOR);
  });
});

describe("levelStats", () => {
  it("puts the threshold between the noise floor and the voice", () => {
    const data = take([[2, "noise"], [2, "voice"], [1, "noise"]]);
    const { levels } = analyzeLevels([data], SR);

    const stats = levelStats(levels);

    expect(stats.noiseFloor).toBeLessThan(-55);
    expect(stats.voiceLevel).toBeGreaterThan(-15);
    expect(stats.threshold).toBeGreaterThan(stats.noiseFloor + 5);
    expect(stats.threshold).toBeLessThan(stats.voiceLevel - 20);
  });

  it("leaves digital silence out of the noise floor", () => {
    const data = take([[1, "noise"], [1, "voice"]]);
    const padded = new Float32Array(data.length + 4 * SR);
    padded.set(data, 4 * SR);

    const { levels } = analyzeLevels([padded], SR);

    expect(levelStats(levels).noiseFloor).toBeGreaterThan(-70);
  });
});

describe("detectSilences", () => {
  const levelsOf = (sections) => analyzeLevels([take(sections)], SR);

  it("finds the silences, minus what is kept around the voice", () => {
    const { levels, hopSeconds } = levelsOf([[1, "noise"], [1, "voice"], [1, "noise"], [1, "voice"], [1, "noise"]]);

    const regions = detectSilences(levels, hopSeconds, 5, params({ threshold: -40 }));

    expect(regions).toHaveLength(3);

    // the first silence starts the file: nothing to keep before it
    expect(regions[0].start).toBe(0);
    expect(regions[0].end).toBeCloseTo(1 - 0.04, 2);

    expect(regions[1].start).toBeCloseTo(2 + 0.15, 2);
    expect(regions[1].end).toBeCloseTo(3 - 0.04, 2);

    // the last one ends it: nothing to keep after it
    expect(regions[2].start).toBeCloseTo(4 + 0.15, 2);
    expect(regions[2].end).toBe(5);
  });

  it("leaves silences shorter than minSilence alone", () => {
    const { levels, hopSeconds } = levelsOf([[1, "voice"], [0.2, "noise"], [1, "voice"], [0.5, "noise"], [1, "voice"]]);

    const regions = detectSilences(levels, hopSeconds, 3.7, params({ threshold: -40, minSilence: 300 }));

    expect(regions).toHaveLength(1);
    expect(regions[0].start).toBeCloseTo(2.2 + 0.15, 2);
  });

  it("drops a silence the kept margins eat whole", () => {
    const { levels, hopSeconds } = levelsOf([[1, "voice"], [0.35, "noise"], [1, "voice"]]);

    const regions = detectSilences(levels, hopSeconds, 2.35, params({ threshold: -40, keepBefore: 100, keepAfter: 300 }));

    expect(regions).toHaveLength(0);
  });

  it("finds nothing above the threshold", () => {
    const { levels, hopSeconds } = levelsOf([[1, "noise"]]);

    expect(detectSilences(levels, hopSeconds, 1, params({ threshold: -90 }))).toEqual([]);
  });
});

describe("renderChannel", () => {
  const ones = (n) => new Float32Array(n).fill(1);

  it("leaves everything outside the regions untouched", () => {
    const input = Float32Array.from({ length: 800 }, (_, i) => Math.sin(i));
    const output = renderChannel(input, new Float32Array(800), SR, [{ start: 0.025, end: 0.05 }], params({ fade: 2 }), "gated");

    for (let i = 0; i < 200; i++) expect(output[i]).toBe(input[i]);
    for (let i = 400; i < 800; i++) expect(output[i]).toBe(input[i]);
  });

  it("fades out, silences, fades back in", () => {
    const output = renderChannel(ones(800), new Float32Array(800), SR, [{ start: 0.025, end: 0.075 }], params({ fade: 5 }), "gated");

    // region is samples 200..600, fades are 40 samples
    expect(output[200]).toBe(1);
    expect(output[220]).toBeCloseTo(0.5, 1);
    expect(output[240]).toBe(0);
    expect(output[400]).toBe(0);
    expect(output[559]).toBe(0);
    expect(output[580]).toBeCloseTo(0.5, 1);
    expect(output[599]).toBeCloseTo(1, 6);

    // monotonic fades
    for (let i = 201; i < 240; i++) expect(output[i]).toBeLessThanOrEqual(output[i - 1]);
    for (let i = 561; i < 600; i++) expect(output[i]).toBeGreaterThanOrEqual(output[i - 1]);
  });

  it("shortens the fades of a short region", () => {
    const output = renderChannel(ones(800), new Float32Array(800), SR, [{ start: 0.025, end: 0.03 }], params({ fade: 50 }), "gated");

    // 40 samples: 20 down, 20 up
    expect(output[219]).toBeCloseTo(0, 1);
    expect(output[220]).toBeCloseTo(0, 1);
    expect(output[239]).toBeCloseTo(1, 6);
  });

  it("does not fade where a region meets the start or the end", () => {
    const output = renderChannel(ones(800), new Float32Array(800), SR, [{ start: 0, end: 0.025 }, { start: 0.075, end: 0.1 }], params({ fade: 5 }), "gated");

    expect(output[0]).toBe(0);
    expect(output[199]).toBeCloseTo(1, 6); // fades back in before the voice
    expect(output[180]).toBeCloseTo(0.5, 1);
    expect(output[620]).toBeCloseTo(0.5, 1); // fades out after the voice
    expect(output[799]).toBe(0);
  });

  it("reduces to the floor instead of silence", () => {
    const output = renderChannel(ones(800), new Float32Array(800), SR, [{ start: 0.025, end: 0.075 }], params({ fade: 0, floorDb: -20 }), "gated");

    expect(output[400]).toBeCloseTo(0.1, 6);
  });

  it("makes gated + removed the original", () => {
    const input = Float32Array.from({ length: 800 }, (_, i) => Math.sin(i / 3));
    const regions = [{ start: 0.01, end: 0.04 }, { start: 0.06, end: 0.09 }];
    const p = params({ fade: 3, floorDb: -12 });

    const gated = renderChannel(input, new Float32Array(800), SR, regions, p, "gated");
    const removed = renderChannel(input, new Float32Array(800), SR, regions, p, "removed");

    for (let i = 0; i < 800; i++) expect(gated[i] + removed[i]).toBeCloseTo(input[i], 6);
    expect(removed[20]).toBe(0);
  });

  it("can render in place", () => {
    const data = ones(800);

    renderChannel(data, data, SR, [{ start: 0.025, end: 0.075 }], params({ fade: 0 }), "gated");

    expect(data[100]).toBe(1);
    expect(data[400]).toBe(0);
  });
});

describe("renderGate", () => {
  it("renders every channel and keeps the input", () => {
    const left = new Float32Array(800).fill(0.5);
    const right = new Float32Array(800).fill(-0.5);

    const [l, r] = renderGate([left, right], SR, [{ start: 0.05, end: 0.1 }], params({ fade: 0 }));

    expect(l[500]).toBeCloseTo(0, 10);
    expect(r[500]).toBeCloseTo(0, 10);
    expect(left[500]).toBe(0.5);
  });
});

describe("regionIndexAt", () => {
  const regions = [{ start: 1, end: 2 }, { start: 3, end: 4 }, { start: 6, end: 9 }];

  it("finds the region holding a time", () => {
    expect(regionIndexAt(regions, 1)).toBe(0);
    expect(regionIndexAt(regions, 3.5)).toBe(1);
    expect(regionIndexAt(regions, 8.99)).toBe(2);
  });

  it("answers -1 between regions", () => {
    expect(regionIndexAt(regions, 0.5)).toBe(-1);
    expect(regionIndexAt(regions, 2)).toBe(-1);
    expect(regionIndexAt(regions, 10)).toBe(-1);
    expect(regionIndexAt([], 1)).toBe(-1);
  });
});
