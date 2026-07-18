import { describe, expect, it } from "vitest";

import { applyFilter, factoryFilter, selectedTrackIds } from "./filter";

const tracks = [
  { id: "a", enabled: true, rating: 5, authors: ["Jean"] },
  { id: "b", enabled: false, rating: 3, authors: ["Jean", "Alex"] },
  { id: "c", enabled: true, rating: 0, authors: ["Mark"] },
];

describe("factoryFilter", () => {
  it("accepts everything by default", () => {
    expect(applyFilter(tracks, factoryFilter())).toEqual(tracks);
  });
});

describe("applyFilter", () => {
  it("filters disabled tracks", () => {
    const filter = { ...factoryFilter(), enabledTracksOnly: true };

    expect(applyFilter(tracks, filter).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("filters by minimum rating", () => {
    const filter = { ...factoryFilter(), minRating: 3 };

    expect(applyFilter(tracks, filter).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("treats a null minRating as no rating filter", () => {
    const filter = { ...factoryFilter(), minRating: null };

    expect(applyFilter(tracks, filter)).toHaveLength(3);
  });

  it("excludes listed titles", () => {
    const filter = { ...factoryFilter(), excludeTitles: ["b"] };

    expect(applyFilter(tracks, filter).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("matches any of the requested authors", () => {
    const filter = { ...factoryFilter(), authorsMatcher: ["Alex", "Mark"] };

    expect(applyFilter(tracks, filter).map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("combines criteria", () => {
    const filter = {
      ...factoryFilter(),
      enabledTracksOnly: true,
      authorsMatcher: ["Jean"],
    };

    expect(applyFilter(tracks, filter).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("selectedTrackIds", () => {
  it("returns the matching ids as a set", () => {
    const filter = { ...factoryFilter(), minRating: 4 };

    expect(selectedTrackIds(tracks, filter)).toEqual(new Set(["a"]));
  });
});
