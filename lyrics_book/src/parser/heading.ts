/**
 * Reading a `## ` song heading.
 *
 * Fifteen years of typing produced a heading grammar with no single shape. The
 * credit alone is written five ways:
 *
 *     ## Paper Boats (2012-04-15) by Alex Rowe, Jean Lazarou
 *     ## The Dead Living (2018/01/07) / Mark Van Der Linden, Jean Lazarou
 *     ## All Eyes on You* (2024-05-28) Taylor Brae, Jean Lazarou
 *     ## Wanderer by (2023-09-18) Ana Ros, Jean Lazarou
 *     ## Final Words by Martina Venkova, Jean Lazarou
 *
 * and the title may itself contain the word `by` (`Betrayed by Eyes`), carry a
 * variant marker (`Walking by Myself*`, `Glass Roof\*`), or trail a qualifier
 * (`Hardest Part (first version)`).
 *
 * Searching for a keyword cannot separate these. The date can: it is the one
 * part of a heading that identifies itself, so it is found first and its
 * *position* decides the rest — whatever follows the date is the credit, and
 * whatever precedes it is the title. Only a heading with no date at all falls
 * back to looking for a separator word.
 */

import { parseDateGroup, type SongDate } from './dates'
import { unescapeMarkers } from './text'

export interface ParsedHeading {
  name: string
  title: string
  qualifier: string | null
  variant: boolean
  dates: SongDate[]
  authors: string[]
  raw: string
}

const PARENTHETICAL = /\(([^()]*)\)/g
const TRAILING_PARENTHETICAL = /\s*\(([^()]*)\)\s*$/
/** A credit introduced by `by` or by a slash, with or without the keyword. */
const LEADING_SEPARATOR = /^\s*(?:by\b|\/)\s*/i
const TRAILING_BY = /\s+by\s*$/i

/**
 * Authors are separated by commas, and sometimes by a slash when two people
 * share one credit: `BillyBosco / Andrew L, Jean Lazarou`.
 */
function splitAuthors(text: string): string[] {
  return text
    .split(/[,/]/)
    .map((author) => author.trim())
    .filter(Boolean)
}

/** Pull a trailing `(…)` off a fragment, returning it separately. */
function takeQualifier(text: string): { text: string; qualifier: string | null } {
  const match = TRAILING_PARENTHETICAL.exec(text)
  if (!match) return { text, qualifier: null }
  return { text: text.slice(0, match.index), qualifier: match[1].trim() }
}

export function parseHeading(raw: string): ParsedHeading {
  const text = unescapeMarkers(raw.replace(/^#+\s*/, '').trim())

  // The date group. Several parentheticals may be present and only one of them
  // is a date, so each is tried from the right; the last date wins, which is
  // what `Hardest Part (first version) (2023-08-13)` needs.
  let dates: SongDate[] = []
  let before = text
  let after = ''
  for (const group of [...text.matchAll(PARENTHETICAL)].reverse()) {
    const parsed = parseDateGroup(group[1])
    if (!parsed) continue
    const start = group.index ?? 0
    dates = parsed
    before = text.slice(0, start)
    after = text.slice(start + group[0].length)
    break
  }

  let titlePart: string
  let authorPart: string

  if (dates.length && after.trim()) {
    // Anything after the date is the credit, however it is introduced.
    titlePart = before.replace(TRAILING_BY, '')
    authorPart = after.replace(LEADING_SEPARATOR, '')
  } else if (dates.length) {
    // `Title (date)` — nothing follows, so any credit must precede the date.
    const byIndex = before.toLowerCase().lastIndexOf(' by ')
    titlePart = byIndex >= 0 ? before.slice(0, byIndex) : before
    authorPart = byIndex >= 0 ? before.slice(byIndex + 4) : ''
  } else {
    // No date to anchor on. The last `by` is the credit, so that a title
    // holding the word (`Betrayed by Eyes`) survives.
    const byIndex = text.toLowerCase().lastIndexOf(' by ')
    titlePart = byIndex >= 0 ? text.slice(0, byIndex) : text
    authorPart = byIndex >= 0 ? text.slice(byIndex + 4) : ''
  }

  // A qualifier may trail either the title or, as in
  // `Insane* by (…) Taylor Brae, Jean Lazarou (Dubrae)`, the author list.
  const authorSide = takeQualifier(authorPart.trim())
  const titleSide = takeQualifier(titlePart.trim())
  const qualifier = titleSide.qualifier ?? authorSide.qualifier

  const title = titleSide.text.replace(/\s+/g, ' ').trim()
  const variant = /[*+]$/.test(title)
  const name = variant ? title.slice(0, -1).trim() : title

  return {
    name,
    title,
    qualifier,
    variant,
    dates,
    authors: splitAuthors(authorSide.text),
    raw: raw.trim(),
  }
}
