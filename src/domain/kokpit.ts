import { z } from 'zod'

export const profileKokpitu = {
  pion: 'Telefon pionowo', poziom: 'Telefon poziomo', tablet: 'Tablet', komputer: 'Monitor', prezentacja: 'Ekran prezentacyjny',
}
export type ProfilKokpitu = keyof typeof profileKokpitu
export const widokiKokpitu = { plansze: 'Widok plansz', ciagly: 'Widok ciągły' }
export type TrybKokpitu = 'publiczny' | 'prywatny'

const calkowita = (min: number, max: number) => z.number().int().min(min).max(max)
const kolor = z.string().regex(/^#[0-9a-f]{6}$/i)
const tekst = z.string().trim().min(1).max(80)
const schematWidoku = z.enum(['plansze', 'ciagly'])
const schematTrybu = z.enum(['publiczny', 'prywatny'])
const schematBloku = z.object({
  id: tekst, typ: tekst,
  x: calkowita(0, 15), y: calkowita(0, 11), szerokosc: calkowita(1, 16), wysokosc: calkowita(1, 12),
  widocznosc: z.enum(['zawsze', 'publiczny', 'prywatny', 'ukryty']).default('zawsze'),
  filtr: z.enum(['dzisiaj', 'zalegle', 'priorytet']).default('dzisiaj'),
  skrot: z.enum(['zadania', 'planer', 'echo', 'terminy', 'finanse', 'przypomnienia']).default('zadania'),
  wyglad: z.object({
    tlo: kolor, tekst: kolor, obramowanie: kolor, jasnosc: calkowita(25, 175),
    krycie: calkowita(0, 100), krycieRamki: calkowita(0, 100),
    tytul: calkowita(12, 40), wartosc: calkowita(16, 120), opis: calkowita(12, 36),
    grubosc: calkowita(0, 8), promien: calkowita(0, 40), odstep: calkowita(0, 32),
    wyrownanie: z.enum(['left', 'center', 'right']), pokazTytul: z.boolean(),
  }).partial().default({}),
})
const schematPlanszy = z.object({
  id: tekst, nazwa: tekst, ikona: z.enum(['◈', '⌂', '☀', '◷', '★', '▦']),
  kolumny: calkowita(2, 16), wiersze: calkowita(1, 12), odstep: calkowita(0, 24),
  bloki: z.array(schematBloku).max(192),
})
const schematProfilu = z.object({
  plansze: z.array(schematPlanszy).min(1).max(20),
  sekcje: z.array(schematPlanszy).min(1).max(20),
  wysokosc: z.enum(['auto', 'procent', 'pelna', 'piksele']), wysokoscProcent: calkowita(25, 100), wysokoscPx: calkowita(160, 1800),
})
const godzina = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const schematKokpitu = z.object({
  wersja: z.literal(1), id: tekst, wlasciciel: tekst.optional(),
  start: z.enum(['plansze', 'ciagly', 'ostatni']), ostatni: schematWidoku,
  profile: z.partialRecord(z.enum(['pion', 'poziom', 'tablet', 'komputer', 'prezentacja']), schematProfilu),
  pasek: z.enum(['zawsze', 'auto', 'ukryty']), stylPaska: z.enum(['numery', 'ikony', 'nazwy']),
  ukryjPo: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
  interwal: z.union([z.literal(0), calkowita(10, 600)]),
  immersja: z.boolean(),
  prywatnyWPracy: z.boolean(),
  harmonogram: z.array(z.object({
    id: tekst, dni: z.array(calkowita(0, 6)).min(1).max(7), od: godzina, do: godzina, tryb: schematTrybu,
  })).max(64),
  ambient: z.object({
    wlaczony: z.boolean(), sekundy: calkowita(10, 3600), przyciemnienie: calkowita(0, 80), przesuwaj: z.boolean(),
    bloki: z.array(z.enum(['zegar', 'data', 'pogoda', 'kalendarz'])).max(4),
  }),
})

export type KonfiguracjaKokpitu = z.infer<typeof schematKokpitu>
export type UkladKokpitu = z.infer<typeof schematProfilu>
export type PlanszaKokpitu = z.infer<typeof schematPlanszy>
export type BlokKokpitu = z.infer<typeof schematBloku>

export const domyslnyKokpit: KonfiguracjaKokpitu = {
  wersja: 1, id: 'kokpit', start: 'plansze', ostatni: 'plansze', profile: {},
  pasek: 'zawsze', stylPaska: 'nazwy', ukryjPo: 5, interwal: 0, immersja: false,
  prywatnyWPracy: false, harmonogram: [],
  ambient: { wlaczony: false, sekundy: 60, przyciemnienie: 35, przesuwaj: false, bloki: ['zegar', 'data'] },
}

export const katalogBlokow = {
  zegar: { nazwa: 'Zegar', ikona: '◷', kategoria: 'Prezentacja', minimum: [2, 1] },
  data: { nazwa: 'Data', ikona: '◈', kategoria: 'Prezentacja', minimum: [2, 1] },
  pogoda: { nazwa: 'Pogoda', ikona: '☀', kategoria: 'Prezentacja', minimum: [2, 1] },
  plan: { nazwa: 'Plan dnia', ikona: '▦', kategoria: 'Organizacja', minimum: [2, 1], modul: 'planer' },
  zadania: { nazwa: 'Zadania', ikona: '✓', kategoria: 'Organizacja', minimum: [2, 1], modul: 'zadania' },
  kalendarz: { nazwa: 'Kalendarz', ikona: '▦', kategoria: 'Organizacja', minimum: [2, 1], modul: 'terminy' },
  przypomnienia: { nazwa: 'Przypomnienia', ikona: '◷', kategoria: 'Organizacja', minimum: [2, 1], modul: 'przypomnienia' },
  finanse: { nazwa: 'Finanse', ikona: '◈', kategoria: 'Organizacja', minimum: [2, 1], modul: 'finanse' },
  echo: { nazwa: 'Echo', ikona: '✦', kategoria: 'Sterowanie', minimum: [2, 1], modul: 'echo' },
  polaczenie: { nazwa: 'Połączenie', ikona: '↻', kategoria: 'Sterowanie', minimum: [2, 1] },
  dom: { nazwa: 'Dom', ikona: '⌂', kategoria: 'Sterowanie', minimum: [2, 1] },
  skrot: { nazwa: 'Skrót do modułu', ikona: '↗', kategoria: 'Sterowanie', minimum: [2, 1] },
  akcja: { nazwa: 'Przycisk akcji', ikona: '★', kategoria: 'Sterowanie', minimum: [2, 1] },
} as const
export type TypBlokuKokpitu = keyof typeof katalogBlokow

export function definicjaBloku(typ: string) {
  return Object.hasOwn(katalogBlokow, typ) ? katalogBlokow[typ as TypBlokuKokpitu] : undefined
}

export function nowyBlok(typ: string, id = crypto.randomUUID() as string): BlokKokpitu {
  const [szerokosc, wysokosc] = definicjaBloku(typ)?.minimum ?? [1, 1]
  return { id, typ, x: 0, y: 0, szerokosc, wysokosc, widocznosc: 'zawsze', filtr: 'dzisiaj', skrot: 'zadania', wyglad: {} }
}

export function domyslnyUklad(profil: ProfilKokpitu): UkladKokpitu {
  const pion = profil === 'pion'
  const poczatek: PlanszaKokpitu = { id: 'start', nazwa: 'Przegląd', ikona: '◈', kolumny: pion ? 4 : 8, wiersze: 4, odstep: 8,
    bloki: [ { ...nowyBlok('zegar', 'zegar'), szerokosc: pion ? 4 : 6, wysokosc: 2 },
      { ...nowyBlok('data', 'data'), x: pion ? 0 : 6, y: pion ? 2 : 0, szerokosc: pion ? 4 : 2, wysokosc: pion ? 1 : 2 },
      { ...nowyBlok('polaczenie', 'polaczenie'), y: pion ? 3 : 2, szerokosc: pion ? 4 : 8, wysokosc: pion ? 1 : 2 } ],
  }
  const organizacja: PlanszaKokpitu = { ...poczatek, id: 'organizacja', nazwa: 'Organizacja', ikona: '▦',
    bloki: ['zadania', 'plan', 'echo', 'dom'].map((typ, numer) => ({
      ...nowyBlok(typ, typ), x: pion ? 0 : (numer % 2) * 4, y: pion ? numer : Math.floor(numer / 2) * 2,
      szerokosc: 4, wysokosc: pion ? 1 : 2,
    })),
  }
  return { plansze: [poczatek, organizacja], sekcje: structuredClone([poczatek, organizacja]), wysokosc: 'auto', wysokoscProcent: 70, wysokoscPx: 520 }
}

export function sprawdzPolozenie(plansza: PlanszaKokpitu, blok: BlokKokpitu): boolean {
  const [szerokosc, wysokosc] = definicjaBloku(blok.typ)?.minimum ?? [1, 1]
  return [blok.x, blok.y, blok.szerokosc, blok.wysokosc].every(Number.isInteger)
    && blok.x >= 0 && blok.y >= 0 && blok.szerokosc >= szerokosc && blok.wysokosc >= wysokosc
    && blok.x + blok.szerokosc <= plansza.kolumny && blok.y + blok.wysokosc <= plansza.wiersze
    && !plansza.bloki.some((inny) => inny.id !== blok.id && blok.x < inny.x + inny.szerokosc
      && blok.x + blok.szerokosc > inny.x && blok.y < inny.y + inny.wysokosc && blok.y + blok.wysokosc > inny.y)
}

export function znajdzMiejsce(plansza: PlanszaKokpitu, blok: BlokKokpitu): BlokKokpitu | undefined {
  for (let y = 0; y <= plansza.wiersze - blok.wysokosc; y++) {
    for (let x = 0; x <= plansza.kolumny - blok.szerokosc; x++) {
      const propozycja = { ...blok, x, y }
      if (sprawdzPolozenie(plansza, propozycja)) return propozycja
    }
  }
}

export function uporzadkujPlansze(plansza: PlanszaKokpitu): PlanszaKokpitu | undefined {
  const nowa = { ...plansza, bloki: [] as BlokKokpitu[] }
  const ustawione = new Map<string, BlokKokpitu>()
  for (const blok of [...plansza.bloki].sort((a, b) => b.szerokosc * b.wysokosc - a.szerokosc * a.wysokosc)) {
    if (ustawione.has(blok.id)) return
    const miejsce = znajdzMiejsce(nowa, blok)
    if (!miejsce) return
    nowa.bloki.push(miejsce)
    ustawione.set(blok.id, miejsce)
  }
  return { ...nowa, bloki: plansza.bloki.map(({ id }) => ustawione.get(id)!) }
}

export function poprawnaPlansza(plansza: PlanszaKokpitu): boolean {
  return new Set(plansza.bloki.map(({ id }) => id)).size === plansza.bloki.length
    && plansza.bloki.every((blok) => sprawdzPolozenie(plansza, blok))
}

export function odczytajKokpit(dane: unknown): KonfiguracjaKokpitu | undefined {
  const wynik = schematKokpitu.safeParse(dane)
  if (!wynik.success) return
  for (const uklad of Object.values(wynik.data.profile)) {
    if (new Set(uklad.plansze.map(({ id }) => id)).size !== uklad.plansze.length
      || new Set(uklad.sekcje.map(({ id }) => id)).size !== uklad.sekcje.length
      || ![...uklad.plansze, ...uklad.sekcje].every(poprawnaPlansza)) return
  }
  return wynik.data
}
