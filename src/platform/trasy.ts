import type { DaneSzybkiegoDodawania, NazwaModulu, PowiazanieEncji, TypSzybkiegoDodawania } from '../domain/typy'

export interface CelNawigacji {
  sourceRef?: PowiazanieEncji
  route: string
  entityId?: string
}

const SCIEZKI_MODULOW: Record<NazwaModulu, string> = {
  zadania: '/zadania',
  projekty: '/projekty',
  skrzynka: '/skrzynka',
  planer: '/planer',
  grafik: '/grafik',
  nawyki: '/nawyki',
  leki: '/zdrowie/leki',
  wizyty: '/zdrowie/wizyty',
  zdrowie: '/zdrowie',
  skierowania: '/zdrowie/skierowania',
  przypomnienia: '/przypomnienia',
  zakupy: '/zakupy',
  rachunki: '/rachunki',
  miasto: '/miasto',
  miejsca: '/miasto',
  cele: '/cele',
  notatki: '/notatki',
  pomysly: '/pomysly',
  na_pozniej: '/na-pozniej',
  kontakty: '/kontakty',
  dokumenty: '/dokumenty',
  finanse: '/finanse',
  samochod: '/samochod',
  terminy: '/terminy',
  echo: '/echo',
  ustawienia: '/ustawienia',
}

const SCIEZKI_DEEP_LINKOW = new Set([
  '/',
  '/dzisiaj',
  ...Object.values(SCIEZKI_MODULOW),
  '/ustawienia/personalizacja',
  '/dodaj',
])
const DOZWOLONE_PARAMETRY = new Set(['element', 'wystapienie'])
const TYPY_SZYBKIEGO_DODAWANIA = new Set<TypSzybkiegoDodawania>(['zadanie', 'notatka', 'wydarzenie', 'przypomnienie', 'wizyta', 'lek', 'wydatek', 'samochod'])

export function poprawnePowiazanieEncji(wartosc: unknown): wartosc is PowiazanieEncji {
  if (!wartosc || typeof wartosc !== 'object') return false
  const powiazanie = wartosc as Partial<PowiazanieEncji>
  return typeof powiazanie.typ === 'string'
    && powiazanie.typ in SCIEZKI_MODULOW
    && typeof powiazanie.id === 'string'
    && powiazanie.id.length > 0
    && powiazanie.id.length <= 200
}

export function sciezkaDlaCeluNawigacji({ sourceRef, route, entityId }: CelNawigacji): string | null {
  const powiazanie = poprawnePowiazanieEncji(sourceRef) ? sourceRef : undefined
  const sciezka = normalizujSciezke(powiazanie ? SCIEZKI_MODULOW[powiazanie.typ] : route)
  if (!sciezka) return null
  const identyfikator = powiazanie?.id ?? entityId
  const bezpiecznyId = typeof identyfikator === 'string' && identyfikator.length > 0 && identyfikator.length <= 200
    ? identyfikator
    : undefined
  return `${sciezka}${bezpiecznyId ? `?element=${encodeURIComponent(bezpiecznyId)}` : ''}`
}

export function sciezkaDlaSourceRef(sourceRef: PowiazanieEncji | undefined, przypomnienieId: string) {
  return sciezkaDlaCeluNawigacji({ sourceRef, route: '/przypomnienia', entityId: przypomnienieId }) ?? '/przypomnienia'
}

function normalizujSciezke(sciezka: string): string | null {
  try {
    const url = new URL(sciezka, 'https://ogarniacz.local')
    if (url.origin !== 'https://ogarniacz.local' || url.hash || url.username || url.password || url.port) return null
    const znormalizowanaSciezka = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname
    if (!SCIEZKI_DEEP_LINKOW.has(znormalizowanaSciezka)) return null

    for (const [nazwa, wartosc] of url.searchParams) {
      const dozwolony = znormalizowanaSciezka === '/dodaj'
        ? (nazwa === 'typ' && TYPY_SZYBKIEGO_DODAWANIA.has(wartosc as TypSzybkiegoDodawania)) || (nazwa === 'tekst' && wartosc.length <= 10_000)
        : DOZWOLONE_PARAMETRY.has(nazwa) && wartosc.length <= 200
      if (!dozwolony || !wartosc || url.searchParams.getAll(nazwa).length !== 1) return null
    }

    const parametry = url.searchParams.toString()
    return `${znormalizowanaSciezka}${parametry ? `?${parametry}` : ''}`
  } catch {
    return null
  }
}

export function daneSzybkiegoDodawaniaZeSciezki(sciezka: string): DaneSzybkiegoDodawania | null {
  const znormalizowana = normalizujSciezke(sciezka)
  if (!znormalizowana) return null
  const url = new URL(znormalizowana, 'https://ogarniacz.local')
  if (url.pathname !== '/dodaj') return null
  const typ = url.searchParams.get('typ')
  return {
    ...(typ ? { typ: typ as TypSzybkiegoDodawania } : {}),
    ...(url.searchParams.get('tekst') ? { tresc: url.searchParams.get('tekst')! } : {}),
  }
}

export function normalizujSciezkePowiadomienia(sciezka: string): string | null {
  return normalizujSciezke(sciezka)
}

export function parsujDeepLink(adres: string): string | null {
  try {
    const url = new URL(adres)
    if (url.protocol !== 'ogarniacz:' || url.username || url.password || url.port || url.hash) return null

    if (url.hostname === 'pulpit' && url.pathname && url.pathname !== '/') return null
    const sciezka = url.hostname === 'pulpit'
      ? '/'
      : url.hostname
        ? `/${url.hostname}${url.pathname}`
        : url.pathname
    return normalizujSciezke(`${sciezka}${url.search}`)
  } catch {
    return null
  }
}
