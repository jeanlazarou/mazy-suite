// albums without a color are shown and filtered as "white" elsewhere too
export const NO_COLOR = "white";

// Groups in order of first appearance; each album keeps its index in the
// list, which is what the album summary is opened with.
export function groupByColor(list) {
  const groups = new Map();

  list.forEach((album, index) => {
    const color = album.color || NO_COLOR;

    if (!groups.has(color)) groups.set(color, []);

    groups.get(color).push({ album, index });
  });

  return [...groups].map(([color, albums]) => ({ color, albums }));
}

export function albumsLabel(count) {
  return count === 1 ? "1 album" : `${count} albums`;
}
