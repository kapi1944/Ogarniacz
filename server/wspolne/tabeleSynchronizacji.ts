import { TABELE_FINANSOW_WSPOLNYCH } from './ZapisFinansowy.ts'

/**
 * Jedyne źródło listy tabel przyjmowanych przez `POST /api/sync/changes`.
 * Nowa tabela synchronizowana przez klienta wymaga wpisu tutaj; zgodność pilnuje
 * test parytetu `src/services/ParytetTabelSynchronizacji.test.ts`.
 */
export const TABELE_SYNCHRONIZOWANE_ZWYKLE = [
  'zadania', 'projekty', 'skrzynka', 'blokiCzasu', 'grafikPracy', 'wyjatkiGrafiku', 'urlopy',
  'nawyki', 'dziennikNawykow', 'leki', 'dziennikLekow', 'wizyty', 'przypomnienia', 'listyZakupow',
  'pozycjeZakupow', 'rachunki', 'platnosciRachunkow', 'notatki', 'pomysly', 'naPozniej', 'cele',
  'kontakty', 'dokumenty', 'wydatki', 'budzety', 'kontaFinansowe', 'miejsca', 'pojazdy', 'terminyWaznosci', 'uprawnienia',
  'edytorzy', 'ustawienia', 'skierowania', 'recepty', 'terapie', 'wpisyTerapii',
  'platnosciStale', 'planyRat', 'raty',
  'definicjeWlasnychPolRejestru', 'widokiRejestru',
] as const

/** Tabele przyjmowane w paczce, ale pomijane przed zapisem (zgodność ze starszymi klientami). */
export const TABELE_POMIJANE_PRZEZ_SERWER = ['wpisyTerapii'] as const

export const TABELE_SYNCHRONIZOWANE: readonly string[] = [...TABELE_SYNCHRONIZOWANE_ZWYKLE, ...TABELE_FINANSOW_WSPOLNYCH]

const ZBIOR_TABEL = new Set<string>(TABELE_SYNCHRONIZOWANE)

export function czyTabelaObslugiwanaPrzezSerwer(tabela: unknown): tabela is string {
  return typeof tabela === 'string' && ZBIOR_TABEL.has(tabela)
}
