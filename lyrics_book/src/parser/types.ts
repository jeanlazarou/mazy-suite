/**
 * What a parsed `lyrics.md` is made of.
 *
 * The document is the only source: there is no database and no JSON beside it.
 * Everything the book shows — pages, search, reuse tracking — is derived from
 * these shapes.
 */

import type { SongDate } from './dates'

/** A line of lyrics, with the little formatting the file actually uses. */
export interface LyricLine {
  text: string
  /** The `_line_` form, used in the file for refrains and backing vocals. */
  emphasis: boolean
  /** Written indented; kept because it is deliberate, not Markdown. */
  indented: boolean
  line: number
}

/** Lines between two blank lines — a verse, a chorus, a fragment. */
export interface Stanza {
  lines: LyricLine[]
  line: number
}

/**
 * Lyrics carried over from an earlier song of Jean's own — the convention that
 * started with the *Nothing New* album.
 */
export interface Provenance {
  /** Title of the song the words come from. */
  title: string
  date: SongDate | null
  /** Album the words come from, when the line names one. */
  album: string | null
  raw: string
  line: number
}

/**
 * An outside song the lyrics answer to, as used across *Anonymous Lives*:
 * `"It's a Feeling" by Toto / 1982`.
 */
export interface Reference {
  title: string
  artist: string
  year: number | null
  raw: string
  line: number
}

export interface Song {
  /** Title with any variant marker and qualifier removed — what to match on. */
  name: string
  /** Title as written, marker included: `Walking by Myself*`. */
  title: string
  /** A parenthetical that is not a date: `Hardest Part (first version)`. */
  qualifier: string | null
  /** The trailing `*`/`+` marker, meaning a variant of another song. */
  variant: boolean
  dates: SongDate[]
  authors: string[]
  /** The collaboration link, when there is one. */
  url: string | null
  kompozId: string | null
  /** Title the music's composer gave the instrumental, before the vocal work. */
  originalTitle: string | null
  provenance: Provenance | null
  reference: Reference | null
  stanzas: Stanza[]
  albumTitle: string | null
  line: number
  /** Heading text exactly as written, for the problems report. */
  raw: string
}

export interface Album {
  title: string
  songs: Song[]
  line: number
}

/**
 * Something in the file that the parser could read past but a human should
 * probably look at. This is the report that replaces the hand-written notes
 * block sitting inside the file today.
 */
export interface Anomaly {
  kind:
    | 'divider-heading'
    | 'orphan-song'
    | 'loose-text'
    | 'date-missing'
    | 'date-unreadable'
    | 'date-partial'
    | 'authors-missing'
    | 'repeated-separator'
    | 'duplicate-title'
  line: number
  message: string
  /** A short excerpt, so the report reads without opening the file. */
  context?: string
}

export interface LyricsDocument {
  albums: Album[]
  /** Every song, in file order, album grouping flattened away. */
  songs: Song[]
  anomalies: Anomaly[]
}
