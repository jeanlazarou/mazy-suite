/**
 * Turning `lyrics.md` into albums, songs and a list of things to look at.
 *
 * The file is read as structure, never as Markdown. Rendering it with a
 * Markdown engine would quietly damage it: an indented lyric line becomes a
 * code block, `_words_` become emphasis whether or not that was meant, and a
 * `#` inside a lyric becomes a heading. Only `## ` and `# ` at the start of a
 * line carry structure here; everything else is text to be shown as typed.
 *
 * The scan never throws. Anything surprising is recorded as an anomaly and the
 * scan carries on, because a reader that refuses to open a 339-song file over
 * one malformed heading is useless.
 */

import { parseHeading } from './heading'
import type {
  Album,
  Anomaly,
  LyricLine,
  LyricsDocument,
  Provenance,
  Reference,
  Song,
  Stanza,
} from './types'
import { parseDateToken } from './dates'

const SEPARATOR = /^={5,}\s*$/
const SONG_HEADING = /^##\s+(.*\S)\s*$/
const ALBUM_HEADING = /^#\s+(.*\S)\s*$/

const URL_LINE = /^(https?:\/\/\S+)\s*$/
const KOMPOZ_ID = /kompoz\.com\/(?:music|studio)\/collaboration\/(\d+)/
const ORIGINAL_LINE = /^Original:?\s+(.+?)\s*$/
/** `"It's a Feeling" by Toto / 1982` — an outside song the words answer to. */
const REFERENCE_LINE = /^"([^"]+)"\s+by\s+(.+?)\s*$/
/** `Lyrics from "3 AM" (2020-06-14) in "Letter 45"` and its looser ancestors. */
const PROVENANCE_LINE = /^Lyrics\s+(?:from|of)\b\s*(.+?)\s*$/i

/** A heading that is one character repeated is a divider, not an album. */
const DIVIDER_HEADING = /^(\S)\1{4,}$/

/**
 * A numbered line under an album heading is its running order. Only collected
 * before the album's first song, so a lyric that opens with a number is safe.
 */
const LISTING_ENTRY = /^\d+\.\s+(\S.*?)\s*$/

const EMPHASIS_LINE = /^_.+_$/

/** Lowercase, unaccented, single-spaced — for comparing titles only. */
export function normalizeTitle(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Read a provenance line's payload, which has been written three ways so far.
 * Everything past the title is optional.
 */
function parseProvenance(payload: string, raw: string, line: number): Provenance {
  let rest = payload

  // Title: quoted when the writer was being careful, bare otherwise. A bare
  // title runs until the date or the album clause, whichever comes first.
  let title = ''
  const quoted = /^"([^"]+)"\s*/.exec(rest)
  if (quoted) {
    title = quoted[1]
    rest = rest.slice(quoted[0].length)
  } else {
    const bare = /^(.+?)(?=\s*\(|\s+(?:from|in)\s+|$)/.exec(rest)
    title = bare ? bare[1].trim() : rest.trim()
    rest = bare ? rest.slice(bare[0].length) : ''
  }

  const dateGroup = /\(([^()]*)\)/.exec(rest)
  const date = dateGroup ? parseDateToken(dateGroup[1]) : null
  if (dateGroup) rest = rest.replace(dateGroup[0], ' ')

  const albumClause = /\b(?:from|in)\s+"?([^"]+?)"?\s*$/i.exec(rest)
  const album = albumClause ? albumClause[1].trim() : null

  return { title: title.trim(), date, album, raw, line }
}

function parseReference(match: RegExpExecArray, raw: string, line: number): Reference {
  const credit = match[2].trim()
  // The year, when given, trails behind a slash: `Toto / 1982`.
  const withYear = /^(.*?)\s*\/\s*(\d{4})$/.exec(credit)
  return {
    title: match[1].trim(),
    artist: withYear ? withYear[1].trim() : credit,
    year: withYear ? Number(withYear[2]) : null,
    raw,
    line,
  }
}

/**
 * Split a song's lines into its metadata block and its stanzas.
 *
 * The metadata lines sit between the heading and the first lyric, in no fixed
 * order and sometimes with blank lines among them, so they are consumed for as
 * long as every non-blank line is recognisable. The first unrecognised line is
 * where the lyrics start — and from there nothing is interpreted as metadata,
 * so a lyric that happens to begin with `Original` stays a lyric.
 */
function fillSongBody(song: Song, lines: string[], firstLine: number): void {
  let index = 0

  for (; index < lines.length; index += 1) {
    const raw = lines[index]
    const text = raw.trim()
    const lineNumber = firstLine + index

    if (!text) continue

    const url = URL_LINE.exec(text)
    if (url) {
      song.url = url[1]
      song.kompozId = KOMPOZ_ID.exec(url[1])?.[1] ?? null
      continue
    }

    const provenance = PROVENANCE_LINE.exec(text)
    if (provenance) {
      song.provenance = parseProvenance(provenance[1], text, lineNumber)
      continue
    }

    const reference = REFERENCE_LINE.exec(text)
    if (reference) {
      song.reference = parseReference(reference, text, lineNumber)
      continue
    }

    const original = ORIGINAL_LINE.exec(text)
    if (original) {
      song.originalTitle = original[1].trim()
      continue
    }

    break
  }

  const stanzas: Stanza[] = []
  let current: LyricLine[] = []
  let stanzaStart = firstLine + index

  const flush = () => {
    if (current.length) stanzas.push({ lines: current, line: stanzaStart })
    current = []
  }

  for (; index < lines.length; index += 1) {
    const raw = lines[index]
    const lineNumber = firstLine + index
    const text = raw.trim()

    if (!text) {
      flush()
      stanzaStart = lineNumber + 1
      continue
    }

    if (!current.length) stanzaStart = lineNumber
    current.push({
      text,
      emphasis: EMPHASIS_LINE.test(text),
      indented: /^[ \t]{2,}/.test(raw),
      line: lineNumber,
    })
  }

  flush()
  song.stanzas = stanzas
}

export function parseLyricsDocument(source: string): LyricsDocument {
  const lines = source.split(/\r?\n/)
  const albums: Album[] = []
  const songs: Song[] = []
  const anomalies: Anomaly[] = []

  let album: Album | null = null
  let song: Song | null = null
  let body: string[] = []
  let bodyStart = 0

  // Loose text is anything outside a song: album front matter, the memorial
  // note, and the working notes block sitting inside *Nothing New*.
  let loose: { line: number; text: string }[] = []
  let separatorAt: number | null = null
  let sawSeparatorSinceAlbum = false

  const flushLoose = () => {
    const kept = loose.filter((entry) => entry.text.trim())
    if (kept.length) {
      anomalies.push({
        kind: 'loose-text',
        line: kept[0].line,
        message: `${kept.length} line${kept.length > 1 ? 's' : ''} of text outside any song`,
        context: kept[0].text.trim().slice(0, 60),
      })
    }
    loose = []
  }

  const closeSong = () => {
    if (!song) return
    fillSongBody(song, body, bodyStart)
    song = null
    body = []
  }

  lines.forEach((raw, index) => {
    const lineNumber = index + 1
    const text = raw.trim()

    if (SEPARATOR.test(text)) {
      closeSong()
      flushLoose()
      if (separatorAt !== null && separatorAt === lineNumber - 2) {
        anomalies.push({
          kind: 'repeated-separator',
          line: lineNumber,
          message: 'Two separators in a row, with no album between them',
        })
      }
      separatorAt = lineNumber
      sawSeparatorSinceAlbum = true
      return
    }

    const songHeading = SONG_HEADING.exec(raw)
    if (songHeading) {
      closeSong()
      flushLoose()

      const heading = parseHeading(songHeading[1])
      song = {
        name: heading.name,
        title: heading.title,
        qualifier: heading.qualifier,
        variant: heading.variant,
        dates: heading.dates,
        authors: heading.authors,
        url: null,
        kompozId: null,
        originalTitle: null,
        provenance: null,
        reference: null,
        stanzas: [],
        albumTitle: album?.title ?? null,
        line: lineNumber,
        raw: heading.raw,
      }

      // A song that follows a separator without an album heading in between
      // belongs to nothing in particular — it is filed under the album still
      // open, but the reader should be told.
      if (sawSeparatorSinceAlbum) {
        anomalies.push({
          kind: 'orphan-song',
          line: lineNumber,
          message: album
            ? `"${heading.name}" follows a separator with no album heading; filed under "${album.title}"`
            : `"${heading.name}" appears before any album heading`,
          context: heading.raw,
        })
        sawSeparatorSinceAlbum = false
      }

      if (!heading.dates.length) {
        anomalies.push({
          kind: 'date-missing',
          line: lineNumber,
          message: `"${heading.name}" has no date`,
          context: heading.raw,
        })
      } else if (heading.dates.some((date) => date.precision !== 'day')) {
        anomalies.push({
          kind: 'date-partial',
          line: lineNumber,
          message: `"${heading.name}" has an incomplete date (${heading.dates
            .map((date) => date.raw)
            .join(', ')})`,
          context: heading.raw,
        })
      }

      if (!heading.authors.length) {
        anomalies.push({
          kind: 'authors-missing',
          line: lineNumber,
          message: `"${heading.name}" names no authors`,
          context: heading.raw,
        })
      }

      songs.push(song)
      album?.songs.push(song)
      bodyStart = lineNumber + 1
      return
    }

    const albumHeading = ALBUM_HEADING.exec(raw)
    if (albumHeading) {
      closeSong()
      flushLoose()
      const title = albumHeading[1].trim()

      if (DIVIDER_HEADING.test(title)) {
        anomalies.push({
          kind: 'divider-heading',
          line: lineNumber,
          message: 'Heading is a divider, not an album; skipped',
          context: title.slice(0, 30),
        })
        // Deliberately not closing the album: the songs after this divider
        // carry on where they left off.
        return
      }

      album = { title, songs: [], listing: [], line: lineNumber }
      albums.push(album)
      sawSeparatorSinceAlbum = false
      return
    }

    if (song) {
      body.push(raw)
      return
    }

    // Between an album heading and its first song, a numbered line is the
    // album's running order rather than stray text.
    if (album && !album.songs.length) {
      const entry = LISTING_ENTRY.exec(text)
      if (entry) {
        album.listing.push(entry[1])
        return
      }
    }

    loose.push({ line: lineNumber, text: raw })
  })

  closeSong()
  flushLoose()

  // A written running order is a second opinion about what the album holds, so
  // it is worth checking against the songs that actually follow it.
  albums.forEach((entry) => {
    if (!entry.listing.length) return
    const present = new Set(entry.songs.map((item) => normalizeTitle(item.name)))
    const listed = new Set(entry.listing.map(normalizeTitle))

    const missing = entry.listing.filter((title) => !present.has(normalizeTitle(title)))
    const unlisted = entry.songs.filter((item) => !listed.has(normalizeTitle(item.name)))

    if (missing.length) {
      anomalies.push({
        kind: 'listing-mismatch',
        line: entry.line,
        message: `"${entry.title}" lists ${missing.length} song${
          missing.length === 1 ? '' : 's'
        } with no lyrics below: ${missing.join(', ')}`,
      })
    }
    if (unlisted.length) {
      anomalies.push({
        kind: 'listing-mismatch',
        line: entry.line,
        message: `"${entry.title}" has ${unlisted.length} song${
          unlisted.length === 1 ? '' : 's'
        } missing from its running order: ${unlisted.map((item) => item.name).join(', ')}`,
      })
    }
  })

  // A title reused across albums makes a bare `Lyrics from <title>` line
  // ambiguous, which is exactly what the quoted-album form exists to fix.
  const byName = new Map<string, Song[]>()
  songs.forEach((entry) => {
    const key = normalizeTitle(entry.name)
    if (!key) return
    const bucket = byName.get(key)
    if (bucket) bucket.push(entry)
    else byName.set(key, [entry])
  })
  byName.forEach((bucket) => {
    if (bucket.length < 2) return
    const where = bucket
      .map((entry) => `${entry.albumTitle ?? 'no album'}:${entry.line}`)
      .join(', ')
    anomalies.push({
      kind: 'duplicate-title',
      line: bucket[0].line,
      message: `"${bucket[0].name}" is used by ${bucket.length} songs (${where})`,
    })
  })

  anomalies.sort((left, right) => left.line - right.line)

  return { albums, songs, anomalies }
}
