import { strict as assert } from 'node:assert'
import { createHash, scryptSync } from 'node:crypto'
import { test, mock } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { setImmediate as kolejnyObieg } from 'node:timers/promises'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { uruchomMigracje } from './migracje.ts'
import { utworzSerwer } from './serwer.ts'
import type { Poczta } from './poczta.ts'

const ORIGIN = 'https://pi.prywatny.ts.net'
const TERAZ = '2026-10-17T10:00:00.000Z'
const STARE_HASLO = 'Historyczne-haslo-123'
const hash = (tekst: string) => createHash('sha256').update(tekst).digest('hex')
const sol = Buffer.from('syntetyczna-sol')
const HASH_HASLA = `scrypt$16384$8$1$${sol.toString('base64url')}$${scryptSync(STARE_HASLO, sol, 64).toString('base64url')}`

function dodajKonto(baza: DatabaseSync, id = 'historyczne-uuid', email = 'konto@example.test') {
  baza.prepare('INSERT INTO uzytkownicy (id, email, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, ?, ?)').run(id, email, HASH_HASLA, TERAZ, TERAZ)
  baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES (?, ?, 'wlasciciel', 'aktywne', ?, ?)").run(id, id, TERAZ, TERAZ)
  for (const token of [id + '-sesja1', id + '-sesja2']) {
    baza.prepare('INSERT INTO sesje (token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(hash(token), id, id, hash('csrf'), '2099-01-01T00:00:00.000Z', TERAZ, TERAZ)
  }
  baza.prepare('INSERT INTO kody_odzyskiwania (uzytkownik_id, kod_hash, utworzono_at) VALUES (?, ?, ?)').run(id, hash('stary-kod'), TERAZ)
}

async function zSerwerem(testuj: (dane: {
  baza: DatabaseSync; linki: string[]; odbiorcy: string[];
  wykonaj: (sciezka: string, dane: unknown, naglowki?: Record<string, string>) => Promise<Response>
}) => Promise<void>, poczta?: Poczta, wlaczona = true) {
  const baza = new DatabaseSync(':memory:')
  uruchomMigracje(baza)
  dodajKonto(baza)
  const linki: string[] = [], odbiorcy: string[] = []
  const konfiguracja = utworzKonfiguracjeSerwera(wlaczona ? { MAIL_PROVIDER: 'resend', MAIL_FROM: 'nadawca@example.test', MAIL_API_KEY: 'syntetyczny-klucz', PASSWORD_RESET_ORIGIN: ORIGIN } : {})
  const serwer = utworzSerwer(konfiguracja, baza, undefined, undefined, undefined, undefined, poczta ?? { wyslijLink: async (email, link) => { odbiorcy.push(email); linki.push(link) } })
  await new Promise<void>((gotowe) => serwer.listen(0, '127.0.0.1', gotowe))
  const adres = serwer.address()
  assert.ok(adres && typeof adres === 'object')
  const wykonaj = (sciezka: string, dane: unknown, naglowki?: Record<string, string>) => fetch(`http://127.0.0.1:${adres.port}/api/auth/${sciezka}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...naglowki }, body: JSON.stringify(dane),
  })
  try { await testuj({ baza, linki, odbiorcy, wykonaj }) }
  finally { await kolejnyObieg(); await new Promise<void>((gotowe) => serwer.close(() => gotowe())); baza.close() }
}

const tokenZLinku = (link: string) => new URL(link).hash.slice('#reset-hasla='.length)

test('link trafia wyłącznie do aktywnego konta, hash i termin są bezpieczne, a reset zachowuje UUID i stare kody', async () => {
  await zSerwerem(async ({ baza, linki, odbiorcy, wykonaj }) => {
    dodajKonto(baza, 'obce', 'obce@example.test')
    dodajKonto(baza, 'nieaktywne', 'nieaktywne@example.test')
    baza.prepare("UPDATE uzytkownicy SET status_konta = 'nieaktywne' WHERE id = 'nieaktywne'").run()
    baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES ('historyczne-uuid', 'obce', 'edytor', 'aktywne', ?, ?)").run(TERAZ, TERAZ)
    baza.prepare("INSERT INTO granty_dostepu (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at) VALUES ('grant-historyczny', 'historyczne-uuid', 'obce', 'zadania', '', 1, 0, 'aktywne', ?, ?)").run(TERAZ, TERAZ)
    baza.prepare("INSERT INTO instalacje (id, uzytkownik_id, ostatnia_aktywnosc_at, utworzono_at) VALUES ('instalacja-historyczna', 'historyczne-uuid', ?, ?)").run(TERAZ, TERAZ)
    baza.prepare("INSERT INTO rekordy_synchronizacji (uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, version, ostatnia_instalacja_id, server_updated_at) VALUES ('historyczne-uuid', 'zadania', 'rekord-historyczny', ?, ?, ?, 3, 'instalacja-historyczna', ?)").run(JSON.stringify({ id: 'rekord-historyczny', tytul: 'Dane przed resetem' }), TERAZ, TERAZ, TERAZ)
    baza.prepare("INSERT INTO przetworzone_zmiany_synchronizacji (uzytkownik_id, zmiana_id, przetworzono_at) VALUES ('historyczne-uuid', 'zmiana-historyczna', ?)").run(TERAZ)
    const tabeleDomenowe = ['granty_dostepu', 'instalacje', 'rekordy_synchronizacji', 'przetworzone_zmiany_synchronizacji']
    const danePrzed = tabeleDomenowe.map((tabela) => baza.prepare(`SELECT * FROM ${tabela}`).all())
    const tozsamosciPrzed = baza.prepare('SELECT id, email, login, nazwa, rola_systemowa, status_konta FROM uzytkownicy ORDER BY id').all()
    const relacje = baza.prepare('SELECT * FROM czlonkostwa').all()
    const kody = baza.prepare('SELECT * FROM kody_odzyskiwania').all()
    const odpowiedzi = []
    for (const email of [' KONTO@EXAMPLE.TEST ', 'brak@example.test', 'nieaktywne@example.test']) {
      const odpowiedz = await wykonaj('password/request', { email }, { host: 'atak.example.test', 'x-forwarded-host': 'atak.example.test' })
      assert.equal(odpowiedz.status, 202)
      assert.equal(odpowiedz.headers.get('cache-control'), 'no-store')
      odpowiedzi.push(await odpowiedz.text())
    }
    await kolejnyObieg()
    assert.equal(new Set(odpowiedzi).size, 1)
    assert.deepEqual(odbiorcy, ['konto@example.test'])
    assert.ok(linki[0].startsWith(ORIGIN + '/#reset-hasla='))
    const token = tokenZLinku(linki[0])
    assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    const zapis = baza.prepare('SELECT * FROM tokeny_resetowania_hasla').get()!
    assert.equal(zapis.token_hash, hash(token))
    assert.ok(Math.abs(Date.parse(String(zapis.wygasa_at)) - Date.now() - 900_000) < 5000)
    assert.doesNotMatch(JSON.stringify(zapis), new RegExp(token))
    assert.equal(baza.prepare("SELECT haslo_hash FROM uzytkownicy WHERE id = 'historyczne-uuid'").get()?.haslo_hash, HASH_HASLA)
    assert.equal(baza.prepare("SELECT COUNT(*) AS n FROM sesje WHERE uzytkownik_id = 'historyczne-uuid'").get()?.n, 2)
    await wykonaj('password/request', { email: 'konto@example.test' })
    await kolejnyObieg()
    const wyniki = await Promise.all([1, 2].map(() => wykonaj('password/reset', { token, noweHaslo: 'Nowe-wlasne-haslo' })))
    assert.deepEqual(wyniki.map((wynik) => wynik.status).sort(), [200, 401])
    assert.match(wyniki.find((wynik) => wynik.status === 200)!.headers.get('set-cookie')!, /Max-Age=0/)
    assert.equal(baza.prepare("SELECT COUNT(*) AS n FROM sesje WHERE uzytkownik_id = 'historyczne-uuid'").get()?.n, 0)
    assert.equal(baza.prepare("SELECT COUNT(*) AS n FROM sesje WHERE uzytkownik_id = 'obce'").get()?.n, 2)
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 0)
    assert.deepEqual(baza.prepare('SELECT * FROM czlonkostwa').all(), relacje)
    assert.deepEqual(baza.prepare('SELECT * FROM kody_odzyskiwania').all(), kody)
    assert.deepEqual(baza.prepare('SELECT id, email, login, nazwa, rola_systemowa, status_konta FROM uzytkownicy ORDER BY id').all(), tozsamosciPrzed)
    assert.deepEqual(tabeleDomenowe.map((tabela) => baza.prepare(`SELECT * FROM ${tabela}`).all()), danePrzed)
    assert.equal((await wykonaj('login', { email: 'konto@example.test', haslo: STARE_HASLO })).status, 401)
    const logowanie = await wykonaj('login', { email: 'konto@example.test', haslo: 'Nowe-wlasne-haslo' })
    assert.equal(logowanie.status, 200)
    assert.equal((await logowanie.json()).uzytkownikId, 'historyczne-uuid')
    assert.equal((await wykonaj('password/reset', { token: tokenZLinku(linki[1]), noweHaslo: 'Jeszcze-inne-haslo' })).status, 401)
    await wykonaj('password/request', { email: 'konto@example.test' }); await kolejnyObieg()
    assert.equal(linki.length, 3)
    assert.equal((await wykonaj('recover', { email: 'konto@example.test', kod: 'stary-kod', noweHaslo: 'Haslo-ze-starej-sciezki' })).status, 200)
    assert.equal((await wykonaj('password/reset', { token: tokenZLinku(linki[2]), noweHaslo: 'Jeszcze-inne-haslo' })).status, 401)
  })
})

test('błędne hasło i błąd transakcji nie zużywają tokenu ani sesji; wygasły token nie działa', async () => {
  await zSerwerem(async ({ baza, linki, wykonaj }) => {
    await wykonaj('password/request', { email: 'konto@example.test' }); await kolejnyObieg()
    const token = tokenZLinku(linki[0])
    assert.equal((await wykonaj('password/reset', { token, noweHaslo: 'krotkie' })).status, 400)
    assert.equal((await wykonaj('password/reset', { token, noweHaslo: 'x'.repeat(201) })).status, 400)
    baza.exec("CREATE TRIGGER awaria_resetowania BEFORE DELETE ON sesje BEGIN SELECT RAISE(ABORT, 'awaria'); END")
    assert.equal((await wykonaj('password/reset', { token, noweHaslo: 'Nowe-poprawne-haslo' })).status, 400)
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 1)
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM sesje').get()?.n, 2)
    assert.equal(baza.prepare('SELECT haslo_hash FROM uzytkownicy').get()?.haslo_hash, HASH_HASLA)
    baza.exec('DROP TRIGGER awaria_resetowania')
    baza.prepare("UPDATE tokeny_resetowania_hasla SET wygasa_at = '2000-01-01T00:00:00.000Z'").run()
    const wygasly = await wykonaj('password/reset', { token, noweHaslo: 'Nowe-poprawne-haslo' })
    const bledny = await wykonaj('password/reset', { token: 'x'.repeat(43), noweHaslo: 'Nowe-poprawne-haslo' })
    assert.equal(wygasly.status, 401)
    assert.equal(await wygasly.text(), await bledny.text())
  })
})

test('zmiana hasła, e-maila lub statusu unieważnia wszystkie wcześniej wydane linki', async () => {
  await zSerwerem(async ({ baza, wykonaj }) => {
    for (const sql of ["UPDATE uzytkownicy SET haslo_hash = 'nowy'", "UPDATE uzytkownicy SET email = 'nowy@example.test'", "UPDATE uzytkownicy SET status_konta = 'nieaktywne'"]) {
      baza.prepare('INSERT INTO tokeny_resetowania_hasla VALUES (?, ?, ?)').run(hash('token'), 'historyczne-uuid', '2099-01-01')
      baza.exec(sql)
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 0)
    }
    assert.equal((await wykonaj('password/reset', { token: 'x'.repeat(43), noweHaslo: 'Nowe-poprawne-haslo' })).status, 401)
  })
})

test('prośby o link mają limit konta i adresu, również dla nieznanych kont i podszytych nagłówków', async () => {
  await zSerwerem(async ({ baza, linki, wykonaj }) => {
    dodajKonto(baza, 'drugie', 'drugie@example.test')
    for (let numer = 0; numer < 4; numer += 1) assert.equal((await wykonaj('password/request', { email: numer % 2 ? ' KONTO@EXAMPLE.TEST ' : 'konto@example.test' })).status, 202)
    await kolejnyObieg()
    assert.equal(linki.length, 3)
    for (let numer = 0; numer < 17; numer += 1) assert.equal((await wykonaj('password/request', { email: `brak${numer}@example.test` }, { 'x-forwarded-for': `10.0.0.${numer}` })).status, 202)
    await wykonaj('password/request', { email: 'drugie@example.test' }); await kolejnyObieg()
    assert.equal(linki.length, 3)
  })
})

test('odpowiedź nie czeka na dostawcę poczty, a błędna próba nie zużywa innego tokenu', { timeout: 5000 }, async () => {
  const wysylka = Promise.withResolvers<void>()
  try {
    await zSerwerem(async ({ baza, wykonaj }) => {
      assert.equal((await wykonaj('password/request', { email: 'konto@example.test' })).status, 202)
      await kolejnyObieg()
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 1)
      wysylka.resolve()
      const odpowiedz = await wykonaj('password/reset', { token: 'nieznany', noweHaslo: 'Nowe-haslo' })
      assert.equal(odpowiedz.status, 401)
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 1)
    }, { wyslijLink: async () => wysylka.promise })
  } finally { wysylka.resolve() }
})

test('limit prób użycia tokenów chroni adres niezależnie od X-Forwarded-For', async () => {
  await zSerwerem(async ({ wykonaj }) => {
    for (let numer = 0; numer < 50; numer += 1) assert.equal((await wykonaj('password/reset', { token: 'bledny', noweHaslo: 'Nowe-haslo' }, { 'x-forwarded-for': `10.0.0.${numer}` })).status, 401)
    const limit = await wykonaj('password/reset', { token: 'bledny', noweHaslo: 'Nowe-haslo' })
    assert.equal(limit.status, 429)
    assert.equal(limit.headers.get('retry-after'), '900')
  })
})

test('awaria poczty nie ujawnia konta i nie loguje sekretów; stare odzyskiwanie nadal działa', async () => {
  const log = mock.method(console, 'error', () => {})
  try {
    await zSerwerem(async ({ baza, wykonaj }) => {
      const znane = await wykonaj('password/request', { email: 'konto@example.test' })
      const nieznane = await wykonaj('password/request', { email: 'brak@example.test' })
      assert.equal(await znane.text(), await nieznane.text())
      await kolejnyObieg()
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 0)
      assert.doesNotMatch(JSON.stringify(log.mock.calls), /syntetyczny-sekret|konto@example.test|reset-hasla=/)
      assert.equal(log.mock.callCount(), 1)
      assert.equal((await wykonaj('recover', { email: 'konto@example.test', kod: 'stary-kod', noweHaslo: 'Nowe-ze-starej-sciezki' })).status, 200)
    }, { wyslijLink: async () => { throw new Error('syntetyczny-sekret konto@example.test /#reset-hasla=sekret') } })
  } finally { log.mock.restore() }
})

test('nieskonfigurowana poczta zachowuje neutralną odpowiedź i nie wydaje tokenów', async () => {
  await zSerwerem(async ({ baza, linki, wykonaj }) => {
    const znane = await wykonaj('password/request', { email: 'konto@example.test' })
    const nieznane = await wykonaj('password/request', { email: 'brak@example.test' })
    assert.equal(await znane.text(), await nieznane.text())
    await kolejnyObieg()
    assert.deepEqual(linki, [])
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 0)
  }, undefined, false)
})

test('obce originy i formularze bez JSON nie mogą zlecać wysyłki ani resetu', async () => {
  await zSerwerem(async ({ linki, wykonaj }) => {
    for (const sciezka of ['password/request', 'password/reset']) {
      assert.equal((await wykonaj(sciezka, { email: 'konto@example.test' }, { origin: 'https://obca.test' })).status, 403)
      assert.equal((await wykonaj(sciezka, { email: 'konto@example.test' }, { 'content-type': 'text/plain' })).status, 403)
    }
    await kolejnyObieg(); assert.deepEqual(linki, [])
  })
})

test('migracja 7 → 8 zachowuje historyczne konta, sesje, członkostwa i kody oraz jest idempotentna', () => {
  const baza = new DatabaseSync(':memory:')
  try {
    uruchomMigracje(baza)
    baza.exec('DROP TRIGGER uniewaznij_linki_resetowania; DROP TABLE tokeny_resetowania_hasla; DELETE FROM migracje WHERE wersja = 8')
    dodajKonto(baza)
    const tabele = ['uzytkownicy', 'sesje', 'czlonkostwa', 'kody_odzyskiwania', 'granty_dostepu', 'rekordy_synchronizacji']
    const przed = tabele.map((tabela) => baza.prepare(`SELECT * FROM ${tabela}`).all())
    assert.equal(uruchomMigracje(baza), 8)
    assert.deepEqual(tabele.map((tabela) => baza.prepare(`SELECT * FROM ${tabela}`).all()), przed)
    assert.equal(uruchomMigracje(baza), 8)
    assert.deepEqual(tabele.map((tabela) => baza.prepare(`SELECT * FROM ${tabela}`).all()), przed)
  } finally { baza.close() }
})
