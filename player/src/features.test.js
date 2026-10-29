import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  globalThis.localStorage = { getItem: () => null };
});

import { defaultFeatures } from "./features";

describe("defaultFeatures", () => {
  it("keeps the defaults in a plain build", () => {
    const features = defaultFeatures("production");

    expect(features.isolatedPlayer).toBe(false);
    expect(features.defaultList).toBe(false);
  });

  it("reads its own data folder and plays default.json in a single-album build", () => {
    const features = defaultFeatures("single-album");

    expect(features.isolatedPlayer).toBe(true);
    expect(features.defaultList).toBe(true);
    expect(features.includeTour).toBe(true);
  });
});
