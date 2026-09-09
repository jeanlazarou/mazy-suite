/**
 * Which words have already been used, and where they came from.
 *
 * Reworking old lyrics into new songs is the reason this tool exists, and the
 * question it has to answer while leafing is: have I already taken this one?
 * So the links are resolved in both directions — a song knows what it borrowed,
 * and it knows who has borrowed from it.
 *
 * Titles are not unique here (six are used by two songs each), which is why a
 * provenance line should name its album. When it does not, and the title is
 * ambiguous, the link is reported as uncertain rather than guessed at.
 */

import { normalizeTitle } from './parser/parse'
import type { LyricsDocument, Song } from './parser/types'

export interface ReuseLink {
  /** The new song, the one doing the borrowing. */
  fromIndex: number
  from: Song
  /** The earlier song whose words were taken, when it could be identified. */
  toIndex: number | null
  to: Song | null
  /** True when the provenance line named a title that matches several songs. */
  ambiguous: boolean
  /** Title as written on the provenance line, for when nothing was found. */
  wanted: string
}

export interface Reuse {
  /** By song index: what this song borrowed. */
  borrowed: Map<number, ReuseLink>
  /** By song index: the later songs that borrowed from it. */
  lentTo: Map<number, ReuseLink[]>
  /** Links whose source song could not be found in the document. */
  unresolved: ReuseLink[]
}

export function resolveReuse(document: LyricsDocument): Reuse {
  const byTitle = new Map<string, number[]>()
  document.songs.forEach((song, index) => {
    const key = normalizeTitle(song.name)
    if (!key) return
    const bucket = byTitle.get(key)
    if (bucket) bucket.push(index)
    else byTitle.set(key, [index])
  })

  const borrowed = new Map<number, ReuseLink>()
  const lentTo = new Map<number, ReuseLink[]>()
  const unresolved: ReuseLink[] = []

  document.songs.forEach((song, fromIndex) => {
    const { provenance } = song
    if (!provenance) return

    const candidates = byTitle.get(normalizeTitle(provenance.title)) ?? []

    // The album named on the line is what makes a duplicate title resolvable.
    const narrowed = provenance.album
      ? candidates.filter(
          (index) =>
            normalizeTitle(document.songs[index].albumTitle ?? '') ===
            normalizeTitle(provenance.album ?? ''),
        )
      : candidates

    const chosen = narrowed.length === 1 ? narrowed[0] : null
    const link: ReuseLink = {
      fromIndex,
      from: song,
      toIndex: chosen,
      to: chosen === null ? null : document.songs[chosen],
      ambiguous: narrowed.length > 1,
      wanted: provenance.title,
    }

    borrowed.set(fromIndex, link)
    if (chosen === null) {
      unresolved.push(link)
      return
    }

    const bucket = lentTo.get(chosen)
    if (bucket) bucket.push(link)
    else lentTo.set(chosen, [link])
  })

  return { borrowed, lentTo, unresolved }
}
