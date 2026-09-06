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
    const brakGodziny = await agent.obsluz('Przypomnij mi jutro rano opłacić Spotify.')
    expect(brakGodziny.tekst).toBe('O której?')
    const odpowiedz = await agent.obsluz('O 8.')
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
    const przed = await agent.obsluz('Oznacz raport kwartalny jako wykonane.')
    expect(przed.wymagaPotwierdzenia).toBe(true)
    const wynik = await agent.potwierdz(przed.akcjaDoPotwierdzenia!)
    expect(wynik.wyniki?.some((element) => element.nazwa === 'complete_task')).toBe(true)
    expect(await pobierzRepozytorium('zadania').pobierz(zadanie.id)).toMatchObject({ status: 'wykonane' })
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
