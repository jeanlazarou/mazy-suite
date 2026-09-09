/**
 * Heading shapes taken from the real `lyrics.md`, with invented titles and
 * names: the lyrics file is personal data and is never committed, so these
 * fixtures copy its *grammar* only.
 */

import { describe, expect, it } from 'vitest'
import { parseHeading } from './heading'

describe('parseHeading', () => {
  it('reads the ordinary shape', () => {
    const heading = parseHeading('Paper Boats (2012-04-15) by Alex Rowe, Jean Lazarou')
    expect(heading.name).toBe('Paper Boats')
    expect(heading.dates[0].iso).toBe('2012-04-15')
    expect(heading.authors).toEqual(['Alex Rowe', 'Jean Lazarou'])
  })

  it('accepts slashes as date separators', () => {
    const heading = parseHeading('Low Tide (2017/09/10)')
    expect(heading.name).toBe('Low Tide')
    expect(heading.dates[0].iso).toBe('2017-09-10')
    expect(heading.authors).toEqual([])
  })

  it('handles "by" written before the date', () => {
    const heading = parseHeading('Wanderer by (2023-09-18) Ana Ros, Jean Lazarou')
    expect(heading.name).toBe('Wanderer')
    expect(heading.dates[0].iso).toBe('2023-09-18')
    expect(heading.authors).toEqual(['Ana Ros', 'Jean Lazarou'])
  })

  it('keeps a "by" that belongs to the title', () => {
    const heading = parseHeading('Betrayed by Eyes (2022-04-14) by Taylor Brae, Jean Lazarou')
    expect(heading.name).toBe('Betrayed by Eyes')
    expect(heading.authors).toEqual(['Taylor Brae', 'Jean Lazarou'])
  })

  it('unescapes the variant marker and strips it from the name', () => {
    const heading = parseHeading('Glass Roof\\* (2023-07-11) by Chris Bouchard, Jean Lazarou')
    expect(heading.title).toBe('Glass Roof*')
    expect(heading.name).toBe('Glass Roof')
    expect(heading.variant).toBe(true)
  })

  it('handles an unescaped marker too', () => {
    const heading = parseHeading('Walking by Myself* (2026-04-19) by Yvan Nunez, Jean Lazarou')
    expect(heading.name).toBe('Walking by Myself')
    expect(heading.variant).toBe(true)
  })

  it('tells a title qualifier apart from a date', () => {
    const heading = parseHeading(
      'Hardest Part (first version) (2023-08-13) by Mike Sanders, Jean Lazarou',
    )
    expect(heading.name).toBe('Hardest Part')
    expect(heading.qualifier).toBe('first version')
    expect(heading.dates[0].iso).toBe('2023-08-13')
  })

  it('takes a qualifier trailing the author list', () => {
    const heading = parseHeading('Insane* by (2024-06-15) Taylor Brae, Jean Lazarou (Dubrae)')
    expect(heading.name).toBe('Insane')
    expect(heading.qualifier).toBe('Dubrae')
    expect(heading.authors).toEqual(['Taylor Brae', 'Jean Lazarou'])
  })

  it('accepts a slash where "by" was meant', () => {
    const heading = parseHeading('The Dead Living (2018/01/07) / Mark Van Der Linden, Jean Lazarou')
    expect(heading.name).toBe('The Dead Living')
    expect(heading.dates[0].iso).toBe('2018-01-07')
    expect(heading.authors).toEqual(['Mark Van Der Linden', 'Jean Lazarou'])
  })

  it('accepts a credit with no separator at all', () => {
    const heading = parseHeading('All Eyes on You* (2024-05-28) Taylor Brae, Jean Lazarou')
    expect(heading.name).toBe('All Eyes on You')
    expect(heading.variant).toBe(true)
    expect(heading.authors).toEqual(['Taylor Brae', 'Jean Lazarou'])
  })

  it('leaves authors empty when the heading truly has none', () => {
    const heading = parseHeading('City to City (2014-10-26)')
    expect(heading.name).toBe('City to City')
    expect(heading.authors).toEqual([])
  })

  it('splits authors sharing a credit with a slash', () => {
    const heading = parseHeading('Cold by Morlader/Mark Taylor')
    expect(heading.name).toBe('Cold')
    expect(heading.authors).toEqual(['Morlader', 'Mark Taylor'])
    expect(heading.dates).toEqual([])
  })

  it('keeps both dates when a song was reworked', () => {
    const heading = parseHeading('Sweetheart\\* (2019-04-25/2022-07-06) by Marcus J, Jean Lazarou')
    expect(heading.dates.map((date) => date.iso)).toEqual(['2019-04-25', '2022-07-06'])
  })

  it('reads a date whose day was never recorded', () => {
    const heading = parseHeading('Hidden Rhythms (2014-**-**) by Simon Lau, Jean Lazarou')
    expect(heading.dates[0].precision).toBe('year')
    expect(heading.dates[0].year).toBe(2014)
    expect(heading.dates[0].iso).toBeNull()
  })

  it('survives a heading with no date at all', () => {
    const heading = parseHeading('Final Words by Martina Venkova, Jean Lazarou')
    expect(heading.name).toBe('Final Words')
    expect(heading.dates).toEqual([])
    expect(heading.authors).toEqual(['Martina Venkova', 'Jean Lazarou'])
  })
})
