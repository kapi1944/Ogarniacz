import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { DOMYSLNE_KAFELKI_PULPITU, DOMYSLNE_USTAWIENIA, normalizujUstawienia } from './ustawienia'

describe.sequential('ustawienia aplikacji', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('uzupełnia puste i niepełne ustawienia', () => {
    const puste = normalizujUstawienia(undefined)
    const niepelne = normalizujUstawienia({ wyglad: { motyw: 'ciemny' } })

    expect(puste.harmonogram).toEqual(DOMYSLNE_USTAWIENIA.harmonogram)
    expect(niepelne.wyglad.motyw).toBe('ciemny')
    expect(niepelne.nawigacja).toEqual(DOMYSLNE_USTAWIENIA.nawigacja)
  })

  it('zamienia błędne wartości enum na domyślne', () => {
    const wynik = normalizujUstawienia({
      wyglad: { motyw: 'neonowy' },
      harmonogram: { dostepnoscDojazdu: 'zablokowana' },
    })

    expect(wynik.wyglad.motyw).toBe(DOMYSLNE_USTAWIENIA.wyglad.motyw)
    expect(wynik.harmonogram.dostepnoscDojazdu).toBe(DOMYSLNE_USTAWIENIA.harmonogram.dostepnoscDojazdu)
  })

  it('ogranicza liczby do bezpiecznych zakresów', () => {
    const wynik = normalizujUstawienia({
      wyglad: { promienKart: 999, czasAnimacjiMs: Number.NaN },
      nawigacja: { szerokoscMenu: -20 },
      harmonogram: { dojazdDoPracyMinuty: 500 },
    })

    expect(wynik.wyglad.promienKart).toBe(24)
    expect(wynik.wyglad.czasAnimacjiMs).toBe(DOMYSLNE_USTAWIENIA.wyglad.czasAnimacjiMs)
    expect(wynik.nawigacja.szerokoscMenu).toBe(220)
    expect(wynik.harmonogram.dojazdDoPracyMinuty).toBe(180)
  })

  it('przywraca bezpieczny harmonogram dla błędnych godzin', () => {
    const wynik = normalizujUstawienia({
      harmonogram: {
        godzinaRozpoczecia: '18:00',
        godzinaZakonczenia: '08:00',
        poczatekSnu: '25:00',
        koniecSnu: '06:30',
      },
    })

    expect(wynik.harmonogram.godzinaRozpoczecia).toBe('07:45')
    expect(wynik.harmonogram.godzinaZakonczenia).toBe('16:00')
    expect(wynik.harmonogram.poczatekSnu).toBe('22:30')
    expect(wynik.harmonogram.koniecSnu).toBe('06:30')
  })

  it('zachowuje sen przechodzący przez północ i ogranicza jego skalę', () => {
    const wynik = normalizujUstawienia({
      harmonogram: {
        poczatekSnu: '23:30',
        koniecSnu: '07:30',
        skalaSnuNaOsi: 0.05,
      },
    })

    expect(wynik.harmonogram.poczatekSnu).toBe('23:30')
    expect(wynik.harmonogram.koniecSnu).toBe('07:30')
    expect(wynik.harmonogram.skalaSnuNaOsi).toBe(0.1)
  })

  it('uzupełnia kompletne domyślne kafelki w starszych ustawieniach', () => {
    const wynik = normalizujUstawienia({ pulpit: { pokazKafelki: true } })

    expect(wynik.pulpit.kafelki).toEqual(DOMYSLNE_KAFELKI_PULPITU)
  })

  it('ignoruje nieznany typ kafelka i zachowuje poprawną widoczność oraz kolejność', () => {
    const wynik = normalizujUstawienia({
      pulpit: {
        kafelki: [
          { typ: 'nieznany', widoczny: true, kolejnosc: 1 },
          { typ: 'zadania', widoczny: false, kolejnosc: 0, rozmiar: 'medium', zakresCzasu: '7d', limit: 4 },
          { typ: 'pilne', widoczny: true, kolejnosc: 99, rozmiar: 'large', zakresCzasu: '7d', limit: 4 },
        ],
      },
    })

    expect(wynik.pulpit.kafelki).toHaveLength(DOMYSLNE_KAFELKI_PULPITU.length)
    expect(wynik.pulpit.kafelki.map((kafelek) => kafelek.typ)).not.toContain('nieznany')
    expect(wynik.pulpit.kafelki[0]).toMatchObject({ typ: 'zadania', widoczny: false })
    expect(wynik.pulpit.kafelki.at(-1)?.typ).toBe('pilne')
  })

  it('normalizuje zakres, limity i rozmiar kafelków', () => {
    const wynik = normalizujUstawienia({
      pulpit: {
        kafelki: [
          { typ: 'zadania', zakresCzasu: 'rok', limit: -5, rozmiar: 'ogromny' },
          { typ: 'pilne', zakresCzasu: '30d', limit: 999, rozmiar: 'small' },
        ],
      },
    })
    const zadania = wynik.pulpit.kafelki.find((kafelek) => kafelek.typ === 'zadania')
    const pilne = wynik.pulpit.kafelki.find((kafelek) => kafelek.typ === 'pilne')

    expect(zadania).toMatchObject({ zakresCzasu: '7d', limit: 1, rozmiar: 'large' })
    expect(pilne).toMatchObject({ zakresCzasu: '30d', limit: 10, rozmiar: 'small' })
  })

  it('nie mutuje wejścia ani nie nadpisuje ustawień Quick Add podczas normalizacji kafelków', () => {
    const wejscie = {
      pulpit: { kafelki: [{ typ: 'zadania', widoczny: false, kolejnosc: 3, rozmiar: 'small', zakresCzasu: 'today', limit: 2 }] },
      szybkieDodawanie: { parserWlaczony: false },
    }
    const kopia = structuredClone(wejscie)

    const wynik = normalizujUstawienia(wejscie)

    expect(wejscie).toEqual(kopia)
    expect(wynik.szybkieDodawanie.parserWlaczony).toBe(false)
  })

  it('zapisuje i ponownie wczytuje ustawienia przez repozytorium', async () => {
    await repozytoriumUstawien.zapisz({
      ...DOMYSLNE_USTAWIENIA,
      wyglad: { ...DOMYSLNE_USTAWIENIA.wyglad, gestosc: 'zwarta' },
      harmonogram: { ...DOMYSLNE_USTAWIENIA.harmonogram, dojazdDoPracyMinuty: 55 },
    })

    const wczytane = await repozytoriumUstawien.wczytaj()
    expect(wczytane.wyglad.gestosc).toBe('zwarta')
    expect(wczytane.harmonogram.dojazdDoPracyMinuty).toBe(55)
  })

  it('zapisuje własne interakcje, animacje i motyw w bibliotece', async () => {
    const bazowa = DOMYSLNE_USTAWIENIA.wyglad.personalizacja
    const wlasna = {
      ...bazowa,
      interakcje: { ...bazowa.interakcje, hoverPoziom: 'wlasny' as const, hoverSkala: 1.025 },
      animacje: { ...bazowa.animacje, profil: 'wlasne' as const, modalMs: 330, animujKarty: false },
      motywyWlasne: [{
        id: 'testowy-motyw',
        nazwa: 'Testowy motyw',
        motyw: 'ciemny' as const,
        paleta: bazowa.paleta,
        interakcje: { ...bazowa.interakcje, hoverPoziom: 'wlasny' as const, hoverSkala: 1.025 },
        animacje: { ...bazowa.animacje, profil: 'wlasne' as const, modalMs: 330, animujKarty: false },
        komponenty: bazowa.komponenty,
      }],
    }

    await repozytoriumUstawien.zapisz({
      ...DOMYSLNE_USTAWIENIA,
      wyglad: { ...DOMYSLNE_USTAWIENIA.wyglad, personalizacja: wlasna },
    })

    const wczytane = await repozytoriumUstawien.wczytaj()
    expect(wczytane.wyglad.personalizacja.interakcje.hoverSkala).toBe(1.025)
    expect(wczytane.wyglad.personalizacja.animacje.modalMs).toBe(330)
    expect(wczytane.wyglad.personalizacja.animacje.animujKarty).toBe(false)
    expect(wczytane.wyglad.personalizacja.motywyWlasne[0].id).toBe('testowy-motyw')
  })
})
