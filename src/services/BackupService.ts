import { sprawdzBiezacyDostep } from './UprawnieniaService'
import { z } from 'zod'
import { schematWaznejInformacjiZdrowotnej } from '../domain/historiaZdrowia'
import { schematWynikuBadania, schematMetadanychMedycznych } from '../domain/badania'
import { baza, nazwyTabel, WERSJA_SCHEMATU_BAZY } from '../data/BazaOgarniacza'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { normalizujUstawienia, WERSJA_USTAWIEN } from '../domain/ustawienia'
import { ROLE_SEMANTYCZNE_REJESTRU } from '../domain/rejestr'
import { schematUstawienSamopoczucia, schematWpisuSamopoczucia } from '../domain/samopoczucie'
import { schematSzczegolowPsychoterapii } from '../domain/psychoterapia'
import type { NazwaTabeli } from '../domain/typy'
import { pobierzInstallationId } from './InstallationService'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'

export const WERSJA_FORMATU_BACKUPU = 3
const NAJNIZSZA_WERSJA_FORMATU_BACKUPU = 1
const WERSJA_APLIKACJI = '1.0.0'
const WSPARTE_WERSJE_SCHEMATU_BACKUPU = [4, 5, 14, 15, 16, 17, 18, WERSJA_SCHEMATU_BAZY]

export const SEKCJE_BACKUPU = [
  { nazwa: 'ustawienia', etykieta: 'Ustawienia' },
  { nazwa: 'zadania', etykieta: 'Zadania i planer' },
  { nazwa: 'notatki', etykieta: 'Notatki' },
  { nazwa: 'poczekalnia', etykieta: 'Poczekalnia' },
  { nazwa: 'leki', etykieta: 'Leki' },
  { nazwa: 'wizyty', etykieta: 'Wizyty' },
  { nazwa: 'zdrowie', etykieta: 'Pozostałe dane zdrowotne' },
  { nazwa: 'wazneInformacjeZdrowotne', etykieta: 'Prywatne ważne informacje zdrowotne' },
  { nazwa: 'badania', etykieta: 'Prywatne wyniki badań' },
  { nazwa: 'samopoczucie', etykieta: 'Prywatny dziennik samopoczucia' },
  { nazwa: 'finanse', etykieta: 'Finanse i rachunki' },
  { nazwa: 'samochod', etykieta: 'Samochód' },
  { nazwa: 'zakupy', etykieta: 'Zakupy' },
  { nazwa: 'dokumenty', etykieta: 'Dokumenty i pliki' },
  { nazwa: 'rejestr', etykieta: 'Definicje pól i widoki rejestru' },
  { nazwa: 'pozostaleDane', etykieta: 'Pozostałe dane i powiązania' },
  { nazwa: 'historia', etykieta: 'Historia ważnych zmian' },
] as const

export type NazwaSekcjiBackupu = (typeof SEKCJE_BACKUPU)[number]['nazwa']
export const PODSTAWOWE_SEKCJE_BACKUPU: NazwaSekcjiBackupu[] = SEKCJE_BACKUPU
  .map(({ nazwa }) => nazwa)
  .filter((nazwa) => nazwa !== 'historia')
export type TypBackupu = 'export' | 'before-restore'
type RekordBackupu = Record<string, unknown>
type DaneSekcji = Record<string, RekordBackupu[]>

export interface ManifestBackupu {
  formatVersion: number
  createdAt: string
  appVersion: string
  dexieSchemaVersion: number
  installationId: string
  backupType: TypBackupu
  sections: NazwaSekcjiBackupu[]
  recordCounts: Partial<Record<NazwaSekcjiBackupu, number>>
  schemaVersions: Partial<Record<NazwaSekcjiBackupu, number>>
  checksum: string
}

export interface OgarniaczBackup {
  manifest: ManifestBackupu
  payload: Partial<Record<NazwaSekcjiBackupu, DaneSekcji>>
}

const LICZBA_ITERACJI_KDF = 600_000
const schematBase64Szyfrowania = z.string().refine((tresc) => tresc.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(tresc))
const schematZaszyfrowanegoBackupu = z.object({
  naglowek: z.object({
    format: z.literal('ogarniacz-backup-szyfrowany'),
    wersja: z.literal(1),
    szyfr: z.literal('AES-256-GCM'),
    kdf: z.object({
      algorytm: z.literal('PBKDF2'),
      hash: z.literal('SHA-256'),
      iteracje: z.literal(LICZBA_ITERACJI_KDF),
      sol: schematBase64Szyfrowania.refine((tresc) => tresc.length === 24),
    }).strict(),
    iv: schematBase64Szyfrowania.refine((tresc) => tresc.length === 16),
  }).strict(),
  szyfrogram: schematBase64Szyfrowania.min(24),
}).strict()

export type ZaszyfrowanyBackup = z.infer<typeof schematZaszyfrowanegoBackupu>

export interface WynikPrzywracania {
  backupPrzedPrzywracaniem: OgarniaczBackup
  przywroconeSekcje: NazwaSekcjiBackupu[]
  liczbaRekordow: number
}

export interface OpcjePrzywracania {
  utworzKopiePrzedPrzywracaniem?: () => Promise<OgarniaczBackup>
  poUtworzeniuKopii?: (backup: OgarniaczBackup) => void | Promise<void>
}

interface DefinicjaSekcji {
  nazwa: NazwaSekcjiBackupu
  wersjaSchematu: number
  tabele: NazwaTabeli[]
  pobierz: () => Promise<DaneSekcji>
}

interface SurowyManifest {
  formatVersion: number
  createdAt: string
  appVersion: string
  dexieSchemaVersion?: number
  installationId?: string
  backupType?: TypBackupu
  sections: string[]
  recordCounts: Record<string, number>
  schemaVersions: Record<string, number>
  checksum: string
}

interface SurowyBackup {
  manifest: SurowyManifest
  payload: Record<string, unknown>
}

const niedozwoloneKlucze = /^(access_?token|refresh_?token|token|secret|sekret|password|haslo|session|sesja|credentials|daneLogowania)$/i
const schematDawki = z.object({ id: z.string(), godzina: z.string(), ilosc: z.number().optional(), instrukcja: z.string().optional() }).passthrough()
const schematWersjiDawkowania = z.object({
  id: z.string().min(1), obowiazujeOd: z.iso.datetime({ offset: true }), zapisanoAt: z.iso.datetime({ offset: true }),
  poczatekNieznany: z.boolean().optional(), poczatekInterwalu: z.iso.datetime({ offset: true }).optional(), notatka: z.string().optional(),
  konfiguracja: z.object({
    dawkaInstrukcja: z.string(), godziny: z.array(z.string()), dawki: z.array(schematDawki).optional(),
    trybDawkowania: z.enum(['konkretne_godziny', 'razy_dziennie', 'co_x_godzin']).optional(),
    liczbaDawekDziennie: z.number().optional(), oknoAktywnosciOd: z.string().optional(), oknoAktywnosciDo: z.string().optional(),
    interwalGodzin: z.number().min(1).optional(), pierwszaGodzina: z.string().optional(),
    jednostka: z.string().optional(), jednostkaLubPostac: z.string().optional(), dniTygodnia: z.array(z.number()).optional(),
    coIleDni: z.number().optional(), dataOd: z.string().optional(), dataDo: z.string().optional(),
    zuzycieNaDawke: z.number().optional(), dodatkoweInstrukcje: z.string().optional(),
  }).passthrough(),
}).passthrough()
const schematHistoriiDawkowania = z.array(schematWersjiDawkowania).min(1).refine((wersje) =>
  new Set(wersje.map((wersja) => wersja.id)).size === wersje.length
  && wersje.every((wersja, indeks) => indeks === 0 || Date.parse(wersja.obowiazujeOd) >= Date.parse(wersje[indeks - 1].obowiazujeOd)), 'Historia schematów ma niepoprawną kolejność lub powtórzone ID.')

const schematEncji = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  usunietoAt: z.string().min(1).optional(),
}).passthrough()
const schematTransportowegoBlobu = z.object({
  __ogarniaczBlob: z.literal(true),
  mimeType: z.string(),
  base64: z.string(),
}).strict()

const schematyTabel: Partial<Record<NazwaTabeli, z.ZodTypeAny>> = {
  wazneInformacjeZdrowotne: schematWaznejInformacjiZdrowotnej,
  wynikiBadan: schematWynikuBadania,
  wpisySamopoczucia: schematWpisuSamopoczucia,
  ustawienia: schematEncji.extend({
    samopoczucie: schematUstawienSamopoczucia.optional(),
    wersja: z.literal(WERSJA_USTAWIEN),
    wyglad: z.record(z.string(), z.unknown()),
    nawigacja: z.record(z.string(), z.unknown()),
    pulpit: z.record(z.string(), z.unknown()),
    harmonogram: z.record(z.string(), z.unknown()),
    zadania: z.record(z.string(), z.unknown()),
  }),
  zadania: schematEncji.extend({
    sesjaTerapiiId: z.string().min(1).optional(),
    tytul: z.string(),
    opis: z.string(),
    status: z.enum(['otwarte', 'w_toku', 'wykonane']),
    priorytet: z.enum(['niski', 'normalny', 'wysoki', 'krytyczny']),
    tagi: z.array(z.string()),
    podzadania: z.array(z.unknown()),
    powiazania: z.array(z.unknown()),
  }),
  notatki: schematEncji.extend({
    tytul: z.string(),
    tresc: z.string(),
    tagi: z.array(z.string()),
    powiazania: z.array(z.unknown()),
  }),
  skrzynka: schematEncji.extend({
    tresc: z.string(),
    zrodlo: z.enum(['tekst', 'glos']),
    status: z.enum(['do_sklasyfikowania', 'nowe', 'przetworzone']),
  }),
  leki: schematEncji.extend({
    historiaDawkowania: schematHistoriiDawkowania.optional(),
    jednostkaZapasu: z.string().nullable().optional(),
    nazwa: z.string(),
    dawkaInstrukcja: z.string(),
    godziny: z.array(z.string()),
    dawki: z.array(z.object({ id: z.string(), godzina: z.string(), ilosc: z.number().optional(), instrukcja: z.string().optional() })).optional(),
    trybDawkowania: z.enum(['konkretne_godziny', 'razy_dziennie', 'co_x_godzin']).optional(),
    liczbaDawekDziennie: z.number().optional(),
    oknoAktywnosciOd: z.string().optional(),
    oknoAktywnosciDo: z.string().optional(),
    interwalGodzin: z.number().optional(),
    pierwszaGodzina: z.string().optional(),
    jednostkaLubPostac: z.string().optional(),
    aktywny: z.boolean(),
  }),
  dziennikLekow: schematEncji.extend({
    wersjaDawkowaniaId: z.string().optional(), planowanaDawka: schematDawki.optional(),
    planowanaJednostka: z.string().optional(), planowanyCzas: z.iso.datetime({ offset: true }).optional(),
    lekId: z.string(),
    dawkaId: z.string().optional(),
    data: z.string(),
    planowanaGodzina: z.string(),
    status: z.enum(['oczekuje', 'zazyte', 'odroczone', 'pominiete']),
  }),
  wizyty: schematEncji.extend({
    nazwa: z.string(),
    status: z.enum(['do_umowienia', 'umowiona', 'odbyta', 'anulowana']),
    notatka: z.string(),
    pytania: z.array(z.string()),
    dokumentyIds: z.array(z.string()),
    checklista: z.array(z.string()),
  }),
  skierowania: schematEncji.extend({
    nazwa: z.string(),
    wystawca: z.string().optional(),
    dataWystawienia: z.string(),
    typCelu: z.enum(['specjalista', 'badanie', 'zabieg', 'rehabilitacja', 'inne']),
    cel: z.string(),
    kod: z.string().optional(),
    terminWaznosci: z.string().optional(),
    placowka: z.string().optional(),
    notatka: z.string().optional(),
    status: z.enum(['nowe', 'do_umowienia', 'umowiono', 'zrealizowano', 'anulowano', 'wygaslo']),
    wizytaId: z.string().optional(),
  }),
  recepty: schematEncji.extend({
    kod: z.string().optional(),
    dataWystawienia: z.string(),
    wystawca: z.string().optional(),
    terminRealizacji: z.string().optional(),
    status: z.enum(['do_realizacji', 'czesciowo_zrealizowana', 'zrealizowana', 'wygasla', 'anulowana']),
    notatka: z.string().optional(),
    pozycje: z.array(z.object({
      id: z.string(),
      nazwaLeku: z.string(),
      lekId: z.string().optional(),
      ilosc: z.number(),
      iloscZrealizowana: z.number(),
      dawkowanie: z.string().optional(),
      odplatnosc: z.string().optional(),
      notatka: z.string().optional(),
    }).passthrough()),
    wizytaId: z.string().optional(),
  }),
  terapie: schematEncji.extend({
    nazwa: z.string(),
    rodzaj: z.enum(['psychoterapia', 'rehabilitacja', 'leczenie', 'inne']).optional(),
    dataRozpoczecia: z.string().optional(),
    status: z.enum(['aktywna', 'zakonczona', 'wstrzymana']),
    notatka: z.string().optional(),
  }),
  wpisyTerapii: schematEncji.extend({
    psychoterapia: schematSzczegolowPsychoterapii.optional(),
    terapiaId: z.string(),
    dataCzas: z.string(),
    tytul: z.string().optional(),
    tresc: z.string(),
    samopoczucie: z.number().optional(),
    obserwacje: z.string().optional(),
    zalecenia: z.string().optional(),
    tematNastepnegoSpotkania: z.string().optional(),
    wizytaId: z.string().optional(),
  }),
  rachunki: schematEncji.extend({
    nazwa: z.string(),
    kwota: z.number(),
    termin: z.string(),
    status: z.enum(['niezaplacony', 'zaplacony']),
  }),
  platnosciRachunkow: schematEncji.extend({
    rachunekId: z.string(),
    kwota: z.number(),
    zaplaconoAt: z.string(),
  }),
  wydatki: schematEncji.extend({
    kwota: z.number(),
    data: z.string(),
    kategoria: z.string(),
    opis: z.string(),
  }),
  platnosciStale: schematEncji.extend({
    nazwa: z.string(), kwota: z.number(), dzienMiesiaca: z.number(), dataStartu: z.string(), kategoria: z.string(), aktywna: z.boolean(),
  }),
  planyRat: schematEncji.extend({
    nazwa: z.string(), kwotaCalkowita: z.number(), liczbaRat: z.number(), dataPierwszejRaty: z.string(), kategoria: z.string(), status: z.enum(['aktywny', 'splacony']),
  }),
  raty: schematEncji.extend({
    planRatId: z.string(), numer: z.number(), data: z.string(), kwota: z.number(), nadplata: z.number(), status: z.enum(['planowana', 'zaplacona']),
  }),
  budzety: schematEncji.extend({
    nazwa: z.string(),
    okres: z.string(),
    limit: z.number(),
  }),
  kontaFinansowe: schematEncji,
  miejsca: schematEncji,
  pojazdy: schematEncji.extend({ nazwa: z.string() }),
  listyZakupow: schematEncji.extend({
    nazwa: z.string(),
    aktywna: z.boolean(),
  }),
  pozycjeZakupow: schematEncji.extend({
    listaId: z.string(),
    nazwa: z.string(),
    ilosc: z.string(),
    kupione: z.boolean(),
  }),
  dokumenty: schematEncji.extend({
    medyczne: schematMetadanychMedycznych.optional(),
    nazwa: z.string(),
    powiazania: z.array(z.unknown()),
    plik: schematTransportowegoBlobu.optional(),
  }),
  definicjeWlasnychPolRejestru: schematEncji.extend({
    id: z.string().regex(/^custom:/),
    rejestrId: z.string().min(1),
    etykieta: z.string(),
    typ: z.enum(['tekst', 'textarea', 'liczba', 'kwota', 'data', 'czas', 'checkbox', 'select', 'multiselect', 'url']),
    opcje: z.array(z.object({ wartosc: z.string(), etykieta: z.string() })).optional(),
    rolaSemantyczna: z.string().optional(),
    aktywne: z.boolean(),
    revision: z.number().int().positive().default(1),
  }).refine((definicja) => !definicja.rolaSemantyczna || ROLE_SEMANTYCZNE_REJESTRU.some((rola) =>
    rola.id === definicja.rolaSemantyczna && rola.dozwoloneTypy.includes(definicja.typ as never),
  ), 'Rola semantyczna nie istnieje lub nie jest zgodna z typem pola.'),
  widokiRejestru: schematEncji.extend({
    rejestrId: z.string().min(1),
    nazwa: z.string(),
    widocznePolaIds: z.array(z.string()),
  }),
  projekty: schematEncji,
  blokiCzasu: schematEncji,
  grafikPracy: schematEncji,
  wyjatkiGrafiku: schematEncji,
  urlopy: schematEncji,
  nawyki: schematEncji,
  dziennikNawykow: schematEncji.extend({ nawykId: z.string() }),
  przypomnienia: schematEncji,
  pomysly: schematEncji,
  naPozniej: schematEncji,
  cele: schematEncji,
  kontakty: schematEncji,
  terminyWaznosci: schematEncji,
  pamiecEcho: schematEncji,
  uprawnienia: schematEncji.extend({ editorId: z.string() }),
  edytorzy: schematEncji,
  dziennikEcho: schematEncji,
  historiaZmian: schematEncji.extend({
    modul: z.enum(['finanse', 'leki', 'wizyty', 'samochod', 'zadania']),
    typEncji: z.string(),
    encjaId: z.string(),
    operacja: z.enum(['utworzenie', 'aktualizacja', 'usuniecie']),
    znacznikCzasu: z.string(),
    zmienionePola: z.array(z.string()),
    przed: z.record(z.string(), z.unknown()).optional(),
    po: z.record(z.string(), z.unknown()).optional(),
  }),
}

const schematSurowegoBackupu = z.object({
  manifest: z.object({
    formatVersion: z.number().int(),
    createdAt: z.string().min(1),
    appVersion: z.string().min(1),
    dexieSchemaVersion: z.number().int().positive().optional(),
    installationId: z.string().min(1).optional(),
    backupType: z.enum(['export', 'before-restore']).optional(),
    sections: z.array(z.string()),
    recordCounts: z.record(z.string(), z.number().int().nonnegative()),
    schemaVersions: z.record(z.string(), z.number().int().positive()),
    checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }).strict(),
  payload: z.record(z.string(), z.unknown()),
}).strict()

function bajtyNaBase64(bajty: Uint8Array): string {
  const alfabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let wynik = ''
  for (let indeks = 0; indeks < bajty.length; indeks += 3) {
    const pierwszy = bajty[indeks] ?? 0
    const drugi = bajty[indeks + 1] ?? 0
    const trzeci = bajty[indeks + 2] ?? 0
    const liczba = (pierwszy << 16) | (drugi << 8) | trzeci
    wynik += alfabet[(liczba >> 18) & 63]
    wynik += alfabet[(liczba >> 12) & 63]
    wynik += indeks + 1 < bajty.length ? alfabet[(liczba >> 6) & 63] : '='
    wynik += indeks + 2 < bajty.length ? alfabet[liczba & 63] : '='
  }
  return wynik
}

function base64NaBajty(base64: string): Uint8Array<ArrayBuffer> {
  const alfabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const oczyszczony = base64.replace(/=+$/, '')
  const wynik = new Uint8Array(Math.floor((oczyszczony.length * 6) / 8))
  let bufor = 0
  let liczbaBitow = 0
  let indeksWyniku = 0
  for (const znak of oczyszczony) {
    const wartosc = alfabet.indexOf(znak)
    if (wartosc < 0) throw new BladBackupu('Backup zawiera niepoprawne dane pliku.', 'MODEL_DANYCH')
    bufor = (bufor << 6) | wartosc
    liczbaBitow += 6
    if (liczbaBitow >= 8) {
      liczbaBitow -= 8
      wynik[indeksWyniku] = (bufor >> liczbaBitow) & 255
      indeksWyniku += 1
    }
  }
  return wynik
}

async function odczytajBajty(blob: Blob): Promise<Uint8Array> {
  const zArrayBuffer = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }
  if (zArrayBuffer.arrayBuffer) return new Uint8Array(await zArrayBuffer.arrayBuffer())
  return new Promise((rozwiaz, odrzuc) => {
    const czytnik = new FileReader()
    czytnik.onerror = () => odrzuc(czytnik.error)
    czytnik.onload = () => rozwiaz(new Uint8Array(czytnik.result as ArrayBuffer))
    czytnik.readAsArrayBuffer(blob)
  })
}

function czyBlob(wartosc: unknown): wartosc is Blob {
  return wartosc instanceof Blob || Object.prototype.toString.call(wartosc) === '[object Blob]'
}

export async function przygotujWartoscDoTransportu(wartosc: unknown): Promise<unknown> {
  if (czyBlob(wartosc)) {
    return {
      __ogarniaczBlob: true,
      mimeType: wartosc.type,
      base64: bajtyNaBase64(await odczytajBajty(wartosc)),
    }
  }
  if (Array.isArray(wartosc)) return Promise.all(wartosc.map(przygotujWartoscDoTransportu))
  if (wartosc && typeof wartosc === 'object') {
    return Object.fromEntries(
      await Promise.all(Object.entries(wartosc)
        .filter(([klucz]) => !niedozwoloneKlucze.test(klucz))
        .map(async ([klucz, element]) => [klucz, await przygotujWartoscDoTransportu(element)] as const)),
    )
  }
  return wartosc
}

export function odtworzWartoscZTransportu(wartosc: unknown): unknown {
  if (Array.isArray(wartosc)) return wartosc.map(odtworzWartoscZTransportu)
  if (wartosc && typeof wartosc === 'object') {
    const rekord = wartosc as Record<string, unknown>
    if (
      rekord.__ogarniaczBlob === true
      && typeof rekord.mimeType === 'string'
      && typeof rekord.base64 === 'string'
    ) {
      const bajty = base64NaBajty(rekord.base64)
      const bufor = new ArrayBuffer(bajty.byteLength)
      new Uint8Array(bufor).set(bajty)
      return new Blob([bufor], { type: rekord.mimeType })
    }
    return Object.fromEntries(Object.entries(rekord).map(([klucz, element]) => [klucz, odtworzWartoscZTransportu(element)]))
  }
  return wartosc
}

function normalizujLekZBackupu(rekord: RekordBackupu): RekordBackupu {
  if (!Array.isArray(rekord.dawki)) return rekord
  return {
    ...rekord,
    dawki: rekord.dawki.map((dawka) => {
      if (!dawka || typeof dawka !== 'object' || Array.isArray(dawka)) return dawka
      const znormalizowana = { ...dawka } as RekordBackupu
      if (znormalizowana.ilosc === 0) delete znormalizowana.ilosc
      return znormalizowana
    }),
  }
}

function normalizujDefinicjePolaRejestruZBackupu(rekord: RekordBackupu): RekordBackupu {
  return { ...rekord, revision: typeof rekord.revision === 'number' && rekord.revision > 0 ? rekord.revision : 1 }
}

function normalizujRekordDoPrzywrocenia(tabela: NazwaTabeli, rekord: RekordBackupu): RekordBackupu {
  const odtworzony = odtworzWartoscZTransportu(rekord) as RekordBackupu
  if (tabela === 'leki') return normalizujLekZBackupu(odtworzony)
  if (tabela === 'definicjeWlasnychPolRejestru') return normalizujDefinicjePolaRejestruZBackupu(odtworzony)
  return odtworzony
}

function kanonizuj(wartosc: unknown): string {
  if (wartosc === null || typeof wartosc !== 'object') return JSON.stringify(wartosc) ?? 'null'
  if (Array.isArray(wartosc)) return `[${wartosc.map(kanonizuj).join(',')}]`
  return `{${Object.entries(wartosc)
    .filter(([, element]) => element !== undefined)
    .sort(([kluczA], [kluczB]) => kluczA.localeCompare(kluczB))
    .map(([klucz, element]) => `${JSON.stringify(klucz)}:${kanonizuj(element)}`)
    .join(',')}}`
}

async function obliczSha256(tresc: string): Promise<string> {
  const bajty = new TextEncoder().encode(tresc)
  const skrot = typeof globalThis.crypto?.subtle?.digest === 'function'
    ? await globalThis.crypto.subtle.digest('SHA-256', bajty)
    : (await import('@noble/hashes/sha2.js')).sha256(bajty)
  return `sha256:${Array.from(new Uint8Array(skrot), (bajt) => bajt.toString(16).padStart(2, '0')).join('')}`
}

function zrodloRepozytoriow(nazwa: NazwaSekcjiBackupu, tabele: NazwaTabeli[]): DefinicjaSekcji {
  return {
    nazwa,
    wersjaSchematu: 1,
    tabele,
    pobierz: async () => Object.fromEntries(
      await Promise.all(tabele.map(async (tabela) => [tabela, await baza.tabela(tabela).toArray()])),
    ) as DaneSekcji,
  }
}

const definicjeSekcji: DefinicjaSekcji[] = [
  {
    nazwa: 'ustawienia',
    wersjaSchematu: WERSJA_USTAWIEN,
    tabele: ['ustawienia'],
    pobierz: async () => ({ ustawienia: [await repozytoriumUstawien.wczytaj() as unknown as RekordBackupu] }),
  },
  zrodloRepozytoriow('zadania', ['zadania']),
  zrodloRepozytoriow('notatki', ['notatki']),
  zrodloRepozytoriow('poczekalnia', ['skrzynka']),
  zrodloRepozytoriow('leki', ['leki', 'dziennikLekow']),
  zrodloRepozytoriow('wizyty', ['wizyty']),
  zrodloRepozytoriow('zdrowie', ['skierowania', 'recepty', 'terapie', 'wpisyTerapii']),
  zrodloRepozytoriow('wazneInformacjeZdrowotne', ['wazneInformacjeZdrowotne']),
  zrodloRepozytoriow('badania', ['wynikiBadan']),
  zrodloRepozytoriow('samopoczucie', ['wpisySamopoczucia']),
  zrodloRepozytoriow('finanse', ['rachunki', 'platnosciRachunkow', 'wydatki', 'platnosciStale', 'planyRat', 'raty', 'budzety', 'kontaFinansowe']),
  zrodloRepozytoriow('samochod', ['pojazdy']),
  zrodloRepozytoriow('zakupy', ['listyZakupow', 'pozycjeZakupow']),
  zrodloRepozytoriow('dokumenty', ['dokumenty']),
  zrodloRepozytoriow('rejestr', ['definicjeWlasnychPolRejestru', 'widokiRejestru']),
  zrodloRepozytoriow('pozostaleDane', [
    'projekty',
    'blokiCzasu',
    'grafikPracy',
    'wyjatkiGrafiku',
    'urlopy',
    'nawyki',
    'dziennikNawykow',
    'przypomnienia',
    'pomysly',
    'naPozniej',
    'cele',
    'kontakty',
    'miejsca',
    'terminyWaznosci',
    'pamiecEcho',
    'uprawnienia',
    'edytorzy',
    'dziennikEcho',
  ]),
  zrodloRepozytoriow('historia', ['historiaZmian']),
]

export class BladBackupu extends Error {
  constructor(message: string, public readonly kod: string, przyczyna?: unknown) {
    super(message, { cause: przyczyna })
    this.name = 'BladBackupu'
  }
}

export class BladSekcjiBackupu extends BladBackupu {
  constructor(public readonly sekcja: NazwaSekcjiBackupu, przyczyna: unknown) {
    super(`Nie udało się odczytać sekcji „${sekcja}”. Backup nie został utworzony.`, 'ODCZYT_SEKCJI', przyczyna)
    this.name = 'BladSekcjiBackupu'
  }
}

export async function obliczChecksum<TManifest extends object>(backup: {
  manifest: TManifest
  payload: unknown
}): Promise<string> {
  return obliczSha256(kanonizuj({ manifest: backup.manifest, payload: backup.payload }))
}

export async function checksumJestPoprawny(backup: OgarniaczBackup): Promise<boolean> {
  const { checksum, ...manifest } = backup.manifest
  return checksum === await obliczChecksum({ manifest, payload: backup.payload })
}

export async function utworzBackup(
  wybraneSekcje: readonly NazwaSekcjiBackupu[] = PODSTAWOWE_SEKCJE_BACKUPU,
  teraz: () => string = () => new Date().toISOString(),
  typBackupu: TypBackupu = 'export',
): Promise<OgarniaczBackup> {
  sprawdzBiezacyDostep('ustawienia', 'odczyt')
  const unikalneSekcje = SEKCJE_BACKUPU.map(({ nazwa }) => nazwa).filter((nazwa) => wybraneSekcje.includes(nazwa))
  if (unikalneSekcje.length === 0) throw new BladBackupu('Wybierz co najmniej jedną sekcję backupu.', 'BRAK_SEKCJI')

  const payload: OgarniaczBackup['payload'] = {}
  const recordCounts: ManifestBackupu['recordCounts'] = {}
  const schemaVersions: ManifestBackupu['schemaVersions'] = {}

  for (const nazwa of unikalneSekcje) {
    const zrodlo = definicjeSekcji.find((element) => element.nazwa === nazwa)!
    try {
      const dane = await przygotujWartoscDoTransportu(await zrodlo.pobierz()) as DaneSekcji
      payload[nazwa] = dane
      recordCounts[nazwa] = Object.values(dane).reduce((suma, rekordy) => suma + rekordy.length, 0)
      schemaVersions[nazwa] = zrodlo.wersjaSchematu
    } catch (blad) {
      throw new BladSekcjiBackupu(nazwa, blad)
    }
  }

  const manifestBezChecksum: Omit<ManifestBackupu, 'checksum'> = {
    formatVersion: WERSJA_FORMATU_BACKUPU,
    createdAt: teraz(),
    appVersion: WERSJA_APLIKACJI,
    dexieSchemaVersion: WERSJA_SCHEMATU_BAZY,
    installationId: pobierzInstallationId(),
    backupType: typBackupu,
    sections: unikalneSekcje,
    recordCounts,
    schemaVersions,
  }
  const checksum = await obliczChecksum({ manifest: manifestBezChecksum, payload })
  sprawdzBiezacyDostep('ustawienia', 'odczyt')
  return { manifest: { ...manifestBezChecksum, checksum }, payload }
}

function parsujJson(tresc: string): unknown {
  try {
    return JSON.parse(tresc)
  } catch (blad) {
    throw new BladBackupu('Plik nie zawiera poprawnego JSON.', 'USZKODZONY_JSON', blad)
  }
}

function sprawdzKompatybilnosc(surowy: SurowyBackup): void {
  const wersja = surowy.manifest.formatVersion
  if (wersja < NAJNIZSZA_WERSJA_FORMATU_BACKUPU || wersja > WERSJA_FORMATU_BACKUPU) {
    throw new BladBackupu(`Nieobsługiwana wersja formatu backupu: ${wersja}.`, 'WERSJA_FORMATU')
  }
  const glownaWersjaAplikacji = Number(surowy.manifest.appVersion.split('.')[0])
  if (glownaWersjaAplikacji !== 1) {
    throw new BladBackupu(`Backup pochodzi z niekompatybilnej wersji aplikacji: ${surowy.manifest.appVersion}.`, 'WERSJA_APLIKACJI')
  }
  if (wersja >= 2) {
    if (!WSPARTE_WERSJE_SCHEMATU_BACKUPU.includes(surowy.manifest.dexieSchemaVersion ?? -1)) {
      throw new BladBackupu('Backup ma nieobsługiwaną wersję schematu danych.', 'WERSJA_SCHEMATU_BAZY')
    }
  }
}

async function migrujBackupV1DoV2(staryBackup: SurowyBackup): Promise<SurowyBackup> {
  const { checksum: _staryChecksum, ...staryManifest } = staryBackup.manifest
  const manifest = {
    ...staryManifest,
    formatVersion: 2,
    dexieSchemaVersion: WERSJA_SCHEMATU_BAZY,
    backupType: 'export' as const,
  }
  const checksum = await obliczChecksum({ manifest, payload: staryBackup.payload })
  return { manifest: { ...manifest, checksum }, payload: structuredClone(staryBackup.payload) }
}

async function migrujBackupV2DoV3(staryBackup: SurowyBackup): Promise<SurowyBackup> {
  const { checksum: staryChecksum, ...staryManifest } = staryBackup.manifest
  const manifest = {
    ...staryManifest,
    formatVersion: 3,
    installationId: staryBackup.manifest.installationId ?? `legacy-${staryChecksum.slice(7, 39)}`,
  }
  const checksum = await obliczChecksum({ manifest, payload: staryBackup.payload })
  return { manifest: { ...manifest, checksum }, payload: structuredClone(staryBackup.payload) }
}

async function migrujDoAktualnejWersji(surowy: SurowyBackup): Promise<SurowyBackup> {
  let migrowany = structuredClone(surowy)
  if (migrowany.manifest.formatVersion === 1) migrowany = await migrujBackupV1DoV2(migrowany)
  if (migrowany.manifest.formatVersion === 2) migrowany = await migrujBackupV2DoV3(migrowany)
  return migrowany
}

function walidujSekcje(backup: SurowyBackup, wybraneSekcje: readonly NazwaSekcjiBackupu[]): void {
  const dostepneSekcje = new Set(backup.manifest.sections)
  for (const nazwa of wybraneSekcje) {
    if (!dostepneSekcje.has(nazwa)) {
      throw new BladBackupu(`Backup nie zawiera sekcji „${nazwa}”.`, 'BRAK_SEKCJI')
    }
    const definicja = definicjeSekcji.find((element) => element.nazwa === nazwa)!
    if (backup.manifest.schemaVersions[nazwa] !== definicja.wersjaSchematu) {
      throw new BladBackupu(`Nieobsługiwana wersja schematu sekcji „${nazwa}”.`, 'WERSJA_SEKCJI')
    }
    const dane = backup.payload[nazwa]
    if (!dane || typeof dane !== 'object' || Array.isArray(dane)) {
      throw new BladBackupu(`Niepoprawna struktura sekcji „${nazwa}”.`, 'STRUKTURA_SEKCJI')
    }
    const rekordSekcji = dane as Record<string, unknown>
    const tabele = Object.keys(rekordSekcji).sort()
    if (tabele.join('|') !== [...definicja.tabele].sort().join('|')) {
      throw new BladBackupu(`Sekcja „${nazwa}” ma niepoprawny zestaw źródeł.`, 'STRUKTURA_SEKCJI')
    }
    let liczbaRekordow = 0
    for (const tabela of definicja.tabele) {
      const rekordy = rekordSekcji[tabela]
      if (!Array.isArray(rekordy)) {
        throw new BladBackupu(`Źródło „${tabela}” w sekcji „${nazwa}” nie jest listą.`, 'STRUKTURA_SEKCJI')
      }
      const schemat = schematyTabel[tabela]
      const identyfikatory = new Set<string>()
      for (const [indeks, rekord] of rekordy.entries()) {
        const wynik = schemat?.safeParse(rekord)
        if (!wynik?.success) {
          throw new BladBackupu(`Niepoprawny rekord ${indeks + 1} źródła „${tabela}”.`, 'MODEL_DANYCH', wynik?.error)
        }
        const id = (rekord as RekordBackupu).id as string
        if (identyfikatory.has(id)) {
          throw new BladBackupu(`Źródło „${tabela}” zawiera powtórzony identyfikator „${id}”.`, 'MODEL_DANYCH')
        }
        identyfikatory.add(id)
      }
      liczbaRekordow += rekordy.length
    }
    if (backup.manifest.recordCounts[nazwa] !== liczbaRekordow) {
      throw new BladBackupu(`Liczba rekordów sekcji „${nazwa}” nie zgadza się z manifestem.`, 'LICZBA_REKORDOW')
    }
  }
}

function walidujCaloscBackupu(backup: SurowyBackup): OgarniaczBackup {
  const sekcje = backup.manifest.sections as NazwaSekcjiBackupu[]
  if (
    backup.manifest.formatVersion !== WERSJA_FORMATU_BACKUPU
    || !WSPARTE_WERSJE_SCHEMATU_BACKUPU.includes(backup.manifest.dexieSchemaVersion ?? -1)
    || !backup.manifest.installationId
    || !backup.manifest.backupType
  ) {
    throw new BladBackupu('Backup nie został poprawnie doprowadzony do aktualnego formatu.', 'STRUKTURA_MANIFESTU')
  }
  if (new Set(sekcje).size !== sekcje.length || sekcje.length === 0) {
    throw new BladBackupu('Manifest zawiera pustą lub powtórzoną listę sekcji.', 'STRUKTURA_MANIFESTU')
  }
  const znaneSekcje = new Set(SEKCJE_BACKUPU.map(({ nazwa }) => nazwa))
  if (sekcje.some((sekcja) => !znaneSekcje.has(sekcja))) {
    throw new BladBackupu('Manifest zawiera nieznaną sekcję.', 'STRUKTURA_MANIFESTU')
  }
  const kluczePayloadu = Object.keys(backup.payload).sort()
  const kluczeSekcji = [...sekcje].sort()
  if (
    kluczePayloadu.join('|') !== kluczeSekcji.join('|')
    || Object.keys(backup.manifest.recordCounts).sort().join('|') !== kluczeSekcji.join('|')
    || Object.keys(backup.manifest.schemaVersions).sort().join('|') !== kluczeSekcji.join('|')
  ) {
    throw new BladBackupu('Sekcje payloadu nie zgadzają się z manifestem.', 'STRUKTURA_MANIFESTU')
  }
  walidujSekcje(backup, sekcje)
  return backup as OgarniaczBackup
}

function czyKopertaSzyfrowania(wartosc: unknown): boolean {
  return !!wartosc && typeof wartosc === 'object'
    && ('naglowek' in wartosc || 'szyfrogram' in wartosc)
}

export function czyBackupZaszyfrowany(tresc: string): boolean {
  return czyKopertaSzyfrowania(parsujJson(tresc))
}

function pobierzKryptografie(): Crypto {
  const kryptografia = globalThis.crypto
  if (!kryptografia?.getRandomValues || !kryptografia.subtle?.importKey
    || !kryptografia.subtle.deriveKey || !kryptografia.subtle.encrypt || !kryptografia.subtle.decrypt) {
    throw new BladBackupu('Bezpieczna kryptografia Web Crypto jest niedostępna. Otwórz aplikację w bezpiecznym kontekście HTTPS lub localhost.', 'BRAK_KRYPTOGRAFII')
  }
  return kryptografia
}

async function wyprowadzKlucz(kryptografia: Crypto, haslo: string, sol: Uint8Array<ArrayBuffer>, operacja: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  if (!haslo.length) throw new BladBackupu('Podaj niepuste hasło kopii zapasowej.', 'HASLO_WYMAGANE')
  const bajtyHasla = new TextEncoder().encode(haslo)
  try {
    const material = await kryptografia.subtle.importKey('raw', bajtyHasla, 'PBKDF2', false, ['deriveKey'])
    return await kryptografia.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', iterations: LICZBA_ITERACJI_KDF, salt: sol },
      material, { name: 'AES-GCM', length: 256 }, false, [operacja],
    )
  } catch {
    throw new BladBackupu('Nie udało się wyprowadzić klucza. Wymagana jest obsługa PBKDF2 i AES-GCM przez Web Crypto.', 'BRAK_KRYPTOGRAFII')
  } finally {
    bajtyHasla.fill(0)
  }
}

export async function szyfrujBackup(backup: OgarniaczBackup, haslo: string): Promise<ZaszyfrowanyBackup> {
  const kryptografia = pobierzKryptografie()
  await przygotujBackupDoPrzywracania(JSON.stringify(backup))
  const sol = new Uint8Array(16)
  const iv = new Uint8Array(12)
  try {
    kryptografia.getRandomValues(sol)
    kryptografia.getRandomValues(iv)
  } catch {
    throw new BladBackupu('Nie można wygenerować bezpiecznej soli i IV. Kopia nie została zaszyfrowana.', 'BRAK_KRYPTOGRAFII')
  }
  const naglowek: ZaszyfrowanyBackup['naglowek'] = {
    format: 'ogarniacz-backup-szyfrowany', wersja: 1, szyfr: 'AES-256-GCM',
    kdf: { algorytm: 'PBKDF2', hash: 'SHA-256', iteracje: LICZBA_ITERACJI_KDF, sol: bajtyNaBase64(sol) },
    iv: bajtyNaBase64(iv),
  }
  const klucz = await wyprowadzKlucz(kryptografia, haslo, sol, 'encrypt')
  const bajty = new TextEncoder().encode(JSON.stringify(backup))
  try {
    const szyfrogram = await kryptografia.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128, additionalData: new TextEncoder().encode(kanonizuj(naglowek)) }, klucz, bajty,
    )
    return { naglowek, szyfrogram: bajtyNaBase64(new Uint8Array(szyfrogram)) }
  } catch {
    throw new BladBackupu('Nie udało się bezpiecznie zaszyfrować kopii. Nie utworzono nieszyfrowanego eksportu.', 'SZYFROWANIE')
  } finally {
    bajty.fill(0)
  }
}

export async function odszyfrujBackup(tresc: string, haslo?: string): Promise<string> {
  const surowy = parsujJson(tresc)
  if (surowy && typeof surowy === 'object' && 'naglowek' in surowy) {
    const naglowek = surowy.naglowek
    if (naglowek && typeof naglowek === 'object' && 'wersja' in naglowek && naglowek.wersja !== 1) {
      throw new BladBackupu('Nieobsługiwana wersja szyfrowania kopii zapasowej.', 'WERSJA_SZYFROWANIA')
    }
  }
  const wynik = schematZaszyfrowanegoBackupu.safeParse(surowy)
  if (!wynik.success) throw new BladBackupu('Niepoprawny lub nieobsługiwany format zaszyfrowanej kopii.', 'FORMAT_SZYFROWANIA')
  const { naglowek, szyfrogram } = wynik.data
  const sol = base64NaBajty(naglowek.kdf.sol)
  const iv = base64NaBajty(naglowek.iv)
  const bajty = base64NaBajty(szyfrogram)
  if (sol.length !== 16 || iv.length !== 12 || bajty.length < 16
    || bajtyNaBase64(sol) !== naglowek.kdf.sol || bajtyNaBase64(iv) !== naglowek.iv || bajtyNaBase64(bajty) !== szyfrogram) {
    throw new BladBackupu('Uszkodzone dane zaszyfrowanej kopii.', 'FORMAT_SZYFROWANIA')
  }
  if (!haslo?.length) throw new BladBackupu('Podaj hasło zaszyfrowanej kopii zapasowej.', 'HASLO_WYMAGANE')
  const kryptografia = pobierzKryptografie()
  const klucz = await wyprowadzKlucz(kryptografia, haslo, sol, 'decrypt')
  let odszyfrowane: Uint8Array<ArrayBuffer> | undefined
  try {
    odszyfrowane = new Uint8Array(await kryptografia.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128, additionalData: new TextEncoder().encode(kanonizuj(naglowek)) }, klucz, bajty,
    ))
    return new TextDecoder('utf-8', { fatal: true }).decode(odszyfrowane)
  } catch {
    throw new BladBackupu('Nie można odszyfrować kopii: błędne hasło lub uszkodzony plik.', 'ODSZYFROWANIE')
  } finally {
    odszyfrowane?.fill(0)
  }
}

export async function przygotujBackupDoPrzywracania(tresc: string, haslo?: string): Promise<OgarniaczBackup> {
  sprawdzBiezacyDostep('ustawienia', 'odczyt')
  const surowaZawartosc = parsujJson(tresc)
  const zawartosc = czyKopertaSzyfrowania(surowaZawartosc) ? parsujJson(await odszyfrujBackup(tresc, haslo)) : surowaZawartosc
  const wynikStruktury = schematSurowegoBackupu.safeParse(zawartosc)
  if (!wynikStruktury.success) {
    throw new BladBackupu('Plik ma niepoprawną strukturę backupu.', 'STRUKTURA_BACKUPU', wynikStruktury.error)
  }
  const surowy = wynikStruktury.data as SurowyBackup
  const { checksum, ...manifestBezChecksum } = surowy.manifest
  if (checksum !== await obliczChecksum({ manifest: manifestBezChecksum, payload: surowy.payload })) {
    throw new BladBackupu('Checksum backupu jest niepoprawny.', 'CHECKSUM')
  }
  sprawdzKompatybilnosc(surowy)
  return walidujCaloscBackupu(await migrujDoAktualnejWersji(surowy))
}

function sprawdzWyborSekcji(backup: OgarniaczBackup, sekcje: readonly NazwaSekcjiBackupu[]): NazwaSekcjiBackupu[] {
  const unikalne = backup.manifest.sections.filter((sekcja) => sekcje.includes(sekcja))
  if (unikalne.length === 0 || unikalne.length !== new Set(sekcje).size) {
    throw new BladBackupu('Wybierz poprawne sekcje dostępne w backupie.', 'WYBOR_SEKCJI')
  }
  walidujSekcje(backup as unknown as SurowyBackup, unikalne)
  return unikalne
}

export async function przywrocBackup(
  backup: OgarniaczBackup,
  sekcje: readonly NazwaSekcjiBackupu[] = backup.manifest.sections,
  opcje: OpcjePrzywracania = {},
): Promise<WynikPrzywracania> {
  sprawdzBiezacyDostep('ustawienia', 'edycja')
  if (!await checksumJestPoprawny(backup)) {
    throw new BladBackupu('Checksum backupu jest niepoprawny.', 'CHECKSUM')
  }
  sprawdzKompatybilnosc(backup as unknown as SurowyBackup)
  walidujCaloscBackupu(backup as unknown as SurowyBackup)
  const wybraneSekcje = sprawdzWyborSekcji(backup, sekcje)
  const utworzKopie = opcje.utworzKopiePrzedPrzywracaniem
    ?? (() => utworzBackup(undefined, () => new Date().toISOString(), 'before-restore'))
  const backupPrzedPrzywracaniem = await utworzKopie()
  if (!await checksumJestPoprawny(backupPrzedPrzywracaniem)) {
    throw new BladBackupu('Automatyczna kopia before-restore ma niepoprawny checksum.', 'BEFORE_RESTORE')
  }
  const wszystkieSekcje = PODSTAWOWE_SEKCJE_BACKUPU
  if (
    backupPrzedPrzywracaniem.manifest.backupType !== 'before-restore'
    || backupPrzedPrzywracaniem.manifest.sections.join('|') !== wszystkieSekcje.join('|')
  ) {
    throw new BladBackupu('Automatyczna kopia before-restore nie jest pełnym backupem.', 'BEFORE_RESTORE')
  }
  try {
    walidujCaloscBackupu(backupPrzedPrzywracaniem as unknown as SurowyBackup)
  } catch (blad) {
    throw new BladBackupu('Automatyczna kopia before-restore zawiera niepoprawne lub niepełne dane.', 'BEFORE_RESTORE', blad)
  }
  await opcje.poUtworzeniuKopii?.(backupPrzedPrzywracaniem)

  const definicje = wybraneSekcje.map((nazwa) => definicjeSekcji.find((element) => element.nazwa === nazwa)!)
  const tabele = [...new Set(definicje.flatMap((definicja) => definicja.tabele))]
  const daneDoZapisu = new Map<NazwaTabeli, RekordBackupu[]>()
  for (const definicja of definicje) {
    const daneSekcji = backup.payload[definicja.nazwa]!
    for (const tabela of definicja.tabele) {
      const rekordy = daneSekcji[tabela]
      daneDoZapisu.set(tabela, tabela === 'ustawienia'
        ? rekordy.map((rekord) => normalizujUstawienia(rekord) as unknown as RekordBackupu)
        : rekordy.map((rekord) => normalizujRekordDoPrzywrocenia(tabela, rekord)))
    }
  }

  await baza.transaction('rw', tabele.map((tabela) => baza.table(tabela)), async () => {
    sprawdzBiezacyDostep('ustawienia', 'edycja')
    for (const tabela of tabele) {
      const repozytorium = baza.table(tabela)
      const prywatneUstawienia = tabela === 'ustawienia' ? (await baza.tabela('ustawienia').get('glowne'))?.samopoczucie : undefined
      await repozytorium.clear()
      const rekordy = daneDoZapisu.get(tabela) ?? []
      if (tabela === 'ustawienia' && prywatneUstawienia) for (const rekord of rekordy) if (rekord.id === 'glowne' && !('samopoczucie' in rekord)) rekord.samopoczucie = prywatneUstawienia
      if (rekordy.length > 0) await repozytorium.bulkPut(rekordy)
    }
  })
  for (const tabela of tabele) powiadomOZmianieDanych(tabela)

  return {
    backupPrzedPrzywracaniem,
    przywroconeSekcje: wybraneSekcje,
    liczbaRekordow: [...daneDoZapisu.values()].reduce((suma, rekordy) => suma + rekordy.length, 0),
  }
}

export async function wyczyscDane(): Promise<void> {
  await baza.transaction('rw', nazwyTabel.map((nazwa) => baza.table(nazwa)), async () => {
    for (const nazwa of nazwyTabel) await baza.table(nazwa).clear()
  })
}
