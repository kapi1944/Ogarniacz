import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'

const MAKSYMALNY_ROZMIAR_PACZKI = 25 * 1024 * 1024
const POCZATEK_SYNCHRONIZACJI = '1970-01-01T00:00:00.000Z'
const TABELE_SYNCHRONIZOWANE = new Set([
  'zadania', 'projekty', 'skrzynka', 'blokiCzasu', 'grafikPracy', 'wyjatkiGrafiku', 'urlopy',
  'nawyki', 'dziennikNawykow', 'leki', 'dziennikLekow', 'wizyty', 'przypomnienia', 'listyZakupow',
  'pozycjeZakupow', 'rachunki', 'platnosciRachunkow', 'notatki', 'pomysly', 'naPozniej', 'cele',
  'kontakty', 'dokumenty', 'wydatki', 'budzety', 'pojazdy', 'terminyWaznosci', 'uprawnienia',
  'edytorzy', 'ustawienia', 'skierowania', 'recepty', 'terapie', 'wpisyTerapii',
  'platnosciStale', 'planyRat', 'raty',
])

interface RekordSynchronizacji {
  id: string
  createdAt: string
  updatedAt: string
  usunietoAt?: string
  [klucz: string]: unknown
}

interface ZmianaSynchronizacjiApi {
  zmianaId?: string
  bazowyUpdatedAt?: string
  tabela: string
  rekord: RekordSynchronizacji
  installationId: string
}

interface PaczkaSynchronizacji {
  od: string
  installationId: string
  zmiany: ZmianaSynchronizacjiApi[]
}

function poprawnyIso(wartosc: unknown): wartosc is string {
  return typeof wartosc === 'string' && !Number.isNaN(Date.parse(wartosc))
}

export function czyDostepDoSynchronizacji(zadanie: IncomingMessage, konfiguracja: KonfiguracjaSerwera): boolean {
  if (!konfiguracja.syncAccessKey || !konfiguracja.syncUserId) return false
  const naglowek = zadanie.headers.authorization
  if (!naglowek?.startsWith('Bearer ')) return false
  const otrzymany = Buffer.from(naglowek.slice(7))
  const oczekiwany = Buffer.from(konfiguracja.syncAccessKey)
  return otrzymany.length === oczekiwany.length && timingSafeEqual(otrzymany, oczekiwany)
}

export function pobierzInstallationIdZNaglowka(zadanie: IncomingMessage): string | undefined {
  const wartosc = zadanie.headers['x-ogarniacz-installation-id']
  return typeof wartosc === 'string' && wartosc.length >= 8 && wartosc.length <= 200 ? wartosc : undefined
}

export async function odczytajPaczkeSynchronizacji(zadanie: IncomingMessage): Promise<PaczkaSynchronizacji> {
  const fragmenty: Buffer[] = []
  let rozmiar = 0
  for await (const fragment of zadanie) {
    const bufor = Buffer.isBuffer(fragment) ? fragment : Buffer.from(fragment)
    rozmiar += bufor.length
    if (rozmiar > MAKSYMALNY_ROZMIAR_PACZKI) throw new Error('Paczka synchronizacji jest za duża.')
    fragmenty.push(bufor)
  }
  const dane = JSON.parse(Buffer.concat(fragmenty).toString('utf8')) as Partial<PaczkaSynchronizacji>
  if (!poprawnyIso(dane.od) || typeof dane.installationId !== 'string' || !Array.isArray(dane.zmiany)) {
    throw new Error('Niepoprawna paczka synchronizacji.')
  }
  for (const zmiana of dane.zmiany) walidujZmiane(zmiana, dane.installationId)
  return dane as PaczkaSynchronizacji
}

function walidujZmiane(zmiana: unknown, installationId: string): asserts zmiana is ZmianaSynchronizacjiApi {
  if (!zmiana || typeof zmiana !== 'object') throw new Error('Niepoprawna zmiana synchronizacji.')
  const kandydat = zmiana as Partial<ZmianaSynchronizacjiApi>
  const rekord = kandydat.rekord
  if (
    !TABELE_SYNCHRONIZOWANE.has(kandydat.tabela ?? '')
    || kandydat.installationId !== installationId
    || (kandydat.zmianaId !== undefined && (typeof kandydat.zmianaId !== 'string' || kandydat.zmianaId.length < 8 || kandydat.zmianaId.length > 200))
    || (kandydat.bazowyUpdatedAt !== undefined && !poprawnyIso(kandydat.bazowyUpdatedAt))
    || !rekord
    || typeof rekord.id !== 'string'
    || !poprawnyIso(rekord.createdAt)
    || !poprawnyIso(rekord.updatedAt)
    || (rekord.usunietoAt !== undefined && !poprawnyIso(rekord.usunietoAt))
  ) throw new Error('Niepoprawna zmiana synchronizacji.')
}

export function zapewnijProfilSynchronizacji(baza: DatabaseSync, userId: string, installationId: string): void {
  const teraz = new Date().toISOString()
  baza.prepare(`
    INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET zaktualizowano_at = excluded.zaktualizowano_at
  `).run(userId, `${userId}@sync.ogarniacz.local`, 'dostep-przez-klucz-serwera', teraz, teraz)
  baza.prepare(`
    INSERT INTO instalacje (id, uzytkownik_id, ostatnia_aktywnosc_at, utworzono_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET ostatnia_aktywnosc_at = excluded.ostatnia_aktywnosc_at
  `).run(installationId, userId, teraz, teraz)
}

export function pobierzZmianySynchronizacji(baza: DatabaseSync, userId: string, od: string): ZmianaSynchronizacjiApi[] {
  if (!poprawnyIso(od)) throw new Error('Niepoprawny kursor synchronizacji.')
  return baza.prepare(`
    SELECT tabela, dane_json, ostatnia_instalacja_id
    FROM rekordy_synchronizacji
    WHERE uzytkownik_id = ? AND COALESCE(server_updated_at, updated_at) > ?
    ORDER BY COALESCE(server_updated_at, updated_at), tabela, rekord_id
  `).all(userId, od).map((wiersz) => ({
    tabela: String(wiersz.tabela),
    rekord: JSON.parse(String(wiersz.dane_json)) as RekordSynchronizacji,
    installationId: String(wiersz.ostatnia_instalacja_id ?? 'serwer'),
  }))
}

export function zapiszZmianySynchronizacji(baza: DatabaseSync, userId: string, paczka: PaczkaSynchronizacji): void {
  const czyPrzetworzona = baza.prepare(`
    SELECT 1 FROM przetworzone_zmiany_synchronizacji WHERE uzytkownik_id = ? AND zmiana_id = ?
  `)
  const pobierzIstniejacy = baza.prepare(`
    SELECT dane_json, updated_at, ostatnia_instalacja_id
    FROM rekordy_synchronizacji
    WHERE uzytkownik_id = ? AND tabela = ? AND rekord_id = ?
  `)
  const konflikty: string[] = []
  for (const zmiana of paczka.zmiany) {
    if (zmiana.zmianaId && czyPrzetworzona.get(userId, zmiana.zmianaId)) continue
    const istniejacy = pobierzIstniejacy.get(userId, zmiana.tabela, zmiana.rekord.id)
    if (
      istniejacy
      && (zmiana.bazowyUpdatedAt
        ? String(istniejacy.updated_at) !== zmiana.bazowyUpdatedAt
        : String(istniejacy.updated_at) > paczka.od)
      && String(istniejacy.ostatnia_instalacja_id) !== paczka.installationId
      && String(istniejacy.dane_json) !== JSON.stringify(zmiana.rekord)
    ) konflikty.push(`${zmiana.tabela}:${zmiana.rekord.id}`)
  }
  if (konflikty.length > 0) throw new Error(`KONFLIKT_SYNC:${konflikty.join(',')}`)

  const zapisz = baza.prepare(`
    INSERT INTO rekordy_synchronizacji (
      uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, version, deleted_at, ostatnia_instalacja_id, server_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(uzytkownik_id, tabela, rekord_id) DO UPDATE SET
      dane_json = excluded.dane_json,
      updated_at = excluded.updated_at,
      version = rekordy_synchronizacji.version + 1,
      deleted_at = excluded.deleted_at,
      ostatnia_instalacja_id = excluded.ostatnia_instalacja_id,
      server_updated_at = excluded.server_updated_at
  `)
  const oznaczPrzetworzona = baza.prepare(`
    INSERT OR IGNORE INTO przetworzone_zmiany_synchronizacji (uzytkownik_id, zmiana_id, przetworzono_at)
    VALUES (?, ?, ?)
  `)
  baza.exec('BEGIN')
  try {
    for (const zmiana of paczka.zmiany) {
      if (zmiana.zmianaId && czyPrzetworzona.get(userId, zmiana.zmianaId)) continue
      zapisz.run(
        userId,
        zmiana.tabela,
        zmiana.rekord.id,
        JSON.stringify(zmiana.rekord),
        zmiana.rekord.createdAt,
        zmiana.rekord.updatedAt,
        zmiana.rekord.usunietoAt ?? null,
        paczka.installationId,
        new Date().toISOString(),
      )
      if (zmiana.zmianaId) oznaczPrzetworzona.run(userId, zmiana.zmianaId, new Date().toISOString())
    }
    baza.exec('COMMIT')
  } catch (blad) {
    baza.exec('ROLLBACK')
    throw blad
  }
}

export function poczatekSynchronizacji(): string {
  return POCZATEK_SYNCHRONIZACJI
}
