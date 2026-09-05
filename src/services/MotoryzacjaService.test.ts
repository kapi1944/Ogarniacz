import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Pojazd } from '../domain/typy'
import { statystykaPaliwa } from './MotoryzacjaService'

describe('statystyka paliwa', () => {
  it('traktuje pierwsze pełne tankowanie jako punkt startowy', () => {
    const pojazd: Pojazd = { ...utworzMetadane(), nazwa: 'Auto', tankowania: [
      { id: 'a', data: '2026-08-01', przebieg: 10_000, litry: 40, cena: 240, pelnyBak: true },
      { id: 'b', data: '2026-08-15', przebieg: 10_500, litry: 35, cena: 227.5, pelnyBak: true },
    ] }
    expect(statystykaPaliwa(pojazd)).toMatchObject({ kosztPaliwa: 467.5, srednieSpalanie: 7, kosztNaKm: 0.455 })
  })

  it('uwzględnia niepełne tankowania pomiędzy pełnymi', () => {
    const pojazd: Pojazd = { ...utworzMetadane(), nazwa: 'Auto', tankowania: [
      { id: 'a', data: '2026-08-01', przebieg: 10_000, litry: 40, cena: 240, pelnyBak: true },
      { id: 'b', data: '2026-08-10', przebieg: 10_250, litry: 15, cena: 90 },
      { id: 'c', data: '2026-08-20', przebieg: 10_500, litry: 20, cena: 120, pelnyBak: true },
    ] }
    expect(statystykaPaliwa(pojazd).srednieSpalanie).toBe(7)
  })
})
