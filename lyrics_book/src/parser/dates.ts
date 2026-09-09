/**
 * Reading the dates that sit in a song heading.
 *
 * `lyrics.md` was written by hand over fifteen years, so a date is whatever
 * looked reasonable that day: `2012-04-15`, `2017/09/10`, `June 2010`,
 * `2014-**-**` when only the year was remembered, and
 * `2019-04-25/2022-07-06` when a song was picked up again years later.
 *
 * Every reading is best-effort and never throws: a date that cannot be read is
 * reported, not fatal, because a song is still worth showing without one.
 */

/** How much of a date was actually written down. */
export type DatePrecision = 'day' | 'month' | 'year'

export interface SongDate {
  /** Exactly as it appeared, for round-tripping and for the problems report. */
  raw: string
  year: number
  month: number | null
  day: number | null
  precision: DatePrecision
  /** `YYYY-MM-DD` when the whole date is known, else null. */
  iso: string | null
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

/** `2012-04-15`, `2017/09/10`, and the `2014-**-**` form with unknown parts. */
const YEAR_MONTH_DAY = /^(\d{4})[-/](\d{1,2}|\*{1,2})[-/](\d{1,2}|\*{1,2})$/
const YEAR_MONTH = /^(\d{4})[-/](\d{1,2})$/
const YEAR_ONLY = /^(\d{4})$/
const MONTH_NAME_YEAR = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/

const isUnknownPart = (part: string) => part.startsWith('*')

function build(raw: string, year: number, month: number | null, day: number | null): SongDate {
  const precision: DatePrecision = day !== null ? 'day' : month !== null ? 'month' : 'year'
  const iso =
    precision === 'day'
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null
  return { raw, year, month, day, precision, iso }
}

/**
 * Read one date. Returns null for anything that is not a date at all — which
 * is how a title qualifier like `(first version)` is told apart from a date.
 */
export function parseDateToken(token: string): SongDate | null {
  const raw = token.trim()
  if (!raw) return null

  const full = YEAR_MONTH_DAY.exec(raw)
  if (full) {
    const [, year, month, day] = full
    // A starred part means "not recorded", so precision drops accordingly.
    if (isUnknownPart(month)) return build(raw, Number(year), null, null)
    if (isUnknownPart(day)) return build(raw, Number(year), Number(month), null)
    return build(raw, Number(year), Number(month), Number(day))
  }

  const yearMonth = YEAR_MONTH.exec(raw)
  if (yearMonth) return build(raw, Number(yearMonth[1]), Number(yearMonth[2]), null)

  const named = MONTH_NAME_YEAR.exec(raw)
  if (named) {
    const month = MONTH_NAMES[named[1].toLowerCase()]
    if (month) return build(raw, Number(named[2]), month, null)
    return null
  }

  const yearOnly = YEAR_ONLY.exec(raw)
  if (yearOnly) return build(raw, Number(yearOnly[1]), null, null)

  return null
}

/**
 * Read the whole of a heading's `(...)` group, which may hold two dates when a
 * song was reworked: `2019-04-25/2022-07-06`.
 *
 * A single `2017/09/10` is one date, not three, so the group is only split on
 * `/` once it has failed to read as a date on its own.
 */
export function parseDateGroup(text: string): SongDate[] | null {
  const raw = text.trim()
  if (!raw) return null

  const single = parseDateToken(raw)
  if (single) return [single]

  const parts = raw.split('/').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null

  const dates = parts.map(parseDateToken)
  if (dates.every((date): date is SongDate => date !== null)) return dates

  return null
}
