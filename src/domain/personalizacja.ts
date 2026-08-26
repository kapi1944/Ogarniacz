export type PresetMotywu =
  | 'bazowy'
  | 'ogarniacz-dark'
  | 'ogarniacz-light'
  | 'midnight'
  | 'oled'
  | 'soft'
  | 'wlasny'

export type ProfilRuchu =
  | 'wylaczone'
  | 'minimalne'
  | 'standardowe'
  | 'plynne'
  | 'dynamiczne'
  | 'wlasne'

export type PoziomHover = 'wylaczony' | 'subtelny' | 'normalny' | 'wyrazny' | 'wlasny'
export type PoziomReakcji = 'subtelny' | 'normalny' | 'wyrazny' | 'wlasny'
export type PoziomFocus = 'subtelny' | 'standardowy' | 'wyrazny' | 'wlasny'
export type PoziomObramowania = 'brak' | 'subtelne' | 'standardowe' | 'wyrazne'
export type GlebiaKomponentow = 'plaska' | 'lekko-podniesiona' | 'przestrzenna'

export interface PaletaPersonalizacji {
  tlo: string
  panel: string
  panel2: string
  tekst: string
  tekst2: string
  obramowanie: string
  obramowanieMocne: string
  akcent: string
  akcentHover: string
  akcentJasny: string
  sukces: string
  sukcesTlo: string
  ostrzezenie: string
  ostrzezenieTlo: string
  blad: string
  bladTlo: string
  informacja: string
  informacjaTlo: string
  sidebar: string
  sidebarHover: string
  sidebarActive: string
  sidebarTekst: string
  focus: string
  zadanie: string
  projekt: string
  wizyta: string
  lek: string
  finanse: string
  samochod: string
  przypomnienie: string
  timeline: string
  timelineTeraz: string
}

export interface InterakcjePersonalizacji {
  autoStany: boolean
  hoverPoziom: PoziomHover
  hoverJasnosc: number
  hoverKrycie: number
  hoverSkala: number
  hoverPrzesuniecieY: number
  hoverCien: number
  hoverObramowanie: number
  activePoziom: PoziomReakcji
  activeJasnosc: number
  activeKrycie: number
  activeSkala: number
  activePrzesuniecieY: number
  activeCien: number
  selectedPoziom: PoziomReakcji
  selectedIntensywnosc: number
  selectedObramowanie: number
  selectedGlow: number
  focusPoziom: PoziomFocus
  focusGrubosc: number
  focusKrycie: number
  disabledKrycie: number
}

export interface AnimacjePersonalizacji {
  profil: ProfilRuchu
  hoverMs: number
  activeMs: number
  modalMs: number
  dropdownMs: number
  tooltipMs: number
  pageMs: number
  kartaMs: number
  dragMs: number
  easing: string
  animujHover: boolean
  animujPrzyciski: boolean
  animujKarty: boolean
  animujDropdowny: boolean
  animujModale: boolean
  animujZakladki: boolean
  animujPanele: boolean
  animujPojawianie: boolean
}

export interface KomponentyPersonalizacji {
  obramowanie: PoziomObramowania
  glebia: GlebiaKomponentow
  kartaCien: 'brak' | 'lekki' | 'sredni' | 'mocny'
  kartaObramowanie: number
  kartaHoverUniesienie: number
  przyciskObramowanie: number
  poleObramowanie: number
  sidebarPromien: number
  timelinePromien: number
  timelinePrzezroczystosc: number
  timelineLiniaPx: number
  miniaturaRozmiar: number
}

export interface MotywWlasny {
  id: string
  nazwa: string
  motyw: 'jasny' | 'ciemny'
  paleta: PaletaPersonalizacji
  interakcje: InterakcjePersonalizacji
  animacje: AnimacjePersonalizacji
  komponenty: KomponentyPersonalizacji
}

export interface PersonalizacjaUI {
  preset: PresetMotywu
  uzyjWlasnejPalety: boolean
  paleta: PaletaPersonalizacji
  interakcje: InterakcjePersonalizacji
  animacje: AnimacjePersonalizacji
  komponenty: KomponentyPersonalizacji
  motywyWlasne: MotywWlasny[]
  aktywnyMotywId?: string
}

export interface DefinicjaPresetu {
  id: Exclude<PresetMotywu, 'bazowy' | 'wlasny'>
  nazwa: string
  opis: string
  motyw: 'jasny' | 'ciemny'
  paleta: PaletaPersonalizacji
}

const PALETA_DARK: PaletaPersonalizacji = {
  tlo: '#101715',
  panel: '#18211f',
  panel2: '#1d2926',
  tekst: '#edf4f2',
  tekst2: '#9cafaa',
  obramowanie: '#34413e',
  obramowanieMocne: '#566560',
  akcent: '#63c9b5',
  akcentHover: '#82d8c7',
  akcentJasny: '#1c4038',
  sukces: '#79d69e',
  sukcesTlo: '#1c3b2b',
  ostrzezenie: '#f0bb64',
  ostrzezenieTlo: '#43351e',
  blad: '#f19a96',
  bladTlo: '#492928',
  informacja: '#8bc0ec',
  informacjaTlo: '#20384c',
  sidebar: '#0e2823',
  sidebarHover: '#24443e',
  sidebarActive: '#29695d',
  sidebarTekst: '#dce8e5',
  focus: '#63c9b5',
  zadanie: '#63c9b5',
  projekt: '#8bc0ec',
  wizyta: '#b69cf3',
  lek: '#79d69e',
  finanse: '#f0bb64',
  samochod: '#dc9b64',
  przypomnienie: '#f19a96',
  timeline: '#566560',
  timelineTeraz: '#63c9b5',
}

const PALETA_LIGHT: PaletaPersonalizacji = {
  tlo: '#f3f5f5',
  panel: '#ffffff',
  panel2: '#f7f9f8',
  tekst: '#172321',
  tekst2: '#61706d',
  obramowanie: '#d8e0de',
  obramowanieMocne: '#aebbb8',
  akcent: '#17665a',
  akcentHover: '#105248',
  akcentJasny: '#e0f1ed',
  sukces: '#1d6c44',
  sukcesTlo: '#e2f3e9',
  ostrzezenie: '#8b5505',
  ostrzezenieTlo: '#fff0d4',
  blad: '#a53535',
  bladTlo: '#fde8e7',
  informacja: '#285e8f',
  informacjaTlo: '#e7f0fa',
  sidebar: '#16332e',
  sidebarHover: '#24443e',
  sidebarActive: '#29695d',
  sidebarTekst: '#dce8e5',
  focus: '#17665a',
  zadanie: '#17665a',
  projekt: '#285e8f',
  wizyta: '#6c4da6',
  lek: '#1d6c44',
  finanse: '#8b5505',
  samochod: '#9a571f',
  przypomnienie: '#a53535',
  timeline: '#aebbb8',
  timelineTeraz: '#17665a',
}

const PALETA_MIDNIGHT: PaletaPersonalizacji = {
  ...PALETA_DARK,
  tlo: '#080d14',
  panel: '#101923',
  panel2: '#152130',
  tekst: '#eef6ff',
  tekst2: '#9db0c5',
  obramowanie: '#26384b',
  obramowanieMocne: '#3d5872',
  akcent: '#53d1c0',
  akcentHover: '#78e3d4',
  akcentJasny: '#123b3a',
  sidebar: '#081d22',
  sidebarHover: '#12343b',
  sidebarActive: '#17605d',
  focus: '#53d1c0',
  timeline: '#3d5872',
  timelineTeraz: '#53d1c0',
}

const PALETA_OLED: PaletaPersonalizacji = {
  ...PALETA_DARK,
  tlo: '#000000',
  panel: '#080b0a',
  panel2: '#0d1210',
  tekst: '#f2f8f6',
  tekst2: '#9da9a6',
  obramowanie: '#252c2a',
  obramowanieMocne: '#3c4844',
  sidebar: '#020605',
  sidebarHover: '#0e1b18',
  sidebarActive: '#173d35',
  akcent: '#68dcc5',
  akcentHover: '#8ae8d6',
  focus: '#68dcc5',
  timeline: '#3c4844',
  timelineTeraz: '#68dcc5',
}

const PALETA_SOFT: PaletaPersonalizacji = {
  ...PALETA_LIGHT,
  tlo: '#f5f3f0',
  panel: '#fffdf9',
  panel2: '#f1eee8',
  tekst: '#29312f',
  tekst2: '#737d79',
  obramowanie: '#ddd8cf',
  obramowanieMocne: '#bcb5aa',
  akcent: '#397a70',
  akcentHover: '#2d655c',
  akcentJasny: '#e4efec',
  sidebar: '#25413c',
  sidebarHover: '#34544d',
  sidebarActive: '#47766d',
  focus: '#397a70',
  timeline: '#bcb5aa',
  timelineTeraz: '#397a70',
}

export const PRESETY_MOTYWOW: DefinicjaPresetu[] = [
  {
    id: 'ogarniacz-dark',
    nazwa: 'Ogarniacz Dark',
    opis: 'Domyślna ciemna paleta Ogarniacza.',
    motyw: 'ciemny',
    paleta: PALETA_DARK,
  },
  {
    id: 'ogarniacz-light',
    nazwa: 'Ogarniacz Light',
    opis: 'Jasna wersja bazowego wyglądu.',
    motyw: 'jasny',
    paleta: PALETA_LIGHT,
  },
  {
    id: 'midnight',
    nazwa: 'Midnight',
    opis: 'Głębszy, chłodniejszy motyw do pracy wieczorem.',
    motyw: 'ciemny',
    paleta: PALETA_MIDNIGHT,
  },
  {
    id: 'oled',
    nazwa: 'OLED',
    opis: 'Prawie czarne powierzchnie i mocniejszy kontrast.',
    motyw: 'ciemny',
    paleta: PALETA_OLED,
  },
  {
    id: 'soft',
    nazwa: 'Soft',
    opis: 'Łagodniejsza jasna paleta o mniejszej ostrości wizualnej.',
    motyw: 'jasny',
    paleta: PALETA_SOFT,
  },
]

export const DOMYSLNA_PERSONALIZACJA: PersonalizacjaUI = {
  preset: 'bazowy',
  uzyjWlasnejPalety: false,
  paleta: PALETA_DARK,
  interakcje: {
    autoStany: true,
    hoverPoziom: 'normalny',
    hoverJasnosc: 1.04,
    hoverKrycie: 1,
    hoverSkala: 1,
    hoverPrzesuniecieY: 0,
    hoverCien: 0,
    hoverObramowanie: 35,
    activePoziom: 'normalny',
    activeJasnosc: 0.96,
    activeKrycie: 1,
    activeSkala: 0.98,
    activePrzesuniecieY: 1,
    activeCien: 0,
    selectedPoziom: 'normalny',
    selectedIntensywnosc: 16,
    selectedObramowanie: 48,
    selectedGlow: 0,
    focusPoziom: 'standardowy',
    focusGrubosc: 3,
    focusKrycie: 58,
    disabledKrycie: 48,
  },
  animacje: {
    profil: 'standardowe',
    hoverMs: 160,
    activeMs: 80,
    modalMs: 180,
    dropdownMs: 150,
    tooltipMs: 120,
    pageMs: 180,
    kartaMs: 180,
    dragMs: 140,
    easing: 'ease',
    animujHover: true,
    animujPrzyciski: true,
    animujKarty: true,
    animujDropdowny: true,
    animujModale: true,
    animujZakladki: true,
    animujPanele: true,
    animujPojawianie: true,
  },
  komponenty: {
    obramowanie: 'standardowe',
    glebia: 'lekko-podniesiona',
    kartaCien: 'lekki',
    kartaObramowanie: 1,
    kartaHoverUniesienie: 0,
    przyciskObramowanie: 1,
    poleObramowanie: 1,
    sidebarPromien: 7,
    timelinePromien: 8,
    timelinePrzezroczystosc: 100,
    timelineLiniaPx: 1,
    miniaturaRozmiar: 44,
  },
  motywyWlasne: [],
}

const PROFILE_RUCHU: Record<Exclude<ProfilRuchu, 'wlasne'>, Partial<AnimacjePersonalizacji>> = {
  wylaczone: { hoverMs: 0, activeMs: 0, modalMs: 0, dropdownMs: 0, tooltipMs: 0, pageMs: 0, kartaMs: 0, dragMs: 0, easing: 'linear' },
  minimalne: { hoverMs: 90, activeMs: 60, modalMs: 120, dropdownMs: 100, tooltipMs: 80, pageMs: 120, kartaMs: 110, dragMs: 90, easing: 'ease-out' },
  standardowe: { hoverMs: 160, activeMs: 80, modalMs: 180, dropdownMs: 150, tooltipMs: 120, pageMs: 180, kartaMs: 180, dragMs: 140, easing: 'ease' },
  plynne: { hoverMs: 220, activeMs: 100, modalMs: 260, dropdownMs: 210, tooltipMs: 160, pageMs: 240, kartaMs: 240, dragMs: 190, easing: 'cubic-bezier(.2,.8,.2,1)' },
  dynamiczne: { hoverMs: 120, activeMs: 60, modalMs: 160, dropdownMs: 120, tooltipMs: 90, pageMs: 160, kartaMs: 150, dragMs: 110, easing: 'cubic-bezier(.2,.9,.25,1.15)' },
}

const PROFILE_HOVER: Record<Exclude<PoziomHover, 'wlasny'>, Partial<InterakcjePersonalizacji>> = {
  wylaczony: { hoverJasnosc: 1, hoverKrycie: 1, hoverSkala: 1, hoverPrzesuniecieY: 0, hoverCien: 0, hoverObramowanie: 0 },
  subtelny: { hoverJasnosc: 1.02, hoverKrycie: 1, hoverSkala: 1, hoverPrzesuniecieY: 0, hoverCien: 0, hoverObramowanie: 22 },
  normalny: { hoverJasnosc: 1.04, hoverKrycie: 1, hoverSkala: 1, hoverPrzesuniecieY: 0, hoverCien: 0, hoverObramowanie: 35 },
  wyrazny: { hoverJasnosc: 1.08, hoverKrycie: 1, hoverSkala: 1.01, hoverPrzesuniecieY: -1, hoverCien: 10, hoverObramowanie: 58 },
}

const PROFILE_ACTIVE: Record<Exclude<PoziomReakcji, 'wlasny'>, Partial<InterakcjePersonalizacji>> = {
  subtelny: { activeJasnosc: 0.98, activeKrycie: 1, activeSkala: 0.99, activePrzesuniecieY: 0, activeCien: 0 },
  normalny: { activeJasnosc: 0.96, activeKrycie: 1, activeSkala: 0.98, activePrzesuniecieY: 1, activeCien: 0 },
  wyrazny: { activeJasnosc: 0.91, activeKrycie: 1, activeSkala: 0.96, activePrzesuniecieY: 2, activeCien: 5 },
}

const PROFILE_SELECTED: Record<Exclude<PoziomReakcji, 'wlasny'>, Partial<InterakcjePersonalizacji>> = {
  subtelny: { selectedIntensywnosc: 9, selectedObramowanie: 30, selectedGlow: 0 },
  normalny: { selectedIntensywnosc: 16, selectedObramowanie: 48, selectedGlow: 0 },
  wyrazny: { selectedIntensywnosc: 25, selectedObramowanie: 72, selectedGlow: 10 },
}

const PROFILE_FOCUS: Record<Exclude<PoziomFocus, 'wlasny'>, Partial<InterakcjePersonalizacji>> = {
  subtelny: { focusGrubosc: 2, focusKrycie: 46 },
  standardowy: { focusGrubosc: 3, focusKrycie: 58 },
  wyrazny: { focusGrubosc: 4, focusKrycie: 78 },
}

function rekord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function tekst(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function maPole(source: Record<string, unknown>, pola: string[]): boolean {
  return pola.some((pole) => Object.prototype.hasOwnProperty.call(source, pole))
}

function kolor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

function normalizujPalete(value: unknown): PaletaPersonalizacji {
  const source = rekord(value)
  const d = DOMYSLNA_PERSONALIZACJA.paleta
  const out = {} as PaletaPersonalizacji
  for (const key of Object.keys(d) as (keyof PaletaPersonalizacji)[]) {
    out[key] = kolor(source[key], d[key])
  }
  return out
}

function normalizujInterakcje(value: unknown): InterakcjePersonalizacji {
  const source = rekord(value)
  const d = DOMYSLNA_PERSONALIZACJA.interakcje
  const starszyHover = source.hoverPoziom === undefined && maPole(source, ['hoverJasnosc', 'hoverSkala', 'hoverPrzesuniecieY'])
  const starszyActive = source.activePoziom === undefined && maPole(source, ['activeSkala', 'activePrzesuniecieY'])
  const starszySelected = source.selectedPoziom === undefined && maPole(source, ['selectedGlow'])
  const starszyFocus = source.focusPoziom === undefined && maPole(source, ['focusGrubosc'])
  return {
    autoStany: bool(source.autoStany, d.autoStany),
    hoverPoziom: starszyHover ? 'wlasny' : enumValue(source.hoverPoziom, ['wylaczony', 'subtelny', 'normalny', 'wyrazny', 'wlasny'], d.hoverPoziom),
    hoverJasnosc: num(source.hoverJasnosc, 0.8, 1.3, d.hoverJasnosc),
    hoverKrycie: num(source.hoverKrycie, 0.65, 1, d.hoverKrycie),
    hoverSkala: num(source.hoverSkala, 0.94, 1.08, d.hoverSkala),
    hoverPrzesuniecieY: num(source.hoverPrzesuniecieY, -8, 8, d.hoverPrzesuniecieY),
    hoverCien: num(source.hoverCien, 0, 24, d.hoverCien),
    hoverObramowanie: num(source.hoverObramowanie, 0, 100, d.hoverObramowanie),
    activePoziom: starszyActive ? 'wlasny' : enumValue(source.activePoziom, ['subtelny', 'normalny', 'wyrazny', 'wlasny'], d.activePoziom),
    activeJasnosc: num(source.activeJasnosc, 0.75, 1.1, d.activeJasnosc),
    activeKrycie: num(source.activeKrycie, 0.65, 1, d.activeKrycie),
    activeSkala: num(source.activeSkala, 0.9, 1.04, d.activeSkala),
    activePrzesuniecieY: num(source.activePrzesuniecieY, -4, 6, d.activePrzesuniecieY),
    activeCien: num(source.activeCien, 0, 18, d.activeCien),
    selectedPoziom: starszySelected ? 'wlasny' : enumValue(source.selectedPoziom, ['subtelny', 'normalny', 'wyrazny', 'wlasny'], d.selectedPoziom),
    selectedIntensywnosc: num(source.selectedIntensywnosc, 6, 40, d.selectedIntensywnosc),
    selectedObramowanie: num(source.selectedObramowanie, 20, 100, d.selectedObramowanie),
    selectedGlow: num(source.selectedGlow, 0, 32, d.selectedGlow),
    focusPoziom: starszyFocus ? 'wlasny' : enumValue(source.focusPoziom, ['subtelny', 'standardowy', 'wyrazny', 'wlasny'], d.focusPoziom),
    focusGrubosc: num(source.focusGrubosc, 1, 6, d.focusGrubosc),
    focusKrycie: num(source.focusKrycie, 35, 100, d.focusKrycie),
    disabledKrycie: num(source.disabledKrycie, 30, 75, d.disabledKrycie),
  }
}

function normalizujAnimacje(value: unknown): AnimacjePersonalizacji {
  const source = rekord(value)
  const d = DOMYSLNA_PERSONALIZACJA.animacje
  return {
    profil: enumValue(source.profil, ['wylaczone', 'minimalne', 'standardowe', 'plynne', 'dynamiczne', 'wlasne'], d.profil),
    hoverMs: num(source.hoverMs, 0, 1000, d.hoverMs),
    activeMs: num(source.activeMs, 0, 1000, d.activeMs),
    modalMs: num(source.modalMs, 0, 1200, d.modalMs),
    dropdownMs: num(source.dropdownMs, 0, 1000, d.dropdownMs),
    tooltipMs: num(source.tooltipMs, 0, 1000, d.tooltipMs),
    pageMs: num(source.pageMs, 0, 1200, d.pageMs),
    kartaMs: num(source.kartaMs, 0, 1000, d.kartaMs),
    dragMs: num(source.dragMs, 0, 1000, d.dragMs),
    easing: tekst(source.easing, d.easing),
    animujHover: bool(source.animujHover, d.animujHover),
    animujPrzyciski: bool(source.animujPrzyciski, d.animujPrzyciski),
    animujKarty: bool(source.animujKarty, d.animujKarty),
    animujDropdowny: bool(source.animujDropdowny, d.animujDropdowny),
    animujModale: bool(source.animujModale, d.animujModale),
    animujZakladki: bool(source.animujZakladki, d.animujZakladki),
    animujPanele: bool(source.animujPanele, d.animujPanele),
    animujPojawianie: bool(source.animujPojawianie, d.animujPojawianie),
  }
}

function normalizujKomponenty(value: unknown): KomponentyPersonalizacji {
  const source = rekord(value)
  const d = DOMYSLNA_PERSONALIZACJA.komponenty
  return {
    obramowanie: enumValue(source.obramowanie, ['brak', 'subtelne', 'standardowe', 'wyrazne'], d.obramowanie),
    glebia: enumValue(source.glebia, ['plaska', 'lekko-podniesiona', 'przestrzenna'], d.glebia),
    kartaCien: enumValue(source.kartaCien, ['brak', 'lekki', 'sredni', 'mocny'], d.kartaCien),
    kartaObramowanie: num(source.kartaObramowanie, 0, 4, d.kartaObramowanie),
    kartaHoverUniesienie: num(source.kartaHoverUniesienie, 0, 10, d.kartaHoverUniesienie),
    przyciskObramowanie: num(source.przyciskObramowanie, 0, 4, d.przyciskObramowanie),
    poleObramowanie: num(source.poleObramowanie, 0, 4, d.poleObramowanie),
    sidebarPromien: num(source.sidebarPromien, 0, 20, d.sidebarPromien),
    timelinePromien: num(source.timelinePromien, 0, 20, d.timelinePromien),
    timelinePrzezroczystosc: num(source.timelinePrzezroczystosc, 35, 100, d.timelinePrzezroczystosc),
    timelineLiniaPx: num(source.timelineLiniaPx, 1, 5, d.timelineLiniaPx),
    miniaturaRozmiar: num(source.miniaturaRozmiar, 24, 96, d.miniaturaRozmiar),
  }
}

function normalizujMotywyWlasne(value: unknown): MotywWlasny[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): MotywWlasny | null => {
      const source = rekord(item)
      const id = typeof source.id === 'string' ? source.id : ''
      const nazwa = typeof source.nazwa === 'string' ? source.nazwa.trim() : ''
      if (!id || !nazwa) return null
      return {
        id,
        nazwa,
        motyw: enumValue(source.motyw, ['jasny', 'ciemny'], 'ciemny'),
        paleta: normalizujPalete(source.paleta),
        interakcje: normalizujInterakcje(source.interakcje),
        animacje: normalizujAnimacje(source.animacje),
        komponenty: normalizujKomponenty(source.komponenty),
      }
    })
    .filter((item): item is MotywWlasny => item !== null)
    .slice(0, 30)
}

export function normalizujPersonalizacje(value: unknown): PersonalizacjaUI {
  const source = rekord(value)
  const d = DOMYSLNA_PERSONALIZACJA
  const aktywnyMotywId = typeof source.aktywnyMotywId === 'string' && source.aktywnyMotywId
    ? source.aktywnyMotywId
    : undefined
  return {
    preset: enumValue(source.preset, ['bazowy', 'ogarniacz-dark', 'ogarniacz-light', 'midnight', 'oled', 'soft', 'wlasny'], d.preset),
    uzyjWlasnejPalety: bool(source.uzyjWlasnejPalety, d.uzyjWlasnejPalety),
    paleta: normalizujPalete(source.paleta),
    interakcje: normalizujInterakcje(source.interakcje),
    animacje: normalizujAnimacje(source.animacje),
    komponenty: normalizujKomponenty(source.komponenty),
    motywyWlasne: normalizujMotywyWlasne(source.motywyWlasne),
    ...(aktywnyMotywId ? { aktywnyMotywId } : {}),
  }
}

export function przywrocBazowaPersonalizacje(obecna: PersonalizacjaUI): PersonalizacjaUI {
  return {
    ...normalizujPersonalizacje(DOMYSLNA_PERSONALIZACJA),
    motywyWlasne: normalizujPersonalizacje(obecna).motywyWlasne,
  }
}

export function zastosujPresetMotywu(
  obecna: PersonalizacjaUI,
  id: DefinicjaPresetu['id'],
): { motyw: 'jasny' | 'ciemny'; personalizacja: PersonalizacjaUI } {
  const preset = PRESETY_MOTYWOW.find((item) => item.id === id)
  if (!preset) {
    return { motyw: 'ciemny', personalizacja: normalizujPersonalizacje(obecna) }
  }
  return {
    motyw: preset.motyw,
    personalizacja: {
      ...normalizujPersonalizacje(obecna),
      preset: preset.id,
      uzyjWlasnejPalety: true,
      paleta: { ...preset.paleta },
      aktywnyMotywId: undefined,
    },
  }
}

export function zastosujProfilRuchu(
  obecne: AnimacjePersonalizacji,
  profil: ProfilRuchu,
): AnimacjePersonalizacji {
  if (profil === 'wlasne') return { ...obecne, profil }
  return { ...obecne, ...PROFILE_RUCHU[profil], profil }
}

export function zastosujPoziomHover(
  obecne: InterakcjePersonalizacji,
  poziom: PoziomHover,
): InterakcjePersonalizacji {
  if (poziom === 'wlasny') return { ...obecne, hoverPoziom: poziom }
  return { ...obecne, ...PROFILE_HOVER[poziom], hoverPoziom: poziom }
}

export function zastosujPoziomActive(
  obecne: InterakcjePersonalizacji,
  poziom: PoziomReakcji,
): InterakcjePersonalizacji {
  if (poziom === 'wlasny') return { ...obecne, activePoziom: poziom }
  return { ...obecne, ...PROFILE_ACTIVE[poziom], activePoziom: poziom }
}

export function zastosujPoziomSelected(
  obecne: InterakcjePersonalizacji,
  poziom: PoziomReakcji,
): InterakcjePersonalizacji {
  if (poziom === 'wlasny') return { ...obecne, selectedPoziom: poziom }
  return { ...obecne, ...PROFILE_SELECTED[poziom], selectedPoziom: poziom }
}

export function zastosujPoziomFocus(
  obecne: InterakcjePersonalizacji,
  poziom: PoziomFocus,
): InterakcjePersonalizacji {
  if (poziom === 'wlasny') return { ...obecne, focusPoziom: poziom }
  return { ...obecne, ...PROFILE_FOCUS[poziom], focusPoziom: poziom }
}

function rozwiazInterakcje(interakcje: InterakcjePersonalizacji): InterakcjePersonalizacji {
  return {
    ...interakcje,
    ...(interakcje.hoverPoziom === 'wlasny' ? {} : PROFILE_HOVER[interakcje.hoverPoziom]),
    ...(interakcje.activePoziom === 'wlasny' ? {} : PROFILE_ACTIVE[interakcje.activePoziom]),
    ...(interakcje.selectedPoziom === 'wlasny' ? {} : PROFILE_SELECTED[interakcje.selectedPoziom]),
    ...(interakcje.focusPoziom === 'wlasny' ? {} : PROFILE_FOCUS[interakcje.focusPoziom]),
  }
}

export const WERSJA_SCHEMATU_MOTYWU = 2 as const

export interface ZaimportowanyMotyw {
  motyw: 'jasny' | 'ciemny' | 'systemowy'
  personalizacja: PersonalizacjaUI
}

export function normalizujImportMotywu(
  value: unknown,
  motywDomyslny: ZaimportowanyMotyw['motyw'] = 'systemowy',
): ZaimportowanyMotyw {
  const source = rekord(value)
  if (source.format !== 'ogarniacz-theme') throw new Error('Nieprawidłowy format motywu.')
  const wersja = source.wersja === undefined ? 1 : source.wersja
  if (!Number.isInteger(wersja) || Number(wersja) < 1 || Number(wersja) > WERSJA_SCHEMATU_MOTYWU) {
    throw new Error('Nieobsługiwana wersja motywu.')
  }
  if (Object.keys(rekord(source.personalizacja)).length === 0) {
    throw new Error('Brak konfiguracji personalizacji.')
  }
  return {
    motyw: enumValue(source.motyw, ['jasny', 'ciemny', 'systemowy'], motywDomyslny),
    personalizacja: normalizujPersonalizacje(source.personalizacja),
  }
}

function kanalLiniowy(value: number): number {
  const kanal = value / 255
  return kanal <= 0.04045 ? kanal / 12.92 : ((kanal + 0.055) / 1.055) ** 2.4
}

function luminancja(kolorHex: string): number {
  const kolor = kolorHex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((indeks) => kanalLiniowy(Number.parseInt(kolor.slice(indeks, indeks + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function obliczKontrast(kolorA: string, kolorB: string): number {
  const jasniejszy = Math.max(luminancja(kolorA), luminancja(kolorB))
  const ciemniejszy = Math.min(luminancja(kolorA), luminancja(kolorB))
  return (jasniejszy + 0.05) / (ciemniejszy + 0.05)
}

export function wybierzCzytelnyTekst(kolorTla: string): '#ffffff' | '#08130f' {
  return obliczKontrast('#ffffff', kolorTla) >= obliczKontrast('#08130f', kolorTla)
    ? '#ffffff'
    : '#08130f'
}

export interface OcenaKontrastu {
  id: 'tekst-tlo' | 'tekst-panel' | 'przycisk-primary' | 'sidebar'
  etykieta: string
  wspolczynnik: number
  niski: boolean
}

export function ocenKontrastPalety(paleta: PaletaPersonalizacji): OcenaKontrastu[] {
  const pary: { id: OcenaKontrastu['id']; etykieta: string; tekst: string; tlo: string }[] = [
    { id: 'tekst-tlo', etykieta: 'Tekst główny / tło aplikacji', tekst: paleta.tekst, tlo: paleta.tlo },
    { id: 'tekst-panel', etykieta: 'Tekst główny / karta', tekst: paleta.tekst, tlo: paleta.panel },
    { id: 'przycisk-primary', etykieta: 'Tekst przycisku / primary', tekst: wybierzCzytelnyTekst(paleta.akcent), tlo: paleta.akcent },
    { id: 'sidebar', etykieta: 'Tekst menu / tło menu', tekst: paleta.sidebarTekst, tlo: paleta.sidebar },
  ]
  return pary.map((para) => {
    const wspolczynnik = obliczKontrast(para.tekst, para.tlo)
    return { id: para.id, etykieta: para.etykieta, wspolczynnik, niski: wspolczynnik < 4.5 }
  })
}

const KOLORY_CSS: Record<keyof Pick<
  PaletaPersonalizacji,
  | 'tlo'
  | 'panel'
  | 'panel2'
  | 'tekst'
  | 'tekst2'
  | 'obramowanie'
  | 'obramowanieMocne'
  | 'akcent'
  | 'akcentHover'
  | 'akcentJasny'
  | 'sukces'
  | 'sukcesTlo'
  | 'ostrzezenie'
  | 'ostrzezenieTlo'
  | 'blad'
  | 'bladTlo'
  | 'informacja'
  | 'informacjaTlo'
>, string> = {
  tlo: '--tlo',
  panel: '--panel',
  panel2: '--panel-2',
  tekst: '--tekst',
  tekst2: '--tekst-2',
  obramowanie: '--obramowanie',
  obramowanieMocne: '--obramowanie-mocne',
  akcent: '--akcent',
  akcentHover: '--akcent-hover',
  akcentJasny: '--akcent-jasny',
  sukces: '--sukces',
  sukcesTlo: '--sukces-tlo',
  ostrzezenie: '--ostrzezenie',
  ostrzezenieTlo: '--ostrzezenie-tlo',
  blad: '--blad',
  bladTlo: '--blad-tlo',
  informacja: '--informacja',
  informacjaTlo: '--informacja-tlo',
}

const CIENIE = {
  brak: 'none',
  lekki: '0 1px 2px rgb(0 0 0 / 8%), 0 8px 26px rgb(0 0 0 / 6%)',
  sredni: '0 3px 10px rgb(0 0 0 / 13%), 0 14px 34px rgb(0 0 0 / 11%)',
  mocny: '0 8px 22px rgb(0 0 0 / 20%), 0 24px 54px rgb(0 0 0 / 17%)',
} as const

const CIENIE_GLEBI: Record<GlebiaKomponentow, string> = {
  plaska: 'none',
  'lekko-podniesiona': CIENIE.lekki,
  przestrzenna: CIENIE.mocny,
}

const OBRAMOWANIA: Record<PoziomObramowania, string> = {
  brak: 'transparent',
  subtelne: 'color-mix(in srgb, var(--obramowanie) 58%, transparent)',
  standardowe: 'var(--obramowanie)',
  wyrazne: 'var(--obramowanie-mocne)',
}

export function zastosujPersonalizacje(
  value: PersonalizacjaUI,
  root: HTMLElement,
  ograniczRuch: boolean,
): void {
  const p = normalizujPersonalizacje(value)
  const style = root.style
  const interakcje = rozwiazInterakcje(p.interakcje)

  root.dataset.uiHover = p.interakcje.hoverPoziom
  root.dataset.uiActive = p.interakcje.activePoziom
  root.dataset.uiSelected = p.interakcje.selectedPoziom
  root.dataset.uiFocus = p.interakcje.focusPoziom

  if (p.uzyjWlasnejPalety) {
    for (const [key, css] of Object.entries(KOLORY_CSS) as [keyof typeof KOLORY_CSS, string][]) {
      style.setProperty(css, p.paleta[key])
    }
    style.setProperty('--ui-sidebar-bg', p.paleta.sidebar)
    style.setProperty('--akcent-hover', p.interakcje.autoStany
      ? `color-mix(in srgb, ${p.paleta.akcent} 82%, white)`
      : p.paleta.akcentHover)
    style.setProperty('--ui-sidebar-hover', p.interakcje.autoStany
      ? `color-mix(in srgb, ${p.paleta.sidebar} 82%, white)`
      : p.paleta.sidebarHover)
    style.setProperty('--ui-sidebar-active', p.interakcje.autoStany
      ? `color-mix(in srgb, ${p.paleta.sidebar} 62%, ${p.paleta.akcent})`
      : p.paleta.sidebarActive)
    style.setProperty('--ui-sidebar-tekst', p.paleta.sidebarTekst)
    style.setProperty('--ui-focus', p.paleta.focus)
    style.setProperty('--ui-text-on-accent', wybierzCzytelnyTekst(p.paleta.akcent))
    style.setProperty('--ui-text-on-danger', wybierzCzytelnyTekst(p.paleta.blad))
    style.setProperty('--ui-text-on-success', wybierzCzytelnyTekst(p.paleta.sukces))
    style.setProperty('--ui-text-on-warning', wybierzCzytelnyTekst(p.paleta.ostrzezenie))
  } else {
    for (const css of Object.values(KOLORY_CSS)) style.removeProperty(css)
    for (const css of [
      '--ui-sidebar-bg', '--ui-sidebar-hover', '--ui-sidebar-active', '--ui-sidebar-tekst', '--ui-focus',
      '--ui-text-on-accent', '--ui-text-on-danger', '--ui-text-on-success', '--ui-text-on-warning',
    ]) {
      style.removeProperty(css)
    }
  }

  style.setProperty('--modul-zadanie', p.paleta.zadanie)
  style.setProperty('--modul-projekt', p.paleta.projekt)
  style.setProperty('--modul-wizyta', p.paleta.wizyta)
  style.setProperty('--modul-lek', p.paleta.lek)
  style.setProperty('--modul-finanse', p.paleta.finanse)
  style.setProperty('--modul-samochod', p.paleta.samochod)
  style.setProperty('--modul-przypomnienie', p.paleta.przypomnienie)
  style.setProperty('--timeline-linia', p.paleta.timeline)
  style.setProperty('--timeline-teraz', p.paleta.timelineTeraz)

  style.setProperty('--ui-hover-brightness', String(interakcje.hoverJasnosc))
  style.setProperty('--ui-hover-opacity', String(interakcje.hoverKrycie))
  style.setProperty('--ui-hover-scale', String(interakcje.hoverSkala))
  style.setProperty('--ui-hover-y', `${interakcje.hoverPrzesuniecieY}px`)
  style.setProperty('--ui-hover-shadow', interakcje.hoverCien === 0 ? 'none' : `0 ${Math.max(2, interakcje.hoverCien / 2)}px ${interakcje.hoverCien}px rgb(0 0 0 / 18%)`)
  style.setProperty('--ui-card-hover-shadow', interakcje.hoverCien === 0 ? 'var(--ui-card-shadow)' : `0 ${Math.max(2, interakcje.hoverCien / 2)}px ${interakcje.hoverCien}px rgb(0 0 0 / 18%), var(--ui-card-shadow)`)
  style.setProperty('--ui-hover-border', `color-mix(in srgb, var(--akcent) ${interakcje.hoverObramowanie}%, var(--ui-component-border))`)
  style.setProperty('--ui-active-brightness', String(interakcje.activeJasnosc))
  style.setProperty('--ui-active-opacity', String(interakcje.activeKrycie))
  style.setProperty('--ui-active-scale', String(interakcje.activeSkala))
  style.setProperty('--ui-active-y', `${interakcje.activePrzesuniecieY}px`)
  style.setProperty('--ui-active-shadow', interakcje.activeCien === 0 ? 'none' : `inset 0 ${Math.max(1, interakcje.activeCien / 3)}px ${interakcje.activeCien}px rgb(0 0 0 / 22%)`)
  style.setProperty('--ui-selected-surface', `color-mix(in srgb, var(--akcent) ${interakcje.selectedIntensywnosc}%, var(--panel))`)
  style.setProperty('--ui-selected-border', `color-mix(in srgb, var(--akcent) ${interakcje.selectedObramowanie}%, var(--obramowanie))`)
  style.setProperty('--ui-selected-glow', `${interakcje.selectedGlow}px`)
  style.setProperty('--ui-focus-width', `${interakcje.focusGrubosc}px`)
  style.setProperty('--ui-focus-opacity', `${interakcje.focusKrycie}%`)
  style.setProperty('--ui-disabled-opacity', String(interakcje.disabledKrycie / 100))
  style.setProperty('--ui-sidebar-hover-effective', p.interakcje.hoverPoziom === 'wylaczony' ? 'var(--ui-sidebar-bg)' : 'var(--ui-sidebar-hover)')
  style.setProperty('--ui-sidebar-selected-effective', p.interakcje.autoStany
    ? `color-mix(in srgb, var(--akcent) ${interakcje.selectedIntensywnosc}%, var(--ui-sidebar-bg))`
    : 'var(--ui-sidebar-active)')
  style.setProperty('--ui-accent-hover-effective', p.interakcje.hoverPoziom === 'wylaczony' ? 'var(--akcent)' : 'var(--akcent-hover)')

  const ruch0 = ograniczRuch || p.animacje.profil === 'wylaczone'
  root.dataset.uiRuch = ruch0 ? 'wylaczony' : p.animacje.profil
  const duration = (ms: number, wlaczone = true) => `${ruch0 || !wlaczone ? 0 : ms}ms`
  style.setProperty('--ui-hover-ms', duration(p.animacje.hoverMs, p.animacje.animujHover))
  style.setProperty('--ui-button-ms', duration(p.animacje.hoverMs, p.animacje.animujHover && p.animacje.animujPrzyciski))
  style.setProperty('--ui-active-ms', duration(p.animacje.activeMs, p.animacje.animujPrzyciski))
  style.setProperty('--ui-modal-ms', duration(p.animacje.modalMs, p.animacje.animujModale))
  style.setProperty('--ui-dropdown-ms', duration(p.animacje.dropdownMs, p.animacje.animujDropdowny))
  style.setProperty('--ui-tooltip-ms', duration(p.animacje.tooltipMs, p.animacje.animujHover))
  style.setProperty('--ui-page-ms', duration(p.animacje.pageMs, p.animacje.animujPanele))
  style.setProperty('--ui-card-ms', duration(p.animacje.kartaMs, p.animacje.animujKarty))
  style.setProperty('--ui-tab-ms', duration(p.animacje.hoverMs, p.animacje.animujZakladki))
  style.setProperty('--ui-appear-ms', duration(p.animacje.pageMs, p.animacje.animujPojawianie))
  style.setProperty('--ui-drag-ms', duration(p.animacje.dragMs))
  style.setProperty('--ui-easing', p.animacje.easing)
  style.setProperty('--czas-animacji', duration(p.animacje.pageMs, p.animacje.animujPanele))

  style.setProperty('--ui-component-border', OBRAMOWANIA[p.komponenty.obramowanie])
  style.setProperty('--ui-depth-shadow', CIENIE_GLEBI[p.komponenty.glebia])
  style.setProperty('--ui-card-shadow', CIENIE[p.komponenty.kartaCien])
  style.setProperty('--ui-card-border', `${p.komponenty.kartaObramowanie}px`)
  style.setProperty('--ui-card-hover-y', `${p.interakcje.hoverPoziom === 'wylaczony' ? 0 : p.komponenty.kartaHoverUniesienie}px`)
  style.setProperty('--ui-button-border', `${p.komponenty.przyciskObramowanie}px`)
  style.setProperty('--ui-field-border', `${p.komponenty.poleObramowanie}px`)
  style.setProperty('--ui-sidebar-radius', `${p.komponenty.sidebarPromien}px`)
  style.setProperty('--ui-timeline-radius', `${p.komponenty.timelinePromien}px`)
  style.setProperty('--ui-timeline-opacity', String(p.komponenty.timelinePrzezroczystosc / 100))
  style.setProperty('--ui-timeline-line-width', `${p.komponenty.timelineLiniaPx}px`)
  style.setProperty('--ui-thumbnail-size', `${p.komponenty.miniaturaRozmiar}px`)
}
