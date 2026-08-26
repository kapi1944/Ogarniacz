import { describe, expect, it } from 'vitest'
import {
  KOLEJNOSC_MODULOW_DRUGIEGO_RZUTU,
  dniOpoznienia,
  ocenBudzet,
  sekcjaDlaElementuPulpitu,
  sortujElementyPulpitu,
} from './ustaleniaGlosowe'

describe('ustalenia rozmowy głosowej — Pulpit', () => {
  const teraz = new Date('2026-08-27T12:00:00')

  it('umieszcza element z godziną na osi, a dzisiejszy bez godziny w osobnej sekcji', () => {
    expect(sekcjaDlaElementuPulpitu({ id: '1', date: '2026-08-27', time: '15:00', deadlineMode: 'AT_TIME' }, '2026-08-27')).toBe('TIMELINE')
    expect(sekcjaDlaElementuPulpitu({ id: '2', date: '2026-08-27', deadlineMode: 'END_OF_DAY' }, '2026-08-27')).toBe('TODAY_NO_TIME')
    expect(sekcjaDlaElementuPulpitu({ id: '3' }, '2026-08-27')).toBe('BELOW')
  })

  it('sortuje ASAP i zaległe wyżej niż luźne elementy', () => {
    const wynik = sortujElementyPulpitu([
      { id: 'low', title: 'Luźne', priority: 'LOW' },
      { id: 'urgent', title: 'Pilne', priority: 'URGENT', date: '2026-08-27', time: '14:00' },
      { id: 'asap', title: 'ASAP', priority: 'ASAP' },
      { id: 'late', title: 'Zaległe', priority: 'NORMAL', date: '2026-08-25', time: '10:00' },
    ], teraz)

    expect(wynik[0].id).toBe('asap')
    expect(wynik.at(-1)?.id).toBe('low')
    expect(wynik.findIndex(x => x.id === 'late')).toBeLessThan(wynik.findIndex(x => x.id === 'low'))
  })

  it('liczy opóźnienie i progi budżetu 90/95%', () => {
    expect(dniOpoznienia({ id: '1', date: '2026-08-25', time: '10:00' }, teraz)).toBeGreaterThanOrEqual(2)
    expect(ocenBudzet(900, 1000).poziom).toBe('WARNING_90')
    expect(ocenBudzet(950, 1000).poziom).toBe('CRITICAL_95')
    expect(ocenBudzet(1001, 1000).poziom).toBe('OVER_LIMIT')
  })

  it('utrwala uzgodnioną kolejność modułów drugiego rzutu', () => {
    expect(KOLEJNOSC_MODULOW_DRUGIEGO_RZUTU).toEqual([
      'poczekalnia', 'notatki-dzienne', 'samochod', 'zakupy', 'integracje',
    ])
  })
})
