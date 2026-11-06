import { describe, expect, it } from "vitest";

import { albumsLabel, groupByColor } from "./albumGroups";

const albums = [
  { id: "a", color: "#86a38e" },
  { id: "b" },
  { id: "c", color: "#86a38e" },
  { id: "d", color: "#000" },
  { id: "e" },
];

describe("groupByColor", () => {
  it("groups in order of first appearance", () => {
    expect(groupByColor(albums).map((g) => g.color)).toEqual([
      "#86a38e",
      "white",
      "#000",
    ]);
  });

  it("keeps each album's index in the list", () => {
    const [green, white] = groupByColor(albums);

    expect(green.albums.map(({ album, index }) => [album.id, index])).toEqual([
      ["a", 0],
      ["c", 2],
    ]);
    expect(white.albums.map(({ index }) => index)).toEqual([1, 4]);
  });

  it("returns no group for an empty list", () => {
    expect(groupByColor([])).toEqual([]);
  });
});

describe("albumsLabel", () => {
  it("says album or albums", () => {
    expect(albumsLabel(1)).toBe("1 album");
    expect(albumsLabel(15)).toBe("15 albums");
  });
});
