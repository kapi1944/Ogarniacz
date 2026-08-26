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
  hoverJasnosc: number
  hoverSkala: number
  hoverPrzesuniecieY: number
  activeSkala: number
  activePrzesuniecieY: number
  selectedGlow: number
  focusGrubosc: number
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
}

export interface KomponentyPersonalizacji {
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
    hoverJasnosc: 1.04,
    hoverSkala: 1,
    hoverPrzesuniecieY: 0,
    activeSkala: 0.98,
    activePrzesuniecieY: 1,
    selectedGlow: 0,
    focusGrubosc: 3,
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
  },
  komponenty: {
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
  return {
    autoStany: bool(source.autoStany, d.autoStany),
    hoverJasnosc: num(source.hoverJasnosc, 0.8, 1.3, d.hoverJasnosc),
    hoverSkala: num(source.hoverSkala, 0.94, 1.08, d.hoverSkala),
    hoverPrzesuniecieY: num(source.hoverPrzesuniecieY, -8, 8, d.hoverPrzesuniecieY),
    activeSkala: num(source.activeSkala, 0.9, 1.04, d.activeSkala),
    activePrzesuniecieY: num(source.activePrzesuniecieY, -4, 6, d.activePrzesuniecieY),
    selectedGlow: num(source.selectedGlow, 0, 32, d.selectedGlow),
    focusGrubosc: num(source.focusGrubosc, 1, 6, d.focusGrubosc),
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
  }
}

function normalizujKomponenty(value: unknown): KomponentyPersonalizacji {
  const source = rekord(value)
  const d = DOMYSLNA_PERSONALIZACJA.komponenty
  return {
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

export function zastosujPersonalizacje(
  value: PersonalizacjaUI,
  root: HTMLElement,
  ograniczRuch: boolean,
): void {
  const p = normalizujPersonalizacje(value)
  const style = root.style

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
  } else {
    for (const css of Object.values(KOLORY_CSS)) style.removeProperty(css)
    for (const css of ['--ui-sidebar-bg', '--ui-sidebar-hover', '--ui-sidebar-active', '--ui-sidebar-tekst', '--ui-focus']) {
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

  style.setProperty('--ui-hover-brightness', String(p.interakcje.hoverJasnosc))
  style.setProperty('--ui-hover-scale', String(p.interakcje.hoverSkala))
  style.setProperty('--ui-hover-y', `${p.interakcje.hoverPrzesuniecieY}px`)
  style.setProperty('--ui-active-scale', String(p.interakcje.activeSkala))
  style.setProperty('--ui-active-y', `${p.interakcje.activePrzesuniecieY}px`)
  style.setProperty('--ui-selected-glow', `${p.interakcje.selectedGlow}px`)
  style.setProperty('--ui-focus-width', `${p.interakcje.focusGrubosc}px`)

  const ruch0 = ograniczRuch || p.animacje.profil === 'wylaczone'
  const duration = (ms: number) => `${ruch0 ? 0 : ms}ms`
  style.setProperty('--ui-hover-ms', duration(p.animacje.hoverMs))
  style.setProperty('--ui-active-ms', duration(p.animacje.activeMs))
  style.setProperty('--ui-modal-ms', duration(p.animacje.modalMs))
  style.setProperty('--ui-dropdown-ms', duration(p.animacje.dropdownMs))
  style.setProperty('--ui-tooltip-ms', duration(p.animacje.tooltipMs))
  style.setProperty('--ui-page-ms', duration(p.animacje.pageMs))
  style.setProperty('--ui-card-ms', duration(p.animacje.kartaMs))
  style.setProperty('--ui-drag-ms', duration(p.animacje.dragMs))
  style.setProperty('--ui-easing', p.animacje.easing)
  style.setProperty('--czas-animacji', duration(p.animacje.hoverMs))

  style.setProperty('--ui-card-shadow', CIENIE[p.komponenty.kartaCien])
  style.setProperty('--ui-card-border', `${p.komponenty.kartaObramowanie}px`)
  style.setProperty('--ui-card-hover-y', `${p.komponenty.kartaHoverUniesienie}px`)
  style.setProperty('--ui-button-border', `${p.komponenty.przyciskObramowanie}px`)
  style.setProperty('--ui-field-border', `${p.komponenty.poleObramowanie}px`)
  style.setProperty('--ui-sidebar-radius', `${p.komponenty.sidebarPromien}px`)
  style.setProperty('--ui-timeline-radius', `${p.komponenty.timelinePromien}px`)
  style.setProperty('--ui-timeline-opacity', String(p.komponenty.timelinePrzezroczystosc / 100))
  style.setProperty('--ui-timeline-line-width', `${p.komponenty.timelineLiniaPx}px`)
  style.setProperty('--ui-thumbnail-size', `${p.komponenty.miniaturaRozmiar}px`)
}
