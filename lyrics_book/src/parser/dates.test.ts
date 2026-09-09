import { describe, expect, it } from 'vitest'
import { parseDateGroup, parseDateToken } from './dates'

describe('parseDateToken', () => {
  it('reads a full date either way round', () => {
    expect(parseDateToken('2012-04-15')!.iso).toBe('2012-04-15')
    expect(parseDateToken('2017/09/10')!.iso).toBe('2017-09-10')
  })

  it('reads a month written by name', () => {
    const date = parseDateToken('June 2010')
    expect(date).toMatchObject({ year: 2010, month: 6, precision: 'month' })
  })

  it('drops precision when parts are starred out', () => {
    expect(parseDateToken('2014-**-**')).toMatchObject({ year: 2014, precision: 'year' })
    expect(parseDateToken('2014-06-**')).toMatchObject({ month: 6, precision: 'month' })
  })

  it('is not fooled by a title qualifier', () => {
    expect(parseDateToken('first version')).toBeNull()
    expect(parseDateToken('Dubrae')).toBeNull()
    expect(parseDateToken('Great Projects')).toBeNull()
  })
})

describe('parseDateGroup', () => {
  it('keeps a slash-separated single date whole', () => {
    expect(parseDateGroup('2017/09/10')).toHaveLength(1)
  })

  it('splits a genuine pair of dates', () => {
    const dates = parseDateGroup('2019-04-25/2022-07-06')!
    expect(dates.map((date) => date.iso)).toEqual(['2019-04-25', '2022-07-06'])
  })

  it('refuses anything that is not a date', () => {
    expect(parseDateGroup('first version')).toBeNull()
  })
})
