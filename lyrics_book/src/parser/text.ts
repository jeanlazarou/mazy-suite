/**
 * Title text, and the two things that have to be taken off it before two
 * titles can be compared.
 *
 * A song title is written differently in a heading and in a provenance line —
 * `## Hand in the Air\*` against `Lyrics of "Hand in the Air*"` — so matching
 * one against the other has to strip both the Markdown escaping and the
 * variant marker. Doing that in one place is what keeps the two ends of a
 * reuse link agreeing.
 */

/** `\*` and `\+` in the file are escaped Markdown, not emphasis. */
export function unescapeMarkers(text: string): string {
  return text.replace(/\\([*+])/g, '$1')
}

/**
 * Remove the trailing `*` or `+` that marks a song as a variant of another.
 * The marker is part of how a title is written, never part of its name.
 */
export function stripVariantMarker(title: string): string {
  const bare = unescapeMarkers(title).trim()
  return /[*+]$/.test(bare) ? bare.slice(0, -1).trim() : bare
}
