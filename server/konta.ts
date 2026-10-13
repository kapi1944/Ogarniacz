import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'
import { wykonajAdministracjeKont } from './administracja-kont.ts'

const NAZWA_COOKIE = 'ogarniacz_sesja'
const MAKSYMALNY_ROZMIAR_JSON = 1024 * 1024
const OKNO_PROB_LOGOWANIA_MS = 15 * 60 * 1000
const LIMIT_PROB_LOGOWANIA = 10
const probyLogowania = new WeakMap<DatabaseSync, Map<string, { liczba: number; od: number }>>()
const LIMIT_ADRESU = 50
const LIMIT_KLUCZY = 10_000
const MODULY = new Set([
  'zadania', 'projekty', 'skrzynka', 'planer', 'grafik', 'nawyki', 'leki', 'wizyty', 'zdrowie',
  'skierowania', 'przypomnienia', 'zakupy', 'rachunki', 'miasto', 'miejsca', 'cele', 'notatki',
  'pomysly', 'na_pozniej', 'kontakty', 'dokumenty', 'finanse', 'samochod', 'terminy', 'echo', 'ustawienia',
])

const MODUL_TABELI: Record<string, string> = {
  zadania: 'zadania', projekty: 'projekty', skrzynka: 'skrzynka', blokiCzasu: 'planer',
  grafikPracy: 'grafik', wyjatkiGrafiku: 'grafik', urlopy: 'grafik', nawyki: 'nawyki',
  dziennikNawykow: 'nawyki', leki: 'leki', dziennikLekow: 'leki', wizyty: 'wizyty',
  przypomnienia: 'przypomnienia', listyZakupow: 'zakupy', pozycjeZakupow: 'zakupy', rachunki: 'rachunki',
  platnosciRachunkow: 'rachunki', notatki: 'notatki', pomysly: 'pomysly', naPozniej: 'na_pozniej',
  cele: 'cele', kontakty: 'kontakty', dokumenty: 'dokumenty', wydatki: 'finanse', budzety: 'finanse',
  kontaFinansowe: 'finanse', miejsca: 'miasto',
  pojazdy: 'samochod', terminyWaznosci: 'terminy', skierowania: 'skierowania', recepty: 'zdrowie',
  terapie: 'zdrowie', wpisyTerapii: 'zdrowie', platnosciStale: 'finanse', planyRat: 'finanse', raty: 'finanse',
  uprawnienia: 'ustawienia', edytorzy: 'ustawienia', ustawienia: 'ustawienia',
}

export interface KontekstDostepu {
  uzytkownikId: string
  wlascicielId: string
  rola: 'wlasciciel' | 'edytor'
  csrfHash?: string
  wymaganaZmianaHasla?: boolean
}

interface UtworzonaSesja {
  cookie: string
  csrf: string
}

function tekst(wartosc: unknown): string {
  return typeof wartosc === 'string' ? wartosc : String(wartosc ?? '')
}

function odpowiedzJson(odpowiedz: ServerResponse, status: number, dane: unknown, cookie?: string): void {
  odpowiedz.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  })
  odpowiedz.end(JSON.stringify(dane))
}

async function odczytajJson(zadanie: IncomingMessage): Promise<Record<string, unknown>> {
  const fragmenty: Buffer[] = []
  let rozmiar = 0
  for await (const fragment of zadanie) {
    const bufor = Buffer.isBuffer(fragment) ? fragment : Buffer.from(fragment)
    rozmiar += bufor.length
    if (rozmiar > MAKSYMALNY_ROZMIAR_JSON) throw new Error('Żądanie jest za duże.')
    fragmenty.push(bufor)
  }
  const dane = JSON.parse(Buffer.concat(fragmenty).toString('utf8')) as unknown
  if (!dane || typeof dane !== 'object' || Array.isArray(dane)) throw new Error('Niepoprawne dane.')
  return dane as Record<string, unknown>
}

function hashSekretu(sekret: string): string {
  return createHash('sha256').update(sekret).digest('hex')
}

function porownajSekrety(a: string, b: string): boolean {
  const buforA = Buffer.from(a)
  const buforB = Buffer.from(b)
  return buforA.length === buforB.length && timingSafeEqual(buforA, buforB)
}

function kluczeLimitu(zadanie: IncomingMessage, konto?: string): string[] {
  // Nagłówki Forwarded/X-Forwarded-For nie stanowią dowodu adresu klienta.
  return [`adres:${zadanie.socket.remoteAddress ?? 'nieznany'}`, ...(konto ? [`konto:${hashSekretu(konto)}`] : [])]
}

function pobierzProby(baza: DatabaseSync): Map<string, { liczba: number; od: number }> {
  let proby = probyLogowania.get(baza)
  if (!proby) {
    proby = new Map()
    probyLogowania.set(baza, proby)
  }
  for (const [klucz, proba] of proby) {
    if (Date.now() - proba.od >= OKNO_PROB_LOGOWANIA_MS) proby.delete(klucz)
  }
  return proby
}

function czyZablokowaneLogowanie(zadanie: IncomingMessage, baza: DatabaseSync, konto?: string): boolean {
  const proby = pobierzProby(baza)
  return proby.size >= LIMIT_KLUCZY || kluczeLimitu(zadanie, konto).some((klucz) =>
    (proby.get(klucz)?.liczba ?? 0) >= (klucz.startsWith('adres:') ? LIMIT_ADRESU : LIMIT_PROB_LOGOWANIA))
}

function zarejestrujNieudaneLogowanie(zadanie: IncomingMessage, baza: DatabaseSync, konto?: string): void {
  const proby = pobierzProby(baza)
  for (const klucz of kluczeLimitu(zadanie, konto)) {
    const poprzednia = proby.get(klucz)
    if (poprzednia) poprzednia.liczba += 1
    else if (proby.size < LIMIT_KLUCZY) proby.set(klucz, { liczba: 1, od: Date.now() })
  }
}

function wyczyscNieudaneLogowania(baza: DatabaseSync, konto: string): void {
  // Sukces na jednym koncie nie zeruje limitu adresu dla ataków na inne konta.
  pobierzProby(baza).delete(`konto:${hashSekretu(konto)}`)
}

function odpowiedzLimitu(odpowiedz: ServerResponse): void {
  odpowiedz.setHeader('retry-after', String(OKNO_PROB_LOGOWANIA_MS / 1000))
  odpowiedzJson(odpowiedz, 429, { error: 'Zbyt wiele prób. Spróbuj ponownie później.' })
}

function normalizujEmail(wartosc: unknown): string {
  const email = tekst(wartosc).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Podaj poprawny adres e-mail.')
  return email
}

function hashujHaslo(haslo: string): string {
  if (haslo.length < 8 || haslo.length > 200) throw new Error('Hasło musi mieć od 8 do 200 znaków.')
  const sol = randomBytes(16)
  const hash = scryptSync(haslo, sol, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt$16384$8$1$${sol.toString('base64url')}$${hash.toString('base64url')}`
}

function czyIstniejeKontoWlasciciela(baza: DatabaseSync): boolean {
  return Boolean(baza.prepare("SELECT 1 FROM czlonkostwa WHERE rola = 'wlasciciel' LIMIT 1").get())
}

function sprawdzHaslo(haslo: string, zapisanyHash: string): boolean {
  if (haslo.length > 200) return false
  const [algorytm, koszt, r, p, sol, oczekiwany] = zapisanyHash.split('$')
  if (algorytm !== 'scrypt' || !koszt || !r || !p || !sol || !oczekiwany) return false
  try {
    const wzorzec = Buffer.from(oczekiwany, 'base64url')
    const hash = scryptSync(haslo, Buffer.from(sol, 'base64url'), wzorzec.length, {
      N: Number(koszt), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    })
    return hash.length === wzorzec.length && timingSafeEqual(hash, wzorzec)
  } catch {
    return false
  }
}

function pobierzCookie(zadanie: IncomingMessage): string | undefined {
  for (const para of (zadanie.headers.cookie ?? '').split(';')) {
    const [nazwa, ...reszta] = para.trim().split('=')
    if (nazwa === NAZWA_COOKIE) return decodeURIComponent(reszta.join('='))
  }
  return undefined
}

function utworzSesje(
  baza: DatabaseSync,
  uzytkownikId: string,
  wlascicielId: string,
  konfiguracja: KonfiguracjaSerwera,
): UtworzonaSesja {
  const token = randomBytes(32).toString('base64url')
  const csrf = randomBytes(24).toString('base64url')
  const teraz = new Date()
  const wygasa = new Date(teraz.getTime() + konfiguracja.czasSesjiDni * 86_400_000)
  baza.prepare(`
    INSERT INTO sesje (token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(hashSekretu(token), uzytkownikId, wlascicielId, hashSekretu(csrf), wygasa.toISOString(), teraz.toISOString(), teraz.toISOString())
  return {
    csrf,
    cookie: `${NAZWA_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${konfiguracja.czasSesjiDni * 86_400}`,
  }
}

function wygasCookie(): string {
  return `${NAZWA_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`
}

function utworzKodyOdzyskiwania(baza: DatabaseSync, uzytkownikId: string): string[] {
  const kody = Array.from({ length: 8 }, () => `${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}`)
  const teraz = new Date().toISOString()
  const zapisz = baza.prepare('INSERT INTO kody_odzyskiwania (uzytkownik_id, kod_hash, utworzono_at) VALUES (?, ?, ?)')
  for (const kod of kody) zapisz.run(uzytkownikId, hashSekretu(kod), teraz)
  return kody
}

export function pobierzKontekstDostepu(zadanie: IncomingMessage, baza: DatabaseSync, dopuscZmianeHasla = false): KontekstDostepu | undefined {
  const token = pobierzCookie(zadanie)
  if (!token) return undefined
  const teraz = new Date().toISOString()
  const wiersz = baza.prepare(`
    SELECT s.uzytkownik_id, s.aktywny_wlasciciel_id, s.csrf_hash, c.rola, u.wymagana_zmiana_hasla
    FROM sesje s
    JOIN czlonkostwa c ON c.wlasciciel_id = s.aktywny_wlasciciel_id AND c.uzytkownik_id = s.uzytkownik_id
    JOIN uzytkownicy u ON u.id = s.uzytkownik_id
    JOIN uzytkownicy w ON w.id = s.aktywny_wlasciciel_id
    WHERE s.token_hash = ? AND s.wygasa_at > ? AND c.status = 'aktywne'
      AND u.status_konta = 'aktywne' AND w.status_konta = 'aktywne'
  `).get(hashSekretu(token), teraz)
  if (!wiersz) return undefined
  const wskazanyUzytkownik = zadanie.headers['x-ogarniacz-user-id']
  const wskazanyWlasciciel = zadanie.headers['x-ogarniacz-owner-id']
  if ((wskazanyUzytkownik !== undefined || wskazanyWlasciciel !== undefined)
    && (wskazanyUzytkownik !== wiersz.uzytkownik_id || wskazanyWlasciciel !== wiersz.aktywny_wlasciciel_id)) return undefined
  if (Number(wiersz.wymagana_zmiana_hasla) === 1 && !dopuscZmianeHasla) return undefined
  baza.prepare('UPDATE sesje SET ostatnia_aktywnosc_at = ? WHERE token_hash = ?').run(teraz, hashSekretu(token))
  return {
    uzytkownikId: tekst(wiersz.uzytkownik_id),
    wlascicielId: tekst(wiersz.aktywny_wlasciciel_id),
    rola: tekst(wiersz.rola) === 'wlasciciel' ? 'wlasciciel' : 'edytor',
    csrfHash: tekst(wiersz.csrf_hash),
    wymaganaZmianaHasla: Number(wiersz.wymagana_zmiana_hasla) === 1,
  }
}

export function czyDozwolonaTabela(
  baza: DatabaseSync,
  kontekst: KontekstDostepu,
  tabela: string,
  operacja: 'odczyt' | 'edycja',
  rekord?: Record<string, unknown>,
): boolean {
  if (kontekst.rola === 'wlasciciel') return true
  const modul = MODUL_TABELI[tabela]
  if (!modul || modul === 'ustawienia' || modul === 'echo') return false
  const sekcja = tabela === 'wpisyTerapii' || tabela === 'zadania' && rekord && 'sesjaTerapiiId' in rekord ? 'psychoterapia'
    : tabela === 'dokumenty' && rekord && ('medyczne' in rekord && rekord.medyczne !== undefined || Array.isArray(rekord.powiazania) && rekord.powiazania.some((relacja) => relacja && ['zdrowie', 'wizyty', 'skierowania', 'leki'].includes(relacja.typ))) ? 'dokumentacja' : undefined
  const sekcje = new Set<string>(sekcja ? [sekcja] : [])
  if (tabela === 'dokumenty' && Array.isArray(rekord?.sekcjePrywatnosci)) {
    for (const sekcjaDokumentu of rekord.sekcjePrywatnosci) {
      if (!['dokumentacja', 'psychoterapia'].includes(sekcjaDokumentu)) return false
      sekcje.add('dokumentacja')
      sekcje.add(sekcjaDokumentu)
    }
  }
  if (tabela === 'dokumenty' && rekord?.id) {
    const zrodla = baza.prepare("SELECT tabela, dane_json FROM rekordy_synchronizacji WHERE uzytkownik_id = ? AND tabela IN ('wizyty', 'wpisyTerapii')").all(kontekst.wlascicielId)
    for (const zrodlo of zrodla) {
      const dane = JSON.parse(String(zrodlo.dane_json))
      if (zrodlo.tabela === 'wizyty' && dane.dokumentyIds?.includes(rekord.id)) sekcje.add('dokumentacja')
      if (zrodlo.tabela === 'wpisyTerapii' && dane.psychoterapia?.dokumentyIds?.includes(rekord.id)) { sekcje.add('dokumentacja'); sekcje.add('psychoterapia') }
    }
  }
  for (const prywatnaSekcja of sekcje) {
    const prywatnyGrant = baza.prepare(`SELECT odczyt, edycja FROM granty_dostepu
      WHERE wlasciciel_id = ? AND edytor_id = ? AND modul = 'zdrowie' AND sekcja = ? AND status = 'aktywne'`)
      .get(kontekst.wlascicielId, kontekst.uzytkownikId, prywatnaSekcja)
    if (!prywatnyGrant || Number(operacja === 'odczyt' ? prywatnyGrant.odczyt : prywatnyGrant.edycja) !== 1) return false
  }
  if (tabela === 'wpisyTerapii' && sekcje.size) return true
  const wiersz = baza.prepare(`
    SELECT odczyt, edycja FROM granty_dostepu
    WHERE wlasciciel_id = ? AND edytor_id = ? AND modul = ? AND sekcja = '' AND status = 'aktywne'
    LIMIT 1
  `).get(kontekst.wlascicielId, kontekst.uzytkownikId, modul)
  return Boolean(wiersz && Number(operacja === 'odczyt' ? wiersz.odczyt : wiersz.edycja) === 1)
}

export function sprawdzCsrf(zadanie: IncomingMessage, kontekst: KontekstDostepu): boolean {
  const token = zadanie.headers['x-ogarniacz-csrf']
  return typeof token === 'string' && Boolean(kontekst.csrfHash) && porownajSekrety(hashSekretu(token), kontekst.csrfHash!)
}

function daneKonta(baza: DatabaseSync, kontekst: KontekstDostepu, csrf?: string): Record<string, unknown> {
  const uzytkownik = baza.prepare('SELECT email, login, nazwa, rola_systemowa, status_konta, wymagana_zmiana_hasla FROM uzytkownicy WHERE id = ?').get(kontekst.uzytkownikId)
  const edytorzy = kontekst.rola === 'wlasciciel' ? baza.prepare(`
    SELECT u.id, u.email, c.status FROM czlonkostwa c JOIN uzytkownicy u ON u.id = c.uzytkownik_id
    WHERE c.wlasciciel_id = ? AND c.rola = 'edytor' ORDER BY u.email
  `).all(kontekst.wlascicielId) : []
  const granty = baza.prepare(`
    SELECT id, edytor_id, modul, sekcja, odczyt, edycja, status FROM granty_dostepu
    WHERE wlasciciel_id = ? AND (? = 'wlasciciel' OR edytor_id = ?) ORDER BY modul
  `).all(kontekst.wlascicielId, kontekst.rola, kontekst.uzytkownikId).map((wiersz) => ({
    id: tekst(wiersz.id), editorId: tekst(wiersz.edytor_id), modul: tekst(wiersz.modul),
    sekcja: tekst(wiersz.sekcja) || undefined, odczyt: Number(wiersz.odczyt) === 1,
    edycja: Number(wiersz.edycja) === 1, status: tekst(wiersz.status),
  }))
  return {
    zalogowany: true,
    uzytkownikId: kontekst.uzytkownikId,
    wlascicielId: kontekst.wlascicielId,
    email: tekst(uzytkownik?.email),
    login: uzytkownik?.login ?? null,
    nazwa: uzytkownik?.nazwa ?? null,
    rolaSystemowa: tekst(uzytkownik?.rola_systemowa),
    statusKonta: tekst(uzytkownik?.status_konta),
    wymaganaZmianaHasla: Number(uzytkownik?.wymagana_zmiana_hasla) === 1,
    rola: kontekst.rola,
    csrf,
    edytorzy: edytorzy.map((wiersz) => ({ id: tekst(wiersz.id), email: tekst(wiersz.email), status: tekst(wiersz.status) })),
    granty,
  }
}

export async function obsluzKonta(
  zadanie: IncomingMessage,
  odpowiedz: ServerResponse,
  baza: DatabaseSync,
  konfiguracja: KonfiguracjaSerwera,
): Promise<boolean> {
  const sciezka = new URL(zadanie.url ?? '/', 'http://localhost').pathname
  if (!sciezka.startsWith('/api/auth/') && !sciezka.startsWith('/api/account')) return false
  try {
    if (zadanie.method === 'GET' && sciezka === '/api/auth/session') {
      const kontekst = pobierzKontekstDostepu(zadanie, baza, true)
      if (!kontekst) odpowiedzJson(odpowiedz, 401, { zalogowany: false })
      else {
        const csrf = randomBytes(24).toString('base64url')
        baza.prepare('UPDATE sesje SET csrf_hash = ? WHERE token_hash = ?').run(hashSekretu(csrf), hashSekretu(pobierzCookie(zadanie)!))
        odpowiedzJson(odpowiedz, 200, daneKonta(baza, kontekst, csrf))
      }
      return true
    }

    if (zadanie.method === 'GET' && sciezka === '/api/auth/bootstrap/status') {
      odpowiedzJson(odpowiedz, 200, {
        dostepny: Boolean(konfiguracja.ownerBootstrapToken) && !czyIstniejeKontoWlasciciela(baza),
      })
      return true
    }

    if (zadanie.method === 'POST' && sciezka === '/api/auth/bootstrap') {
      if (czyIstniejeKontoWlasciciela(baza)) {
        odpowiedzJson(odpowiedz, 409, { error: 'Konto Właściciela już istnieje.' })
        return true
      }
      if (czyZablokowaneLogowanie(zadanie, baza)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const dane = await odczytajJson(zadanie)
      if (!konfiguracja.ownerBootstrapToken || !porownajSekrety(tekst(dane.token), konfiguracja.ownerBootstrapToken)) {
        zarejestrujNieudaneLogowanie(zadanie, baza)
        odpowiedzJson(odpowiedz, 403, { error: 'Bootstrap Właściciela jest niedostępny.' })
        return true
      }
      const email = normalizujEmail(dane.email)
      const hasloHash = hashujHaslo(tekst(dane.haslo))
      const teraz = new Date().toISOString()
      const uzytkownikId = randomUUID()
      baza.exec('BEGIN')
      try {
        const rolaSystemowa = baza.prepare('SELECT 1 FROM uzytkownicy LIMIT 1').get() ? 'uzytkownik' : 'administrator'
        baza.prepare(`INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at, rola_systemowa) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET email = excluded.email, haslo_hash = excluded.haslo_hash, zaktualizowano_at = excluded.zaktualizowano_at`)
          .run(uzytkownikId, email, hasloHash, teraz, teraz, rolaSystemowa)
        baza.prepare(`INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at)
          VALUES (?, ?, 'wlasciciel', 'aktywne', ?, ?)
          ON CONFLICT(wlasciciel_id, uzytkownik_id) DO UPDATE SET rola = 'wlasciciel', status = 'aktywne', zaktualizowano_at = excluded.zaktualizowano_at`)
          .run(uzytkownikId, uzytkownikId, teraz, teraz)
        baza.exec('COMMIT')
      } catch (blad) {
        baza.exec('ROLLBACK')
        throw blad
      }
      const kodyOdzyskiwania = utworzKodyOdzyskiwania(baza, uzytkownikId)
      const sesja = utworzSesje(baza, uzytkownikId, uzytkownikId, konfiguracja)
      wyczyscNieudaneLogowania(baza, email)
      odpowiedzJson(odpowiedz, 201, { ...daneKonta(baza, { uzytkownikId, wlascicielId: uzytkownikId, rola: 'wlasciciel' }, sesja.csrf), kodyOdzyskiwania }, sesja.cookie)
      return true
    }

    if (zadanie.method === 'POST' && sciezka === '/api/auth/login') {
      if (czyZablokowaneLogowanie(zadanie, baza)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const dane = await odczytajJson(zadanie)
      const email = tekst(dane.email).trim().toLowerCase()
      if (czyZablokowaneLogowanie(zadanie, baza, email)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const uzytkownik = baza.prepare('SELECT id, haslo_hash, status_konta FROM uzytkownicy WHERE email = ? OR login = ? COLLATE NOCASE').get(email, email)
      if (!uzytkownik || uzytkownik.status_konta !== 'aktywne' || !sprawdzHaslo(tekst(dane.haslo), tekst(uzytkownik.haslo_hash))) {
        zarejestrujNieudaneLogowanie(zadanie, baza, email)
        odpowiedzJson(odpowiedz, 401, { error: 'Nieprawidłowy e-mail lub hasło.' })
        return true
      }
      const uzytkownikId = tekst(uzytkownik.id)
      const czlonkostwo = baza.prepare(`SELECT wlasciciel_id, rola FROM czlonkostwa
        WHERE uzytkownik_id = ? AND status = 'aktywne'
          AND wlasciciel_id IN (SELECT id FROM uzytkownicy WHERE status_konta = 'aktywne')
        ORDER BY CASE WHEN rola = 'wlasciciel' THEN 0 ELSE 1 END LIMIT 1`).get(uzytkownikId)
      if (!czlonkostwo) {
        odpowiedzJson(odpowiedz, 403, { error: 'Konto nie ma aktywnego dostępu.' })
        return true
      }
      const wlascicielId = tekst(czlonkostwo.wlasciciel_id)
      const rola = tekst(czlonkostwo.rola) === 'wlasciciel' ? 'wlasciciel' : 'edytor'
      const sesja = utworzSesje(baza, uzytkownikId, wlascicielId, konfiguracja)
      wyczyscNieudaneLogowania(baza, email)
      odpowiedzJson(odpowiedz, 200, daneKonta(baza, { uzytkownikId, wlascicielId, rola }, sesja.csrf), sesja.cookie)
      return true
    }

    if (zadanie.method === 'POST' && sciezka === '/api/auth/recover') {
      if (czyZablokowaneLogowanie(zadanie, baza)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const dane = await odczytajJson(zadanie)
      const email = normalizujEmail(dane.email)
      if (czyZablokowaneLogowanie(zadanie, baza, email)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const uzytkownik = baza.prepare("SELECT id FROM uzytkownicy WHERE email = ? AND status_konta = 'aktywne'").get(email)
      const kodHash = hashSekretu(tekst(dane.kod))
      const kod = uzytkownik && baza.prepare('SELECT 1 FROM kody_odzyskiwania WHERE uzytkownik_id = ? AND kod_hash = ? AND uzyto_at IS NULL AND (wygasa_at IS NULL OR wygasa_at > ?)').get(tekst(uzytkownik.id), kodHash, new Date().toISOString())
      if (!uzytkownik || !kod) {
        zarejestrujNieudaneLogowanie(zadanie, baza, email)
        odpowiedzJson(odpowiedz, 401, { error: 'Nieprawidłowy kod odzyskiwania.' })
        return true
      }
      const teraz = new Date().toISOString()
      const uzytkownikId = tekst(uzytkownik.id)
      baza.exec('BEGIN IMMEDIATE')
      try {
        const zuzycie = baza.prepare('UPDATE kody_odzyskiwania SET uzyto_at = ? WHERE uzytkownik_id = ? AND kod_hash = ? AND uzyto_at IS NULL AND (wygasa_at IS NULL OR wygasa_at > ?)').run(teraz, uzytkownikId, kodHash, teraz)
        if (!zuzycie.changes) throw new Error('Nieprawidłowy kod odzyskiwania.')
        baza.prepare('UPDATE uzytkownicy SET haslo_hash = ?, wymagana_zmiana_hasla = 0, zaktualizowano_at = ? WHERE id = ?').run(hashujHaslo(tekst(dane.noweHaslo)), teraz, uzytkownikId)
        baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').run(uzytkownikId)
        baza.exec('COMMIT')
      } catch (blad) {
        baza.exec('ROLLBACK')
        throw blad
      }
      wyczyscNieudaneLogowania(baza, email)
      odpowiedzJson(odpowiedz, 200, { zmienionoHaslo: true })
      return true
    }

    if (zadanie.method === 'POST' && sciezka === '/api/auth/invitations/accept') {
      if (czyZablokowaneLogowanie(zadanie, baza)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const dane = await odczytajJson(zadanie)
      const tokenHash = hashSekretu(tekst(dane.token))
      const zaproszenie = baza.prepare(`SELECT id, wlasciciel_id, email FROM zaproszenia_edytorow
        WHERE token_hash = ? AND status = 'oczekuje' AND wygasa_at > ?`).get(tokenHash, new Date().toISOString())
      if (!zaproszenie) {
        zarejestrujNieudaneLogowanie(zadanie, baza)
        odpowiedzJson(odpowiedz, 410, { error: 'Zaproszenie wygasło albo zostało cofnięte.' })
        return true
      }
      const email = tekst(zaproszenie.email)
      if (czyZablokowaneLogowanie(zadanie, baza, email)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const istniejacy = baza.prepare('SELECT id, haslo_hash, status_konta FROM uzytkownicy WHERE email = ?').get(email)
      const wlasciciel = baza.prepare('SELECT status_konta FROM uzytkownicy WHERE id = ?').get(tekst(zaproszenie.wlasciciel_id))
      if (wlasciciel?.status_konta !== 'aktywne' || istniejacy && (istniejacy.status_konta !== 'aktywne' || !sprawdzHaslo(tekst(dane.haslo), tekst(istniejacy.haslo_hash)))) {
        zarejestrujNieudaneLogowanie(zadanie, baza, email)
        odpowiedzJson(odpowiedz, 401, { error: 'Podaj hasło istniejącego konta.' })
        return true
      }
      const teraz = new Date().toISOString()
      const uzytkownikId = istniejacy ? tekst(istniejacy.id) : randomUUID()
      baza.exec('BEGIN')
      try {
        if (!istniejacy) baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)')
          .run(uzytkownikId, email, hashujHaslo(tekst(dane.haslo)), teraz, teraz)
        baza.prepare(`INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at)
          VALUES (?, ?, 'edytor', 'aktywne', ?, ?)
          ON CONFLICT(wlasciciel_id, uzytkownik_id) DO UPDATE SET status = 'aktywne', zaktualizowano_at = excluded.zaktualizowano_at`)
          .run(tekst(zaproszenie.wlasciciel_id), uzytkownikId, teraz, teraz)
        baza.prepare("UPDATE zaproszenia_edytorow SET status = 'przyjete', przyjeto_at = ? WHERE id = ?").run(teraz, tekst(zaproszenie.id))
        baza.exec('COMMIT')
      } catch (blad) {
        baza.exec('ROLLBACK')
        throw blad
      }
      const kodyOdzyskiwania = istniejacy ? undefined : utworzKodyOdzyskiwania(baza, uzytkownikId)
      const wlascicielId = tekst(zaproszenie.wlasciciel_id)
      const sesja = utworzSesje(baza, uzytkownikId, wlascicielId, konfiguracja)
      wyczyscNieudaneLogowania(baza, email)
      odpowiedzJson(odpowiedz, 200, { ...daneKonta(baza, { uzytkownikId, wlascicielId, rola: 'edytor' }, sesja.csrf), kodyOdzyskiwania }, sesja.cookie)
      return true
    }

    // Odczyt ciała może czekać na sieć; autoryzację sprawdzamy dopiero po nim.
    const daneBezpieczenstwa = ['POST', 'PUT'].includes(zadanie.method ?? '')
      ? await odczytajJson(zadanie) : undefined
    const kontekst = pobierzKontekstDostepu(zadanie, baza, true)
    if (!kontekst) {
      odpowiedzJson(odpowiedz, 401, { error: 'Zaloguj się ponownie.' })
      return true
    }
    if (zadanie.method !== 'GET' && !sprawdzCsrf(zadanie, kontekst)) {
      odpowiedzJson(odpowiedz, 403, { error: 'Sesja wymaga odświeżenia.' })
      return true
    }

    if (kontekst.wymaganaZmianaHasla && !['/api/account/password', '/api/auth/logout', '/api/account/sessions/revoke-all'].includes(sciezka)) {
      odpowiedzJson(odpowiedz, 403, { error: 'Zmień hasło przed kontynuowaniem.' })
      return true
    }
    if (sciezka.startsWith('/api/account/users')) {
      const wynik = wykonajAdministracjeKont(baza, kontekst.uzytkownikId, zadanie.method ?? '', sciezka, daneBezpieczenstwa ?? {}, hashujHaslo)
      odpowiedzJson(odpowiedz, wynik.status, wynik.dane)
      return true
    }
    if (zadanie.method === 'GET' && sciezka === '/api/account') {
      odpowiedzJson(odpowiedz, 200, daneKonta(baza, kontekst))
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/auth/logout') {
      baza.prepare('DELETE FROM sesje WHERE token_hash = ?').run(hashSekretu(pobierzCookie(zadanie)!))
      odpowiedzJson(odpowiedz, 200, { wylogowano: true }, wygasCookie())
      return true
    }
    if (zadanie.method === 'GET' && sciezka === '/api/account/sessions') {
      const biezaca = hashSekretu(pobierzCookie(zadanie)!)
      const sesje = baza.prepare(`SELECT id, utworzono_at, ostatnia_aktywnosc_at, wygasa_at, token_hash = ? AS biezaca
        FROM sesje WHERE uzytkownik_id = ? AND wygasa_at > ? ORDER BY utworzono_at DESC`)
        .all(biezaca, kontekst.uzytkownikId, new Date().toISOString()).map((wiersz) => ({
          id: tekst(wiersz.id), utworzonoAt: tekst(wiersz.utworzono_at),
          ostatniaAktywnoscAt: tekst(wiersz.ostatnia_aktywnosc_at), biezaca: Number(wiersz.biezaca) === 1,
          wygasaAt: tekst(wiersz.wygasa_at),
        }))
      odpowiedzJson(odpowiedz, 200, { sesje })
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/sessions/revoke') {
      const dane = daneBezpieczenstwa!
      const sesja = baza.prepare('SELECT token_hash FROM sesje WHERE id = ? AND uzytkownik_id = ?')
        .get(tekst(dane.id), kontekst.uzytkownikId)
      if (!sesja) {
        odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono sesji.' })
        return true
      }
      baza.prepare('DELETE FROM sesje WHERE id = ? AND uzytkownik_id = ?').run(tekst(dane.id), kontekst.uzytkownikId)
      const biezaca = sesja.token_hash === hashSekretu(pobierzCookie(zadanie)!)
      odpowiedzJson(odpowiedz, 200, { wylogowano: true, biezaca }, biezaca ? wygasCookie() : undefined)
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/sessions/revoke-others') {
      baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ? AND token_hash <> ?').run(kontekst.uzytkownikId, hashSekretu(pobierzCookie(zadanie)!))
      odpowiedzJson(odpowiedz, 200, { wylogowano: true })
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/sessions/revoke-all') {
      baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').run(kontekst.uzytkownikId)
      odpowiedzJson(odpowiedz, 200, { wylogowano: true }, wygasCookie())
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/password') {
      const dane = daneBezpieczenstwa!
      const uzytkownik = baza.prepare('SELECT email, haslo_hash FROM uzytkownicy WHERE id = ?').get(kontekst.uzytkownikId)!
      const email = tekst(uzytkownik.email)
      if (czyZablokowaneLogowanie(zadanie, baza, email)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      if (!sprawdzHaslo(tekst(dane.aktualneHaslo), tekst(uzytkownik.haslo_hash))) {
        zarejestrujNieudaneLogowanie(zadanie, baza, email)
        odpowiedzJson(odpowiedz, 400, { error: 'Aktualne hasło jest nieprawidłowe.' })
        return true
      }
      const nowyHash = hashujHaslo(tekst(dane.noweHaslo))
      if (kontekst.wymaganaZmianaHasla && sprawdzHaslo(tekst(dane.noweHaslo), tekst(uzytkownik.haslo_hash))) {
        odpowiedzJson(odpowiedz, 400, { error: 'Nowe hasło musi różnić się od tymczasowego.' })
        return true
      }
      baza.exec('BEGIN')
      try {
        baza.prepare('UPDATE uzytkownicy SET haslo_hash = ?, wymagana_zmiana_hasla = 0, zaktualizowano_at = ? WHERE id = ?')
          .run(nowyHash, new Date().toISOString(), kontekst.uzytkownikId)
        baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ? AND token_hash <> ?')
          .run(kontekst.uzytkownikId, hashSekretu(pobierzCookie(zadanie)!))
        baza.exec('COMMIT')
      } catch (blad) {
        baza.exec('ROLLBACK')
        throw blad
      }
      wyczyscNieudaneLogowania(baza, email)
      odpowiedzJson(odpowiedz, 200, { zmieniono: true })
      return true
    }
    if (kontekst.rola !== 'wlasciciel') {
      odpowiedzJson(odpowiedz, 403, { error: 'Operacja jest dostępna tylko dla Właściciela.' })
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/invitations') {
      const dane = daneBezpieczenstwa!
      const email = normalizujEmail(dane.email)
      const token = randomBytes(32).toString('base64url')
      const id = randomUUID()
      const teraz = new Date()
      const wygasaAt = new Date(teraz.getTime() + 7 * 86_400_000).toISOString()
      baza.prepare(`INSERT INTO zaproszenia_edytorow (id, wlasciciel_id, email, token_hash, wygasa_at, status, utworzono_at)
        VALUES (?, ?, ?, ?, ?, 'oczekuje', ?)`)
        .run(id, kontekst.wlascicielId, email, hashSekretu(token), wygasaAt, teraz.toISOString())
      odpowiedzJson(odpowiedz, 201, { id, email, token, wygasaAt })
      return true
    }
    if (zadanie.method === 'PUT' && sciezka === '/api/account/grants') {
      const dane = daneBezpieczenstwa!
      const editorId = tekst(dane.editorId)
      const modul = tekst(dane.modul)
      const sekcja = tekst(dane.sekcja).trim()
      if (!MODULY.has(modul) || modul === 'ustawienia' || modul === 'echo') throw new Error('Niepoprawny zakres grantu.')
      const czlonkostwo = baza.prepare("SELECT 1 FROM czlonkostwa WHERE wlasciciel_id = ? AND uzytkownik_id = ? AND rola = 'edytor' AND status = 'aktywne'")
        .get(kontekst.wlascicielId, editorId)
      if (!czlonkostwo) throw new Error('Edytor nie ma aktywnego członkostwa.')
      const teraz = new Date().toISOString()
      const istniejacy = baza.prepare('SELECT id FROM granty_dostepu WHERE wlasciciel_id = ? AND edytor_id = ? AND modul = ? AND sekcja = ?')
        .get(kontekst.wlascicielId, editorId, modul, sekcja)
      const id = istniejacy ? tekst(istniejacy.id) : randomUUID()
      baza.prepare(`INSERT INTO granty_dostepu (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'aktywne', ?, ?)
        ON CONFLICT(wlasciciel_id, edytor_id, modul, sekcja) DO UPDATE SET odczyt = excluded.odczyt, edycja = excluded.edycja, status = 'aktywne', zaktualizowano_at = excluded.zaktualizowano_at`)
        .run(id, kontekst.wlascicielId, editorId, modul, sekcja, dane.odczyt === true ? 1 : 0, dane.edycja === true ? 1 : 0, teraz, teraz)
      odpowiedzJson(odpowiedz, 200, { id })
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/grants/revoke') {
      const dane = daneBezpieczenstwa!
      baza.prepare("UPDATE granty_dostepu SET status = 'cofniete', zaktualizowano_at = ? WHERE id = ? AND wlasciciel_id = ?")
        .run(new Date().toISOString(), tekst(dane.id), kontekst.wlascicielId)
      odpowiedzJson(odpowiedz, 200, { cofnieto: true })
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/editors/revoke') {
      const dane = daneBezpieczenstwa!
      const editorId = tekst(dane.editorId)
      const teraz = new Date().toISOString()
      baza.exec('BEGIN')
      try {
        baza.prepare("UPDATE czlonkostwa SET status = 'cofniete', zaktualizowano_at = ? WHERE wlasciciel_id = ? AND uzytkownik_id = ? AND rola = 'edytor'")
          .run(teraz, kontekst.wlascicielId, editorId)
        baza.prepare("UPDATE granty_dostepu SET status = 'cofniete', zaktualizowano_at = ? WHERE wlasciciel_id = ? AND edytor_id = ?")
          .run(teraz, kontekst.wlascicielId, editorId)
        baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ? AND aktywny_wlasciciel_id = ?').run(editorId, kontekst.wlascicielId)
        baza.exec('COMMIT')
      } catch (blad) {
        baza.exec('ROLLBACK')
        throw blad
      }
      odpowiedzJson(odpowiedz, 200, { cofnieto: true })
      return true
    }
    odpowiedzJson(odpowiedz, 404, { error: 'Nie znaleziono zasobu konta.' })
    return true
  } catch (blad) {
    const komunikat = blad instanceof Error && ['Hasło musi mieć od 8 do 200 znaków.', 'Niepoprawny e-mail.', 'Niepoprawny login.', 'Nazwa jest za długa.', 'Niepoprawna rola lub status.', 'Nie znaleziono konta.', 'Nie można odebrać dostępu ostatniemu administratorowi.', 'E-mail lub login jest już zajęty.'].includes(blad.message)
      ? blad.message
      : 'Nie udało się wykonać operacji konta.'
    odpowiedzJson(odpowiedz, 400, { error: komunikat })
    return true
  }
}
