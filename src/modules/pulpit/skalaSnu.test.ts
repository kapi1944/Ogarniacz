import { describe, expect, it } from 'vitest'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import {
  DOMYSLNY_ZAKRES_SNU,
  pozycjaGodzinyNaOsi,
  rozmiarZakresuNaOsi,
  utworzHarmonogramDnia,
  type ZakresSnuDnia,
} from './logikaOsiCzasu'

function rozmiar(od: string, doGodziny: string, zakres = DOMYSLNY_ZAKRES_SNU): number {
  return rozmiarZakresuNaOsi(od, doGodziny, zakres)
}

describe('oś czasu z kompresją snu', () => {
  const godzinaStandardowa = rozmiar('12:00', '13:00')

  it('mapuje pełną dobę 00:00–24:00', () => {
    expect(pozycjaGodzinyNaOsi('00:00')).toBe(0)
    expect(pozycjaGodzinyNaOsi('24:00')).toBe(100)
  })

  it('Test 1: 12:00–13:00 ma pełną standardową skalę', () => {
    expect(godzinaStandardowa).toBeCloseTo(5, 5)
  })

  it('Test 2: 23:00–00:00 jest skompresowane jak sen także przez północ', () => {
    expect(rozmiar('23:00', '00:00') / godzinaStandardowa).toBeCloseTo(0.5, 5)
  })

  it('Test 3: 05:00–06:00 jest skompresowane jak sen', () => {
    expect(rozmiar('05:00', '06:00') / godzinaStandardowa).toBeCloseTo(0.5, 5)
  })

  it('Test 4: 21:30–23:30 łączy skalę zwykłą i skalę snu', () => {
    expect(rozmiar('21:30', '23:30') / godzinaStandardowa).toBeCloseTo(1.5, 5)
  })

  it('Test 5: 06:00–07:00 łączy skalę snu i skalę zwykłą', () => {
    expect(rozmiar('06:00', '07:00') / godzinaStandardowa).toBeCloseTo(0.75, 5)
  })

  it('Test 6: pusty czas 17:00–22:00 nie jest kompresowany', () => {
    expect(rozmiar('17:00', '22:00') / godzinaStandardowa).toBeCloseTo(5, 5)
  })

  it('Test 7: weekend bez pracy nie zmienia skali godzin dziennych', () => {
    const harmonogram = utworzHarmonogramDnia('2026-08-29', DOMYSLNE_USTAWIENIA.harmonogram)

    expect(harmonogram.pracuje).toBe(false)
    expect(harmonogram.przedzialy).toEqual([])
    expect(rozmiar('12:00', '13:00')).toBeCloseTo(godzinaStandardowa, 5)
  })

  it('Test 8: ustawienie snu 23:30–07:30 przesuwa miejsca kompresji', () => {
    const zmienionyZakres: ZakresSnuDnia = { od: '23:30', do: '07:30', skala: 0.5 }

    expect(rozmiar('05:00', '06:00', zmienionyZakres) / rozmiar('12:00', '13:00', zmienionyZakres)).toBeCloseTo(0.5, 5)
    expect(rozmiar('22:30', '23:30', zmienionyZakres) / rozmiar('12:00', '13:00', zmienionyZakres)).toBeCloseTo(1, 5)
    expect(pozycjaGodzinyNaOsi('07:30', zmienionyZakres)).not.toBeCloseTo(pozycjaGodzinyNaOsi('07:30'), 5)
  })
})
