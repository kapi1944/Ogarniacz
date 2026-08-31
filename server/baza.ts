import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { KonfiguracjaSerwera } from './config.ts'
import { uruchomMigracje } from './migracje.ts'

export interface OtwartaBaza {
  baza: DatabaseSync
  liczbaMigracji: number
}

export function otworzBaze(konfiguracja: KonfiguracjaSerwera): OtwartaBaza {
  mkdirSync(dirname(konfiguracja.sciezkaBazy), { recursive: true })
  const baza = new DatabaseSync(konfiguracja.sciezkaBazy)
  baza.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
  return { baza, liczbaMigracji: uruchomMigracje(baza) }
}
