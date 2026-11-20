import { describe, expect, it } from "vitest";

import {
  NO_EDITS,
  acceptRegion,
  combineRegions,
  deleteRegion,
  hasEdits,
  mergeForRender,
  mergeOverlapping,
  nextRegion,
  previousRegion,
  removeKeep,
  splitRegion,
  subtract,
} from "./regions";

const ranges = (list) => list.map(({ start, end }) => [start, end]);

describe("subtract", () => {
  it("cuts a range around the blockers", () => {
    expect(ranges(subtract({ start: 0, end: 10 }, [{ start: 2, end: 3 }, { start: 5, end: 12 }]))).toEqual([
      [0, 2],
      [3, 5],
    ]);
  });

  it("keeps a range no blocker touches", () => {
    expect(ranges(subtract({ start: 0, end: 1 }, [{ start: 1, end: 2 }]))).toEqual([[0, 1]]);
  });

  it("removes a covered range", () => {
    expect(subtract({ start: 1, end: 2 }, [{ start: 0, end: 3 }])).toEqual([]);
  });
});

describe("merging", () => {
  it("merges overlapping ranges but keeps touching ones apart", () => {
    const merged = mergeOverlapping([
      { id: "b", start: 2, end: 4 },
      { id: "a", start: 0, end: 2 },
      { id: "c", start: 3, end: 5 },
    ]);

    expect(merged).toEqual([
      { id: "a", start: 0, end: 2 },
      { id: "b", start: 2, end: 5 },
    ]);
  });

  it("renders touching ranges as one", () => {
    expect(ranges(mergeForRender([{ start: 2, end: 4 }, { start: 0, end: 2 }, { start: 5, end: 6 }]))).toEqual([
      [0, 4],
      [5, 6],
    ]);
  });
});

describe("combineRegions", () => {
  const detected = [
    { start: 0, end: 1 },
    { start: 2, end: 4 },
    { start: 6, end: 8 },
  ];

  it("uses the detected regions when nothing was edited", () => {
    const regions = combineRegions(detected, NO_EDITS);

    expect(ranges(regions)).toEqual([[0, 1], [2, 4], [6, 8]]);
    expect(regions.every((r) => r.origin === "auto")).toBe(true);
    expect(new Set(regions.map((r) => r.id)).size).toBe(3);
  });

  it("cuts detected regions around keeps and manual regions", () => {
    const edits = {
      manual: [{ id: "manual-1", start: 3, end: 5 }],
      keeps: [{ id: "keep-2", start: 6.5, end: 7 }],
      next: 3,
    };

    const regions = combineRegions(detected, edits);

    expect(regions.map((r) => [r.start, r.end, r.origin])).toEqual([
      [0, 1, "auto"],
      [2, 3, "auto"],
      [3, 5, "manual"],
      [6, 6.5, "auto"],
      [7, 8, "auto"],
    ]);
  });

  it("drops the crumbs a keep leaves", () => {
    const edits = { manual: [], keeps: [{ id: "keep-1", start: 2.005, end: 4 }], next: 2 };

    expect(ranges(combineRegions(detected, edits))).toEqual([[0, 1], [6, 8]]);
  });
});

describe("acceptRegion", () => {
  it("makes a resized detected region manual and keeps what it gave back", () => {
    const { edits, id } = acceptRegion(NO_EDITS, {
      id: "auto-1",
      origin: "auto",
      start: 2.5,
      end: 4,
      original: { start: 2, end: 4 },
    });

    expect(edits.manual).toEqual([{ id: "manual-1", start: 2.5, end: 4 }]);
    expect(ranges(edits.keeps)).toEqual([[2, 2.5]]);
    expect(id).toBe("manual-1");

    // the gate can no longer mute what was given back
    expect(ranges(combineRegions([{ start: 2, end: 4 }], edits))).toEqual([[2.5, 4]]);
  });

  it("replaces the manual region being edited", () => {
    const first = acceptRegion(NO_EDITS, { id: undefined, origin: "new", start: 1, end: 2 });
    const { edits } = acceptRegion(first.edits, {
      id: first.id,
      origin: "manual",
      start: 1,
      end: 3,
      original: { start: 1, end: 2 },
    });

    expect(ranges(edits.manual)).toEqual([[1, 3]]);
    expect(edits.keeps).toEqual([]);
  });

  it("takes the muted range out of the keeps", () => {
    const deleted = deleteRegion(NO_EDITS, { start: 1, end: 5 });
    const { edits } = acceptRegion(deleted, { origin: "new", start: 2, end: 3 });

    expect(ranges(edits.keeps)).toEqual([[1, 2], [3, 5]]);
    expect(new Set(edits.keeps.map((k) => k.id)).size).toBe(2);
  });

  it("merges a region drawn over another manual one", () => {
    const first = acceptRegion(NO_EDITS, { origin: "new", start: 1, end: 3 });
    const { edits, id } = acceptRegion(first.edits, { origin: "new", start: 2, end: 4 });

    expect(edits.manual).toEqual([{ id: first.id, start: 1, end: 4 }]);
    expect(id).toBe(first.id);
  });
});

describe("deleteRegion", () => {
  it("turns a detected region into a keep zone", () => {
    const edits = deleteRegion(NO_EDITS, { id: "auto-0", start: 2, end: 4 });

    expect(edits.manual).toEqual([]);
    expect(ranges(edits.keeps)).toEqual([[2, 4]]);
    expect(combineRegions([{ start: 2, end: 4 }], edits)).toEqual([]);
  });

  it("removes a manual region", () => {
    const { edits, id } = acceptRegion(NO_EDITS, { origin: "new", start: 1, end: 2 });
    const after = deleteRegion(edits, { id, start: 1, end: 2 });

    expect(after.manual).toEqual([]);
  });

  it("gives a removed keep zone back to the gate", () => {
    const edits = deleteRegion(NO_EDITS, { start: 2, end: 4 });
    const back = removeKeep(edits, edits.keeps[0].id);

    expect(ranges(combineRegions([{ start: 2, end: 4 }], back))).toEqual([[2, 4]]);
    expect(hasEdits(back)).toBe(false);
  });
});

describe("splitRegion", () => {
  it("splits a region into two manual halves", () => {
    const edits = splitRegion(NO_EDITS, { id: "auto-0", start: 2, end: 4 }, 3);

    expect(ranges(edits.manual)).toEqual([[2, 3], [3, 4]]);
    expect(new Set(edits.manual.map((m) => m.id)).size).toBe(2);
    expect(ranges(mergeForRender(combineRegions([{ start: 2, end: 4 }], edits)))).toEqual([[2, 4]]);
  });

  it("does not split too close to an edge", () => {
    expect(splitRegion(NO_EDITS, { start: 2, end: 4 }, 2.01)).toBe(NO_EDITS);
  });
});

describe("stepping through regions", () => {
  const list = [{ start: 1, end: 2 }, { start: 3, end: 4 }];

  it("finds the next and the previous region", () => {
    expect(nextRegion(list, 0)).toBe(list[0]);
    expect(nextRegion(list, 1)).toBe(list[1]);
    expect(nextRegion(list, 3)).toBeUndefined();
    expect(previousRegion(list, 3)).toBe(list[0]);
    expect(previousRegion(list, 1)).toBeUndefined();
  });
});
