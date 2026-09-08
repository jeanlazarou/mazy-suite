import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_THEME,
  normalizeTheme,
  themeClassNames,
  themeMarker,
} from "./descriptionThemes";

describe("themeMarker", () => {
  it("reads the theme name", () => {
    expect(themeMarker("$THEME:sleeve")).toBe("sleeve");
  });

  it("ignores the spacing around the name", () => {
    expect(themeMarker("  $THEME:   sleeve  ")).toBe("sleeve");
  });

  it("returns null for any other line", () => {
    expect(themeMarker("# Chapter 22")).toBeNull();
    expect(themeMarker("1. $T:Songs")).toBeNull();
    expect(themeMarker("a $THEME:sleeve marker mid-sentence")).toBeNull();
  });
});

describe("normalizeTheme", () => {
  it("accepts a known theme, whatever its case", () => {
    expect(normalizeTheme("Sleeve")).toBe("sleeve");
  });

  it("falls back to the default theme", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme("")).toBe(DEFAULT_THEME);
    expect(normalizeTheme("no-such-theme")).toBe(DEFAULT_THEME);

    warn.mockRestore();
  });
});

describe("themeClassNames", () => {
  it("leaves the default theme unclassed", () => {
    expect(themeClassNames(DEFAULT_THEME)).toBe("");
  });

  it("marks a themed description", () => {
    expect(themeClassNames("neon")).toBe(
      "description-themed description-theme-neon"
    );
  });
});
