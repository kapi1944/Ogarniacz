import { strict as assert } from 'node:assert'
import { createHash, randomUUID, scryptSync } from 'node:crypto'
import { chmodSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { otworzBazeOdzyskiwania, pobierzKonta, sprawdzUprawnieniaSystemowe, wydajLinkResetowania } from '../scripts/odzyskaj-konto-rpi.mjs'
import { uruchomMigracje } from './migracje.ts'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { utworzSerwer } from './serwer.ts'

const id = '11111111-2222-4333-8444-555555555555'
const obcyId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const czas = '2026-10-01T00:00:00.000Z'
const hash = (wartosc: string) => createHash('sha256').update(wartosc).digest('hex')

async function zBaza(wykonaj: (baza: DatabaseSync, sciezka: string) => void | Promise<void>) {
  const katalog = realpathSync(mkdtempSync(join(tmpdir(), 'ogarniacz-odzyskiwanie-')))
  const sciezka = join(katalog, 'syntetyczna.sqlite')
  const baza = new DatabaseSync(sciezka)
  uruchomMigracje(baza)
  baza.exec("CREATE TABLE odzyskiwanie_testowe (nazwa TEXT); INSERT INTO odzyskiwanie_testowe VALUES ('syntetyczna')")
  for (const [uuid, email] of [[id, 'wlasciciel@example.test'], [obcyId, 'edytor@example.test']]) {
    baza.prepare("INSERT INTO uzytkownicy (id, email, login, nazwa, haslo_hash, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, 'Konto syntetyczne', 'stary-hash', ?, ?)").run(uuid, email, uuid === id ? 'wlasciciel' : 'edytor', czas, czas)
    baza.prepare("INSERT INTO czlonkostwa (wlasciciel_id, uzytkownik_id, rola, status, utworzono_at, zaktualizowano_at) VALUES (?, ?, ?, 'aktywne', ?, ?)").run(id, uuid, uuid === id ? 'wlasciciel' : 'edytor', czas, czas)
    baza.prepare('INSERT INTO sesje (token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(hash(uuid), uuid, id, hash('csrf'), '2099-01-01', czas, czas)
  }
  baza.prepare("INSERT INTO granty_dostepu (id, wlasciciel_id, edytor_id, modul, sekcja, odczyt, edycja, status, utworzono_at, zaktualizowano_at) VALUES ('grant', ?, ?, 'zadania', '', 1, 1, 'aktywne', ?, ?)").run(id, obcyId, czas, czas)
  baza.prepare("INSERT INTO instalacje (id, uzytkownik_id, ostatnia_aktywnosc_at, utworzono_at) VALUES ('instalacja', ?, ?, ?)").run(id, czas, czas)
  baza.prepare("INSERT INTO rekordy_synchronizacji (uzytkownik_id, tabela, rekord_id, dane_json, created_at, updated_at, version, ostatnia_instalacja_id, server_updated_at) VALUES (?, 'zadania', 'zadanie', '{\"id\":\"zadanie\"}', ?, ?, 1, 'instalacja', ?)").run(id, czas, czas, czas)
  baza.prepare("INSERT INTO przetworzone_zmiany_synchronizacji (uzytkownik_id, zmiana_id, przetworzono_at) VALUES (?, 'zmiana', ?)").run(id, czas)
  try { await wykonaj(baza, sciezka) }
  finally { baza.close(); rmSync(katalog, { recursive: true, force: true }) }
}

test('lista kont jest tylko do odczytu i ujawnia wyłącznie zatwierdzone metadane', async () => {
  await zBaza((baza, sciezka) => {
    const przed = readFileSync(sciezka)
    const pliki = readdirSync(join(sciezka, '..'))
    const odczyt = otworzBazeOdzyskiwania({ sciezka, testowa: true })
    try {
      const konta = pobierzKonta(odczyt)
      assert.equal(konta.length, 2)
      assert.deepEqual(Object.keys(konta[0]).sort(), ['email', 'login', 'rolaSystemowa', 'statusKonta', 'uuid', 'wlasciciel'].sort())
      assert.equal(konta.find((konto) => konto.uuid === id)?.wlasciciel, 1)
      assert.equal(konta.find((konto) => konto.uuid === obcyId)?.wlasciciel, 0)
      assert.throws(() => odczyt.exec('DELETE FROM uzytkownicy'), /readonly/)
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 0)
    } finally { odczyt.close() }
    assert.deepEqual(readFileSync(sciezka), przed)
    assert.deepEqual(readdirSync(join(sciezka, '..')), pliki)
  })
})

test('narzędzie odmawia dla nieistniejącego UUID, nieaktywnego konta i błędnego schematu', async () => {
  await zBaza((baza, sciezka) => {
    assert.throws(() => wydajLinkResetowania(baza, randomUUID()), /Nie znaleziono/)
    assert.throws(() => wydajLinkResetowania(baza, "' OR 1=1"), /UUID/)
    for (const status of ['nieaktywne', 'zarchiwizowane']) {
      baza.prepare('UPDATE uzytkownicy SET status_konta = ? WHERE id = ?').run(status, id)
      assert.throws(() => wydajLinkResetowania(baza, id), /nie jest aktywne/)
    }
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 0)
    baza.exec('DELETE FROM migracje WHERE wersja = 8')
    assert.throws(() => otworzBazeOdzyskiwania({ sciezka, testowa: true, zapis: true }), /migracja 8/)
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM migracje WHERE wersja = 8').get()?.n, 0)
  })
})

test('token CLI działa przez istniejący endpoint, jest jednorazowy i zachowuje tożsamość, uprawnienia oraz dane', async () => {
  await zBaza(async (baza, sciezka) => {
    baza.exec('PRAGMA journal_mode = WAL')
    const tabele = ['czlonkostwa', 'granty_dostepu', 'instalacje', 'rekordy_synchronizacji', 'przetworzone_zmiany_synchronizacji']
    const przed = tabele.map((tabela) => baza.prepare(`SELECT * FROM ${tabela}`).all())
    const kontaPrzed = pobierzKonta(baza)
    const zapis = otworzBazeOdzyskiwania({ sciezka, testowa: true, zapis: true })
    let link: string
    try { link = wydajLinkResetowania(zapis, id).link } finally { zapis.close() }
    const adres = new URL(link)
    const token = adres.hash.slice('#reset-hasla='.length)
    assert.equal(adres.origin, 'https://raspberrypi.tailb0bcf2.ts.net')
    assert.equal(adres.search, '')
    assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    const wiersz = baza.prepare('SELECT * FROM tokeny_resetowania_hasla').get()!
    assert.equal(wiersz.token_hash, hash(token))
    assert.ok(Math.abs(Date.parse(String(wiersz.wygasa_at)) - Date.now() - 900_000) < 5000)
    assert.ok(!JSON.stringify(wiersz).includes(token))
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM sesje').get()?.n, 2)
    assert.equal(baza.prepare('SELECT haslo_hash FROM uzytkownicy WHERE id = ?').get(id)?.haslo_hash, 'stary-hash')
    const serwer = utworzSerwer(utworzKonfiguracjeSerwera({}), baza)
    await new Promise<void>((gotowe) => serwer.listen(0, '127.0.0.1', gotowe))
    const port = (serwer.address() as { port: number }).port
    const wyslij = (sciezkaApi: string, dane: unknown) => fetch(`http://127.0.0.1:${port}${sciezkaApi}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dane) })
    try {
      assert.equal((await wyslij('/api/auth/password/reset', { token, noweHaslo: 'krotkie' })).status, 400)
      baza.exec("CREATE TRIGGER awaria BEFORE DELETE ON sesje BEGIN SELECT RAISE(ABORT, 'syntetyczna awaria'); END")
      assert.equal((await wyslij('/api/auth/password/reset', { token, noweHaslo: 'Nowe-haslo-123' })).status, 400)
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 1)
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM sesje').get()?.n, 2)
      baza.exec('DROP TRIGGER awaria')
      const odpowiedzi = await Promise.all([1, 2].map(() => wyslij('/api/auth/password/reset', { token, noweHaslo: 'Nowe-haslo-123' })))
      assert.deepEqual(odpowiedzi.map((odpowiedz) => odpowiedz.status).sort(), [200, 401])
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM sesje WHERE uzytkownik_id = ?').get(id)?.n, 0)
      assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM sesje WHERE uzytkownik_id = ?').get(obcyId)?.n, 1)
      assert.deepEqual(pobierzKonta(baza), kontaPrzed)
      assert.deepEqual(tabele.map((tabela) => baza.prepare(`SELECT * FROM ${tabela}`).all()), przed)
      const [algorytm, n, r, p, sol, klucz] = String(baza.prepare('SELECT haslo_hash FROM uzytkownicy WHERE id = ?').get(id)?.haslo_hash).split('$')
      assert.equal(algorytm, 'scrypt')
      assert.deepEqual(scryptSync('Nowe-haslo-123', Buffer.from(sol, 'base64url'), 64, { N: +n, r: +r, p: +p }), Buffer.from(klucz, 'base64url'))
      const logowanie = await wyslij('/api/auth/login', { email: 'wlasciciel@example.test', haslo: 'Nowe-haslo-123' })
      assert.equal(logowanie.status, 200)
      assert.equal((await logowanie.json()).uzytkownikId, id)
    } finally { await new Promise<void>((gotowe) => serwer.close(() => gotowe())) }
  })
})

test('link wygasa na granicy 15 minut, kolejne wydanie zastępuje stary link i wycofuje zapis po błędzie', async () => {
  await zBaza(async (baza) => {
    const stary = wydajLinkResetowania(baza, id)
    const nowy = wydajLinkResetowania(baza, id)
    assert.notEqual(stary.link, nowy.link)
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 1)
    const przed = baza.prepare('SELECT * FROM tokeny_resetowania_hasla').all()
    baza.exec("CREATE TRIGGER awaria BEFORE INSERT ON tokeny_resetowania_hasla BEGIN SELECT RAISE(ABORT, 'awaria'); END")
    assert.throws(() => wydajLinkResetowania(baza, id))
    assert.deepEqual(baza.prepare('SELECT * FROM tokeny_resetowania_hasla').all(), przed)
    baza.exec('DROP TRIGGER awaria')
    const wygasa = String(przed[0].wygasa_at)
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla WHERE wygasa_at > ?').get(wygasa)?.n, 0)
    baza.prepare('UPDATE tokeny_resetowania_hasla SET wygasa_at = ?').run(new Date(Date.now() - 1).toISOString())
    const serwer = utworzSerwer(utworzKonfiguracjeSerwera({}), baza)
    await new Promise<void>((gotowe) => serwer.listen(0, '127.0.0.1', gotowe))
    try {
      for (const link of [stary.link, nowy.link]) {
        const odpowiedz = await fetch(`http://127.0.0.1:${(serwer.address() as { port: number }).port}/api/auth/password/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: new URL(link).hash.slice('#reset-hasla='.length), noweHaslo: 'Nowe-haslo-123' }) })
        assert.equal(odpowiedz.status, 401)
      }
    } finally { await new Promise<void>((gotowe) => serwer.close(() => gotowe())) }
  })
})

test('produkcja nie dopuszcza obejścia uprawnień, dowiązań, tworzenia bazy ani nieinteraktywnego issue', async () => {
  await zBaza((baza, sciezka) => {
    assert.throws(() => otworzBazeOdzyskiwania({ sciezka }))
    assert.throws(() => otworzBazeOdzyskiwania({ sciezka: join(sciezka, '..', 'brak.sqlite'), testowa: true }))
    const wynik = spawnSync(process.execPath, ['scripts/odzyskaj-konto-rpi.mjs', 'issue', '--user-id', id, '--test-db', sciezka], { encoding: 'utf8' })
    assert.equal(wynik.status, 1)
    assert.ok(!wynik.stdout.includes('#reset-hasla='))
    assert.equal(baza.prepare('SELECT COUNT(*) AS n FROM tokeny_resetowania_hasla').get()?.n, 0)
    if (process.platform === 'linux') {
      // Rzeczywiste uprawnienia Unix, sprawdzane także w zwykłym workflow CI.
      chmodSync(sciezka, 0o000)
      assert.throws(() => otworzBazeOdzyskiwania({ sciezka, testowa: true, zapis: true }), { code: 'EACCES' })
      chmodSync(sciezka, 0o600)
      chmodSync(join(sciezka, '..'), 0o755)
      assert.throws(() => sprawdzUprawnieniaSystemowe(sciezka), /prywatnego katalogu/)
      chmodSync(join(sciezka, '..'), 0o700)
    } else {
      assert.throws(() => sprawdzUprawnieniaSystemowe(sciezka), /bez sudo/)
    }
    baza.exec('DROP TABLE odzyskiwanie_testowe')
    assert.throws(() => otworzBazeOdzyskiwania({ sciezka, testowa: true }))
    if (process.platform === 'linux') {
      const dowiazanie = sciezka + '-wal'
      symlinkSync(sciezka, dowiazanie)
      assert.throws(() => sprawdzUprawnieniaSystemowe(sciezka), /WAL/)
    }
  })
})
