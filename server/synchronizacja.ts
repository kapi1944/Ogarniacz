import type { IncomingMessage } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import { czyTabelaFinansowa, TABELE_FINANSOW_WSPOLNYCH, walidujObrazFinansowy, sprawdzKontynuacjeHistorii } from './wspolne/SynchronizacjaFinansow.ts'
import { kanonicznyZapis } from './wspolne/ZapisFinansowy.ts'
import { czyTabelaObslugiwanaPrzezSerwer } from './wspolne/tabeleSynchronizacji.ts'
import { TABELE_FZ } from './wspolne/modelePulZobowiazan.ts'

const MAKSYMALNY_ROZMIAR_PACZKI = 25 * 1024 * 1024
const POCZATEK_SYNCHRONIZACJI = '1970-01-01T00:00:00.000Z'

export type PowodOdrzuceniaZmiany = 'nieobslugiwana_tabela' | 'niepoprawna_zmiana' | 'niepoprawna_klasyfikacja'

const KOMUNIKATY_ODRZUCENIA: Record<PowodOdrzuceniaZmiany, string> = {
  nieobslugiwana_tabela: 'Nieobsługiwana tabela synchronizacji.',
  niepoprawna_zmiana: 'Niepoprawna zmiana synchronizacji.',
  niepoprawna_klasyfikacja: 'Niepoprawna klasyfikacja dokumentu.',
}

/** Bezpieczny identyfikator do logu i odpowiedzi: bez treści rekordu, ograniczony zestaw znaków. */
function bezpiecznyIdentyfikator(wartosc: unknown): string | undefined {
  if (typeof wartosc !== 'string' || wartosc.length === 0) return undefined
  return wartosc.slice(0, 120).replace(/[^\p{L}\p{N}_:.-]/gu, '_')
}

/** Odrzucenie pojedynczej zmiany; niesie wyłącznie tabelę, ID rekordu i kontrolowany powód. */
export class BladZmianySynchronizacji extends Error {
  readonly powod: PowodOdrzuceniaZmiany
  readonly tabela?: string
  readonly rekordId?: string
  constructor(powod: PowodOdrzuceniaZmiany, tabela?: unknown, rekordId?: unknown) {
    super(KOMUNIKATY_ODRZUCENIA[powod])
    this.name = 'BladZmianySynchronizacji'
    this.powod = powod
    this.tabela = bezpiecznyIdentyfikator(tabela)
    this.rekordId = bezpiecznyIdentyfikator(rekordId)
  }
}

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

export interface OdrzuconaZmiana {
  tabela?: string
  rekordId?: string
  zmianaId?: string
  powod: PowodOdrzuceniaZmiany
}

interface PaczkaSynchronizacji {
  od: string
  installationId: string
  zmiany: ZmianaSynchronizacjiApi[]
  /** Klient deklaruje obsługę listy `odrzucone`; bez tego paczka z błędną zmianą jest odrzucana w całości (starsze klienty). */
  obslugujeOdrzucone?: boolean
  /** Tylko w trybie częściowym: zmiany odrzucone przy walidacji, pominięte przed zapisem. */
  odrzucone?: OdrzuconaZmiana[]
}

/** Finanse wspólne i FZ pozostają „wszystko albo nic”: ich błąd zawsze odrzuca całą paczkę. */
function czyTabelaNiepodzielna(tabela: unknown): boolean {
  return typeof tabela === 'string' && (czyTabelaFinansowa(tabela) || (TABELE_FZ as readonly string[]).includes(tabela))
}

function bezpieczneZmianaId(wartosc: unknown): string | undefined {
  return typeof wartosc === 'string' && /^[\w:.-]{8,200}$/.test(wartosc) ? wartosc : undefined
}

function poprawnyIso(wartosc: unknown): wartosc is string {
  return typeof wartosc === 'string' && !Number.isNaN(Date.parse(wartosc))
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
  if (dane.obslugujeOdrzucone !== true) {
    for (const zmiana of dane.zmiany) walidujZmiane(zmiana, dane.installationId)
    return dane as PaczkaSynchronizacji
  }
  const poprawne: ZmianaSynchronizacjiApi[] = []
  const odrzucone: OdrzuconaZmiana[] = []
  for (const zmiana of dane.zmiany as unknown[]) {
    try {
      walidujZmiane(zmiana, dane.installationId)
      poprawne.push(zmiana)
    } catch (blad) {
      const kandydat = zmiana && typeof zmiana === 'object' ? zmiana as Partial<ZmianaSynchronizacjiApi> : {}
      if (!(blad instanceof BladZmianySynchronizacji) || czyTabelaNiepodzielna(kandydat.tabela)) throw blad
      const zmianaId = bezpieczneZmianaId(kandydat.zmianaId)
      odrzucone.push({
        ...(blad.tabela ? { tabela: blad.tabela } : {}),
        ...(blad.rekordId ? { rekordId: blad.rekordId } : {}),
        ...(zmianaId ? { zmianaId } : {}),
        powod: blad.powod,
      })
    }
  }
  return { od: dane.od, installationId: dane.installationId, zmiany: poprawne, odrzucone }
}

function walidujZmiane(zmiana: unknown, installationId: string): asserts zmiana is ZmianaSynchronizacjiApi {
  if (!zmiana || typeof zmiana !== 'object') throw new BladZmianySynchronizacji('niepoprawna_zmiana')
  const kandydat = zmiana as Partial<ZmianaSynchronizacjiApi>
  const rekord = kandydat.rekord
  const rekordId = rekord && typeof rekord === 'object' ? rekord.id : undefined
  if (!czyTabelaObslugiwanaPrzezSerwer(kandydat.tabela)) throw new BladZmianySynchronizacji('nieobslugiwana_tabela', kandydat.tabela, rekordId)
  if (
    kandydat.installationId !== installationId
    || (kandydat.zmianaId !== undefined && (typeof kandydat.zmianaId !== 'string' || kandydat.zmianaId.length < 8 || kandydat.zmianaId.length > 200))
    || (kandydat.bazowyUpdatedAt !== undefined && !poprawnyIso(kandydat.bazowyUpdatedAt))
    || !rekord
    || typeof rekord.id !== 'string'
    || !poprawnyIso(rekord.createdAt)
    || !poprawnyIso(rekord.updatedAt)
    || (rekord.usunietoAt !== undefined && !poprawnyIso(rekord.usunietoAt))
  ) throw new BladZmianySynchronizacji('niepoprawna_zmiana', kandydat.tabela, rekordId)
  if (kandydat.tabela === 'dokumenty' && rekord.sekcjePrywatnosci !== undefined
    && (!Array.isArray(rekord.sekcjePrywatnosci) || rekord.sekcjePrywatnosci.some((sekcja) => !['dokumentacja', 'psychoterapia'].includes(sekcja)))) throw new BladZmianySynchronizacji('niepoprawna_klasyfikacja', kandydat.tabela, rekordId)
}

export function zapewnijProfilSynchronizacji(baza: DatabaseSync, userId: string, installationId: string): void {
  const teraz = new Date().toISOString()
  baza.prepare(`
    INSERT INTO instalacje (id, uzytkownik_id, ostatnia_aktywnosc_at, utworzono_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET ostatnia_aktywnosc_at = excluded.ostatnia_aktywnosc_at
  `).run(installationId, userId, teraz, teraz)
}

export function pobierzZmianySynchronizacji(baza: DatabaseSync, userId: string, od: string, tylkoFinanse = false): ZmianaSynchronizacjiApi[] {
  if (!poprawnyIso(od)) throw new Error('Niepoprawny kursor synchronizacji.')
  return baza.prepare(`
    SELECT tabela, dane_json, ostatnia_instalacja_id
    FROM rekordy_synchronizacji
    WHERE uzytkownik_id = ? AND COALESCE(server_updated_at, updated_at) > ?
      ${tylkoFinanse ? `AND tabela IN (${TABELE_FINANSOW_WSPOLNYCH.map(() => '?').join(', ')})` : ''}
    ORDER BY COALESCE(server_updated_at, updated_at), tabela, rekord_id
  `).all(userId, od, ...(tylkoFinanse ? TABELE_FINANSOW_WSPOLNYCH : [])).map((wiersz) => ({
    tabela: String(wiersz.tabela),
    rekord: JSON.parse(String(wiersz.dane_json)) as RekordSynchronizacji,
    installationId: String(wiersz.ostatnia_instalacja_id ?? 'serwer'),
  }))
}

export function zapiszZmianySynchronizacji(baza: DatabaseSync, userId: string, paczka: PaczkaSynchronizacji): number {
  // Historyczne notatki pozostają w bazie, ale żaden klient nie może ich ponownie zapisać.
  const zmiany = paczka.zmiany.filter((zmiana) => zmiana.tabela !== 'wpisyTerapii')
  for (const zmiana of zmiany) walidujZmiane(zmiana, paczka.installationId)
  const czyPrzetworzona = baza.prepare(`
    SELECT 1 FROM przetworzone_zmiany_synchronizacji WHERE uzytkownik_id = ? AND zmiana_id = ?
  `)
  const pobierzIstniejacy = baza.prepare(`
    SELECT dane_json, updated_at, ostatnia_instalacja_id
    FROM rekordy_synchronizacji
    WHERE uzytkownik_id = ? AND tabela = ? AND rekord_id = ?
  `)
  const konflikty: string[] = []
  for (const zmiana of zmiany) {
    if (zmiana.zmianaId && czyPrzetworzona.get(userId, zmiana.zmianaId)) continue
    const istniejacy = pobierzIstniejacy.get(userId, zmiana.tabela, zmiana.rekord.id)
    if (zmiana.tabela === 'dokumenty' && istniejacy) {
      const poprzedni = JSON.parse(String(istniejacy.dane_json)) as RekordSynchronizacji
      const sekcje = [...new Set([...(poprzedni.sekcjePrywatnosci as string[] | undefined) ?? [], ...(zmiana.rekord.sekcjePrywatnosci as string[] | undefined) ?? []])].sort()
      if (sekcje.length) zmiana.rekord = { ...zmiana.rekord, sekcjePrywatnosci: sekcje }
      if (sekcje.length && JSON.stringify(sekcje) !== JSON.stringify(poprzedni.sekcjePrywatnosci ?? [])) {
        // Zaostrzenie dostępu nie czeka na konflikt treści; nie zmienia treści ani jej znacznika aktualności.
        const chroniony = JSON.stringify({ ...poprzedni, sekcjePrywatnosci: sekcje })
        baza.prepare(`UPDATE rekordy_synchronizacji SET dane_json = ?, version = version + 1, server_updated_at = ?
          WHERE uzytkownik_id = ? AND tabela = 'dokumenty' AND rekord_id = ?`)
          .run(chroniony, new Date().toISOString(), userId, zmiana.rekord.id)
        istniejacy.dane_json = chroniony
      }
    }
    if (
      istniejacy
      && (czyTabelaFinansowa(zmiana.tabela) && !zmiana.bazowyUpdatedAt
        ? true : zmiana.bazowyUpdatedAt
        ? String(istniejacy.updated_at) !== zmiana.bazowyUpdatedAt
        : String(istniejacy.updated_at) > paczka.od)
      && (czyTabelaFinansowa(zmiana.tabela) || String(istniejacy.ostatnia_instalacja_id) !== paczka.installationId)
      && (czyTabelaFinansowa(zmiana.tabela) ? kanonicznyZapis(JSON.parse(String(istniejacy.dane_json))) !== kanonicznyZapis(zmiana.rekord) : String(istniejacy.dane_json) !== JSON.stringify(zmiana.rekord))
    ) konflikty.push(`${zmiana.tabela}:${zmiana.rekord.id}`)
  }
  if (konflikty.length > 0) throw new Error(`KONFLIKT_SYNC:${konflikty.join(',')}`)

  if (zmiany.some((zmiana) => czyTabelaFinansowa(zmiana.tabela))) {
    const obraz = new Map(pobierzZmianySynchronizacji(baza, userId, POCZATEK_SYNCHRONIZACJI, true)
      .filter((zmiana) => czyTabelaFinansowa(zmiana.tabela)).map((zmiana) => [`${zmiana.tabela}:${zmiana.rekord.id}`, zmiana]))
    const kluczePaczki = new Set<string>()
    for (const zmiana of zmiany.filter((zmiana) => czyTabelaFinansowa(zmiana.tabela))) {
      const klucz = `${zmiana.tabela}:${zmiana.rekord.id}`
      if (kluczePaczki.has(klucz)) throw new Error('Powtórzony rekord finansowy.')
      kluczePaczki.add(klucz)
      if (zmiana.zmianaId && czyPrzetworzona.get(userId, zmiana.zmianaId)) continue
      const przed = obraz.get(klucz)
      if (przed && czyTabelaFinansowa(zmiana.tabela)) sprawdzKontynuacjeHistorii(zmiana.tabela, przed.rekord, zmiana.rekord)
      obraz.set(klucz, zmiana)
    }
    walidujObrazFinansowy([...obraz.values()])
  }

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
  let zapisano = 0
  try {
    for (const zmiana of zmiany) {
      if (zmiana.zmianaId && czyPrzetworzona.get(userId, zmiana.zmianaId)) continue
      // Kolejna zmiana tego samego ID w paczce również nie może zdjąć wcześniejszej ochrony.
      if (zmiana.tabela === 'dokumenty') {
        const istniejacy = pobierzIstniejacy.get(userId, zmiana.tabela, zmiana.rekord.id)
        const poprzedni = istniejacy ? JSON.parse(String(istniejacy.dane_json)) as RekordSynchronizacji : undefined
        const sekcje = [...new Set([...(poprzedni?.sekcjePrywatnosci as string[] | undefined) ?? [], ...(zmiana.rekord.sekcjePrywatnosci as string[] | undefined) ?? []])].sort()
        if (sekcje.length) zmiana.rekord = { ...zmiana.rekord, sekcjePrywatnosci: sekcje }
      }
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
      zapisano += 1
    }
    baza.exec('COMMIT')
  } catch (blad) {
    baza.exec('ROLLBACK')
    throw blad
  }
  return zapisano
}

export function poczatekSynchronizacji(): string {
  return POCZATEK_SYNCHRONIZACJI
}
