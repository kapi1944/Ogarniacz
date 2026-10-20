import { z } from 'zod'

const repozytorium = 'kapi1944/Ogarniacz'
const galaz = 'main'
const kluczPamieci = 'ogarniacz.multimedia.katalog.v1'
const maksymalnyKatalog = 2 * 1024 * 1024
export const maksymalnyPlik = 32 * 1024 * 1024

function czyBezpiecznaSciezka(sciezka: string, czyPodglad = false) {
  const segmenty = sciezka.split('/')
  return !Array.from(sciezka).some((znak) => znak === '\\' || znak.charCodeAt(0) < 32 || znak.charCodeAt(0) === 127)
    && segmenty.every((segment) => segment && segment !== '.' && segment !== '..')
    && (sciezka.startsWith('multimedia/') || sciezka.startsWith('assets/branding/') || czyPodglad && sciezka.startsWith('public/'))
}

const sciezkaMaterialu = z.string().max(500).refine((sciezka) => czyBezpiecznaSciezka(sciezka))
const sciezkaPodgladu = z.string().max(500).refine((sciezka) => czyBezpiecznaSciezka(sciezka, true) && /\.(png|ico|jpe?g|webp|gif)$/i.test(sciezka))
const opis = z.string().max(2000)
const schematMaterialu = z.object({
  id: z.string().min(1).max(100), nazwa: z.string().min(1).max(250), opis,
  kategoria: z.string().min(1).max(100),
  status: z.enum(['OFICJALNE', 'PROMOCYJNE', 'ALTERNATYWNE', 'ARCHIWALNE', 'ROBOCZE']),
  przeznaczenie: opis, wykorzystanie: z.array(opis).max(50), wymagaKlasyfikacji: z.boolean(),
  sciezka: sciezkaMaterialu, mime: z.string().max(100).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i),
  rozmiarBajtow: z.number().int().min(1).max(1024 * 1024 * 1024),
  rozdzielczosc: z.object({ szerokosc: z.number().int().positive(), wysokosc: z.number().int().positive() }).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  walidacja: z.object({ status: z.enum(['poprawny', 'ostrzezenie']), uwagi: z.array(opis).max(20) }),
  sciezkaMiniatury: sciezkaPodgladu.optional(), sciezkaPodgladu: sciezkaPodgladu.optional(),
})
const schematKatalogu = z.object({
  format: z.literal('ogarniacz-multimedia'), wersja: z.literal(1), materialy: z.array(schematMaterialu).max(1000),
}).refine(({ materialy }) => new Set(materialy.map((material) => material.id)).size === materialy.length
  && new Set(materialy.map((material) => material.sciezka)).size === materialy.length)

export type MaterialMultimedialny = z.infer<typeof schematMaterialu>
export type KatalogMultimediow = z.infer<typeof schematKatalogu>
export const etykietyStatusow: Record<MaterialMultimedialny['status'], string> = {
  OFICJALNE: 'Oficjalne', PROMOCYJNE: 'Promocyjne', ALTERNATYWNE: 'Alternatywne', ARCHIWALNE: 'Archiwalne', ROBOCZE: 'Robocze',
}

export function adresMaterialu(sciezka: string, zrodlo: 'raw' | 'github' = 'raw', wersja?: string) {
  if (!czyBezpiecznaSciezka(sciezka, true)) throw new Error('Nieprawidłowa ścieżka materiału.')
  const zakodowana = sciezka.split('/').map(encodeURIComponent).join('/')
  return zrodlo === 'raw'
    ? `https://raw.githubusercontent.com/${repozytorium}/${galaz}/${zakodowana}${wersja ? `?wersja=${encodeURIComponent(wersja)}` : ''}`
    : `https://github.com/${repozytorium}/blob/${galaz}/${zakodowana}`
}
export const adresKatalogu = adresMaterialu('multimedia/katalog.json')

export function parsujKatalog(dane: unknown): KatalogMultimediow {
  const wynik = schematKatalogu.safeParse(dane)
  if (!wynik.success) throw new Error('Katalog multimediów ma nieprawidłowy lub nieobsługiwany format.')
  return wynik.data
}

export function odczytajZapamietanyKatalog(): { katalog: KatalogMultimediow; zapisanoAt: string } | undefined {
  try {
    const dane = localStorage.getItem(kluczPamieci)
    if (!dane || dane.length > maksymalnyKatalog) return undefined
    const wpis = JSON.parse(dane)
    if (typeof wpis.zapisanoAt !== 'string' || !Number.isFinite(Date.parse(wpis.zapisanoAt))) return undefined
    return { katalog: parsujKatalog(wpis.katalog), zapisanoAt: wpis.zapisanoAt }
  } catch { return undefined }
}

async function pobierzBajty(adres: string, limit: number, sygnal?: AbortSignal) {
  const kontroler = new AbortController()
  const przerwij = () => kontroler.abort()
  const czas = window.setTimeout(przerwij, 60_000)
  sygnal?.addEventListener('abort', przerwij, { once: true })
  if (sygnal?.aborted) kontroler.abort()
  try {
    const odpowiedz = await fetch(adres, { signal: kontroler.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
    if (!odpowiedz.ok) throw new Error(`GitHub zwrócił błąd (${odpowiedz.status}).`)
    if (Number(odpowiedz.headers.get('content-length')) > limit) throw new Error('Plik przekracza dopuszczalny rozmiar.')
    const czytnik = odpowiedz.body?.getReader()
    if (!czytnik) throw new Error('Nie można odczytać odpowiedzi GitHub.')
    const fragmenty: Uint8Array[] = []
    let rozmiar = 0
    try {
      while (true) {
        const { done: koniec, value: fragment } = await czytnik.read()
        if (koniec) break
        rozmiar += fragment.byteLength
        if (rozmiar > limit) throw new Error('Plik przekracza dopuszczalny rozmiar.')
        fragmenty.push(fragment)
      }
    } finally { await czytnik.cancel().catch(() => undefined) }
    const bajty = new Uint8Array(rozmiar)
    let pozycja = 0
    for (const fragment of fragmenty) { bajty.set(fragment, pozycja); pozycja += fragment.length }
    return bajty
  } finally {
    window.clearTimeout(czas)
    sygnal?.removeEventListener('abort', przerwij)
  }
}

export async function pobierzKatalog(sygnal?: AbortSignal) {
  const bajty = await pobierzBajty(`${adresKatalogu}?odswiezenie=${Date.now()}`, maksymalnyKatalog, sygnal)
  const katalog = parsujKatalog(JSON.parse(new TextDecoder().decode(bajty)))
  const zapisanoAt = new Date().toISOString()
  let zapamietano = true
  try { localStorage.setItem(kluczPamieci, JSON.stringify({ katalog, zapisanoAt })) } catch { zapamietano = false }
  return { katalog, zapisanoAt, zapamietano }
}

export async function pobierzOryginal(material: MaterialMultimedialny): Promise<Blob> {
  if (material.rozmiarBajtow > maksymalnyPlik) throw new Error('Pobieranie w aplikacji obsługuje pliki do 32 MiB. Otwórz źródło na GitHub, aby pobrać większy plik.')
  const bajty = await pobierzBajty(adresMaterialu(material.sciezka, 'raw', material.sha256), Math.min(maksymalnyPlik, material.rozmiarBajtow))
  const { sha256 } = await import('@noble/hashes/sha2.js')
  const skrot = Array.from(sha256(bajty), (bajt) => bajt.toString(16).padStart(2, '0')).join('')
  if (bajty.length !== material.rozmiarBajtow || skrot !== material.sha256) throw new Error('Plik nie zgadza się z katalogiem. Odśwież bibliotekę i spróbuj ponownie.')
  return new Blob([bajty], { type: material.mime })
}

export function filtrujMaterialy(materialy: MaterialMultimedialny[], fraza: string, kategoria: string, status: string) {
  const szukana = fraza.trim().normalize('NFC').toLocaleLowerCase('pl-PL')
  return materialy.filter((material) => (!kategoria || material.kategoria === kategoria) && (!status || material.status === status)
    && `${material.nazwa} ${material.opis} ${material.przeznaczenie} ${material.sciezka} ${material.wykorzystanie.join(' ')}`.normalize('NFC').toLocaleLowerCase('pl-PL').includes(szukana))
}
