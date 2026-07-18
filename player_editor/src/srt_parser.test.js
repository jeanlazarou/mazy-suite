import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseLyrics } from "./srt_parser";

const fixture = (name) =>
  readFileSync(new URL(`../test/${name}`, import.meta.url), "utf8");

describe("parseLyrics", () => {
  it("parses a simple valid file", () => {
    const { lyricsData, anomalies } = parseLyrics("song", fixture("simple_ok.srt"));

    expect(anomalies.invalid).toBe(false);
    expect(anomalies.warning).toBe(false);

    expect(lyricsData.title).toBe("song");
    expect(lyricsData.lyrics).toEqual(["a", "b"]);

    // one [from, id] and one [to, null] entry per verse
    expect(lyricsData.timings).toEqual([
      [71.593, 1],
      [92.686, null],
      [96.686, 2],
      [1 * 60 + 40.228, null],
    ]);

    expect(lyricsData.savedTimings).toEqual(new Set([71.593, 96.686]));
  });

  it("parses a full song", () => {
    const { lyricsData, anomalies } = parseLyrics("song", fixture("valid.srt"));

    expect(anomalies.invalid).toBe(false);
    expect(anomalies.warning).toBe(false);
    expect(lyricsData.lyrics).toHaveLength(18);
    expect(lyricsData.timings).toHaveLength(36);
  });

  it("flags overlapping timings as warnings, not errors", () => {
    const { lyricsData, anomalies } = parseLyrics(
      "song",
      fixture("double_overlapping.srt")
    );

    expect(anomalies.invalid).toBe(false);
    expect(anomalies.warning).toBe(true);
    expect(anomalies.invalidTo).toHaveLength(1);

    // content is still usable
    expect(lyricsData.lyrics).toHaveLength(5);
  });

  it("warns when a timing repeats the previous one", () => {
    const { anomalies } = parseLyrics("song", fixture("invalid1.srt"));

    expect(anomalies.invalid).toBe(false);
    expect(anomalies.warning).toBe(true);
    expect(anomalies.invalidFrom).toHaveLength(1);
    expect(anomalies.invalidTo).toHaveLength(1);
  });

  it("rejects files with unparsable timings", () => {
    const { lyricsData, anomalies } = parseLyrics("song", fixture("invalid3.srt"));

    expect(anomalies.invalid).toBe(true);
    expect(anomalies.countFrom).toBe(1);

    // nothing is extracted from an invalid file
    expect(lyricsData.lyrics).toEqual([]);
    expect(lyricsData.timings).toEqual([]);
  });

  it("returns empty data when the content does not start with an index", () => {
    const { lyricsData, anomalies } = parseLyrics("song", "no srt content");

    expect(anomalies.invalid).toBe(false);
    expect(lyricsData.lyrics).toEqual([]);
  });

  it("joins multi-line verses with a space", () => {
    const content = "1\n00:00:01,000 --> 00:00:02,000\nline one\nline two\n";

    const { lyricsData } = parseLyrics("song", content);

    expect(lyricsData.lyrics).toEqual(["line one line two"]);
  });
});
