/**
 * The contents page.
 *
 * The book reads in the order the file is written, which is very nearly the
 * order the songs were made — four fifths of the albums fall in chronological
 * order already, and the ones that do not are the side albums gathered at the
 * end. That order is worth keeping: it is the only thing in the book that says
 * when any of this happened.
 *
 * So finding an album is answered here instead, by a list that can be read
 * whichever way suits the moment, without the pages moving underneath it.
 */

import type { Album } from './parser/types'

export type ContentsOrder = 'as-written' | 'title' | 'date'

export interface AlbumSummary {
  /** Position in the document, which is also the reading order. */
  index: number
  title: string
  songs: number
  /** Year range across the album's songs; null when none of them is dated. */
  from: number | null
  to: number | null
}

export function summarizeAlbums(albums: Album[]): AlbumSummary[] {
  return albums.map((album, index) => {
    const years = album.songs.flatMap((song) => song.dates.map((date) => date.year))
    return {
      index,
      title: album.title,
      songs: album.songs.length,
      from: years.length ? Math.min(...years) : null,
      to: years.length ? Math.max(...years) : null,
    }
  })
}

export function sortAlbums(summaries: AlbumSummary[], order: ContentsOrder): AlbumSummary[] {
  const sorted = [...summaries]

  if (order === 'title') {
    return sorted.sort((left, right) => left.title.localeCompare(right.title))
  }

  if (order === 'date') {
    return sorted.sort((left, right) => {
      // An undated album has no place on a timeline, so it goes last rather
      // than pretending to be from year zero.
      if (left.from === null && right.from === null) return left.index - right.index
      if (left.from === null) return 1
      if (right.from === null) return -1
      return left.from - right.from || left.index - right.index
    })
  }

  return sorted
}

/** `2020` or `2020–2022`, and nothing at all when the album has no dates. */
export function yearRange(album: AlbumSummary): string {
  if (album.from === null) return ''
  return album.from === album.to ? `${album.from}` : `${album.from}–${album.to}`
}
