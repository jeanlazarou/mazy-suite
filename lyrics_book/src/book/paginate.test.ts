/**
 * Pagination is pure, so it is tested with invented heights rather than a
 * browser: the question is only ever "given these measurements, where do the
 * breaks fall".
 */

import { describe, expect, it } from 'vitest'
import { paginate, pageOfSong, type Heights } from './paginate'
import type { Album, Song, Stanza } from '../parser/types'

const stanza = (line: number): Stanza => ({ lines: [{ text: 'x', emphasis: false, indented: false, line }], line })

function song(name: string, stanzaCount: number): Song {
  return {
    name,
    title: name,
    qualifier: null,
    variant: false,
    dates: [],
    authors: [],
    url: null,
    kompozId: null,
    originalTitle: null,
    provenance: null,
    reference: null,
    stanzas: Array.from({ length: stanzaCount }, (_, index) => stanza(index + 1)),
    albumTitle: 'A',
    line: 1,
    raw: name,
  }
}

/** Every heading 10 tall, every stanza 10 tall, so pages hold 100. */
function heightsFor(songs: Song[], albums: number): Heights {
  return {
    album: Array.from({ length: albums }, () => 200),
    heading: songs.map(() => 10),
    stanza: songs.map((entry) => entry.stanzas.map(() => 10)),
    continuation: 5,
    stanzaGap: 0,
    songGap: 0,
  }
}

function setup(songs: Song[]): { albums: Album[]; indexOf: Map<Song, number>; heights: Heights } {
  const albums: Album[] = [{ title: 'A', songs, line: 1 }]
  const indexOf = new Map(songs.map((entry, index) => [entry, index]))
  return { albums, indexOf, heights: heightsFor(songs, 1) }
}

describe('paginate', () => {
  it('gives the album its own page', () => {
    const songs = [song('One', 2)]
    const { albums, indexOf, heights } = setup(songs)
    const pages = paginate(albums, indexOf, heights, { pageHeight: 100 })

    expect(pages[0].items).toHaveLength(1)
    expect(pages[0].items[0].kind).toBe('album')
    expect(pages[1].items[0].kind).toBe('song')
  })

  it('lets a short song share a page', () => {
    // Two songs of 30 each, on a page of 100: both fit with room to spare.
    const songs = [song('One', 2), song('Two', 2)]
    const { albums, indexOf, heights } = setup(songs)
    const pages = paginate(albums, indexOf, heights, { pageHeight: 100 })

    expect(pages[1].items).toHaveLength(2)
  })

  it('does not cram a song into the last sliver of a page', () => {
    // First song fills 80 of 100; the second would technically fit in 20 but
    // that leaves less than the share threshold, so it starts a fresh page.
    const songs = [song('Long', 7), song('Short', 1)]
    const { albums, indexOf, heights } = setup(songs)
    const pages = paginate(albums, indexOf, heights, { pageHeight: 100 })

    expect(pages[1].items).toHaveLength(1)
    expect(pages[2].items[0]).toMatchObject({ opening: true })
  })

  it('continues a long song onto the next page', () => {
    const songs = [song('Epic', 20)]
    const { albums, indexOf, heights } = setup(songs)
    const pages = paginate(albums, indexOf, heights, { pageHeight: 100 })

    const opening = pages[1].items[0]
    const carried = pages[2].items[0]
    expect(opening).toMatchObject({ kind: 'song', opening: true })
    expect(carried).toMatchObject({ kind: 'song', opening: false })
    // Nothing is lost across the break.
    const placed = pages
      .flatMap((page) => page.items)
      .filter((item) => item.kind === 'song')
      .reduce((total, item) => total + (item.kind === 'song' ? item.stanzas.length : 0), 0)
    expect(placed).toBe(20)
  })

  it('counts the gaps, so a page cannot overflow', () => {
    // Heights alone say two 3-stanza songs (40 each) fit a page of 100. With a
    // 10 gap between blocks and 20 before a second song they cannot.
    const songs = [song('One', 3), song('Two', 3)]
    const { albums, indexOf } = setup(songs)
    const heights: Heights = { ...heightsFor(songs, 1), stanzaGap: 10, songGap: 20 }
    const pages = paginate(albums, indexOf, heights, { pageHeight: 100 })

    // Each song is now 10 + 3 * (10 + 10) = 70, so they cannot share.
    expect(pages[1].items).toHaveLength(1)
    expect(pages[2].items).toHaveLength(1)

    // And no page claims more than it can hold.
    pages.forEach((page) => {
      const height = page.items.reduce((total, item) => {
        if (item.kind === 'album') return total + 200
        return (
          total +
          (total > 0 ? heights.songGap : 0) +
          10 +
          item.stanzas.length * (heights.stanzaGap + 10)
        )
      }, 0)
      if (page.items[0]?.kind !== 'album') expect(height).toBeLessThanOrEqual(100)
    })
  })

  it('points each song at the page it opens on', () => {
    const songs = [song('One', 2), song('Two', 20)]
    const { albums, indexOf, heights } = setup(songs)
    const pages = paginate(albums, indexOf, heights, { pageHeight: 100 })
    const found = pageOfSong(pages)

    expect(found.get(0)).toBe(1)
    // The second song opens after the first, never on a continuation page.
    const openingPage = found.get(1)!
    const item = pages[openingPage].items.find(
      (entry) => entry.kind === 'song' && entry.songIndex === 1,
    )
    expect(item).toMatchObject({ opening: true })
  })
})
