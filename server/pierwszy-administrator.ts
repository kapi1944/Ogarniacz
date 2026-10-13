import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'
import { wskazPierwszegoAdministratora } from './administracja-kont.ts'

const [sciezka, id, potwierdzenie] = process.argv.slice(2)
if (!sciezka || !id || potwierdzenie !== '--potwierdz') throw new Error('Użycie: node dist-server/pierwszy-administrator.js /pełna/ścieżka/bazy.sqlite UUID --potwierdz')
if (!statSync(resolve(sciezka)).isFile()) throw new Error('Baza nie istnieje.')
const baza = new DatabaseSync(resolve(sciezka))
try {
  // Nie tworzymy ani nie migrujemy bazy. Operator wskazuje istniejącą instalację.
  baza.exec('PRAGMA foreign_keys = ON')
  wskazPierwszegoAdministratora(baza, id)
  console.log('Wskazano administratora. Wymagane ponowne logowanie.')
} finally { baza.close() }
