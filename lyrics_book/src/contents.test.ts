import { describe, expect, it } from 'vitest'
import { sortAlbums, summarizeAlbums, yearRange, type AlbumSummary } from './contents'
import type { Album, Song } from './parser/types'

function song(years: number[]): Song {
  return {
    name: 'x',
    title: 'x',
    qualifier: null,
    variant: false,
    dates: years.map((year) => ({
      raw: `${year}`,
      year,
      month: null,
      day: null,
      precision: 'year' as const,
      iso: null,
    })),
    authors: [],
    url: null,
    kompozId: null,
    originalTitle: null,
    provenance: null,
    reference: null,
    stanzas: [],
    albumTitle: null,
    line: 1,
    raw: 'x',
  }
}

const album = (title: string, years: number[][]): Album => ({
  title,
  songs: years.map(song),
  listing: [],
  line: 1,
})

describe('summarizeAlbums', () => {
  it('takes the year range across an album', () => {
    const [summary] = summarizeAlbums([album('Spread', [[2018], [2022], [2020]])])
    expect(summary).toMatchObject({ title: 'Spread', songs: 3, from: 2018, to: 2022 })
  })

  it('leaves an undated album without a range', () => {
    const [summary] = summarizeAlbums([album('Undated', [[]])])
    expect(summary).toMatchObject({ from: null, to: null })
  })

  it('keeps the reading order as the index', () => {
    const summaries = summarizeAlbums([album('B', [[2020]]), album('A', [[2010]])])
    expect(summaries.map((entry) => [entry.title, entry.index])).toEqual([
      ['B', 0],
      ['A', 1],
    ])
  })
})

describe('sortAlbums', () => {
  const summaries = summarizeAlbums([
    album('Later', [[2026]]),
    album('Earlier', [[2012]]),
    album('Nowhere', [[]]),
    album('Middle', [[2020]]),
  ])

  it('leaves the written order alone', () => {
    expect(sortAlbums(summaries, 'as-written').map((entry) => entry.title)).toEqual([
      'Later',
      'Earlier',
      'Nowhere',
      'Middle',
    ])
  })

  it('sorts by title', () => {
    expect(sortAlbums(summaries, 'title').map((entry) => entry.title)).toEqual([
      'Earlier',
      'Later',
      'Middle',
      'Nowhere',
    ])
  })

  it('sorts by date and puts undated albums last', () => {
    expect(sortAlbums(summaries, 'date').map((entry) => entry.title)).toEqual([
      'Earlier',
      'Middle',
      'Later',
      'Nowhere',
    ])
  })

  it('never changes the reading-order index, whatever the sort', () => {
    // The book reads by index; re-sorting the list must not move a page.
    const byTitle = sortAlbums(summaries, 'title')
    expect(byTitle.find((entry) => entry.title === 'Later')?.index).toBe(0)
    expect(summaries.map((entry) => entry.title)).toEqual([
      'Later',
      'Earlier',
      'Nowhere',
      'Middle',
    ])
  })
})

describe('yearRange', () => {
  const of = (from: number | null, to: number | null) =>
    yearRange({ index: 0, title: 'x', songs: 1, from, to } as AlbumSummary)

  it('collapses a single year', () => {
    expect(of(2020, 2020)).toBe('2020')
  })

  it('shows a span', () => {
    expect(of(2018, 2022)).toBe('2018–2022')
  })

  it('says nothing when there are no dates', () => {
    expect(of(null, null)).toBe('')
  })
})
