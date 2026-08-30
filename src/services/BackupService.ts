import { baza, nazwyTabel } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import type { NazwaTabeli } from '../domain/typy'

export const WERSJA_FORMATU_BACKUPU = 1
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
] as const

export type NazwaSekcjiBackupu = (typeof SEKCJE_BACKUPU)[number]['nazwa']
type RekordBackupu = Record<string, unknown>
type DaneSekcji = Record<string, RekordBackupu[]>

export interface ManifestBackupu {
  formatVersion: number
  createdAt: string
  appVersion: string
  sections: NazwaSekcjiBackupu[]
  recordCounts: Partial<Record<NazwaSekcjiBackupu, number>>
  schemaVersions: Partial<Record<NazwaSekcjiBackupu, number>>
  checksum: string
}

export interface OgarniaczBackup {
  manifest: ManifestBackupu
  payload: Partial<Record<NazwaSekcjiBackupu, DaneSekcji>>
}

interface ZrodloSekcji {
  nazwa: NazwaSekcjiBackupu
  wersjaSchematu: number
  pobierz: () => Promise<DaneSekcji>
}

const niedozwoloneKlucze = /^(access_?token|refresh_?token|token|secret|sekret|password|haslo|session|sesja|credentials|daneLogowania)$/i

function oczyscWartosc(wartosc: unknown): unknown {
  if (Array.isArray(wartosc)) return wartosc.map(oczyscWartosc)
  if (wartosc && typeof wartosc === 'object') {
    return Object.fromEntries(
      Object.entries(wartosc)
        .filter(([klucz]) => !niedozwoloneKlucze.test(klucz))
        .map(([klucz, element]) => [klucz, oczyscWartosc(element)]),
    )
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

async function sha256(tresc: string): Promise<string> {
  const skrot = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tresc))
  return `sha256:${Array.from(new Uint8Array(skrot), (bajt) => bajt.toString(16).padStart(2, '0')).join('')}`
}

function zrodloRepozytoriow(nazwa: NazwaSekcjiBackupu, tabele: NazwaTabeli[]): ZrodloSekcji {
  return {
    nazwa,
    wersjaSchematu: 1,
    pobierz: async () => Object.fromEntries(
      await Promise.all(tabele.map(async (tabela) => [tabela, await pobierzRepozytorium(tabela).lista()])),
    ) as DaneSekcji,
  }
}

const zrodlaDomyslne: ZrodloSekcji[] = [
  {
    nazwa: 'ustawienia',
    wersjaSchematu: 1,
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
]

export class BladSekcjiBackupu extends Error {
  constructor(public readonly sekcja: NazwaSekcjiBackupu, przyczyna: unknown) {
    super(`Nie udało się odczytać sekcji „${sekcja}”. Backup nie został utworzony.`, { cause: przyczyna })
    this.name = 'BladSekcjiBackupu'
  }
}

function daneChronione(backup: Omit<OgarniaczBackup, 'manifest'> & { manifest: Omit<ManifestBackupu, 'checksum'> }): unknown {
  return { manifest: backup.manifest, payload: backup.payload }
}

export async function obliczChecksum(
  backup: Omit<OgarniaczBackup, 'manifest'> & { manifest: Omit<ManifestBackupu, 'checksum'> },
): Promise<string> {
  return sha256(kanonizuj(daneChronione(backup)))
}

export async function checksumJestPoprawny(backup: OgarniaczBackup): Promise<boolean> {
  const { checksum, ...manifest } = backup.manifest
  return checksum === await obliczChecksum({ manifest, payload: backup.payload })
}

export async function utworzBackup(
  wybraneSekcje: readonly NazwaSekcjiBackupu[] = SEKCJE_BACKUPU.map(({ nazwa }) => nazwa),
  teraz: () => string = () => new Date().toISOString(),
): Promise<OgarniaczBackup> {
  const unikalneSekcje = SEKCJE_BACKUPU.map(({ nazwa }) => nazwa).filter((nazwa) => wybraneSekcje.includes(nazwa))
  if (unikalneSekcje.length === 0) throw new Error('Wybierz co najmniej jedną sekcję backupu.')

  const payload: OgarniaczBackup['payload'] = {}
  const recordCounts: ManifestBackupu['recordCounts'] = {}
  const schemaVersions: ManifestBackupu['schemaVersions'] = {}

  for (const nazwa of unikalneSekcje) {
    const zrodlo = zrodlaDomyslne.find((element) => element.nazwa === nazwa)!
    try {
      const dane = oczyscWartosc(await zrodlo.pobierz()) as DaneSekcji
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
    sections: unikalneSekcje,
    recordCounts,
    schemaVersions,
  }
  const checksum = await obliczChecksum({ manifest: manifestBezChecksum, payload })
  return { manifest: { ...manifestBezChecksum, checksum }, payload }
}

export async function wyczyscDane(): Promise<void> {
  await baza.transaction('rw', nazwyTabel.map((nazwa) => baza.table(nazwa)), async () => {
    for (const nazwa of nazwyTabel) await baza.table(nazwa).clear()
  })
}
