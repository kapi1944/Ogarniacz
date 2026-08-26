import { describe, expect, it } from 'vitest'
import {
  DOMYSLNA_PERSONALIZACJA,
  WERSJA_SCHEMATU_MOTYWU,
  normalizujImportMotywu,
  normalizujPersonalizacje,
  ocenKontrastPalety,
  przywrocBazowaPersonalizacje,
  zastosujPersonalizacje,
} from './personalizacja'

describe('personalizacja UI', () => {
  it('uzupełnia nowe pola w starszym motywie bez utraty jego wartości', () => {
    const wynik = normalizujPersonalizacje({
      preset: 'wlasny',
      interakcje: {
        hoverJasnosc: 1.17,
        hoverSkala: 1.03,
        hoverPrzesuniecieY: -2,
        activeSkala: 0.95,
        activePrzesuniecieY: 2,
        selectedGlow: 7,
        focusGrubosc: 4,
      },
      animacje: { profil: 'wlasne', hoverMs: 275 },
      komponenty: { kartaCien: 'mocny' },
    })

    expect(wynik.interakcje.hoverPoziom).toBe('wlasny')
    expect(wynik.interakcje.hoverJasnosc).toBe(1.17)
    expect(wynik.interakcje.activePoziom).toBe('wlasny')
    expect(wynik.interakcje.activeSkala).toBe(0.95)
    expect(wynik.interakcje.selectedPoziom).toBe('wlasny')
    expect(wynik.interakcje.focusPoziom).toBe('wlasny')
    expect(wynik.animacje.animujModale).toBe(true)
    expect(wynik.komponenty.obramowanie).toBe('standardowe')
    expect(wynik.komponenty.glebia).toBe('lekko-podniesiona')
  })

  it('ogranicza własne interakcje do bezpiecznych zakresów', () => {
    const wynik = normalizujPersonalizacje({
      interakcje: {
        hoverPoziom: 'wlasny',
        hoverSkala: 9,
        hoverKrycie: 0,
        activePoziom: 'wlasny',
        activeSkala: -4,
        focusPoziom: 'wlasny',
        focusGrubosc: 0,
        focusKrycie: 0,
      },
    })

    expect(wynik.interakcje.hoverSkala).toBe(1.08)
    expect(wynik.interakcje.hoverKrycie).toBe(0.65)
    expect(wynik.interakcje.activeSkala).toBe(0.9)
    expect(wynik.interakcje.focusGrubosc).toBe(1)
    expect(wynik.interakcje.focusKrycie).toBe(35)
  })

  it('uzupełnia nowe ustawienia we własnym zapisanym motywie', () => {
    const wynik = normalizujPersonalizacje({
      motywyWlasne: [{
        id: 'starszy',
        nazwa: 'Starszy motyw',
        motyw: 'ciemny',
        paleta: DOMYSLNA_PERSONALIZACJA.paleta,
        interakcje: { hoverJasnosc: 1.09 },
        animacje: { profil: 'minimalne' },
        komponenty: { kartaCien: 'sredni' },
      }],
    })

    expect(wynik.motywyWlasne).toHaveLength(1)
    expect(wynik.motywyWlasne[0].interakcje.hoverPoziom).toBe('wlasny')
    expect(wynik.motywyWlasne[0].animacje.animujDropdowny).toBe(true)
    expect(wynik.motywyWlasne[0].komponenty.obramowanie).toBe('standardowe')
  })

  it('resetuje draft bez usuwania zapisanych motywów', () => {
    const obecna = normalizujPersonalizacje({
      preset: 'wlasny',
      motywyWlasne: [{
        id: 'zachowany',
        nazwa: 'Zachowany',
        motyw: 'jasny',
        paleta: DOMYSLNA_PERSONALIZACJA.paleta,
        interakcje: DOMYSLNA_PERSONALIZACJA.interakcje,
        animacje: DOMYSLNA_PERSONALIZACJA.animacje,
        komponenty: DOMYSLNA_PERSONALIZACJA.komponenty,
      }],
    })

    const wynik = przywrocBazowaPersonalizacje(obecna)

    expect(wynik.preset).toBe('bazowy')
    expect(wynik.motywyWlasne.map((motyw) => motyw.id)).toEqual(['zachowany'])
  })

  it('importuje motyw wersji 1 i uzupełnia brakujące pola', () => {
    const wynik = normalizujImportMotywu({
      format: 'ogarniacz-theme',
      wersja: 1,
      motyw: 'ciemny',
      personalizacja: {
        preset: 'wlasny',
        interakcje: { hoverJasnosc: 1.12 },
      },
    })

    expect(wynik.motyw).toBe('ciemny')
    expect(wynik.personalizacja.interakcje.hoverJasnosc).toBe(1.12)
    expect(wynik.personalizacja.animacje).toEqual(DOMYSLNA_PERSONALIZACJA.animacje)
  })

  it('odrzuca nieprawidłowy format i nieobsługiwaną przyszłą wersję', () => {
    expect(() => normalizujImportMotywu({ format: 'inne', personalizacja: { preset: 'wlasny' } })).toThrow()
    expect(() => normalizujImportMotywu({
      format: 'ogarniacz-theme',
      wersja: WERSJA_SCHEMATU_MOTYWU + 1,
      personalizacja: { preset: 'wlasny' },
    })).toThrow()
  })

  it('generuje centralne zmienne CSS dla własnych stanów i animacji', () => {
    const korzen = document.createElement('div')
    const personalizacja = normalizujPersonalizacje({
      ...DOMYSLNA_PERSONALIZACJA,
      interakcje: {
        ...DOMYSLNA_PERSONALIZACJA.interakcje,
        hoverPoziom: 'wlasny',
        hoverSkala: 1.025,
        activePoziom: 'wlasny',
        activeJasnosc: 0.9,
        selectedPoziom: 'wlasny',
        selectedIntensywnosc: 22,
        focusPoziom: 'wlasny',
        focusGrubosc: 5,
      },
      animacje: {
        ...DOMYSLNA_PERSONALIZACJA.animacje,
        animujKarty: false,
      },
    })

    zastosujPersonalizacje(personalizacja, korzen, false)

    expect(korzen.dataset.uiHover).toBe('wlasny')
    expect(korzen.style.getPropertyValue('--ui-hover-scale')).toBe('1.025')
    expect(korzen.style.getPropertyValue('--ui-active-brightness')).toBe('0.9')
    expect(korzen.style.getPropertyValue('--ui-selected-surface')).toContain('22%')
    expect(korzen.style.getPropertyValue('--ui-focus-width')).toBe('5px')
    expect(korzen.style.getPropertyValue('--ui-card-ms')).toBe('0ms')
  })

  it('zeruje wszystkie czasy ruchu przy ograniczeniu systemowym', () => {
    const korzen = document.createElement('div')
    zastosujPersonalizacje(DOMYSLNA_PERSONALIZACJA, korzen, true)

    expect(korzen.dataset.uiRuch).toBe('wylaczony')
    expect(korzen.style.getPropertyValue('--ui-hover-ms')).toBe('0ms')
    expect(korzen.style.getPropertyValue('--ui-modal-ms')).toBe('0ms')
    expect(korzen.style.getPropertyValue('--ui-page-ms')).toBe('0ms')
  })

  it('wykrywa niski kontrast bez blokowania palety', () => {
    const oceny = ocenKontrastPalety({
      ...DOMYSLNA_PERSONALIZACJA.paleta,
      tekst: '#777777',
      tlo: '#777777',
    })

    expect(oceny.find((ocena) => ocena.id === 'tekst-tlo')).toMatchObject({ niski: true, wspolczynnik: 1 })
  })
})
