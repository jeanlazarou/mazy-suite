/**
 * Document-level parsing, on an invented file that reproduces every structural
 * oddity found in the real `lyrics.md` — including the ones that are mistakes.
 */

import { describe, expect, it } from 'vitest'
import { parseLyricsDocument } from './parse'

const SEP = '============================================='

const DOCUMENT = [
  SEP,
  '',
  '# First Album',
  '',
  '## Paper Boats (2012-04-15) by Alex Rowe, Jean Lazarou',
  'https://www.kompoz.com/studio/collaboration/946',
  'Original Rowing Song',
  '"Some Old Hit" by The Band / 1982',
  '',
  'A first line',
  'A second line',
  '',
  '_a refrain_',
  '    an indented aside',
  '',
  SEP,
  '',
  '# Second Album',
  '',
  '## Reworked (2026-09-06) by Taylor Brae, Jean Lazarou',
  'https://www.kompoz.com/studio/collaboration/1544989',
  'Original Working Title',
  '',
  'Lyrics from "Paper Boats" (2012-04-15) in "First Album"',
  '',
  'Words carried over',
  '',
  '# MMMMMMMMMMMMMMMMMMMMMMMMMMMM',
  '',
  '## After the Divider (2020-01-02) by Someone Else, Jean Lazarou',
  '',
  'Still in the second album',
  '',
  SEP,
  '',
  '## Orphan Song (2026-01-01) by Tommy Nigbor, Jean Lazarou',
  '',
  'No album heading above me',
  '',
  SEP,
  '',
  SEP,
  '',
  '> a memorial note',
  '',
  '# Third Album',
  '',
  '1.  Undated',
  '2.  Never Written',
  '',
  '## Undated by Martina Venkova',
  '',
  'No date in the heading',
  '',
  '## 7 Days Later (2021-02-02) by Someone, Jean Lazarou',
  '',
  '3 in the morning',
  '',
].join('\n')

const parsed = parseLyricsDocument(DOCUMENT)
const find = (name: string) => parsed.songs.find((song) => song.name === name)!
const kinds = (kind: string) => parsed.anomalies.filter((entry) => entry.kind === kind)

describe('parseLyricsDocument', () => {
  it('collects albums and songs', () => {
    expect(parsed.albums.map((album) => album.title)).toEqual([
      'First Album',
      'Second Album',
      'Third Album',
    ])
    expect(parsed.songs).toHaveLength(6)
  })

  it('reads the metadata block whatever its order', () => {
    const song = find('Paper Boats')
    expect(song.kompozId).toBe('946')
    expect(song.originalTitle).toBe('Rowing Song')
    expect(song.reference).toMatchObject({
      title: 'Some Old Hit',
      artist: 'The Band',
      year: 1982,
    })
  })

  it('keeps lyric formatting that Markdown would eat', () => {
    const [, second] = find('Paper Boats').stanzas
    expect(second.lines[0]).toMatchObject({ text: '_a refrain_', emphasis: true })
    expect(second.lines[1]).toMatchObject({ text: 'an indented aside', indented: true })
  })

  it('reads a provenance line', () => {
    expect(find('Reworked').provenance).toMatchObject({
      title: 'Paper Boats',
      album: 'First Album',
    })
    expect(find('Reworked').provenance!.date!.iso).toBe('2012-04-15')
  })

  it('treats a repeated-character heading as a divider, not an album', () => {
    expect(kinds('divider-heading')).toHaveLength(1)
    // The songs after it stay with the album that was already open.
    expect(find('After the Divider').albumTitle).toBe('Second Album')
  })

  it('flags a song that follows a separator with no album heading', () => {
    const orphans = kinds('orphan-song')
    expect(orphans).toHaveLength(1)
    expect(orphans[0].message).toContain('Orphan Song')
  })

  it('flags two separators in a row and the text between them', () => {
    expect(kinds('repeated-separator')).toHaveLength(1)
    expect(kinds('loose-text')[0].context).toContain('a memorial note')
  })

  it('flags a missing date', () => {
    const missing = kinds('date-missing')
    expect(missing).toHaveLength(1)
    expect(missing[0].message).toContain('Undated')
  })

  it('reads a numbered list under an album as its running order', () => {
    const third = parsed.albums[2]
    expect(third.listing).toEqual(['Undated', 'Never Written'])
    // The listing is data, not a problem.
    expect(kinds('loose-text').some((entry) => entry.line > third.line)).toBe(false)
  })

  it('does not mistake a lyric starting with a number for a listing entry', () => {
    // "3 in the morning" sits inside a song, so it stays a lyric.
    expect(parsed.albums[2].listing).not.toContain('in the morning')
    expect(find('7 Days Later').stanzas[0].lines[0].text).toBe('3 in the morning')
  })

  it('checks the running order against the songs that follow', () => {
    const listing = kinds('listing-mismatch')
    expect(listing.some((entry) => entry.message.includes('Never Written'))).toBe(true)
    expect(listing.some((entry) => entry.message.includes('7 Days Later'))).toBe(true)
  })

  it('never throws on an empty or headingless file', () => {
    expect(() => parseLyricsDocument('')).not.toThrow()
    expect(parseLyricsDocument('just some words').songs).toEqual([])
  })
})
