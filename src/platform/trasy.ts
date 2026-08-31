import type { NazwaModulu, PowiazanieEncji } from '../domain/typy'

const SCIEZKI_MODULOW: Record<NazwaModulu, string> = {
  zadania: '/zadania',
  projekty: '/projekty',
  skrzynka: '/skrzynka',
  planer: '/planer',
  grafik: '/grafik',
  nawyki: '/nawyki',
  leki: '/leki',
  wizyty: '/wizyty',
  przypomnienia: '/przypomnienia',
  zakupy: '/zakupy',
  rachunki: '/rachunki',
  miasto: '/miasto',
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
  ...Object.values(SCIEZKI_MODULOW),
  '/ustawienia/personalizacja',
])
const DOZWOLONE_PARAMETRY = new Set(['element', 'wystapienie'])

export function sciezkaDlaSourceRef(sourceRef: PowiazanieEncji | undefined, przypomnienieId: string) {
  const bezpiecznyIdPrzypomnienia = typeof przypomnienieId === 'string' && przypomnienieId.length > 0 && przypomnienieId.length <= 200
    ? przypomnienieId
    : undefined
  if (!sourceRef || !SCIEZKI_MODULOW[sourceRef.typ] || typeof sourceRef.id !== 'string' || sourceRef.id.length === 0 || sourceRef.id.length > 200) {
    return bezpiecznyIdPrzypomnienia ? `/przypomnienia?element=${encodeURIComponent(bezpiecznyIdPrzypomnienia)}` : '/przypomnienia'
  }
  return `${SCIEZKI_MODULOW[sourceRef.typ]}?element=${encodeURIComponent(sourceRef.id)}`
}

function normalizujSciezke(sciezka: string): string | null {
  try {
    const url = new URL(sciezka, 'https://ogarniacz.local')
    if (url.origin !== 'https://ogarniacz.local' || url.hash || url.username || url.password || url.port) return null
    const znormalizowanaSciezka = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname
    if (!SCIEZKI_DEEP_LINKOW.has(znormalizowanaSciezka)) return null

    for (const [nazwa, wartosc] of url.searchParams) {
      if (!DOZWOLONE_PARAMETRY.has(nazwa) || !wartosc || wartosc.length > 200 || url.searchParams.getAll(nazwa).length !== 1) return null
    }

    const parametry = url.searchParams.toString()
    return `${znormalizowanaSciezka}${parametry ? `?${parametry}` : ''}`
  } catch {
    return null
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
