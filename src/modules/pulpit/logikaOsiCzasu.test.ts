import { describe, expect, it } from 'vitest'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import type { WyjatekGrafiku } from '../../domain/typy'
import { pozycjaGodzinyNaOsi, utworzHarmonogramDnia } from './logikaOsiCzasu'

describe('oś czasu Pulpitu', () => {
  it('mapuje pełną dobę z kompresją czasu poza aktywnym dniem', () => {
    const zakres = { od: '07:05', do: '16:40' }

    expect(pozycjaGodzinyNaOsi('00:00', zakres)).toBe(0)
    expect(pozycjaGodzinyNaOsi('07:05', zakres)).toBeCloseTo(21.1, 1)
    expect(pozycjaGodzinyNaOsi('07:45', zakres)).toBeCloseTo(25.07, 1)
    expect(pozycjaGodzinyNaOsi('16:00', zakres)).toBeCloseTo(74.23, 1)
    expect(pozycjaGodzinyNaOsi('16:40', zakres)).toBeCloseTo(78.2, 1)
    expect(pozycjaGodzinyNaOsi('23:59', zakres)).toBe(100)
  })

  it('wylicza pracę i dojazdy z ustawień', () => {
    const harmonogram = utworzHarmonogramDnia('2026-08-26', DOMYSLNE_USTAWIENIA.harmonogram)

    expect(harmonogram.przedzialy).toEqual([
      { id: 'dojazd-do-pracy', etykieta: 'Dojazd do pracy', od: '07:05', do: '07:45', dostepnosc: 'czesciowa' },
      { id: 'praca', etykieta: 'Praca', od: '07:45', do: '16:00' },
      { id: 'powrot', etykieta: 'Powrót', od: '16:00', do: '16:40', dostepnosc: 'czesciowa' },
    ])
  })

  it('nie tworzy domyślnego bloku pracy w weekend', () => {
    const harmonogram = utworzHarmonogramDnia('2026-08-29', DOMYSLNE_USTAWIENIA.harmonogram)

    expect(harmonogram.pracuje).toBe(false)
    expect(harmonogram.przedzialy).toEqual([])
    expect(harmonogram.zakresAktywny).toEqual({ od: '07:00', do: '22:00' })
  })

  it('stosuje wyjątek tylko do wskazanego dnia bez zmiany reguły globalnej', () => {
    const ustawienia = structuredClone(DOMYSLNE_USTAWIENIA.harmonogram)
    const ustawieniaPrzed = structuredClone(ustawienia)
    const wyjatek: WyjatekGrafiku = {
      id: 'wyjatek-1',
      data: '2026-08-26',
      pracuje: true,
      od: '07:45',
      do: '18:30',
      dojazdDoPracyMinuty: 0,
      powrotZPracyMinuty: 0,
      dostepnoscDojazdu: 'pelna',
      createdAt: '2026-08-26T10:00:00.000Z',
      updatedAt: '2026-08-26T10:00:00.000Z',
    }

    const dzienZWyjatkiem = utworzHarmonogramDnia('2026-08-26', ustawienia, wyjatek)
    const kolejnyDzien = utworzHarmonogramDnia('2026-08-27', ustawienia)

    expect(dzienZWyjatkiem.przedzialy).toEqual([{ id: 'praca', etykieta: 'Praca', od: '07:45', do: '18:30' }])
    expect(kolejnyDzien.doPracy).toBe('16:00')
    expect(ustawienia).toEqual(ustawieniaPrzed)
  })
})
