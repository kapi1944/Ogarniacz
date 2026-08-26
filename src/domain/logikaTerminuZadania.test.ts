import { describe, expect, it } from 'vitest'
import { godzinaZadaniaNaOsi, normalizujDeadlineMode } from './logikaTerminuZadania'

describe('termin zadania', () => {
  it('AT_TIME wystawia godzinę na oś', () => {
    expect(godzinaZadaniaNaOsi({
      deadlineMode: 'AT_TIME',
      date: '2026-08-27',
      time: '15:30',
    })).toBe('15:30')
  })

  it('END_OF_DAY nie tworzy markera 23:59', () => {
    expect(godzinaZadaniaNaOsi({
      deadlineMode: 'END_OF_DAY',
      date: '2026-08-27',
      time: '15:30',
    })).toBeUndefined()
  })

  it('starsza data bez godziny pozostaje END_OF_DAY', () => {
    expect(normalizujDeadlineMode(undefined, '2026-08-27', undefined)).toBe('END_OF_DAY')
  })

  it('starszy rekord z godziną jest AT_TIME', () => {
    expect(normalizujDeadlineMode(undefined, '2026-08-27', '11:45')).toBe('AT_TIME')
  })
})
