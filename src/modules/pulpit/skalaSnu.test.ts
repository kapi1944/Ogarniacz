import { describe, expect, it } from 'vitest'
import {
  DOMYSLNY_ZAKRES_SNU,
  pozycjaGodzinyNaOsiZeSnem,
} from './logikaOsiCzasu'

function szerokosc(od: string, doGodziny: string): number {
  return pozycjaGodzinyNaOsiZeSnem(doGodziny, DOMYSLNY_ZAKRES_SNU)
    - pozycjaGodzinyNaOsiZeSnem(od, DOMYSLNY_ZAKRES_SNU)
}

describe('oś czasu z kompresją snu', () => {
  it('mapuje początek i koniec doby na 0% i 100%', () => {
    expect(pozycjaGodzinyNaOsiZeSnem('00:00')).toBe(0)
    expect(pozycjaGodzinyNaOsiZeSnem('23:59')).toBe(100)
  })

  it('kompresuje godzinę snu do połowy szerokości godziny dziennej', () => {
    const godzinaDnia = szerokosc('12:00', '13:00')
    const godzinaSnu = szerokosc('22:30', '23:30')

    expect(godzinaSnu / godzinaDnia).toBeCloseTo(0.5, 5)
  })

  it('kompresuje także nocną część snu po północy', () => {
    const godzinaDnia = szerokosc('12:00', '13:00')
    const godzinaSnu = szerokosc('05:30', '06:30')

    expect(godzinaSnu / godzinaDnia).toBeCloseTo(0.5, 5)
  })

  it('obsługuje edytowany sen przechodzący przez północ', () => {
    const zakres = { od: '23:30', do: '07:00' }
    const dzien = pozycjaGodzinyNaOsiZeSnem('13:00', zakres)
      - pozycjaGodzinyNaOsiZeSnem('12:00', zakres)
    const sen = pozycjaGodzinyNaOsiZeSnem('06:00', zakres)
      - pozycjaGodzinyNaOsiZeSnem('05:00', zakres)

    expect(sen / dzien).toBeCloseTo(0.5, 5)
  })
})
