import { strict as assert } from 'node:assert'
import { createHash, scryptSync } from 'node:crypto'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { uruchomMigracje } from './migracje.ts'
import { utworzKonfiguracjeSerwera } from './config.ts'
import { utworzSerwer } from './serwer.ts'

// Historyczny schemat SQLite v4; niezależny od bieżącej listy migracji.
const SCHEMAT_V4 = `
      CREATE TABLE IF NOT EXISTS uzytkownicy (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL UNIQUE,
        haslo_hash TEXT NOT NULL,
        utworzono_at TEXT NOT NULL,
        zaktualizowano_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS instalacje (
        id TEXT PRIMARY KEY NOT NULL,
        uzytkownik_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        nazwa TEXT,
        ostatnia_aktywnosc_at TEXT NOT NULL,
        utworzono_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rekordy_synchronizacji (
        uzytkownik_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        tabela TEXT NOT NULL,
        rekord_id TEXT NOT NULL,
        dane_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT,
        ostatnia_instalacja_id TEXT,
        PRIMARY KEY (uzytkownik_id, tabela, rekord_id)
      );
      CREATE INDEX IF NOT EXISTS idx_rekordy_sync_updated
        ON rekordy_synchronizacji (uzytkownik_id, updated_at);
    

      CREATE TABLE IF NOT EXISTS przetworzone_zmiany_synchronizacji (
        uzytkownik_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        zmiana_id TEXT NOT NULL,
        przetworzono_at TEXT NOT NULL,
        PRIMARY KEY (uzytkownik_id, zmiana_id)
      );
    

      ALTER TABLE rekordy_synchronizacji ADD COLUMN server_updated_at TEXT;
      UPDATE rekordy_synchronizacji SET server_updated_at = updated_at WHERE server_updated_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_rekordy_sync_server_updated
        ON rekordy_synchronizacji (uzytkownik_id, server_updated_at);
    

      CREATE TABLE IF NOT EXISTS czlonkostwa (
        wlasciciel_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        uzytkownik_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        rola TEXT NOT NULL CHECK (rola IN ('wlasciciel', 'edytor')),
        status TEXT NOT NULL DEFAULT 'aktywne' CHECK (status IN ('aktywne', 'cofniete')),
        utworzono_at TEXT NOT NULL,
        zaktualizowano_at TEXT NOT NULL,
        PRIMARY KEY (wlasciciel_id, uzytkownik_id)
      );
      CREATE TABLE IF NOT EXISTS sesje (
        token_hash TEXT PRIMARY KEY NOT NULL,
        uzytkownik_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        aktywny_wlasciciel_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        csrf_hash TEXT NOT NULL,
        wygasa_at TEXT NOT NULL,
        ostatnia_aktywnosc_at TEXT NOT NULL,
        utworzono_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sesje_uzytkownik ON sesje (uzytkownik_id, wygasa_at);
      CREATE TABLE IF NOT EXISTS zaproszenia_edytorow (
        id TEXT PRIMARY KEY NOT NULL,
        wlasciciel_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        wygasa_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'oczekuje' CHECK (status IN ('oczekuje', 'przyjete', 'cofniete')),
        utworzono_at TEXT NOT NULL,
        przyjeto_at TEXT
      );
      CREATE TABLE IF NOT EXISTS granty_dostepu (
        id TEXT PRIMARY KEY NOT NULL,
        wlasciciel_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        edytor_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        modul TEXT NOT NULL,
        sekcja TEXT NOT NULL DEFAULT '',
        odczyt INTEGER NOT NULL DEFAULT 0,
        edycja INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'aktywne' CHECK (status IN ('aktywne', 'cofniete')),
        utworzono_at TEXT NOT NULL,
        zaktualizowano_at TEXT NOT NULL,
        UNIQUE (wlasciciel_id, edytor_id, modul, sekcja)
      );
      CREATE TABLE IF NOT EXISTS kody_odzyskiwania (
        uzytkownik_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        kod_hash TEXT NOT NULL,
        uzyto_at TEXT,
        utworzono_at TEXT NOT NULL,
        PRIMARY KEY (uzytkownik_id, kod_hash)
      );
    `
const TERAZ = '2026-10-13T10:00:00.000Z'
const HASLO = 'Historyczne-haslo-123'
const SOL = Buffer.from('syntetyczna-sol-1')
const HASH_HASLA = `scrypt$16384$8$1$${SOL.toString('base64url')}$${scryptSync(HASLO, SOL, 64).toString('base64url')}`

function staraBaza(): DatabaseSync {
  const baza = new DatabaseSync(':memory:')
  baza.exec('PRAGMA foreign_keys = ON')
  baza.exec(SCHEMAT_V4)
  baza.exec('CREATE TABLE migracje (wersja INTEGER PRIMARY KEY NOT NULL, wykonano_at TEXT NOT NULL)')
  for (let wersja = 1; wersja <= 4; wersja += 1) baza.prepare('INSERT INTO migracje VALUES (?, ?)').run(wersja, TERAZ)
  const dodaj = baza.prepare('INSERT INTO uzytkownicy VALUES (?, ?, ?, ?, ?)')
  dodaj.run('00000000-0000-4000-8000-000000000001', 'owner@example.test', HASH_HASLA, TERAZ, TERAZ)
  dodaj.run('00000000-0000-4000-8000-000000000002', 'editor@example.test', HASH_HASLA, TERAZ, TERAZ)
  baza.exec(`
    INSERT INTO czlonkostwa VALUES
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'wlasciciel', 'aktywne', '${TERAZ}', '${TERAZ}'),
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'edytor', 'aktywne', '${TERAZ}', '${TERAZ}');
    INSERT INTO granty_dostepu VALUES ('grant', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'zadania', '', 1, 0, 'aktywne', '${TERAZ}', '${TERAZ}');
    INSERT INTO instalacje VALUES ('instalacja', '00000000-0000-4000-8000-000000000001', 'Test', '${TERAZ}', '${TERAZ}');
    INSERT INTO rekordy_synchronizacji VALUES ('00000000-0000-4000-8000-000000000001', 'zadania', 'rekord', '{}', '${TERAZ}', '${TERAZ}', 1, NULL, 'instalacja', '${TERAZ}');
    INSERT INTO przetworzone_zmiany_synchronizacji VALUES ('00000000-0000-4000-8000-000000000001', 'zmiana', '${TERAZ}');
    INSERT INTO kody_odzyskiwania VALUES ('00000000-0000-4000-8000-000000000001', 'hash-kodu', NULL, '${TERAZ}');
    INSERT INTO zaproszenia_edytorow VALUES ('zaproszenie', '00000000-0000-4000-8000-000000000001', 'nowy@example.test', 'hash-zaproszenia', '2099-01-01', 'oczekuje', '${TERAZ}', NULL);
  `)
  baza.prepare('INSERT INTO sesje VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    createHash('sha256').update('stary-token').digest('hex'),
    '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
    'hash-csrf', '2099-01-01', TERAZ, TERAZ,
  )
  return baza
}

test('syntetyczna baza v4 zachowuje konta, hashe, sesje i wszystkie powiązania po migracji i ponowieniu', () => {
  const baza = staraBaza()
  try {
    const kontaPrzed = baza.prepare('SELECT * FROM uzytkownicy ORDER BY id').all()
    const tabele = ['czlonkostwa', 'granty_dostepu', 'sesje', 'instalacje', 'rekordy_synchronizacji', 'przetworzone_zmiany_synchronizacji', 'kody_odzyskiwania', 'zaproszenia_edytorow']
    const przed = tabele.map((tabela) => baza.prepare(tabela === 'sesje' ? 'SELECT token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at FROM sesje' : `SELECT * FROM ${tabela}`).all())
    assert.equal(uruchomMigracje(baza), 6)
    assert.deepEqual(baza.prepare('SELECT id, email, haslo_hash, utworzono_at, zaktualizowano_at FROM uzytkownicy ORDER BY id').all(), kontaPrzed)
    assert.deepEqual(tabele.map((tabela) => baza.prepare(tabela === 'sesje' ? 'SELECT token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at FROM sesje' : `SELECT * FROM ${tabela}`).all()), przed)
    const sesjePo = baza.prepare('SELECT * FROM sesje').all()
    assert.equal(new Set(sesjePo.map((sesja) => sesja.id)).size, sesjePo.length)
    for (const sesja of sesjePo) {
      assert.match(String(sesja.id), /^[a-f0-9]{32}$/)
      assert.notEqual(sesja.id, sesja.token_hash)
    }
    for (const konto of baza.prepare('SELECT * FROM uzytkownicy').all()) {
      assert.equal(konto.login, null)
      assert.equal(konto.nazwa, null)
      assert.equal(konto.rola_systemowa, 'uzytkownik')
      assert.equal(konto.status_konta, 'aktywne')
      assert.equal(konto.wymagana_zmiana_hasla, 0)
    }
    baza.prepare("UPDATE uzytkownicy SET login = 'wlasciciel', nazwa = 'Nazwa testowa', rola_systemowa = 'administrator' WHERE email = 'owner@example.test'").run()
    const po = baza.prepare('SELECT * FROM uzytkownicy ORDER BY id').all()
    const migracjePo = baza.prepare('SELECT * FROM migracje').all()
    assert.equal(uruchomMigracje(baza), 6)
    assert.deepEqual(baza.prepare('SELECT * FROM uzytkownicy ORDER BY id').all(), po)
    assert.deepEqual(baza.prepare('SELECT * FROM migracje').all(), migracjePo)
    assert.deepEqual(baza.prepare('SELECT * FROM sesje').all(), sesjePo)
    assert.deepEqual(tabele.map((tabela) => baza.prepare(tabela === 'sesje' ? 'SELECT token_hash, uzytkownik_id, aktywny_wlasciciel_id, csrf_hash, wygasa_at, ostatnia_aktywnosc_at, utworzono_at FROM sesje' : `SELECT * FROM ${tabela}`).all()), przed)
    assert.deepEqual(baza.prepare('PRAGMA foreign_key_check').all(), [])
    assert.equal(baza.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok')
  } finally { baza.close() }
})

test('błąd migracji sesji wycofuje ID i zachowuje wcześniejsze sesje; ponowienie nadaje ID', () => {
  const baza = staraBaza()
  try {
    const przed = baza.prepare('SELECT * FROM sesje').all()
    baza.exec('CREATE INDEX idx_sesje_id ON sesje (token_hash)')
    assert.throws(() => uruchomMigracje(baza), /already exists/)
    assert.deepEqual(baza.prepare('SELECT * FROM sesje').all(), przed)
    assert.equal(baza.prepare('SELECT COUNT(*) AS liczba FROM migracje').get()?.liczba, 5)
    baza.exec('DROP INDEX idx_sesje_id')
    assert.equal(uruchomMigracje(baza), 6)
    for (const sesja of baza.prepare('SELECT * FROM sesje').all()) assert.match(String(sesja.id), /^[a-f0-9]{32}$/)
  } finally { baza.close() }
})

test('login jest opcjonalny, unikalny i zapisany w jednoznacznej postaci; role i statusy są ograniczone', () => {
  const baza = staraBaza()
  try {
    uruchomMigracje(baza)
    baza.prepare("UPDATE uzytkownicy SET login = 'konto.test' WHERE email = 'owner@example.test'").run()
    assert.throws(() => baza.prepare("UPDATE uzytkownicy SET login = 'konto.test' WHERE email = 'editor@example.test'").run(), /UNIQUE/)
    for (const login of ['KONTO.TEST', '', ' konto', 'konto ', 'konto@test', 'łukasz']) {
      assert.throws(() => baza.prepare("UPDATE uzytkownicy SET login = ? WHERE email = 'editor@example.test'").run(login), /CHECK/)
    }
    assert.throws(() => baza.exec("UPDATE uzytkownicy SET rola_systemowa = 'wlasciciel'"), /CHECK/)
    assert.throws(() => baza.exec("UPDATE uzytkownicy SET status_konta = 'inne'"), /CHECK/)
    assert.throws(() => baza.exec('UPDATE uzytkownicy SET wymagana_zmiana_hasla = 2'), /CHECK/)
  } finally { baza.close() }
})

test('wielu Właścicieli nie otrzymuje automatycznie roli administratora', () => {
  const baza = staraBaza()
  try {
    baza.prepare("INSERT INTO czlonkostwa VALUES (?, ?, 'wlasciciel', 'aktywne', ?, ?)")
      .run('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', TERAZ, TERAZ)
    uruchomMigracje(baza)
    assert.equal(baza.prepare("SELECT COUNT(*) AS liczba FROM uzytkownicy WHERE rola_systemowa = 'administrator'").get()?.liczba, 0)
    assert.equal(baza.prepare("SELECT COUNT(*) AS liczba FROM czlonkostwa WHERE rola = 'wlasciciel'").get()?.liczba, 2)
  } finally { baza.close() }
})

test('błąd migracji wycofuje wszystkie nowe kolumny i pozwala na bezstratne ponowienie', () => {
  const baza = staraBaza()
  try {
    const konta = baza.prepare('SELECT * FROM uzytkownicy').all()
    baza.exec('CREATE INDEX idx_uzytkownicy_login ON uzytkownicy(email)')
    assert.throws(() => uruchomMigracje(baza), /already exists/)
    assert.deepEqual(baza.prepare('SELECT * FROM uzytkownicy').all(), konta)
    assert.equal(baza.prepare('SELECT COUNT(*) AS liczba FROM migracje').get()?.liczba, 4)
    baza.exec('DROP INDEX idx_uzytkownicy_login')
    assert.equal(uruchomMigracje(baza), 6)
    assert.deepEqual(baza.prepare('SELECT id, email, haslo_hash, utworzono_at, zaktualizowano_at FROM uzytkownicy').all(), konta)
  } finally { baza.close() }
})

test('stare logowanie e-mailem i aktywna sesja działają po migracji v4 bez zmiany hasha', async () => {
  const baza = staraBaza()
  uruchomMigracje(baza)
  const serwer = utworzSerwer(utworzKonfiguracjeSerwera({ DATABASE_PATH: ':memory:' }), baza)
  await new Promise<void>((rozwiaz) => serwer.listen(0, '127.0.0.1', rozwiaz))
  try {
    const adres = serwer.address()
    assert.ok(adres && typeof adres === 'object')
    const url = `http://127.0.0.1:${adres.port}`
    const sesja = await fetch(`${url}/api/auth/session`, { headers: { cookie: 'ogarniacz_sesja=stary-token' } })
    assert.equal(sesja.status, 200)
    const daneSesji = await sesja.json()
    assert.equal(daneSesji.uzytkownikId, '00000000-0000-4000-8000-000000000001')
    assert.equal(daneSesji.rola, 'wlasciciel')
    assert.equal(daneSesji.rolaSystemowa, 'uzytkownik')
    assert.equal(daneSesji.login, null)
    assert.equal(daneSesji.wymaganaZmianaHasla, false)
    const logowanie = await fetch(`${url}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ' OWNER@EXAMPLE.TEST ', haslo: HASLO }),
    })
    assert.equal(logowanie.status, 200)
    assert.equal((await logowanie.json()).uzytkownikId, daneSesji.uzytkownikId)
    assert.equal(baza.prepare("SELECT haslo_hash FROM uzytkownicy WHERE email = 'owner@example.test'").get()?.haslo_hash, HASH_HASLA)
  } finally {
    await new Promise<void>((rozwiaz) => serwer.close(() => rozwiaz()))
    baza.close()
  }
})
