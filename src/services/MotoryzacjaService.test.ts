import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Pojazd } from '../domain/typy'
import { statystykaPaliwa } from './MotoryzacjaService'

describe('statystyka paliwa', () => {
  it('wylicza spalanie i koszt kilometra tylko z pełnych tankowań', () => {
    const pojazd: Pojazd = { ...utworzMetadane(), nazwa: 'Auto', tankowania: [
      { id: 'a', data: '2026-08-01', przebieg: 10_000, litry: 40, cena: 240, pelnyBak: true },
      { id: 'b', data: '2026-08-15', przebieg: 10_500, litry: 35, cena: 227.5, pelnyBak: true },
    ] }
    expect(statystykaPaliwa(pojazd)).toMatchObject({ kosztPaliwa: 467.5, srednieSpalanie: 15, kosztNaKm: 0.935 })
  })
})
