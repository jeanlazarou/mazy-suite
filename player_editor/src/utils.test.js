import { describe, expect, it } from "vitest";

import {
  formatTime,
  hasAnomalies,
  isPositionAfterTiming,
  markerLabel,
  timingsQuickFix,
  toMarkers,
  toRegions,
  toSMPTETimecode,
  updateTiming,
} from "./utils";

describe("toSMPTETimecode", () => {
  it("formats seconds as 00:mm:ss,mmm", () => {
    expect(toSMPTETimecode(0)).toBe("00:00:00,000");
    expect(toSMPTETimecode(61.5)).toBe("00:01:01,500");
    expect(toSMPTETimecode(111.593)).toBe("00:01:51,593");
  });
});

describe("formatTime", () => {
  it("formats seconds as mm:ss:cc", () => {
    expect(formatTime(0)).toBe("00:00:00");
    expect(formatTime(61.25)).toBe("01:01:25");
  });
});

describe("isPositionAfterTiming", () => {
  it("compares with centisecond precision", () => {
    expect(isPositionAfterTiming(10.0, 10.0)).toBe(true);
    expect(isPositionAfterTiming(10.01, 10.0)).toBe(true);
    expect(isPositionAfterTiming(9.99, 10.0)).toBe(false);
  });
});

describe("markerLabel", () => {
  it("cycles through 1-9 then A-Z", () => {
    expect(markerLabel(0)).toBe("1");
    expect(markerLabel(8)).toBe("9");
    expect(markerLabel(9)).toBe("A");
    expect(markerLabel(35)).toBe("1");
  });
});

describe("toRegions", () => {
  it("pairs [start, id] / [end, null] timings into regions", () => {
    const timings = [
      [1, 1],
      [2, null],
      [5, 2],
      [7, null],
    ];

    expect(toRegions(timings)).toEqual([
      { start: 1, end: 2 },
      { start: 5, end: 7 },
    ]);
  });
});

describe("toMarkers", () => {
  it("colors saved regions gray and changed ones violet", () => {
    const timings = [
      [1, 1],
      [2, null],
      [5, 2],
      [7, null],
    ];

    const markers = toMarkers(timings, new Set([1]), true);

    expect(markers).toHaveLength(2);
    expect(markers[0].color).toBe("rgba(119, 119, 119, 0.3)");
    expect(markers[1].color).toBe("rgba(114, 34, 119, 0.3)");
    expect(markers[0].label).toBe("1");
  });

  it("omits labels when not requested", () => {
    const markers = toMarkers([[1, 1], [2, null]], new Set(), false);

    expect(markers[0].label).toBeUndefined();
  });
});

describe("updateTiming", () => {
  it("appends a new region and renumbers in chronological order", () => {
    const timings = [
      [1, 1],
      [2, null],
      [10, 2],
      [12, null],
    ];

    const updated = updateTiming(timings, { start: 5, end: 7 });

    expect(updated).toEqual([
      [1, 1],
      [2, null],
      [5, 2],
      [7, null],
      [10, 3],
      [12, null],
    ]);
  });

  it("replaces the region at the given index", () => {
    const timings = [
      [1, 1],
      [2, null],
      [10, 2],
      [12, null],
    ];

    const updated = updateTiming(timings, { start: 3, end: 4 }, 2);

    expect(updated).toEqual([
      [1, 1],
      [2, null],
      [3, 2],
      [4, null],
    ]);
  });
});

describe("hasAnomalies", () => {
  const song = (timings, count) => ({
    lyrics: Array.from({ length: count }, (_, i) => `verse ${i}`),
    timings,
  });

  it("detects overlapping regions", () => {
    expect(
      hasAnomalies(song([[1, 1], [5, null], [3, 2], [7, null]], 2))
    ).toBe(true);
  });

  it("accepts back-to-back regions", () => {
    expect(
      hasAnomalies(song([[1, 1], [3, null], [3, 2], [7, null]], 2))
    ).toBe(false);
  });
});

describe("timingsQuickFix", () => {
  it("clips overlapping ends to the next start", () => {
    const fixed = timingsQuickFix({
      lyrics: ["a", "b"],
      timings: [
        [1, 1],
        [5, null],
        [3, 2],
        [7, null],
      ],
    });

    expect(fixed).toEqual([
      { text: "a", start: 1, end: 3 },
      { text: "b", start: 3, end: 7 },
    ]);
  });
});
