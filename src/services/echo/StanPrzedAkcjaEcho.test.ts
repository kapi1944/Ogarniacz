import { beforeEach, describe, expect, it } from 'vitest'
import { baza } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import { utworzZadanie } from '../ZadaniaService'
import { AgentEcho } from './AgentEcho'
import { KontekstRozmowyEcho } from './KontekstRozmowyEcho'
import { utworzDomyslnyRejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'

beforeEach(async () => {
  await Promise.all((['przypomnienia', 'rachunki', 'platnosciStale', 'zadania'] as const).map((nazwa) => baza.tabela(nazwa).clear()))
})

describe('Echo sprawdza stan przed akcją', () => {
  it('pyta przed przypomnieniem o opłaconym Spotify i zapisuje dopiero po potwierdzeniu', async () => {
    await pobierzRepozytorium('rachunki').zapisz({ ...utworzMetadane(), nazwa: 'Spotify', kwota: 25, termin: '2026-09-10', status: 'zaplacony' })
    const agent = new AgentEcho({ pobierzCzas: () => ({ teraz: '2026-09-06T12:00:00Z', dataLokalna: '2026-09-06', strefaCzasowa: 'Europe/Warsaw' }) })
    const odpowiedz = await agent.obsluz('Przypomnij mi jutro o 8 opłacić Spotify.')
    expect(odpowiedz.tekst).toContain('już oznaczone jako opłacone')
    expect(await pobierzRepozytorium('przypomnienia').lista()).toHaveLength(0)
    expect(odpowiedz.akcjaDoPotwierdzenia).toBeDefined()
    const akcja = structuredClone(odpowiedz.akcjaDoPotwierdzenia!)
    akcja.wywolanie.argumenty = { tytul: 'Podmieniony tytuł', czas: '2026-09-07T06:00:00.000Z' }
    await agent.potwierdz(akcja)
    const zapisane = await pobierzRepozytorium('przypomnienia').lista()
    expect(zapisane).toHaveLength(1)
    expect(zapisane[0].tytul).toContain('Spotify')
  })

  it('wykrywa duplikat również bez dostępu do finansów', async () => {
    const rejestr = utworzDomyslnyRejestrNarzedziEcho()
    const wykonawca = new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined, (nazwa) => nazwa !== 'upcoming_bills')
    const argumenty = { tytul: 'Lekarz', czas: '2026-09-07T06:00:00.000Z' }
    expect((await wykonawca.wykonaj({ id: '1', nazwa: 'create_reminder', argumenty }, true)).status).toBe('wykonane')
    expect((await wykonawca.wykonaj({ id: '2', nazwa: 'create_reminder', argumenty })).status).toBe('wymaga_potwierdzenia')
    expect(await pobierzRepozytorium('przypomnienia').lista()).toHaveLength(1)
  })

  it('brak rachunku nie oznacza opłaconej ani zaległej subskrypcji', async () => {
    await pobierzRepozytorium('platnosciStale').zapisz({ ...utworzMetadane(), nazwa: 'Spotify', kwota: 25, dzienMiesiaca: 10, dataStartu: '2026-01-01', kategoria: 'Muzyka', aktywna: true, rodzaj: 'subskrypcja' })
    const wynik = await utworzDomyslnyRejestrNarzedziEcho().pobierz('subscription_state')!.wykonaj({ fraza: 'Spotify', miesiac: '2026-09' })
    expect(wynik).toMatchObject({ subskrypcje: [{ nazwa: 'Spotify' }], rachunki: [] })
  })

  it('zakończenie zadania znalezionego po nazwie nie usuwa go', async () => {
    const zadanie = utworzZadanie({ tytul: 'Raport kwartalny', opis: '', priorytet: 'normalny', szacowanyCzasMin: 30 })
    await pobierzRepozytorium('zadania').zapisz(zadanie)
    const agent = new AgentEcho()
    const wynik = await agent.obsluz('Oznacz raport kwartalny jako wykonane.')
    expect(wynik.wymagaPotwierdzenia).not.toBe(true)
    expect(wynik.wyniki?.some((element) => element.nazwa === 'complete_task')).toBe(true)
    expect(await pobierzRepozytorium('zadania').pobierz(zadanie.id)).toMatchObject({ status: 'wykonane' })
  })

  it('wymaga potwierdzenia dla jednego fleksyjnego dopasowania i zapisuje dopiero po potwierdzeniu', async () => {
    const zadanie = utworzZadanie({ tytul: 'Raport miesięczny', opis: '', priorytet: 'normalny', szacowanyCzasMin: 30 })
    await pobierzRepozytorium('zadania').zapisz(zadanie)
    const agent = new AgentEcho()

    const przed = await agent.obsluz('Oznacz raportu miesięcznego jako wykonane.')

    expect(przed.wymagaPotwierdzenia).toBe(true)
    expect(przed.tekst).toContain('Raport miesięczny')
    expect(przed.wyniki?.some((element) => element.nazwa === 'complete_task')).not.toBe(true)
    expect(await pobierzRepozytorium('zadania').pobierz(zadanie.id)).toMatchObject({ status: 'otwarte' })

    const po = await agent.potwierdz(przed.akcjaDoPotwierdzenia!)
    expect(po.wyniki?.some((element) => element.nazwa === 'complete_task')).toBe(true)
    expect(await pobierzRepozytorium('zadania').pobierz(zadanie.id)).toMatchObject({ status: 'wykonane' })
  })

  it('przy wielu wynikach czeka na wskazanie właściwego zadania', async () => {
    const pierwszy = utworzZadanie({ tytul: 'Raport miesięczny', opis: '', priorytet: 'normalny', szacowanyCzasMin: 30 })
    const drugi = utworzZadanie({ tytul: 'Raport kwartalny', opis: '', priorytet: 'normalny', szacowanyCzasMin: 30 })
    await Promise.all([pobierzRepozytorium('zadania').zapisz(pierwszy), pobierzRepozytorium('zadania').zapisz(drugi)])
    const agent = new AgentEcho()

    const pytanie = await agent.obsluz('Oznacz raport jako wykonane.')

    expect(pytanie.oczekujeDoprecyzowania).toBe(true)
    expect(pytanie.wyniki?.some((element) => element.nazwa === 'complete_task')).not.toBe(true)
    expect(await pobierzRepozytorium('zadania').pobierz(pierwszy.id)).toMatchObject({ status: 'otwarte' })
    expect(await pobierzRepozytorium('zadania').pobierz(drugi.id)).toMatchObject({ status: 'otwarte' })

    const numerKwartalnego = pytanie.tekst
      .split('\n')
      .find((linia) => linia.includes('Raport kwartalny'))
      ?.match(/^(\d+)\./)?.[1]
    expect(numerKwartalnego).toBeDefined()
    const wynik = await agent.obsluz(numerKwartalnego!)
    expect(wynik.wymagaPotwierdzenia).not.toBe(true)
    expect(await pobierzRepozytorium('zadania').pobierz(pierwszy.id)).toMatchObject({ status: 'otwarte' })
    expect(await pobierzRepozytorium('zadania').pobierz(drugi.id)).toMatchObject({ status: 'wykonane' })
  })

  it('automatycznie kończy zadanie wskazane wcześniej jednoznacznie w kontekście', async () => {
    const zadanie = utworzZadanie({ tytul: 'Raport miesięczny', opis: '', priorytet: 'normalny', szacowanyCzasMin: 30 })
    await pobierzRepozytorium('zadania').zapisz(zadanie)
    const agent = new AgentEcho()
    await agent.obsluz('Znajdź zadanie Raport miesięczny.')

    const wynik = await agent.obsluz('Oznacz to jako wykonane.')

    expect(wynik.wymagaPotwierdzenia).not.toBe(true)
    expect(wynik.wyniki?.some((element) => element.nazwa === 'complete_task')).toBe(true)
    expect(await pobierzRepozytorium('zadania').pobierz(zadanie.id)).toMatchObject({ status: 'wykonane' })
  })

  it('nie wywołuje complete_task, gdy wyszukiwanie nie zwraca wyników', async () => {
    const wynik = await new AgentEcho().obsluz('Oznacz nieistniejący raport jako wykonane.')

    expect(wynik.tekst).toContain('Nie znalazłem zadania')
    expect(wynik.wyniki?.some((element) => element.nazwa === 'complete_task')).not.toBe(true)
  })

  it('przechowuje ograniczoną historię intencji i nie udostępnia jej do modyfikacji', () => {
    const kontekst = new KontekstRozmowyEcho()
    for (let numer = 0; numer < 10; numer++) kontekst.zastosujAktualizacje({ intencjaSemantyczna: { typ: String(numer), pewnosc: 0.9, wartosci: [], encje: [], brakujacePola: [], konflikty: [], korekta: true } })
    const migawka = kontekst.migawka()
    expect(migawka.historiaIntencji).toHaveLength(6)
    migawka.intencjaSemantyczna!.typ = 'podmiana'
    expect(kontekst.migawka().intencjaSemantyczna?.typ).toBe('9')
  })
})
