import { describe, expect, it } from 'vitest'
import {
  alertBudzetuNaPulpit,
  dawkaNaPulpit,
  platnoscNaPulpit,
  wizytaNaPulpit,
} from './integracjeGlosowe'

describe('adaptery ustaleń głosowych -> Pulpit', () => {
  it('nie duplikuje leku ani wizyty — zachowuje sourceRef', () => {
    expect(dawkaNaPulpit({ id: 'd1', lekId: 'l1', nazwa: 'Lek', data: '2026-08-27', godzina: '20:00' }).sourceRef)
      .toEqual({ module: 'lek', entityId: 'l1' })
    expect(wizytaNaPulpit({ id: 'w1', tytul: 'Dentysta', data: '2026-08-28', godzina: '10:00' }).sourceRef)
      .toEqual({ module: 'wizyta', entityId: 'w1' })
  })

  it('zaległa płatność ma licznik opóźnienia i stan pulsowania', () => {
    const wynik = platnoscNaPulpit({ id: 'p1', nazwa: 'Internet', termin: '2026-08-25' }, new Date('2026-08-27T12:00:00'))
    expect(wynik.overdueDays).toBeGreaterThanOrEqual(2)
    expect(wynik.pulse).toBe(true)
    expect(wynik.severity).toBe('CRITICAL')
  })

  it('budżet alarmuje dopiero od 90%', () => {
    expect(alertBudzetuNaPulpit('b1', 'Miesiąc', 899, 1000)).toBeNull()
    expect(alertBudzetuNaPulpit('b1', 'Miesiąc', 900, 1000)?.severity).toBe('WARNING')
    expect(alertBudzetuNaPulpit('b1', 'Miesiąc', 950, 1000)?.severity).toBe('CRITICAL')
  })
})
