import { z } from 'zod'
import { baza, nazwyTabel, WERSJA_SCHEMATU_BAZY } from '../data/BazaOgarniacza'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { normalizujUstawienia, WERSJA_USTAWIEN } from '../domain/ustawienia'
import type { NazwaTabeli } from '../domain/typy'
import { pobierzInstallationId } from './InstallationService'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'

export const WERSJA_FORMATU_BACKUPU = 3
const NAJNIZSZA_WERSJA_FORMATU_BACKUPU = 1
const WERSJA_APLIKACJI = '1.0.0'

export const SEKCJE_BACKUPU = [
  { nazwa: 'ustawienia', etykieta: 'Ustawienia' },
  { nazwa: 'zadania', etykieta: 'Zadania i planer' },
  { nazwa: 'notatki', etykieta: 'Notatki' },
  { nazwa: 'poczekalnia', etykieta: 'Poczekalnia' },
  { nazwa: 'leki', etykieta: 'Leki' },
  { nazwa: 'wizyty', etykieta: 'Wizyty' },
  { nazwa: 'finanse', etykieta: 'Finanse i rachunki' },
  { nazwa: 'samochod', etykieta: 'Samochód' },
  { nazwa: 'zakupy', etykieta: 'Zakupy' },
  { nazwa: 'dokumenty', etykieta: 'Dokumenty i pliki' },
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

export interface WynikPrzywracania {
  backupPrzedPrzywracaniem: OgarniaczBackup
  przywroconeSekcje: NazwaSekcjiBackupu[]
  liczbaRekordow: number
}

export interface OpcjePrzywracania {
  utworzKopiePrzedPrzywracaniem?: () => Promise<OgarniaczBackup>
  poUtworzeniuKopii?: (backup: OgarniaczBackup) => void
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
  ustawienia: schematEncji.extend({
    wersja: z.literal(WERSJA_USTAWIEN),
    wyglad: z.record(z.string(), z.unknown()),
    nawigacja: z.record(z.string(), z.unknown()),
    pulpit: z.record(z.string(), z.unknown()),
    harmonogram: z.record(z.string(), z.unknown()),
    zadania: z.record(z.string(), z.unknown()),
  }),
  zadania: schematEncji.extend({
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
    status: z.enum(['nowe', 'przetworzone']),
  }),
  leki: schematEncji.extend({
    nazwa: z.string(),
    dawkaInstrukcja: z.string(),
    godziny: z.array(z.string()),
    aktywny: z.boolean(),
  }),
  dziennikLekow: schematEncji.extend({
    lekId: z.string(),
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
  budzety: schematEncji.extend({
    nazwa: z.string(),
    okres: z.string(),
    limit: z.number(),
  }),
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
    nazwa: z.string(),
    powiazania: z.array(z.unknown()),
    plik: schematTransportowegoBlobu.optional(),
  }),
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

function base64NaBajty(base64: string): Uint8Array {
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

async function przygotujWartoscDoTransportu(wartosc: unknown): Promise<unknown> {
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

function odtworzWartoscZTransportu(wartosc: unknown): unknown {
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
  const skrot = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tresc))
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
  zrodloRepozytoriow('finanse', ['rachunki', 'platnosciRachunkow', 'wydatki', 'budzety']),
  zrodloRepozytoriow('samochod', ['pojazdy']),
  zrodloRepozytoriow('zakupy', ['listyZakupow', 'pozycjeZakupow']),
  zrodloRepozytoriow('dokumenty', ['dokumenty']),
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
    if (![4, 5, WERSJA_SCHEMATU_BAZY].includes(surowy.manifest.dexieSchemaVersion ?? -1)) {
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
    || ![4, 5, WERSJA_SCHEMATU_BAZY].includes(backup.manifest.dexieSchemaVersion ?? -1)
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

export async function przygotujBackupDoPrzywracania(tresc: string): Promise<OgarniaczBackup> {
  const wynikStruktury = schematSurowegoBackupu.safeParse(parsujJson(tresc))
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
  opcje.poUtworzeniuKopii?.(backupPrzedPrzywracaniem)

  const definicje = wybraneSekcje.map((nazwa) => definicjeSekcji.find((element) => element.nazwa === nazwa)!)
  const tabele = [...new Set(definicje.flatMap((definicja) => definicja.tabele))]
  const daneDoZapisu = new Map<NazwaTabeli, RekordBackupu[]>()
  for (const definicja of definicje) {
    const daneSekcji = backup.payload[definicja.nazwa]!
    for (const tabela of definicja.tabele) {
      const rekordy = daneSekcji[tabela]
      daneDoZapisu.set(tabela, tabela === 'ustawienia'
        ? rekordy.map((rekord) => normalizujUstawienia(rekord) as unknown as RekordBackupu)
        : rekordy.map((rekord) => odtworzWartoscZTransportu(rekord) as RekordBackupu))
    }
  }

  await baza.transaction('rw', tabele.map((tabela) => baza.table(tabela)), async () => {
    for (const tabela of tabele) {
      const repozytorium = baza.table(tabela)
      await repozytorium.clear()
      const rekordy = daneDoZapisu.get(tabela) ?? []
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
