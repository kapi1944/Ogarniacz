import { describe, expect, it } from 'vitest'
import {
  DOMYSLNA_PERSONALIZACJA,
  PALETY_PREMIUM,
  PALETY_FLAT,
  PRESETY_MOTYWOW,
  WERSJA_SCHEMATU_MOTYWU,
  normalizujImportMotywu,
  normalizujPersonalizacje,
  ocenKontrastPalety,
  obliczKontrast,
  rozwiazPaletePersonalizacji,
  rozwiazAnimacjePersonalizacji,
  wybierzCzytelnyTekst,
  zastosujPresetMotywu,
  przywrocBazowaPersonalizacje,
  zastosujPersonalizacje,
} from './personalizacja'

describe('personalizacja UI', () => {
  it('starsze i nieznane style pozostawia jako Klasyczny', () => {
    expect(normalizujPersonalizacje({ preset: 'oled' }).styl).toBe('klasyczny')
    expect(normalizujPersonalizacje({ styl: 'nieznany' }).styl).toBe('klasyczny')
    expect(normalizujPersonalizacje({ styl: 'premium' }).styl).toBe('premium')
    expect(normalizujPersonalizacje({ styl: 'flat' }).styl).toBe('flat')
  })

  it.each(['klasyczny', 'premium', 'flat'] as const)('zachowuje styl %s przy imporcie dotychczasowego formatu motywu', (styl) => {
    const wynik = normalizujImportMotywu({ format: 'ogarniacz-theme', wersja: WERSJA_SCHEMATU_MOTYWU, motyw: 'jasny', personalizacja: { styl } })
    expect(wynik.personalizacja.styl).toBe(styl)
    expect(wynik.motyw).toBe('jasny')
  })

  it.each((['premium', 'flat'] as const).flatMap((styl) => (['jasny', 'ciemny'] as const).map((motyw) => ({ styl, motyw }))))('zapewnia kontrast AA palety $styl: $motyw', ({ styl, motyw }) => {
    const paleta = (styl === 'premium' ? PALETY_PREMIUM : PALETY_FLAT)[motyw]
    for (const tlo of [paleta.tlo, paleta.panel, paleta.panel2]) {
      for (const kolor of [paleta.tekst, paleta.tekst2, paleta.akcent, paleta.akcentHover]) {
        expect(obliczKontrast(kolor, tlo)).toBeGreaterThanOrEqual(4.5)
      }
      expect(obliczKontrast(paleta.obramowanieMocne, tlo)).toBeGreaterThanOrEqual(3)
      if (styl === 'flat') expect(obliczKontrast(paleta.obramowanie, tlo)).toBeGreaterThanOrEqual(3)
      expect(obliczKontrast(paleta.focus, tlo)).toBeGreaterThanOrEqual(3)
      for (const kolor of [paleta.zadanie, paleta.projekt, paleta.wizyta, paleta.lek, paleta.finanse, paleta.samochod, paleta.przypomnienie]) {
        expect(obliczKontrast(kolor, tlo)).toBeGreaterThanOrEqual(3)
      }
    }
    for (const [kolor, tlo] of [[paleta.sukces, paleta.sukcesTlo], [paleta.blad, paleta.bladTlo], [paleta.ostrzezenie, paleta.ostrzezenieTlo], [paleta.informacja, paleta.informacjaTlo], [wybierzCzytelnyTekst(paleta.akcent), paleta.akcent], [wybierzCzytelnyTekst(paleta.zadanie), paleta.zadanie], [wybierzCzytelnyTekst(paleta.wizyta), paleta.wizyta], [paleta.sidebarTekst, paleta.sidebarActive]]) {
      expect(obliczKontrast(kolor, tlo)).toBeGreaterThanOrEqual(4.5)
    }
    expect(ocenKontrastPalety(paleta).every((ocena) => !ocena.niski)).toBe(true)
  })

  it('przełącza style i tryby bez mutowania własnej palety, presetów i animacji', () => {
    const korzen = document.createElement('div')
    const premium = normalizujPersonalizacje({ styl: 'premium' })
    const przed = structuredClone(premium)
    for (const motyw of ['jasny', 'ciemny'] as const) {
      zastosujPersonalizacje(premium, korzen, false, motyw)
      expect(korzen.dataset.styl).toBe('premium')
      expect(korzen.style.getPropertyValue('--tlo')).toBe(PALETY_PREMIUM[motyw].tlo)
    }
    expect(premium).toEqual(przed)
    for (const preset of PRESETY_MOTYWOW) {
      const wynik = zastosujPresetMotywu(premium, preset.id)
      expect(wynik.personalizacja.styl).toBe('premium')
      expect(rozwiazPaletePersonalizacji(wynik.personalizacja, wynik.motyw)).toEqual(preset.paleta)
      zastosujPersonalizacje(wynik.personalizacja, korzen, false, wynik.motyw)
      expect(korzen.style.getPropertyValue('--tlo')).toBe(preset.paleta.tlo)
    }
    zastosujPersonalizacje({ ...premium, styl: 'klasyczny' }, korzen, false)
    expect(korzen.dataset.styl).toBe('klasyczny')
    expect(korzen.style.getPropertyValue('--tlo')).toBe('')
    expect(korzen.style.getPropertyValue('--ui-sidebar-bg')).toBe('')
  })

  it.each([true, false])('Premium respektuje ograniczenie ruchu: %s', (ograniczRuch) => {
    const korzen = document.createElement('div')
    const premium = normalizujPersonalizacje({ styl: 'premium', animacje: { profil: 'wlasne', hoverMs: 150, activeMs: 100, modalMs: 200, animujKarty: false } })
    zastosujPersonalizacje(premium, korzen, ograniczRuch)
    expect(korzen.style.getPropertyValue('--ui-hover-ms')).toBe(ograniczRuch ? '0ms' : '150ms')
    expect(korzen.style.getPropertyValue('--ui-active-ms')).toBe(ograniczRuch ? '0ms' : '100ms')
    expect(korzen.style.getPropertyValue('--ui-modal-ms')).toBe(ograniczRuch ? '0ms' : '200ms')
    expect(korzen.style.getPropertyValue('--ui-card-ms')).toBe('0ms')
    zastosujPersonalizacje({ ...premium, animacje: { ...premium.animacje, profil: 'wylaczone' } }, korzen, false)
    expect(korzen.style.getPropertyValue('--ui-modal-ms')).toBe('0ms')
  })

  it('stosuje standardowe czasy Premium bez zmiany zapisanych preferencji Klasycznego', () => {
    const korzen = document.createElement('div')
    const premium = normalizujPersonalizacje({ styl: 'premium' })
    zastosujPersonalizacje(premium, korzen, false)
    expect(korzen.style.getPropertyValue('--ui-hover-ms')).toBe('150ms')
    expect(korzen.style.getPropertyValue('--ui-active-ms')).toBe('100ms')
    expect(korzen.style.getPropertyValue('--ui-modal-ms')).toBe('200ms')
    expect(premium.animacje).toEqual(DOMYSLNA_PERSONALIZACJA.animacje)
    zastosujPersonalizacje({ ...premium, styl: 'klasyczny' }, korzen, false)
    expect(korzen.style.getPropertyValue('--ui-hover-ms')).toBe('160ms')
    expect(korzen.style.getPropertyValue('--ui-modal-ms')).toBe('180ms')
  })

  it('Flat ogranicza dekoracyjny ruch bez nadpisania własnych animacji i palet', () => {
    const flat = normalizujPersonalizacje({ styl: 'flat' })
    const przed = structuredClone(flat)
    expect(rozwiazAnimacjePersonalizacji(flat)).toMatchObject({ hoverMs: 100, modalMs: 0, kartaMs: 0, pageMs: 0 })
    expect(flat).toEqual(przed)
    const wlasny = normalizujPersonalizacje({ ...flat, uzyjWlasnejPalety: true, animacje: { profil: 'wlasne', hoverMs: 270 } })
    expect(rozwiazAnimacjePersonalizacji(wlasny).hoverMs).toBe(270)
    expect(rozwiazPaletePersonalizacji(wlasny, 'jasny')).toEqual(wlasny.paleta)
    expect(przywrocBazowaPersonalizacje(wlasny).styl).toBe('klasyczny')
  })

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
