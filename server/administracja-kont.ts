import { randomUUID, randomBytes, createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export function wskazPierwszegoAdministratora(baza: DatabaseSync, id: string): void {
  baza.exec('BEGIN IMMEDIATE')
  try {
    if (baza.prepare("SELECT 1 FROM uzytkownicy WHERE rola_systemowa = 'administrator'").get()) throw new Error('Administrator został już wskazany.')
    const wynik = baza.prepare("UPDATE uzytkownicy SET rola_systemowa = 'administrator', zaktualizowano_at = ? WHERE id = ? AND status_konta = 'aktywne'").run(new Date().toISOString(), id)
    if (!wynik.changes) throw new Error('Wskaż UUID istniejącego aktywnego konta.')
    baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').run(id)
    baza.exec('COMMIT')
  } catch (blad) { baza.exec('ROLLBACK'); throw blad }
}

export function wykonajAdministracjeKont(
  baza: DatabaseSync, administratorId: string, metoda: string, sciezka: string,
  dane: Record<string, unknown>, hashujHaslo: (haslo: string) => string,
): { status: number; dane: unknown } {
  if (!baza.prepare("SELECT 1 FROM uzytkownicy WHERE id = ? AND rola_systemowa = 'administrator' AND status_konta = 'aktywne' AND wymagana_zmiana_hasla = 0").get(administratorId)) {
    return { status: 403, dane: { error: 'Operacja wymaga administratora systemu.' } }
  }
  if (metoda === 'GET' && sciezka === '/api/account/users') {
    return { status: 200, dane: { uzytkownicy: baza.prepare('SELECT id, email, login, nazwa, rola_systemowa AS rolaSystemowa, status_konta AS statusKonta FROM uzytkownicy ORDER BY email').all() } }
  }
  if (metoda === 'GET' && sciezka.startsWith('/api/account/users/')) {
    const id = sciezka.slice('/api/account/users/'.length)
    const konto = baza.prepare('SELECT id, email, login, nazwa, rola_systemowa AS rolaSystemowa, status_konta AS statusKonta, wymagana_zmiana_hasla AS wymaganaZmianaHasla FROM uzytkownicy WHERE id = ?').get(id)
    return konto ? { status: 200, dane: { konto } } : { status: 404, dane: { error: 'Nie znaleziono konta.' } }
  }
  const id = typeof dane.id === 'string' ? dane.id : ''
  const teraz = new Date().toISOString()
  if (metoda === 'POST' && sciezka === '/api/account/users/password') {
    // Starego hasła nie odczytujemy. Losowe nowe hasło nie jest ujawniane nikomu.
    const hasloHash = hashujHaslo(randomBytes(32).toString('base64url'))
    const kodOdzyskiwania = randomBytes(32).toString('base64url')
    const kodHash = createHash('sha256').update(kodOdzyskiwania).digest('hex')
    const wygasaAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    baza.exec('BEGIN IMMEDIATE')
    try {
      if (!baza.prepare('UPDATE uzytkownicy SET haslo_hash = ?, wymagana_zmiana_hasla = 1, zaktualizowano_at = ? WHERE id = ?').run(hasloHash, teraz, id).changes) throw new Error('Nie znaleziono konta.')
      baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').run(id)
      baza.prepare('DELETE FROM kody_odzyskiwania WHERE uzytkownik_id = ?').run(id)
      baza.prepare('INSERT INTO kody_odzyskiwania (uzytkownik_id, kod_hash, utworzono_at, wygasa_at) VALUES (?, ?, ?, ?)').run(id, kodHash, teraz, wygasaAt)
      baza.exec('COMMIT')
    } catch (blad) { baza.exec('ROLLBACK'); throw blad }
    return { status: 200, dane: { zmieniono: true, kodOdzyskiwania, wygasaAt } }
  }
  if (sciezka !== '/api/account/users' || !['POST', 'PUT'].includes(metoda)) return { status: 404, dane: { error: 'Nie znaleziono operacji.' } }
  const email = typeof dane.email === 'string' ? dane.email.trim().toLowerCase() : ''
  const login = dane.login == null || dane.login === '' ? null : String(dane.login).trim().toLowerCase()
  const nazwa = dane.nazwa == null || dane.nazwa === '' ? null : String(dane.nazwa).trim()
  const rola = String(dane.rolaSystemowa ?? 'uzytkownik')
  const status = String(dane.statusKonta ?? 'aktywne')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Niepoprawny e-mail.')
  if (login && !/^[a-z0-9._-]{1,254}$/.test(login)) throw new Error('Niepoprawny login.')
  if (nazwa && nazwa.length > 200) throw new Error('Nazwa jest za długa.')
  if (!['administrator', 'uzytkownik'].includes(rola) || !['aktywne', 'nieaktywne', 'zarchiwizowane'].includes(status)) throw new Error('Niepoprawna rola lub status.')
  if (baza.prepare('SELECT 1 FROM uzytkownicy WHERE id <> ? AND (email = ? OR (? IS NOT NULL AND login = ? COLLATE NOCASE))').get(metoda === 'POST' ? '' : id, email, login, login)) throw new Error('E-mail lub login jest już zajęty.')
  const nowyId = metoda === 'POST' ? randomUUID() : id
  const hasloHash = metoda === 'POST' ? hashujHaslo(typeof dane.haslo === 'string' ? dane.haslo : '') : undefined
  baza.exec('BEGIN IMMEDIATE')
  try {
    if (metoda === 'PUT') {
      const konto = baza.prepare('SELECT rola_systemowa, status_konta FROM uzytkownicy WHERE id = ?').get(id)
      if (!konto) throw new Error('Nie znaleziono konta.')
      if (konto.rola_systemowa === 'administrator' && konto.status_konta === 'aktywne' && (rola !== 'administrator' || status !== 'aktywne') && Number(baza.prepare("SELECT COUNT(*) AS liczba FROM uzytkownicy WHERE rola_systemowa = 'administrator' AND status_konta = 'aktywne'").get()?.liczba) <= 1) throw new Error('Nie można odebrać dostępu ostatniemu administratorowi.')
      baza.prepare('UPDATE uzytkownicy SET email = ?, login = ?, nazwa = ?, rola_systemowa = ?, status_konta = ?, zaktualizowano_at = ? WHERE id = ?').run(email, login, nazwa, rola, status, teraz, id)
      if (konto.rola_systemowa !== rola) baza.prepare('DELETE FROM sesje WHERE uzytkownik_id = ?').run(id)
    } else {
      baza.prepare('INSERT INTO uzytkownicy (id, email, login, nazwa, rola_systemowa, status_konta, haslo_hash, wymagana_zmiana_hasla, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)').run(nowyId, email, login, nazwa, rola, status, hasloHash!, teraz, teraz)
      baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES (?, ?, 'wlasciciel', 'aktywne', ?, ?)").run(nowyId, nowyId, teraz, teraz)
    }
    baza.exec('COMMIT')
  } catch (blad) { baza.exec('ROLLBACK'); throw blad }
  return { status: metoda === 'POST' ? 201 : 200, dane: { id: nowyId } }
}
