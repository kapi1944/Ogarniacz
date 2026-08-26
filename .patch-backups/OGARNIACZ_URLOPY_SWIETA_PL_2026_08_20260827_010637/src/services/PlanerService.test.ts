import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { BlokCzasu, GrafikPracy, Zadanie } from '../domain/typy'
import { zaproponujPlan, type DanePlanera } from './PlanerService'
import { utworzZadanie } from './ZadaniaService'

const data = '2026-08-17'
const grafik: GrafikPracy[] = [{ ...utworzMetadane('grafik-1'), dzienTygodnia: 1, aktywny: true, od: '08:00', do: '16:00' }]
const zadanie = (tytul: string, priorytet: Zadanie['priorytet'], minuty?: number) => utworzZadanie({ tytul, opis: '', priorytet, termin: data, szacowanyCzasMin: minuty })
const dane = (zmiany: Partial<DanePlanera> = {}): DanePlanera => ({ data, tryb: 'dzien', zadania: [zadanie('Zadanie', 'normalny', 60)], nawyki: [], wizyty: [], bloki: [], grafik, wyjatkiGrafiku: [], ...zmiany })

describe('planer', () => {
  it('respektuje godziny pracy', () => {
    const wynik = zaproponujPlan(dane())
    const obowiazki = wynik.propozycje.filter((blok) => blok.typ === 'zadanie')
    expect(obowiazki.every((blok) => blok.koniec <= `${data}T08:00:00` || blok.poczatek >= `${data}T16:00:00`)).toBe(true)
  })

  it('respektuje twarde bloki', () => {
    const blok: BlokCzasu = { ...utworzMetadane(), tytul: 'Wizyta', poczatek: `${data}T17:00:00`, koniec: `${data}T18:00:00`, typ: 'wizyta', elastycznosc: 'twardy', status: 'zaakceptowany' }
    const wynik = zaproponujPlan(dane({ bloki: [blok], tryb: 'wieczor' }))
    expect(wynik.propozycje.filter((x) => x.typ === 'zadanie').every((x) => x.koniec <= blok.poczatek || x.poczatek >= blok.koniec)).toBe(true)
  })

  it('nie wypełnia obowiązkami 100% dostępności', () => {
    const zadania = Array.from({ length: 20 }, (_, indeks) => zadanie(`Zadanie ${indeks}`, 'normalny', 60))
    const wynik = zaproponujPlan(dane({ zadania, grafik: [], tryb: 'wieczor' }))
    expect(wynik.wykorzystanieProcent).toBeLessThanOrEqual(75)
  })

  it('planuje wyższy priorytet wcześniej', () => {
    const wynik = zaproponujPlan(dane({ zadania: [zadanie('Niski', 'niski', 30), zadanie('Krytyczny', 'krytyczny', 30)], grafik: [], tryb: 'wieczor' }))
    expect(wynik.propozycje.find((blok) => blok.typ === 'zadanie')?.tytul).toBe('Krytyczny')
  })

  it('przyjmuje bezpieczne 30 minut dla zadania bez estymacji', () => {
    const wynik = zaproponujPlan(dane({ zadania: [zadanie('Bez estymacji', 'normalny')], grafik: [], tryb: 'wieczor' }))
    const blok = wynik.propozycje.find((element) => element.typ === 'zadanie')!
    expect((Date.parse(blok.koniec) - Date.parse(blok.poczatek)) / 60000).toBe(30)
  })
})
