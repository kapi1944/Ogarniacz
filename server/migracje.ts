import type { DatabaseSync } from 'node:sqlite'

interface Migracja {
  wersja: number
  sql: string
}

const migracje: Migracja[] = [
  {
    wersja: 1,
    sql: `
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
    `,
  },
  {
    wersja: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS przetworzone_zmiany_synchronizacji (
        uzytkownik_id TEXT NOT NULL REFERENCES uzytkownicy(id) ON DELETE CASCADE,
        zmiana_id TEXT NOT NULL,
        przetworzono_at TEXT NOT NULL,
        PRIMARY KEY (uzytkownik_id, zmiana_id)
      );
    `,
  },
  {
    wersja: 3,
    sql: `
      ALTER TABLE rekordy_synchronizacji ADD COLUMN server_updated_at TEXT;
      UPDATE rekordy_synchronizacji SET server_updated_at = updated_at WHERE server_updated_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_rekordy_sync_server_updated
        ON rekordy_synchronizacji (uzytkownik_id, server_updated_at);
    `,
  },
  {
    wersja: 4,
    sql: `
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
    `,
  },
]

export function uruchomMigracje(baza: DatabaseSync): number {
  baza.exec('CREATE TABLE IF NOT EXISTS migracje (wersja INTEGER PRIMARY KEY NOT NULL, wykonano_at TEXT NOT NULL)')
  const wykonane = new Set(
    baza.prepare('SELECT wersja FROM migracje ORDER BY wersja').all().map((wiersz) => Number(wiersz.wersja)),
  )
  for (const migracja of migracje) {
    if (wykonane.has(migracja.wersja)) continue
    baza.exec('BEGIN')
    try {
      baza.exec(migracja.sql)
      baza.prepare('INSERT INTO migracje (wersja, wykonano_at) VALUES (?, ?)').run(migracja.wersja, new Date().toISOString())
      baza.exec('COMMIT')
    } catch (blad) {
      baza.exec('ROLLBACK')
      throw blad
    }
  }
  return migracje.length
}
