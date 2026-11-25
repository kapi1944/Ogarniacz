import { describe, expect, it } from 'vitest'
import { nazwyTabelSynchronizowanych } from './SyncEngine'
import { TABELE_POMIJANE_PRZEZ_SERWER, TABELE_SYNCHRONIZOWANE } from '../../server/wspolne/tabeleSynchronizacji.ts'

/**
 * Nowa tabela synchronizowana przez klienta = wpis w server/wspolne/tabeleSynchronizacji.ts.
 * Bez niego serwer odrzuca całą paczkę (incydent z 29.10.2026: tabele rejestru).
 */
describe('parytet tabel synchronizacji klient ↔ serwer', () => {
  it('serwer przyjmuje każdą tabelę wysyłaną przez SyncEngine', () => {
    const brakujace = nazwyTabelSynchronizowanych.filter((tabela) => !TABELE_SYNCHRONIZOWANE.includes(tabela))
    expect(brakujace).toEqual([])
  })

  it('serwer nie utrzymuje tabel, których klient już nie wysyła (poza jawnie pomijanymi)', () => {
    const pomijane = new Set<string>(TABELE_POMIJANE_PRZEZ_SERWER)
    const nadmiarowe = TABELE_SYNCHRONIZOWANE.filter((tabela) => !pomijane.has(tabela) && !(nazwyTabelSynchronizowanych as readonly string[]).includes(tabela))
    expect(nadmiarowe).toEqual([])
  })

  it('obejmuje tabele rejestru', () => {
    expect(nazwyTabelSynchronizowanych).toEqual(expect.arrayContaining(['definicjeWlasnychPolRejestru', 'widokiRejestru']))
  })
})
