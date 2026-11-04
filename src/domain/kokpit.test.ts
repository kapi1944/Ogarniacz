import { describe, expect, it } from 'vitest'
import { domyslnyKokpit, domyslnyUklad, znajdzMiejsce, nowyBlok, odczytajKokpit, poprawnaPlansza, profileKokpitu, sprawdzPolozenie, uporzadkujPlansze } from './kokpit'
import { normalizujUstawienia } from './ustawienia'

describe('konfiguracja kokpitu', () => {
  it('otwiera plansze na starszych ustawieniach i zachowuje konfigurację nowszej wersji', () => {
    expect(odczytajKokpit(normalizujUstawienia({}).kokpit) ?? domyslnyKokpit).toMatchObject({ start: 'plansze' })
    const przyszla = { wersja: 2, bloki: ['inny-typ'] }
    expect(normalizujUstawienia({ kokpit: przyszla }).kokpit).toEqual(przyszla)
    expect(odczytajKokpit(przyszla)).toBeUndefined()
  })

  it('czyta poprawne profile oraz zachowuje nieznane typy bloków', () => {
    const profile = Object.fromEntries(Object.keys(profileKokpitu).map((klucz) => [klucz, domyslnyUklad(klucz as keyof typeof profileKokpitu)]))
    profile.pion.plansze[0].bloki[0].typ = 'przyszly-typ'
    expect(odczytajKokpit({ ...domyslnyKokpit, profile })?.profile.pion?.plansze[0].bloki[0].typ).toBe('przyszly-typ')
  })

  it('sprawdza granice, minimum i kolizje oraz pozwala zostawić wolne miejsca', () => {
    const plansza = domyslnyUklad('komputer').plansze[0]
    const pusty = { ...plansza, bloki: [plansza.bloki[0]] }
    const blok = nowyBlok('pogoda')
    expect(poprawnaPlansza(pusty)).toBe(true)
    expect(sprawdzPolozenie(pusty, blok)).toBe(false)
    expect(sprawdzPolozenie(pusty, { ...blok, x: 7 })).toBe(false)
    expect(sprawdzPolozenie(pusty, { ...blok, x: 6, szerokosc: 1 })).toBe(false)
    expect(znajdzMiejsce(pusty, blok)).toMatchObject({ x: 6, y: 0 })
  })

  it('przenosi bloki podczas zmiany siatki i odmawia zapisu, jeśli się nie mieszczą', () => {
    const plansza = domyslnyUklad('komputer').plansze[1]
    expect(uporzadkujPlansze({ ...plansza, kolumny: 4, wiersze: 8 })?.bloki).toHaveLength(4)
    expect(uporzadkujPlansze({ ...plansza, wiersze: 2 })).toBeUndefined()
    expect(poprawnaPlansza({ ...plansza, kolumny: 4 })).toBe(false)
  })
})
