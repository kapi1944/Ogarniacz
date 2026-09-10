import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'

const NAZWA_COOKIE = 'ogarniacz_sesja'
const MAKSYMALNY_ROZMIAR_JSON = 1024 * 1024
const OKNO_PROB_LOGOWANIA_MS = 15 * 60 * 1000
const LIMIT_PROB_LOGOWANIA = 10
const probyLogowania = new Map<string, { liczba: number; od: number }>()
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
  pojazdy: 'samochod', terminyWaznosci: 'terminy', skierowania: 'skierowania', recepty: 'zdrowie',
  terapie: 'zdrowie', wpisyTerapii: 'zdrowie', platnosciStale: 'finanse', planyRat: 'finanse', raty: 'finanse',
  uprawnienia: 'ustawienia', edytorzy: 'ustawienia', ustawienia: 'ustawienia',
}

export interface KontekstDostepu {
  uzytkownikId: string
  wlascicielId: string
  rola: 'wlasciciel' | 'edytor'
  csrfHash?: string
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

function kluczLimitu(zadanie: IncomingMessage): string {
  return zadanie.socket.remoteAddress ?? 'nieznany'
}

function czyZablokowaneLogowanie(zadanie: IncomingMessage): boolean {
  const proba = probyLogowania.get(kluczLimitu(zadanie))
  if (!proba) return false
  if (Date.now() - proba.od >= OKNO_PROB_LOGOWANIA_MS) {
    probyLogowania.delete(kluczLimitu(zadanie))
    return false
  }
  return proba.liczba >= LIMIT_PROB_LOGOWANIA
}

function zarejestrujNieudaneLogowanie(zadanie: IncomingMessage): void {
  const klucz = kluczLimitu(zadanie)
  const teraz = Date.now()
  const poprzednia = probyLogowania.get(klucz)
  if (!poprzednia || teraz - poprzednia.od >= OKNO_PROB_LOGOWANIA_MS) {
    probyLogowania.set(klucz, { liczba: 1, od: teraz })
    return
  }
  poprzednia.liczba += 1
}

function wyczyscNieudaneLogowania(zadanie: IncomingMessage): void {
  probyLogowania.delete(kluczLimitu(zadanie))
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
  if (haslo.length < 12 || haslo.length > 200) throw new Error('Hasło musi mieć od 12 do 200 znaków.')
  const sol = randomBytes(16)
  const hash = scryptSync(haslo, sol, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt$16384$8$1$${sol.toString('base64url')}$${hash.toString('base64url')}`
}

function sprawdzHaslo(haslo: string, zapisanyHash: string): boolean {
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

export function pobierzKontekstDostepu(zadanie: IncomingMessage, baza: DatabaseSync): KontekstDostepu | undefined {
  const token = pobierzCookie(zadanie)
  if (!token) return undefined
  const teraz = new Date().toISOString()
  const wiersz = baza.prepare(`
    SELECT s.uzytkownik_id, s.aktywny_wlasciciel_id, s.csrf_hash, c.rola
    FROM sesje s
    JOIN czlonkostwa c ON c.wlasciciel_id = s.aktywny_wlasciciel_id AND c.uzytkownik_id = s.uzytkownik_id
    WHERE s.token_hash = ? AND s.wygasa_at > ? AND c.status = 'aktywne'
  `).get(hashSekretu(token), teraz)
  if (!wiersz) return undefined
  baza.prepare('UPDATE sesje SET ostatnia_aktywnosc_at = ? WHERE token_hash = ?').run(teraz, hashSekretu(token))
  return {
    uzytkownikId: tekst(wiersz.uzytkownik_id),
    wlascicielId: tekst(wiersz.aktywny_wlasciciel_id),
    rola: tekst(wiersz.rola) === 'wlasciciel' ? 'wlasciciel' : 'edytor',
    csrfHash: tekst(wiersz.csrf_hash),
  }
}

export function pobierzKontekstSynchronizacji(
  zadanie: IncomingMessage,
  baza: DatabaseSync,
  konfiguracja: KonfiguracjaSerwera,
): KontekstDostepu | undefined {
  const sesja = pobierzKontekstDostepu(zadanie, baza)
  if (sesja) return sesja
  if (!konfiguracja.syncAccessKey || !konfiguracja.syncUserId) return undefined
  const naglowek = zadanie.headers.authorization
  if (!naglowek?.startsWith('Bearer ') || !porownajSekrety(naglowek.slice(7), konfiguracja.syncAccessKey)) return undefined
  return { uzytkownikId: konfiguracja.syncUserId, wlascicielId: konfiguracja.syncUserId, rola: 'wlasciciel' }
}

export function czyDozwolonaTabela(
  baza: DatabaseSync,
  kontekst: KontekstDostepu,
  tabela: string,
  operacja: 'odczyt' | 'edycja',
): boolean {
  if (kontekst.rola === 'wlasciciel') return true
  const modul = MODUL_TABELI[tabela]
  if (!modul || modul === 'ustawienia' || modul === 'echo') return false
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
  const uzytkownik = baza.prepare('SELECT email FROM uzytkownicy WHERE id = ?').get(kontekst.uzytkownikId)
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
      const kontekst = pobierzKontekstDostepu(zadanie, baza)
      if (!kontekst) odpowiedzJson(odpowiedz, 401, { zalogowany: false })
      else {
        const csrf = randomBytes(24).toString('base64url')
        baza.prepare('UPDATE sesje SET csrf_hash = ? WHERE token_hash = ?').run(hashSekretu(csrf), hashSekretu(pobierzCookie(zadanie)!))
        odpowiedzJson(odpowiedz, 200, daneKonta(baza, kontekst, csrf))
      }
      return true
    }

    if (zadanie.method === 'POST' && sciezka === '/api/auth/bootstrap') {
      if (czyZablokowaneLogowanie(zadanie)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const dane = await odczytajJson(zadanie)
      if (!konfiguracja.ownerBootstrapToken || !porownajSekrety(tekst(dane.token), konfiguracja.ownerBootstrapToken)) {
        zarejestrujNieudaneLogowanie(zadanie)
        odpowiedzJson(odpowiedz, 403, { error: 'Bootstrap Właściciela jest niedostępny.' })
        return true
      }
      const email = normalizujEmail(dane.email)
      const hasloHash = hashujHaslo(tekst(dane.haslo))
      const prawdziweKonta = Number(baza.prepare("SELECT COUNT(*) AS liczba FROM uzytkownicy WHERE haslo_hash <> 'dostep-przez-klucz-serwera'").get()?.liczba ?? 0)
      if (prawdziweKonta > 0) {
        odpowiedzJson(odpowiedz, 409, { error: 'Konto Właściciela już istnieje.' })
        return true
      }
      const teraz = new Date().toISOString()
      const istniejacyId = konfiguracja.syncUserId && baza.prepare('SELECT id FROM uzytkownicy WHERE id = ?').get(konfiguracja.syncUserId)
      const uzytkownikId = istniejacyId ? konfiguracja.syncUserId! : konfiguracja.syncUserId ?? randomUUID()
      baza.exec('BEGIN')
      try {
        baza.prepare(`INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET email = excluded.email, haslo_hash = excluded.haslo_hash, zaktualizowano_at = excluded.zaktualizowano_at`)
          .run(uzytkownikId, email, hasloHash, teraz, teraz)
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
      wyczyscNieudaneLogowania(zadanie)
      odpowiedzJson(odpowiedz, 201, { ...daneKonta(baza, { uzytkownikId, wlascicielId: uzytkownikId, rola: 'wlasciciel' }, sesja.csrf), kodyOdzyskiwania }, sesja.cookie)
      return true
    }

    if (zadanie.method === 'POST' && sciezka === '/api/auth/login') {
      if (czyZablokowaneLogowanie(zadanie)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const dane = await odczytajJson(zadanie)
      const email = normalizujEmail(dane.email)
      const uzytkownik = baza.prepare('SELECT id, haslo_hash FROM uzytkownicy WHERE email = ?').get(email)
      if (!uzytkownik || !sprawdzHaslo(tekst(dane.haslo), tekst(uzytkownik.haslo_hash))) {
        zarejestrujNieudaneLogowanie(zadanie)
        odpowiedzJson(odpowiedz, 401, { error: 'Nieprawidłowy e-mail lub hasło.' })
        return true
      }
      const uzytkownikId = tekst(uzytkownik.id)
      const czlonkostwo = baza.prepare(`SELECT wlasciciel_id, rola FROM czlonkostwa
        WHERE uzytkownik_id = ? AND status = 'aktywne' ORDER BY CASE WHEN rola = 'wlasciciel' THEN 0 ELSE 1 END LIMIT 1`).get(uzytkownikId)
      if (!czlonkostwo) {
        odpowiedzJson(odpowiedz, 403, { error: 'Konto nie ma aktywnego dostępu.' })
        return true
      }
      const wlascicielId = tekst(czlonkostwo.wlasciciel_id)
      const rola = tekst(czlonkostwo.rola) === 'wlasciciel' ? 'wlasciciel' : 'edytor'
      const sesja = utworzSesje(baza, uzytkownikId, wlascicielId, konfiguracja)
      wyczyscNieudaneLogowania(zadanie)
      odpowiedzJson(odpowiedz, 200, daneKonta(baza, { uzytkownikId, wlascicielId, rola }, sesja.csrf), sesja.cookie)
      return true
    }

    if (zadanie.method === 'POST' && sciezka === '/api/auth/recover') {
      if (czyZablokowaneLogowanie(zadanie)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const dane = await odczytajJson(zadanie)
      const email = normalizujEmail(dane.email)
      const uzytkownik = baza.prepare('SELECT id FROM uzytkownicy WHERE email = ?').get(email)
      const kodHash = hashSekretu(tekst(dane.kod))
      const kod = uzytkownik && baza.prepare('SELECT 1 FROM kody_odzyskiwania WHERE uzytkownik_id = ? AND kod_hash = ? AND uzyto_at IS NULL').get(tekst(uzytkownik.id), kodHash)
      if (!uzytkownik || !kod) {
        zarejestrujNieudaneLogowanie(zadanie)
        odpowiedzJson(odpowiedz, 401, { error: 'Nieprawidłowy kod odzyskiwania.' })
        return true
      }
      const teraz = new Date().toISOString()
      const uzytkownikId = tekst(uzytkownik.id)
      baza.exec('BEGIN')
      try {
        baza.prepare('UPDATE uzytkownicy SET haslo_hash = ?, zaktualizowano_at = ? WHERE id = ?').run(hashujHaslo(tekst(dane.noweHaslo)), teraz, uzytkownikId)
        baza.prepare('UPDATE kody_odzyskiwania SET uzyto_at = ? WHERE uzytkownik_id = ? AND kod_hash = ?').run(teraz, uzytkownikId, kodHash)
        baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').run(uzytkownikId)
        baza.exec('COMMIT')
      } catch (blad) {
        baza.exec('ROLLBACK')
        throw blad
      }
      wyczyscNieudaneLogowania(zadanie)
      odpowiedzJson(odpowiedz, 200, { zmienionoHaslo: true })
      return true
    }

    if (zadanie.method === 'POST' && sciezka === '/api/auth/invitations/accept') {
      if (czyZablokowaneLogowanie(zadanie)) {
        odpowiedzLimitu(odpowiedz)
        return true
      }
      const dane = await odczytajJson(zadanie)
      const tokenHash = hashSekretu(tekst(dane.token))
      const zaproszenie = baza.prepare(`SELECT id, wlasciciel_id, email FROM zaproszenia_edytorow
        WHERE token_hash = ? AND status = 'oczekuje' AND wygasa_at > ?`).get(tokenHash, new Date().toISOString())
      if (!zaproszenie) {
        zarejestrujNieudaneLogowanie(zadanie)
        odpowiedzJson(odpowiedz, 410, { error: 'Zaproszenie wygasło albo zostało cofnięte.' })
        return true
      }
      const email = tekst(zaproszenie.email)
      const istniejacy = baza.prepare('SELECT id, haslo_hash FROM uzytkownicy WHERE email = ?').get(email)
      if (istniejacy && !sprawdzHaslo(tekst(dane.haslo), tekst(istniejacy.haslo_hash))) {
        zarejestrujNieudaneLogowanie(zadanie)
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
      wyczyscNieudaneLogowania(zadanie)
      odpowiedzJson(odpowiedz, 200, { ...daneKonta(baza, { uzytkownikId, wlascicielId, rola: 'edytor' }, sesja.csrf), kodyOdzyskiwania }, sesja.cookie)
      return true
    }

    const kontekst = pobierzKontekstDostepu(zadanie, baza)
    if (!kontekst) {
      odpowiedzJson(odpowiedz, 401, { error: 'Zaloguj się ponownie.' })
      return true
    }
    if (zadanie.method !== 'GET' && !sprawdzCsrf(zadanie, kontekst)) {
      odpowiedzJson(odpowiedz, 403, { error: 'Sesja wymaga odświeżenia.' })
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
    if (kontekst.rola !== 'wlasciciel') {
      odpowiedzJson(odpowiedz, 403, { error: 'Operacja jest dostępna tylko dla Właściciela.' })
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/invitations') {
      const dane = await odczytajJson(zadanie)
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
      const dane = await odczytajJson(zadanie)
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
      const dane = await odczytajJson(zadanie)
      baza.prepare("UPDATE granty_dostepu SET status = 'cofniete', zaktualizowano_at = ? WHERE id = ? AND wlasciciel_id = ?")
        .run(new Date().toISOString(), tekst(dane.id), kontekst.wlascicielId)
      odpowiedzJson(odpowiedz, 200, { cofnieto: true })
      return true
    }
    if (zadanie.method === 'POST' && sciezka === '/api/account/editors/revoke') {
      const dane = await odczytajJson(zadanie)
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
  } catch {
    odpowiedzJson(odpowiedz, 400, { error: 'Nie udało się wykonać operacji konta.' })
    return true
  }
}
