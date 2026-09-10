/**
 * Reuse links, both ways.
 *
 * Invented titles and words throughout — `lyrics.md` is personal data and is
 * not committed — but the shapes are the file's, including the mismatch that
 * broke the reverse link: a heading escapes its variant marker (`Glass Roof\*`)
 * while the provenance line quoting it does not (`"Glass Roof*"`).
 */

import { describe, expect, it } from 'vitest'
import { parseLyricsDocument } from './parser/parse'
import { resolveReuse } from './reuse'

const SEP = '============================================='

function build(lines: string[]) {
  const document = parseLyricsDocument(lines.join('\n'))
  const reuse = resolveReuse(document)
  const indexOf = (name: string) => document.songs.findIndex((song) => song.name === name)
  return { document, reuse, indexOf }
}

describe('resolveReuse', () => {
  const { reuse, indexOf } = build([
    SEP,
    '',
    '# Early Days',
    '',
    '## Glass Roof\\* (2018-11-07) / Peter Rand, Jean Lazarou',
    '',
    'Under a glass roof',
    '',
    '## Plain Title (2019-01-01) by Someone, Jean Lazarou',
    '',
    'Nothing borrowed here',
    '',
    SEP,
    '',
    '# Nothing New',
    '',
    '## In Another Sky* (2026-09-10) by Billy LeCoq-Mauvais, Jean Lazarou',
    '',
    'Lyrics of "Glass Roof*" (2018-11-07) from "Early Days"',
    '',
    'Under a glass roof',
    '',
    '## Ghost Borrower (2026-09-11) by Someone, Jean Lazarou',
    '',
    'Lyrics from "A Song That Is Not Here" (2001-01-01)',
    '',
    'Borrowed from nowhere',
    '',
  ])

  it('matches a quoted title that keeps its variant marker', () => {
    const link = reuse.borrowed.get(indexOf('In Another Sky'))
    expect(link?.to?.name).toBe('Glass Roof')
    expect(link?.ambiguous).toBe(false)
  })

  it('shows the borrowed-from song who took its words', () => {
    // The half that was broken: the forward badge looked right regardless.
    const lent = reuse.lentTo.get(indexOf('Glass Roof'))
    expect(lent).toHaveLength(1)
    expect(lent?.[0].from.name).toBe('In Another Sky')
  })

  it('leaves songs alone that borrowed nothing', () => {
    expect(reuse.borrowed.has(indexOf('Plain Title'))).toBe(false)
    expect(reuse.lentTo.has(indexOf('Plain Title'))).toBe(false)
  })

  it('reports a provenance line pointing at nothing', () => {
    const link = reuse.borrowed.get(indexOf('Ghost Borrower'))
    expect(link?.to).toBeNull()
    expect(reuse.unresolved.map((entry) => entry.wanted)).toContain('A Song That Is Not Here')
  })

  it('uses the album to separate two songs sharing a title', () => {
    const { reuse: sharedReuse, indexOf: sharedIndex } = build([
      '# First',
      '',
      '## Twice Used (2010-01-01) by A, Jean Lazarou',
      '',
      'The first one',
      '',
      SEP,
      '',
      '# Second',
      '',
      '## Twice Used (2011-01-01) by B, Jean Lazarou',
      '',
      'The second one',
      '',
      SEP,
      '',
      '# Nothing New',
      '',
      '## Taker (2026-01-01) by C, Jean Lazarou',
      '',
      'Lyrics from "Twice Used" (2011-01-01) in "Second"',
      '',
      'Borrowed words',
      '',
    ])

    const link = sharedReuse.borrowed.get(sharedIndex('Taker'))
    expect(link?.to?.albumTitle).toBe('Second')
  })

  it('calls a bare duplicate title ambiguous rather than guessing', () => {
    const { reuse: sharedReuse, indexOf: sharedIndex } = build([
      '# First',
      '',
      '## Twice Used (2010-01-01) by A, Jean Lazarou',
      '',
      'The first one',
      '',
      SEP,
      '',
      '# Second',
      '',
      '## Twice Used (2011-01-01) by B, Jean Lazarou',
      '',
      'The second one',
      '',
      SEP,
      '',
      '# Nothing New',
      '',
      '## Taker (2026-01-01) by C, Jean Lazarou',
      '',
      'Lyrics from "Twice Used"',
      '',
      'Borrowed words',
      '',
    ])

    const link = sharedReuse.borrowed.get(sharedIndex('Taker'))
    expect(link?.ambiguous).toBe(true)
    expect(link?.to).toBeNull()
  })
})
