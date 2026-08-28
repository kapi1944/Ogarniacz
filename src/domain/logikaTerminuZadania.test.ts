import { describe, expect, it } from 'vitest'
import { godzinaZadaniaNaOsi, normalizujDeadlineMode, odczytajTerminZadania } from './logikaTerminuZadania'

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

  it('pola kanoniczne mają pierwszeństwo przed historycznymi', () => {
    expect(odczytajTerminZadania({
      termin: '2026-08-27',
      deadlineMode: 'AT_TIME',
      time: '11:45',
      trybTerminuElementu: 'bez_godziny',
    })).toEqual({ data: '2026-08-27', tryb: 'bez_godziny' })
  })

  it('tryb bez godziny nie przekazuje starej godziny na oś', () => {
    expect(godzinaZadaniaNaOsi({
      trybTerminuElementu: 'bez_godziny',
      godzinaElementu: '14:30',
    })).toBeUndefined()
  })
})
