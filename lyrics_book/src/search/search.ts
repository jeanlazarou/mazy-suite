/**
 * Finding a song, or finding a line.
 *
 * Two different questions get asked of this book. "Where is that song?" is
 * answered by title, album or author. "Where did I write that line?" is
 * answered by the words — and when reworking old lyrics into new songs, the
 * second question is the common one, so a phrase match ranks above a title
 * match that merely happens to share a word.
 *
 * The `field:term` vocabulary is `song_finder`'s, so that knowing one tool
 * means knowing the other.
 *
 * At 339 songs a linear scan is under a few milliseconds, so there is no index
 * to build and nothing to keep in sync.
 */

import type { LyricsDocument, Song } from '../parser/types'

/** Field names usable as `field:term`, mapped to the field they search. */
const FIELD_ALIASES: Record<string, SearchField> = {
  title: 'title',
  song: 'title',
  album: 'album',
  author: 'author',
  by: 'author',
  words: 'lyrics',
  lyrics: 'lyrics',
  orig: 'original',
  original: 'original',
  year: 'year',
  date: 'year',
}

export type SearchField = 'title' | 'album' | 'author' | 'lyrics' | 'original' | 'year'

export interface Match {
  songIndex: number
  song: Song
  field: SearchField
  /** The matching lyric line, when the match was in the words. */
  line: string | null
  lineNumber: number | null
  score: number
}

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Spaces removed, so `couldntmake` still finds "Couldn't Make". */
const squeeze = (text: string) => text.replace(/[^a-z0-9]/g, '')

interface Query {
  field: SearchField | null
  term: string
}

/** Split `by:taylor summer rain` into a field filter and the words. */
export function parseQuery(raw: string): Query {
  const match = /^([a-z]+):\s*(.*)$/i.exec(raw.trim())
  if (!match) return { field: null, term: normalize(raw) }
  const field = FIELD_ALIASES[match[1].toLowerCase()]
  if (!field) return { field: null, term: normalize(raw) }
  return { field, term: normalize(match[2]) }
}

interface Indexed {
  song: Song
  songIndex: number
  title: string
  album: string
  author: string
  original: string
  year: string
  squeezedTitle: string
}

export function buildIndex(document: LyricsDocument): Indexed[] {
  return document.songs.map((song, songIndex) => ({
    song,
    songIndex,
    title: normalize(song.name),
    album: normalize(song.albumTitle ?? ''),
    author: normalize(song.authors.join(' ')),
    original: normalize(song.originalTitle ?? ''),
    year: song.dates.map((date) => date.year).join(' '),
    squeezedTitle: squeeze(normalize(song.name)),
  }))
}

/**
 * Score a title hit: an exact title beats a title that starts with the term,
 * which beats one that merely contains it.
 */
function titleScore(title: string, term: string): number {
  if (title === term) return 100
  if (title.startsWith(term)) return 80
  if (title.includes(term)) return 60
  return 0
}

export function search(index: Indexed[], raw: string, limit = 60): Match[] {
  const { field, term } = parseQuery(raw)
  if (term.length < 2) return []

  const squeezed = squeeze(term)
  const matches: Match[] = []

  for (const entry of index) {
    const wants = (name: SearchField) => field === null || field === name

    let best: Match | null = null
    const offer = (candidate: Match) => {
      if (!best || candidate.score > best.score) best = candidate
    }

    if (wants('title')) {
      const score = titleScore(entry.title, term)
      if (score) {
        offer({ ...blank(entry), field: 'title', score })
      } else if (squeezed.length > 3 && entry.squeezedTitle.includes(squeezed)) {
        offer({ ...blank(entry), field: 'title', score: 50 })
      }
    }

    if (wants('album') && entry.album.includes(term)) {
      offer({ ...blank(entry), field: 'album', score: 40 })
    }

    if (wants('author') && entry.author.includes(term)) {
      offer({ ...blank(entry), field: 'author', score: 35 })
    }

    if (wants('original') && entry.original.includes(term)) {
      offer({ ...blank(entry), field: 'original', score: 30 })
    }

    if (wants('year') && entry.year.includes(term)) {
      offer({ ...blank(entry), field: 'year', score: 25 })
    }

    if (wants('lyrics')) {
      // The first matching line is the useful one to show; a phrase found in
      // the words outranks an incidental album or author hit.
      const hit = findLine(entry.song, term)
      if (hit) {
        offer({
          ...blank(entry),
          field: 'lyrics',
          line: hit.text,
          lineNumber: hit.line,
          score: field === 'lyrics' ? 70 : 45,
        })
      }
    }

    if (best) matches.push(best)
  }

  matches.sort((left, right) => right.score - left.score || left.songIndex - right.songIndex)
  return matches.slice(0, limit)
}

function blank(entry: Indexed): Match {
  return {
    songIndex: entry.songIndex,
    song: entry.song,
    field: 'title',
    line: null,
    lineNumber: null,
    score: 0,
  }
}

function findLine(song: Song, term: string): { text: string; line: number } | null {
  for (const stanza of song.stanzas) {
    for (const line of stanza.lines) {
      if (normalize(line.text).includes(term)) return { text: line.text, line: line.line }
    }
  }
  return null
}

/** Every lyric line matching the term, for the "find a line" list. */
export function searchLines(
  document: LyricsDocument,
  raw: string,
  limit = 200,
): { songIndex: number; song: Song; text: string; line: number }[] {
  const { term } = parseQuery(raw)
  if (term.length < 2) return []

  const found: { songIndex: number; song: Song; text: string; line: number }[] = []
  document.songs.forEach((song, songIndex) => {
    for (const stanza of song.stanzas) {
      for (const line of stanza.lines) {
        if (!normalize(line.text).includes(term)) continue
        found.push({ songIndex, song, text: line.text, line: line.line })
        if (found.length >= limit) return
      }
    }
  })
  return found
}
