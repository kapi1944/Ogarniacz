import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { aktywnePrzypomnienia, czasUruchomienia, odroczPrzypomnienie, zakonczPrzypomnienie } from './PrzypomnieniaService'

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
})
