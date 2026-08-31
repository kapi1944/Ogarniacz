import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { RepozytoriumZdalneInMemory } from '../data/RepozytoriumZdalneInMemory'
import { utworzZadanie } from './ZadaniaService'
import { nazwyTabelSynchronizowanych, SyncEngine } from './SyncEngine'

const CZAS_SYNCHRONIZACJI = '2026-09-01T12:00:00.000Z'

function utworzSilnik(): SyncEngine {
  return new SyncEngine({
    teraz: () => CZAS_SYNCHRONIZACJI,
    czyOnline: () => true,
    installationId: () => 'instalacja-lokalna',
    opoznieniePonowieniaMs: 0,
  })
}

function zadanie(id: string, tytul: string, updatedAt: string, usunietoAt?: string) {
  return {
    ...utworzZadanie({ tytul, opis: '', priorytet: 'normalny' }),
    id,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt,
    usunietoAt,
  }
}

describe.sequential('SyncEngine', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
    for (const tabela of nazwyTabelSynchronizowanych) await baza.table(tabela).clear()
  })

  it('wysyła lokalną zmianę przy synchronizacji przyrostowej', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    await baza.tabela('zadania').put(zadanie('lokalne', 'Lokalne', '2026-08-20T10:00:00.000Z'))

    const wynik = await utworzSilnik().synchronizuj(zdalne)

    expect(wynik.wyslane).toBe(1)
    expect((await zdalne.pobierzWszystkie())[0]).toMatchObject({
      tabela: 'zadania',
      rekord: { id: 'lokalne', tytul: 'Lokalne' },
      installationId: 'instalacja-lokalna',
    })
  })

  it('pobiera zmianę zdalną do lokalnego repozytorium', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    await zdalne.ustawZmiany([{
      tabela: 'zadania',
      rekord: zadanie('zdalne', 'Zdalne', '2026-08-21T10:00:00.000Z'),
      installationId: 'instalacja-zdalna',
    }])

    const wynik = await utworzSilnik().synchronizuj(zdalne)

    expect(wynik.pobrane).toBe(1)
    expect(await baza.tabela('zadania').get('zdalne')).toMatchObject({ tytul: 'Zdalne' })
  })

  it('przenosi soft delete jako usunietoAt', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    await baza.tabela('zadania').put(zadanie(
      'usuniete',
      'Usunięte',
      '2026-08-22T10:00:00.000Z',
      '2026-08-22T10:00:00.000Z',
    ))

    await utworzSilnik().synchronizuj(zdalne)

    expect((await zdalne.pobierzWszystkie())[0].rekord.usunietoAt).toBe('2026-08-22T10:00:00.000Z')
  })

  it('zapisuje konflikt i nie nadpisuje rekordu bez decyzji', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    const lokalne = zadanie('wspolne', 'Wersja lokalna', '2026-08-23T10:00:00.000Z')
    const zdalneZadanie = zadanie('wspolne', 'Wersja zdalna', '2026-08-24T10:00:00.000Z')
    await baza.tabela('zadania').put(lokalne)
    await zdalne.ustawZmiany([{ tabela: 'zadania', rekord: zdalneZadanie, installationId: 'instalacja-zdalna' }])
    const silnik = utworzSilnik()

    const wynik = await silnik.synchronizuj(zdalne)

    expect(wynik.stan).toBe('konflikt')
    expect(await baza.tabela('zadania').get('wspolne')).toMatchObject({ tytul: 'Wersja lokalna' })
    const konflikt = (await baza.tabela('konfliktySynchronizacji').toArray())[0]
    expect(konflikt).toMatchObject({
      tabela: 'zadania',
      rekordId: 'wspolne',
      lokalny: { tytul: 'Wersja lokalna' },
      zdalny: { tytul: 'Wersja zdalna' },
    })

    await silnik.rozstrzygnijKonflikt(konflikt.id, 'zdalny')
    expect(await baza.tabela('zadania').get('wspolne')).toMatchObject({ tytul: 'Wersja zdalna' })
  })

  it('jest idempotentny bez nowych zmian', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    await baza.tabela('zadania').put(zadanie('raz', 'Tylko raz', '2026-08-25T10:00:00.000Z'))
    const silnik = utworzSilnik()

    await silnik.synchronizuj(zdalne)
    const drugi = await silnik.synchronizuj(zdalne)

    expect(drugi).toMatchObject({ wyslane: 0, pobrane: 0, konflikty: 0, stan: 'zsynchronizowano' })
    expect(await zdalne.pobierzWszystkie()).toHaveLength(1)
  })

  it('ponawia chwilowo nieudaną operację dostawcy', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    const pobierzZmiany = vi.spyOn(zdalne, 'pobierzZmiany')
      .mockRejectedValueOnce(new Error('Chwilowy błąd'))
      .mockResolvedValueOnce([])

    await utworzSilnik().synchronizuj(zdalne)

    expect(pobierzZmiany).toHaveBeenCalledTimes(2)
  })
})
