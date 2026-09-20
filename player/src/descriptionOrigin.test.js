import { describe, expect, it } from "vitest";

import { originMarker, renderOrigin } from "./descriptionOrigin";

describe("originMarker", () => {
  it("reads a field off a bullet, keeping the bullet punctuation", () => {
    expect(originMarker("   - $KIND:AI rework")).toEqual({
      prefix: "   - ",
      field: "kind",
      value: "AI rework",
    });
  });

  it("accepts the three fields", () => {
    expect(originMarker("- $FROM:1992").field).toBe("from");
    expect(originMarker("- $NOTE:from the demo").field).toBe("note");
    expect(originMarker("- $KIND:remix").field).toBe("kind");
  });

  it("trims the value and tolerates a missing bullet", () => {
    expect(originMarker("$FROM:  2004/08  ")).toEqual({
      prefix: "",
      field: "from",
      value: "2004/08",
    });
  });

  it("returns null for any other line", () => {
    expect(originMarker("   - $AC")).toBeNull();
    expect(originMarker("1. $T:Glass Door*")).toBeNull();
    expect(originMarker("   - Original: Higher")).toBeNull();
    expect(originMarker("a $KIND:rework mid-sentence")).toBeNull();
  });
});

describe("renderOrigin", () => {
  it("renders the fields in a fixed order, whatever order they were written", () => {
    expect(renderOrigin({ note: "from the demo", from: "1992", kind: "rework" })).toBe(
      '<span class="description-origin">' +
        '<span class="description-origin-kind">rework</span>' +
        '<span class="description-origin-from">1992</span>' +
        '<span class="description-origin-note">from the demo</span>' +
        "</span>"
    );
  });

  it("leaves out the fields that are missing", () => {
    expect(renderOrigin({ from: "2004/08" })).toBe(
      '<span class="description-origin">' +
        '<span class="description-origin-from">2004/08</span>' +
        "</span>"
    );
  });

  it("renders nothing when every field is empty", () => {
    expect(renderOrigin({})).toBeNull();
    expect(renderOrigin({ kind: "", from: "", note: "" })).toBeNull();
  });
});
