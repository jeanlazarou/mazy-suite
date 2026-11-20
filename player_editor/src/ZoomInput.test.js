import { describe, expect, it } from "vitest";

import { stepRelativeToZoom } from "./ZoomInput";

describe("stepRelativeToZoom", () => {
  it("reads the range input's string value", () => {
    expect(stepRelativeToZoom("50")).toBeCloseTo(0.5);
  });

  it("stays positive past the slider's ends", () => {
    expect(stepRelativeToZoom("501")).toBeCloseTo(0.01);
    expect(stepRelativeToZoom(100)).toBeCloseTo(0.01);
    expect(stepRelativeToZoom(-3)).toBe(1);
  });
});
