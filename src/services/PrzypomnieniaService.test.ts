import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { aktywnePrzypomnienia, czasUruchomienia, nadchodzacePrzypomnienia, odroczPrzypomnienie, zapiszPowiazanePrzypomnienie, zakonczPrzypomnienie } from './PrzypomnieniaService'

const baza = (zmiany: Partial<Przypomnienie> = {}): Przypomnienie => ({ ...utworzMetadane(), tytul: 'Test', typ: 'absolutne', czas: '2026-08-14T10:00:00.000Z', priorytet: 'normalny', stan: 'nowe', eskalacja: false, ...zmiany })

describe('reminder engine', () => {
  it('uruchamia przypomnienie absolutne o podanym czasie', () => {
    expect(aktywnePrzypomnienia([baza()], new Date('2026-08-14T10:01:00.000Z'))).toHaveLength(1)
  })

  it('wylicza przypomnienie względne przed czasem źródła', () => {
    const przypomnienie = baza({ typ: 'wzgledne', przesuniecieMin: 60 })
    expect(czasUruchomienia(przypomnienie)?.toISOString()).toBe('2026-08-14T09:00:00.000Z')
  })

  it('tworzy następne wystąpienie przypomnienia cyklicznego', () => {
    const przypomnienie = baza({ typ: 'cykliczne', powtarzanie: { typ: 'codziennie', coIle: 1 } })
    expect(zakonczPrzypomnienie(przypomnienie).nastepne?.czas).toBe('2026-08-15T10:00:00.000Z')
  })

  it('snooze odracza przypomnienie o wskazaną liczbę minut', () => {
    const odroczone = odroczPrzypomnienie(baza(), 15, new Date('2026-08-14T08:00:00.000Z'))
    expect(odroczone.odroczoneDo).toBe('2026-08-14T08:15:00.000Z')
    expect(odroczone.stan).toBe('odroczone')
  })

  it('aktualizuje jedno aktywne przypomnienie źródłowe zamiast tworzyć duplikat', () => {
    const istniejace = baza({ id: 'r-1', zrodlo: { typ: 'wizyty', id: 'w-1' }, stan: 'odroczone' })
    const wynik = zapiszPowiazanePrzypomnienie([istniejace], baza({ id: 'r-nowe', zrodlo: { typ: 'wizyty', id: 'w-1' }, czas: '2026-08-15T12:00:00.000Z' }))
    expect(wynik).toMatchObject({ id: 'r-1', stan: 'nowe', odroczoneDo: undefined, czas: '2026-08-15T12:00:00.000Z' })
  })

  it('zachowuje powiązanie przypomnienia z pojazdem', () => {
    const wynik = zapiszPowiazanePrzypomnienie([], baza({ zrodlo: { typ: 'samochod', id: 'auto-1' }, czas: '2026-09-01T09:00:00.000Z' }))
    expect(wynik.zrodlo).toEqual({ typ: 'samochod', id: 'auto-1' })
  })

  it('utrzymuje osobne progi przypomnień jednego terminu i deduplikuje każdy próg', () => {
    const prog30 = baza({ id: 'r-30', zrodlo: { typ: 'terminy', id: 'termin-1' }, kluczDeduplikacji: 'termin:termin-1:30' })
    const prog7 = baza({ id: 'r-7', zrodlo: { typ: 'terminy', id: 'termin-1' }, kluczDeduplikacji: 'termin:termin-1:7' })
    expect(zapiszPowiazanePrzypomnienie([prog30], prog7).id).toBe('r-7')
    expect(zapiszPowiazanePrzypomnienie([prog30, prog7], baza({ id: 'nowe', zrodlo: { typ: 'terminy', id: 'termin-1' }, kluczDeduplikacji: 'termin:termin-1:30' })).id).toBe('r-30')
  })

  it('pokazuje przyszłe przypomnienie wraz z prawidłowym czasem uruchomienia', () => {
    expect(nadchodzacePrzypomnienia([baza({ czas: '2026-08-14T11:00:00.000Z' })], new Date('2026-08-14T10:00:00.000Z'))).toHaveLength(1)
  })
})
