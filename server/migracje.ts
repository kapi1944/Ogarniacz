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
