import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { RepozytoriumZdalneInMemory } from '../data/RepozytoriumZdalneInMemory'
import { BladKonfliktuSynchronizacji, type RepozytoriumZdalne, type ZmianaSynchronizacji } from '../data/DostawcaSynchronizacji'
import { pobierzRepozytorium } from '../data/Repozytorium'
import type { KontoFinansowe, Miejsce } from '../domain/typy'
import { utworzMetadane } from '../domain/fabryki'
import { utworzZadanie } from './ZadaniaService'
import { nazwyTabelSynchronizowanych, oznaczSynchronizacjeOffline, odtworzOczekujacaSynchronizacje, pobierzStanSynchronizacji, SyncEngine } from './SyncEngine'

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

type TabelaDwochUrzadzen = 'kontaFinansowe' | 'miejsca'

async function zapiszEncjeDwochUrzadzen(tabela: TabelaDwochUrzadzen, rekord: KontoFinansowe | Miejsce): Promise<void> {
  if (tabela === 'kontaFinansowe') {
    await pobierzRepozytorium('kontaFinansowe').zapisz(rekord as KontoFinansowe)
    return
  }
  await pobierzRepozytorium('miejsca').zapisz(rekord as Miejsce)
}

async function usunEncjeDwochUrzadzen(tabela: TabelaDwochUrzadzen, id: string): Promise<void> {
  if (tabela === 'kontaFinansowe') {
    await pobierzRepozytorium('kontaFinansowe').usun(id)
    return
  }
  await pobierzRepozytorium('miejsca').usun(id)
}

describe.sequential('SyncEngine', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
    for (const tabela of nazwyTabelSynchronizowanych) await baza.table(tabela).clear()
  })

  it('nie synchronizuje lokalnego stanu ani danych pamięci i historii Echo', () => {
    expect(nazwyTabelSynchronizowanych).not.toContain('stanSynchronizacji')
    expect(nazwyTabelSynchronizowanych).not.toContain('konfliktySynchronizacji')
    expect(nazwyTabelSynchronizowanych).not.toContain('pamiecEcho')
    expect(nazwyTabelSynchronizowanych).not.toContain('dziennikEcho')
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

  it('po zachowaniu ostatniej wersji lokalnej czeka na wysłanie, a po opróżnieniu kolejki kończy synchronizację', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    const lokalne = zadanie('lokalny-wybor', 'Wersja z tego urządzenia', '2026-08-23T10:00:00.000Z')
    const zdalneZadanie = zadanie('lokalny-wybor', 'Wersja z serwera', '2026-08-24T10:00:00.000Z')
    await baza.tabela('zadania').put(lokalne)
    await zdalne.ustawZmiany([{ tabela: 'zadania', rekord: zdalneZadanie, installationId: 'instalacja-zdalna' }])
    const silnik = utworzSilnik()
    await silnik.synchronizuj(zdalne)
    const konflikt = (await baza.tabela('konfliktySynchronizacji').toArray())[0]

    await silnik.rozstrzygnijKonflikt(konflikt.id, 'lokalny')

    expect(await pobierzStanSynchronizacji()).toMatchObject({
      stan: 'oczekuje',
      liczbaKonfliktow: 0,
      liczbaOczekujacych: 1,
    })

    await silnik.synchronizuj(zdalne)

    expect(await pobierzStanSynchronizacji()).toMatchObject({
      stan: 'zsynchronizowano',
      liczbaKonfliktow: 0,
      liczbaOczekujacych: 0,
    })
  })

  it('zachowuje edycję i tombstone jako jawny konflikt', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    const lokalne = zadanie('usuniecie-konflikt', 'Edycja lokalna', '2026-08-23T10:00:00.000Z')
    const zdalneUsuniecie = zadanie(
      'usuniecie-konflikt',
      'Wersja przed usunięciem',
      '2026-08-24T10:00:00.000Z',
      '2026-08-24T10:00:00.000Z',
    )
    await baza.tabela('zadania').put(lokalne)
    await zdalne.ustawZmiany([{ tabela: 'zadania', rekord: zdalneUsuniecie, installationId: 'instalacja-zdalna' }])

    const wynik = await utworzSilnik().synchronizuj(zdalne)

    expect(wynik.stan).toBe('konflikt')
    expect(await baza.tabela('zadania').get(lokalne.id)).toMatchObject({ tytul: 'Edycja lokalna', usunietoAt: undefined })
    expect((await baza.tabela('konfliktySynchronizacji').get(`zadania:${lokalne.id}`))?.zdalny)
      .toMatchObject({ usunietoAt: '2026-08-24T10:00:00.000Z' })
  })

  it('po konflikcie 409 pobiera nowszą wersję i zapisuje konflikt zamiast zwykłego błędu', async () => {
    const lokalne = zadanie('wyscig-409', 'Edycja lokalna', '2026-08-23T10:00:00.000Z')
    const zdalne = zadanie('wyscig-409', 'Edycja zdalna', '2026-08-24T10:00:00.000Z')
    const zmianaZdalna: ZmianaSynchronizacji = {
      tabela: 'zadania',
      rekord: zdalne,
      installationId: 'instalacja-zdalna',
    }
    await baza.tabela('zadania').put(lokalne)
    let liczbaPobran = 0
    const repozytoriumZdalne: RepozytoriumZdalne = {
      trwale: true,
      pobierzZmiany: vi.fn(async () => {
        liczbaPobran += 1
        return liczbaPobran === 1 ? [] : [zmianaZdalna]
      }),
      wyslijZmiany: vi.fn(async (_zmiany: ZmianaSynchronizacji[]) => {
        throw new BladKonfliktuSynchronizacji()
      }),
    }

    const wynik = await utworzSilnik().synchronizuj(repozytoriumZdalne)

    expect(wynik.stan).toBe('konflikt')
    expect(repozytoriumZdalne.pobierzZmiany).toHaveBeenCalledTimes(2)
    expect(await baza.tabela('zadania').get(lokalne.id)).toMatchObject({ tytul: 'Edycja lokalna' })
    expect(await baza.tabela('konfliktySynchronizacji').get(`zadania:${lokalne.id}`)).toBeDefined()
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

  it('przenosi aktualny rekord z urządzenia A na urządzenie B', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    await baza.tabela('zadania').put(zadanie('wspolne-a-b', 'Z urządzenia A', '2026-08-26T10:00:00.000Z'))
    await utworzSilnik().synchronizuj(zdalne)

    await baza.tabela('zadania').clear()
    await baza.tabela('stanSynchronizacji').clear()
    const urzadzenieB = new SyncEngine({
      teraz: () => CZAS_SYNCHRONIZACJI,
      czyOnline: () => true,
      installationId: () => 'instalacja-b',
      opoznieniePonowieniaMs: 0,
    })
    const wynik = await urzadzenieB.synchronizuj(zdalne)

    expect(wynik.pobrane).toBe(1)
    expect(await baza.tabela('zadania').get('wspolne-a-b')).toMatchObject({ tytul: 'Z urządzenia A' })
  })

  it('zachowuje zmianę offline i wysyła ją po odzyskaniu połączenia', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    let online = false
    const silnik = new SyncEngine({
      teraz: () => CZAS_SYNCHRONIZACJI,
      czyOnline: () => online,
      installationId: () => 'instalacja-offline',
      opoznieniePonowieniaMs: 0,
    })
    await baza.tabela('zadania').put(zadanie('offline', 'Zapisane offline', '2026-08-27T10:00:00.000Z'))

    expect((await silnik.synchronizuj(zdalne)).stan).toBe('offline')
    expect(await zdalne.pobierzWszystkie()).toHaveLength(0)
    online = true
    const wynik = await silnik.synchronizuj(zdalne)

    expect(wynik.wyslane).toBe(1)
    expect((await zdalne.pobierzWszystkie())[0].rekord).toMatchObject({ id: 'offline', tytul: 'Zapisane offline' })
  })

  it('odtwarza trwały pending po ponownym otwarciu IndexedDB', async () => {
    await baza.tabela('stanSynchronizacji').update('glowny', { ostatniSync: '2026-08-26T10:00:00.000Z' })
    await baza.tabela('zadania').put(zadanie('pending', 'Czeka po restarcie', '2026-08-27T10:00:00.000Z'))

    baza.close()
    await baza.open()

    expect(await odtworzOczekujacaSynchronizacje(false)).toBe(true)
    expect((await pobierzStanSynchronizacji()).stan).toBe('offline')
  })

  it('odblokowuje trwały stan synchronizacja po restarcie i zachowuje pending', async () => {
    await baza.tabela('stanSynchronizacji').update('glowny', {
      stan: 'synchronizacja',
      ostatniSync: '2026-08-26T10:00:00.000Z',
    })
    await baza.tabela('zadania').put(zadanie(
      'pending-stale-sync',
      'Czeka po przerwanym sync',
      '2026-08-27T10:00:00.000Z',
    ))

    baza.close()
    await baza.open()

    expect(await odtworzOczekujacaSynchronizacje(true)).toBe(true)
    expect(await pobierzStanSynchronizacji()).toMatchObject({
      stan: 'oczekuje',
      liczbaOczekujacych: 1,
    })
  })

  it('łączy równoległe żądania resume i reconnect w jeden sync', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    let zwolnijPobieranie: (() => void) | undefined
    const oczekujacePobieranie = new Promise<void>((rozwiaz) => { zwolnijPobieranie = rozwiaz })
    const pobierzZmiany = vi.spyOn(zdalne, 'pobierzZmiany').mockImplementation(async () => {
      await oczekujacePobieranie
      return []
    })
    const silnik = utworzSilnik()

    const zResume = silnik.synchronizuj(zdalne)
    const zReconnect = silnik.synchronizuj(zdalne)

    expect(zReconnect).toBe(zResume)
    zwolnijPobieranie?.()
    await expect(zResume).resolves.toMatchObject({ stan: 'zsynchronizowano' })
    expect(pobierzZmiany).toHaveBeenCalledTimes(1)
  })

  it('nie zapisuje stanu zsynchronizowano, gdy nowa zmiana trafia do kolejki podczas wysyłania', async () => {
    let rozpocznijWysylanie: (() => void) | undefined
    let zakonczWysylanie: (() => void) | undefined
    const wysylanieRozpoczete = new Promise<void>((rozwiaz) => { rozpocznijWysylanie = rozwiaz })
    const oczekujaceWysylanie = new Promise<void>((rozwiaz) => { zakonczWysylanie = rozwiaz })
    const zdalne: RepozytoriumZdalne = {
      trwale: false,
      pobierzZmiany: vi.fn(async () => []),
      wyslijZmiany: vi.fn(async () => {
        rozpocznijWysylanie?.()
        await oczekujaceWysylanie
      }),
    }
    const repozytorium = pobierzRepozytorium('zadania')
    await repozytorium.zapisz(zadanie('przed-sync', 'Pierwsza zmiana', '2026-08-27T10:00:00.000Z'))

    const synchronizacja = utworzSilnik().synchronizuj(zdalne)
    await wysylanieRozpoczete
    await repozytorium.zapisz(zadanie('podczas-sync', 'Zmiana podczas wysyłania', '2026-08-27T10:01:00.000Z'))
    zakonczWysylanie?.()

    await expect(synchronizacja).resolves.toMatchObject({ stan: 'oczekuje' })
    expect(await pobierzStanSynchronizacji()).toMatchObject({
      stan: 'oczekuje',
      liczbaOczekujacych: 1,
    })
  })

  it('zapisuje rozróżnialne stany: pending, offline, synced i error', async () => {
    await baza.tabela('zadania').put(zadanie('status', 'Status pending', '2026-08-27T10:00:00.000Z'))
    expect(await odtworzOczekujacaSynchronizacje(true)).toBe(true)
    expect((await pobierzStanSynchronizacji()).stan).toBe('oczekuje')

    const zdalne = new RepozytoriumZdalneInMemory()
    const offline = new SyncEngine({ czyOnline: () => false, opoznieniePonowieniaMs: 0 })
    await offline.synchronizuj(zdalne)
    expect((await pobierzStanSynchronizacji()).stan).toBe('offline')

    await utworzSilnik().synchronizuj(zdalne)
    expect((await pobierzStanSynchronizacji()).stan).toBe('zsynchronizowano')

    await pobierzRepozytorium('zadania').zapisz(zadanie('blad', 'Czeka po błędzie', '2026-08-28T10:00:00.000Z'))
    zdalne.ustawOnline(false)
    const zBledem = new SyncEngine({ czyOnline: () => true, liczbaProb: 1, opoznieniePonowieniaMs: 0 })
    await expect(zBledem.synchronizuj(zdalne)).rejects.toThrow('Testowy provider synchronizacji jest offline.')
    expect((await pobierzStanSynchronizacji()).stan).toBe('blad')

    zdalne.ustawOnline(true)
    await expect(zBledem.synchronizuj(zdalne)).resolves.toMatchObject({ wyslane: 1, stan: 'zsynchronizowano' })
    expect((await pobierzStanSynchronizacji()).stan).toBe('zsynchronizowano')
  })

  it('ustawia status offline natychmiast po utracie sieci', async () => {
    await oznaczSynchronizacjeOffline()

    expect((await pobierzStanSynchronizacji()).stan).toBe('offline')
  })

  it('realizuje pełny przepływ A → B → A oraz wysyła zmianę A po pracy offline', async () => {
    const zdalne = new RepozytoriumZdalneInMemory()
    const repozytorium = pobierzRepozytorium('zadania')
    const urzadzenieA = new SyncEngine({
      teraz: () => CZAS_SYNCHRONIZACJI,
      czyOnline: () => true,
      installationId: () => 'instalacja-a',
      opoznieniePonowieniaMs: 0,
    })
    await repozytorium.zapisz(zadanie('dwa-klienty', 'Utworzone na A', '2026-08-28T10:00:00.000Z'))
    await urzadzenieA.synchronizuj(zdalne)

    await baza.tabela('zadania').clear()
    await baza.tabela('stanSynchronizacji').clear()
    await baza.tabela('kolejkaSynchronizacji').clear()
    const urzadzenieB = new SyncEngine({
      teraz: () => CZAS_SYNCHRONIZACJI,
      czyOnline: () => true,
      installationId: () => 'instalacja-b',
      opoznieniePonowieniaMs: 0,
    })
    await urzadzenieB.synchronizuj(zdalne)
    const naB = await repozytorium.pobierz('dwa-klienty')
    expect(naB).toMatchObject({ tytul: 'Utworzone na A' })
    await repozytorium.zapisz({ ...naB!, tytul: 'Edytowane na B' })
    await urzadzenieB.synchronizuj(zdalne)

    await baza.tabela('zadania').clear()
    await baza.tabela('stanSynchronizacji').clear()
    await baza.tabela('kolejkaSynchronizacji').clear()
    await urzadzenieA.synchronizuj(zdalne)
    expect(await repozytorium.pobierz('dwa-klienty')).toMatchObject({ tytul: 'Edytowane na B' })

    let online = false
    const urzadzenieAOffline = new SyncEngine({
      teraz: () => '2026-09-01T12:05:00.000Z',
      czyOnline: () => online,
      installationId: () => 'instalacja-a',
      opoznieniePonowieniaMs: 0,
    })
    const naA = await repozytorium.pobierz('dwa-klienty')
    await repozytorium.zapisz({ ...naA!, tytul: 'Offline na A' })
    expect((await urzadzenieAOffline.synchronizuj(zdalne)).stan).toBe('offline')
    expect((await pobierzStanSynchronizacji()).liczbaOczekujacych).toBe(1)
    online = true
    await urzadzenieAOffline.synchronizuj(zdalne)
    expect((await zdalne.pobierzWszystkie()).find(({ rekord }) => rekord.id === 'dwa-klienty')?.rekord)
      .toMatchObject({ tytul: 'Offline na A' })
  })

  it.each([
    { tabela: 'kontaFinansowe' as const, rekord: { ...utworzMetadane('konto-a'), nazwa: 'Konto główne', typ: 'konto' as const, aktywne: true } },
    { tabela: 'miejsca' as const, rekord: { ...utworzMetadane('miejsce-a'), nazwa: 'Apteka', adres: 'ul. Zdrowa 1', typ: 'apteka' } },
  ])('przenosi $tabela przez outbox między urządzeniami wraz z aktualizacją i tombstone', async ({ tabela, rekord }) => {
    const zdalne = new RepozytoriumZdalneInMemory()
    const urzadzenieA = new SyncEngine({ czyOnline: () => true, installationId: () => 'instalacja-a', opoznieniePonowieniaMs: 0 })
    const urzadzenieB = new SyncEngine({ czyOnline: () => true, installationId: () => 'instalacja-b', opoznieniePonowieniaMs: 0 })

    await zapiszEncjeDwochUrzadzen(tabela, rekord)
    expect(await baza.tabela('kolejkaSynchronizacji').toArray()).toMatchObject([{ tabela, rekordId: rekord.id, operacja: 'utworzenie' }])
    await expect(urzadzenieA.synchronizuj(zdalne)).resolves.toMatchObject({ wyslane: 1 })
    expect((await zdalne.pobierzWszystkie()).find((zmiana) => zmiana.tabela === tabela)?.rekord).toMatchObject({ id: rekord.id, nazwa: rekord.nazwa })

    await baza.tabela(tabela).clear()
    await baza.tabela('stanSynchronizacji').clear()
    await baza.tabela('kolejkaSynchronizacji').clear()
    await expect(urzadzenieB.synchronizuj(zdalne)).resolves.toMatchObject({ pobrane: 1 })
    const pobrany = await baza.tabela(tabela).get(rekord.id)
    expect(pobrany).toMatchObject({ id: rekord.id, nazwa: rekord.nazwa })
    expect(pobrany?.usunietoAt).toBeUndefined()

    const zaktualizowany = { ...(await baza.tabela(tabela).get(rekord.id))!, nazwa: `${rekord.nazwa} po aktualizacji` }
    await zapiszEncjeDwochUrzadzen(tabela, zaktualizowany)
    await expect(urzadzenieB.synchronizuj(zdalne)).resolves.toMatchObject({ wyslane: 1 })
    await expect(urzadzenieB.synchronizuj(zdalne)).resolves.toMatchObject({ wyslane: 0 })
    expect((await zdalne.pobierzWszystkie()).filter((zmiana) => zmiana.tabela === tabela)).toHaveLength(1)

    await usunEncjeDwochUrzadzen(tabela, rekord.id)
    await expect(urzadzenieB.synchronizuj(zdalne)).resolves.toMatchObject({ wyslane: 1 })
    await baza.tabela(tabela).clear()
    await baza.tabela('stanSynchronizacji').clear()
    await baza.tabela('kolejkaSynchronizacji').clear()
    await expect(urzadzenieA.synchronizuj(zdalne)).resolves.toMatchObject({ pobrane: 1 })
    expect(await baza.tabela(tabela).get(rekord.id)).toMatchObject({ id: rekord.id, usunietoAt: expect.any(String) })
  })
})
