// Where a track comes from: what it is (a rework, a remix, an AI-generated
// version of an older piece), when the material it is built on was written,
// and a free note about it.
//
// The three markers are written as ordinary bullets under a song, in any
// order, and any of them may be left out:
//
//   1. $T:Glass Door*
//
//      - $AC
//      - $KIND:AI rework
//      - $FROM:1992
//      - $NOTE:Rebuilt from my four-track demo
//
// They are collected per song and rendered as one element, in place of the
// first marker of the group.

export const ORIGIN_FIELDS = ["kind", "from", "note"];

// the leading bullet (or ordered-list) punctuation is kept, so that replacing
// the line leaves the surrounding list intact
const MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+)?\$(KIND|FROM|NOTE):\s*(.*?)\s*$/;

export function originMarker(line) {
  const match = line.match(MARKER);

  if (!match) return null;

  return {
    prefix: match[1] ?? "",
    field: match[2].toLowerCase(),
    value: match[3],
  };
}

// Inline spans rather than a <div>: the block sits inside a list item, and
// inline HTML is what the markdown renderer passes through untouched. The
// stylesheet gives the outer span a block layout.
export function renderOrigin(fields) {
  const parts = ORIGIN_FIELDS.filter((field) => fields[field]).map(
    (field) =>
      `<span class="description-origin-${field}">${fields[field]}</span>`
  );

  if (parts.length === 0) return null;

  return `<span class="description-origin">${parts.join("")}</span>`;
}
