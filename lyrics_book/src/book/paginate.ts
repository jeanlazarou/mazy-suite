/**
 * Breaking the document into pages.
 *
 * A book is not a scroll: you turn to a page and the words are in the same
 * place every time. That only works if the break points are decided from real
 * measured heights, so this module takes the heights as an argument and stays
 * pure — the measuring is the caller's job, and the packing can be tested
 * without a browser.
 *
 * The rules are the ones a printed lyrics book uses:
 *
 *   - an album opens on its own title page, like a chapter;
 *   - a song starts on a fresh page;
 *   - except that a short song may share a page with the one before it, since
 *     songs here average twenty-odd lines and a page each would leave the book
 *     mostly white;
 *   - a song too long for one page continues on the next, marked as continued.
 */

import type { Album, Song, Stanza } from '../parser/types'

export interface Heights {
  /** Height of an album title page's block, by album index. */
  album: number[]
  /** Height of a song's heading block, by song index. */
  heading: number[]
  /** Height of each stanza, by song index then stanza index. */
  stanza: number[][]
  /** Height of the small "continued" line above a carried-over song. */
  continuation: number
  /** Flex gap between the blocks inside one song. */
  stanzaGap: number
  /**
   * Everything a second song on the same page costs before its first block:
   * the gap between songs plus the rule above it.
   */
  songGap: number
}

export type PageItem =
  | { kind: 'album'; album: Album; albumIndex: number }
  | {
      kind: 'song'
      song: Song
      songIndex: number
      stanzas: Stanza[]
      /** False when the song started on an earlier page. */
      opening: boolean
    }

/** The song variant of a page item, which is the one that accumulates stanzas. */
type SongPageItem = Extract<PageItem, { kind: 'song' }>

export interface Page {
  index: number
  items: PageItem[]
  /** Album this page belongs to, for the running head and the scrubber. */
  albumTitle: string | null
}

/**
 * A song may only follow another on the same page if this much of the page is
 * still free. Below that the page looks crammed rather than economical.
 */
const SHARE_THRESHOLD = 0.3

export interface PaginateOptions {
  /** Usable height of one page, in pixels. */
  pageHeight: number
}

export function paginate(
  albums: Album[],
  songIndexOf: Map<Song, number>,
  heights: Heights,
  { pageHeight }: PaginateOptions,
): Page[] {
  const pages: Page[] = []
  let items: PageItem[] = []
  let used = 0
  let albumTitle: string | null = null

  const flush = () => {
    if (!items.length) return
    pages.push({ index: pages.length, items, albumTitle })
    items = []
    used = 0
  }

  albums.forEach((album, albumIndex) => {
    flush()
    albumTitle = album.title
    items.push({ kind: 'album', album, albumIndex })
    used = heights.album[albumIndex] ?? 0
    flush()

    album.songs.forEach((song) => {
      const songIndex = songIndexOf.get(song) ?? -1
      const headingHeight = heights.heading[songIndex] ?? 0
      const stanzaHeights = heights.stanza[songIndex] ?? []
      // Every block after the first inside a song costs the gap as well.
      const songHeight =
        headingHeight +
        stanzaHeights.reduce((total, height) => total + heights.stanzaGap + height, 0)

      // Share the page only when the whole song fits — gap and rule included —
      // and enough room is left that the result reads as a page, not a scrap.
      const free = pageHeight - used
      const fitsWhole = heights.songGap + songHeight <= free
      const roomToShare = free >= pageHeight * SHARE_THRESHOLD
      if (used > 0 && !(fitsWhole && roomToShare)) flush()
      if (used > 0) used += heights.songGap

      let current: SongPageItem = {
        kind: 'song',
        song,
        songIndex,
        stanzas: [],
        opening: true,
      }
      items.push(current)
      used += headingHeight

      song.stanzas.forEach((stanza, stanzaIndex) => {
        const height = heights.stanzaGap + (stanzaHeights[stanzaIndex] ?? 0)

        // Overflow: carry the rest of the song to the next page. A stanza taller
        // than a whole page is placed anyway, since there is nowhere better.
        if (used + height > pageHeight && used > 0) {
          flush()
          current = {
            kind: 'song',
            song,
            songIndex,
            stanzas: [],
            opening: false,
          }
          items.push(current)
          used += heights.continuation
        }

        current.stanzas.push(stanza)
        used += height
      })
    })
  })

  flush()
  return pages
}

/** First page each song appears on, so search results and the index can jump. */
export function pageOfSong(pages: Page[]): Map<number, number> {
  const found = new Map<number, number>()
  pages.forEach((page) => {
    page.items.forEach((item) => {
      if (item.kind !== 'song' || !item.opening) return
      if (!found.has(item.songIndex)) found.set(item.songIndex, page.index)
    })
  })
  return found
}

/** First page each album opens on. */
export function pageOfAlbum(pages: Page[]): Map<number, number> {
  const found = new Map<number, number>()
  pages.forEach((page) => {
    page.items.forEach((item) => {
      if (item.kind === 'album' && !found.has(item.albumIndex)) {
        found.set(item.albumIndex, page.index)
      }
    })
  })
  return found
}
