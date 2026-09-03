import { describe, expect, it } from 'vitest'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import { alertyZadan } from './logikaKafelkow'
import { sortujElementyDzisiaj, wybierzElementTeraz } from './logikaDniaPulpitu'

const dzisiaj = '2026-09-03'

function element(id: string, zmiany: Partial<ElementOgarniacza<'zadanie'>> = {}): ElementOgarniacza<'zadanie'> {
  return {
    id,
    typ: 'zadanie',
    tytul: id,
    data: dzisiaj,
    status: 'otwarty',
    referencjaZrodla: { modul: 'zadania', encjaId: id },
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...zmiany,
  }
}

describe('logika dnia Pulpitu', () => {
  it('dla zwykłego dnia wybiera najbliższy element i porządkuje priorytety', () => {
    const elementy = [element('później', { godzina: '15:00' }), element('najbliżej', { godzina: '11:30' }), element('pilne', { priorytet: 'asap' })]
    expect(wybierzElementTeraz(elementy, dzisiaj, new Date('2026-09-03T11:00:00'))).toMatchObject({ element: { id: 'najbliżej' }, stan: 'najblizszy' })
    expect(sortujElementyDzisiaj(elementy, dzisiaj).map((pozycja) => pozycja.id)).toEqual(['pilne', 'najbliżej', 'później'])
  })

  it('rozpoznaje trwający element ponad późniejszymi', () => {
    const wynik = wybierzElementTeraz([
      element('trwa', { godzina: '10:00', czasTrwaniaMinuty: 90 }),
      element('później', { godzina: '12:00' }),
    ], dzisiaj, new Date('2026-09-03T11:00:00'))
    expect(wynik).toMatchObject({ element: { id: 'trwa' }, stan: 'trwa' })
  })

  it('wybiera ważny element bez godziny, gdy dzień nie ma kolejnego terminu', () => {
    expect(wybierzElementTeraz([element('najważniejsze', { priorytet: 'asap' })], dzisiaj, new Date('2026-09-03T18:00:00')))
      .toMatchObject({ element: { id: 'najważniejsze' }, stan: 'najblizszy' })
  })

  it('kieruje zaległy element do istniejącej sekcji wymagającej uwagi', () => {
    expect(alertyZadan([element('zaległe', { data: '2026-09-02' })], new Date('2026-09-03T12:00:00')))
      .toMatchObject([{ tytul: 'zaległe', typ: 'overdue', severity: 'critical' }])
  })

  it('pomija elementy wykonane i zapewnia spokojny pusty dzień', () => {
    expect(wybierzElementTeraz([element('gotowe', { godzina: '12:00', status: 'wykonany' })], dzisiaj, new Date('2026-09-03T11:00:00'))).toBeNull()
    expect(sortujElementyDzisiaj([], dzisiaj)).toEqual([])
  })

  it('nie uzależnia dzisiejszych elementów od daty wybranej na osi', () => {
    expect(sortujElementyDzisiaj([element('globalny')], dzisiaj).map((pozycja) => pozycja.id)).toEqual(['globalny'])
  })
})
