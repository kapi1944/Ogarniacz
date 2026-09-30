import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza } from '../../data/BazaOgarniacza'
import * as repozytoria from '../../data/Repozytorium'
import { AgentEcho } from './AgentEcho'
import { LokalnyModelProviderEcho } from './LokalnyModelProviderEcho'
import { LokalnySemantycznyProviderEcho } from './LokalnySemantycznyProviderEcho'
import { utworzDomyslnyRejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'
import type { KontekstPlanowaniaEcho, ProviderModeluEcho } from './typyEcho'

const dzisiaj = '2026-09-30'
const grafik: KontekstPlanowaniaEcho = {
  zajetePrzedzialy: [],
  dni: [{ data: dzisiaj, pracuje: true, jestWyjatkiem: false,
    praca: { od: `${dzisiaj}T07:45:00`, do: `${dzisiaj}T16:00:00`, polowa: `${dzisiaj}T11:52:30`, zrodlo: 'grafik' },
    wolneOkna: [], zajetePrzedzialy: [],
  }],
}

function utworzAgenta(kontekst: KontekstPlanowaniaEcho = grafik, provider: ProviderModeluEcho = new LokalnySemantycznyProviderEcho(), zapiszDziennik = async () => undefined, teraz = `${dzisiaj}T08:00:00Z`) {
  const rejestr = utworzDomyslnyRejestrNarzedziEcho()
  return new AgentEcho({ provider, rejestr, wykonawca: new WykonawcaNarzedziEcho(rejestr, undefined, zapiszDziennik),
    pobierzCzas: () => ({ teraz, dataLokalna: dzisiaj, strefaCzasowa: 'Europe/Warsaw' }),
    pobierzKontekstPlanowania: async () => kontekst,
  })
}

beforeEach(async () => {
  await Promise.all((['zadania', 'przypomnienia', 'rachunki', 'kolejkaSynchronizacji', 'historiaZmian'] as const).map((tabela) => baza.tabela(tabela).clear()))
})
afterEach(() => vi.restoreAllMocks())

describe('głosowe tworzenie przez istniejące repozytoria Echo', () => {
  it('tworzy zadanie bez zbędnego pytania o termin, zachowując treść i kolejkę sync', async () => {
    const wynik = await utworzAgenta().obsluz('Dodaj zadanie: kupić olej', 'stt')
    const zadania = await repozytoria.pobierzRepozytorium('zadania').lista()
    expect(zadania).toHaveLength(1)
    expect(zadania[0]).toMatchObject({ tytul: 'Kupić olej', status: 'otwarte' })
    expect(zadania[0].termin).toBeUndefined()
    expect(wynik.tekst).toContain('Dodałem zadanie')
    expect(await baza.tabela('kolejkaSynchronizacji').toArray()).toContainEqual(expect.objectContaining({ tabela: 'zadania', rekordId: zadania[0].id, operacja: 'utworzenie' }))
  })

  it.each([
    ['Przypomnij mi jutro o 18:00 zadzwonić do taty', 'Zadzwonić do taty', '2026-10-01', 18, 0, 0],
    ['Przypomnij mi po pracy zatankować', 'Zatankować', dzisiaj, 16, 0, 0],
    ['Przypomnij mi w połowie pracy o telefonie', 'Telefonie', dzisiaj, 11, 52, 30],
  ] as const)('zapisuje właściwą treść i czas: %s', async (tekst, tytul, data, godziny, minuty, sekundy) => {
    const wynik = await utworzAgenta().obsluz(tekst, 'stt')
    const zapisane = await repozytoria.pobierzRepozytorium('przypomnienia').lista()
    expect(zapisane).toHaveLength(1)
    expect(zapisane[0]).toMatchObject({ tytul, typ: 'absolutne', stan: 'nowe' })
    const [rok, miesiac, dzien] = data.split('-').map(Number)
    expect(zapisane[0].czas).toBe(new Date(rok, miesiac - 1, dzien, godziny, minuty, sekundy).toISOString())
    expect(wynik.tekst).toContain('dodałem')
    expect(wynik.oczekujeDoprecyzowania).not.toBe(true)
    expect(await baza.tabela('kolejkaSynchronizacji').toArray()).toContainEqual(expect.objectContaining({ tabela: 'przypomnienia', rekordId: zapisane[0].id }))
  })

  it.each(['po pracy', 'w połowie pracy'])('bez grafiku pyta tylko o godzinę i zachowuje treść: %s', async (okreslenie) => {
    const agent = utworzAgenta({ zajetePrzedzialy: [] })
    expect((await agent.obsluz(`Przypomnij mi ${okreslenie} zatankować`, 'stt')).tekst).toBe('O której?')
    expect(await repozytoria.pobierzRepozytorium('przypomnienia').lista()).toHaveLength(0)
    await agent.obsluz('O 18:00', 'stt')
    expect(await repozytoria.pobierzRepozytorium('przypomnienia').lista()).toEqual([expect.objectContaining({ tytul: 'Zatankować' })])
  })

  it('nie bierze dzisiejszego grafiku dla jutrzejszego dnia wolnego', async () => {
    const agent = utworzAgenta({ ...grafik, praca: { od: '08:00', do: '16:00', zrodlo: 'grafik' }, dni: [...grafik.dni!, { data: '2026-10-01', pracuje: false, jestWyjatkiem: true, wolneOkna: [], zajetePrzedzialy: [] }] })
    expect((await agent.obsluz('Przypomnij mi jutro po pracy zatankować', 'stt')).tekst).toBe('O której?')
    expect(await repozytoria.pobierzRepozytorium('przypomnienia').lista()).toHaveLength(0)
  })

  it('korzysta z wyjątku grafiku właściwego dnia', async () => {
    const agent = utworzAgenta({ ...grafik, dni: [...grafik.dni!, { data: '2026-10-01', pracuje: true, jestWyjatkiem: true,
      praca: { od: '2026-10-01T09:00:00', do: '2026-10-01T17:30:00', polowa: '2026-10-01T13:15:00', zrodlo: 'wyjatek' }, wolneOkna: [], zajetePrzedzialy: [],
    }] })
    await agent.obsluz('Przypomnij mi jutro po pracy zatankować', 'stt')
    const [przypomnienie] = await repozytoria.pobierzRepozytorium('przypomnienia').lista()
    expect(new Date(przypomnienie.czas!).getHours()).toBe(17)
    expect(new Date(przypomnienie.czas!).getMinutes()).toBe(30)
  })

  it('po minięciu terminu pyta o dzień i ponownie używa grafiku wybranego dnia', async () => {
    const jutro = { ...grafik.dni![0], data: '2026-10-01', praca: { od: '2026-10-01T09:00:00', do: '2026-10-01T17:00:00', polowa: '2026-10-01T13:00:00', zrodlo: 'wyjatek' as const } }
    const agent = utworzAgenta({ ...grafik, dni: [...grafik.dni!, jutro] }, new LokalnySemantycznyProviderEcho(), async () => undefined, `${dzisiaj}T18:00:00Z`)
    expect((await agent.obsluz('Przypomnij mi w połowie pracy o telefonie', 'stt')).tekst).toContain('Ten termin już minął')
    expect(await repozytoria.pobierzRepozytorium('przypomnienia').lista()).toHaveLength(0)
    await agent.obsluz('Jutro', 'stt')
    const [przypomnienie] = await repozytoria.pobierzRepozytorium('przypomnienia').lista()
    expect(przypomnienie.tytul).toBe('Telefonie')
    expect(new Date(przypomnienie.czas!).getDate()).toBe(1)
    expect(new Date(przypomnienie.czas!).getHours()).toBe(13)
  })

  it('pamięta intencję zadania po pytaniu o brakującą treść', async () => {
    const agent = utworzAgenta()
    expect((await agent.obsluz('Dodaj zadanie', 'stt')).tekst).toBe('Jakie zadanie dodać?')
    await agent.obsluz('Kupić olej', 'stt')
    expect(await repozytoria.pobierzRepozytorium('zadania').lista()).toHaveLength(1)
    expect(await repozytoria.pobierzRepozytorium('przypomnienia').lista()).toHaveLength(0)
  })

  it('nie zamienia ilości w tytule na godzinę i nie usuwa negacji', async () => {
    await utworzAgenta().obsluz('Dodaj zadanie: kupić 2 litry oleju nie paliwa', 'stt')
    expect(await repozytoria.pobierzRepozytorium('zadania').lista()).toEqual([expect.objectContaining({ tytul: 'Kupić 2 litry oleju nie paliwa' })])
  })

  it('zapisuje lokalnie mimo niedostępnego połączenia z modelem', async () => {
    const pobierz = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Przerwane połączenie'))
    const agent = utworzAgenta({ zajetePrzedzialy: [] }, new LokalnyModelProviderEcho('https://ogarniacz.test/api/echo/model', pobierz))
    expect((await agent.obsluz('Przypomnij mi po pracy zatankować', 'stt')).tekst).toBe('O której?')
    const wynik = await agent.obsluz('O 18:00', 'stt')
    expect(wynik.tekst).toContain('dodałem')
    expect(await repozytoria.pobierzRepozytorium('przypomnienia').lista()).toHaveLength(1)
    expect(pobierz).not.toHaveBeenCalled()
  })

  it('ponowne polecenie pyta przed duplikatem i dopuszcza świadome potwierdzenie', async () => {
    const agent = utworzAgenta()
    await agent.obsluz('Dodaj zadanie: kupić olej', 'stt')
    const ponowienie = await agent.obsluz('Dodaj zadanie: kupić olej', 'stt')
    expect(ponowienie.wymagaPotwierdzenia).toBe(true)
    expect(await repozytoria.pobierzRepozytorium('zadania').lista()).toHaveLength(1)
    await agent.obsluz('Tak', 'stt')
    expect(await repozytoria.pobierzRepozytorium('zadania').lista()).toHaveLength(2)
  })

  it('seryjnie sprawdza duplikaty równoległych zapisów i nie powtarza tego samego wywołania', async () => {
    const wykonawca = new WykonawcaNarzedziEcho(utworzDomyslnyRejestrNarzedziEcho(), undefined, async () => undefined)
    const wywolanie = { id: 'tworzenie-1', nazwa: 'create_reminder', argumenty: { tytul: 'Telefon', czas: '2026-10-01T16:00:00Z' } }
    const wyniki = await Promise.all([wykonawca.wykonaj(wywolanie), wykonawca.wykonaj({ ...wywolanie, id: 'tworzenie-2' })])
    expect(wyniki.map((wynik) => wynik.status)).toEqual(['wykonane', 'wymaga_potwierdzenia'])
    expect((await wykonawca.wykonaj(wywolanie, true)).status).toBe('wykonane')
    expect(await repozytoria.pobierzRepozytorium('przypomnienia').lista()).toHaveLength(1)
  })

  it.each(['brak_zapisu', 'zapisany', 'niepewny'] as const)('rozstrzyga wynik po błędzie zapisu: %s', async (wariant) => {
    const pobierz = repozytoria.pobierzRepozytorium
    vi.spyOn(repozytoria, 'pobierzRepozytorium').mockImplementation((nazwa) => {
      const repozytorium = pobierz(nazwa)
      if (nazwa !== 'zadania') return repozytorium
      return { ...repozytorium, lista: () => repozytorium.lista(),
        zapisz: async (encja) => { if (wariant === 'zapisany') await repozytorium.zapisz(encja); throw new Error('Przerwano operację') },
        pobierz: async (id) => { if (wariant === 'niepewny') throw new Error('Baza niedostępna'); return repozytorium.pobierz(id) },
      }
    })
    const wynik = await utworzAgenta().obsluz('Dodaj zadanie: kupić olej', 'stt')
    expect(wynik.tekst).toContain(wariant === 'brak_zapisu' ? 'Nie zapisano' : wariant === 'niepewny' ? 'Nie mogę potwierdzić wyniku' : 'Dodałem zadanie')
    expect(await pobierz('zadania').lista()).toHaveLength(wariant === 'zapisany' ? 1 : 0)
  })

  it('po potwierdzonym niepowodzeniu pozwala ponowić polecenie bez starego wyniku', async () => {
    const zapis = vi.spyOn(baza.tabela('zadania'), 'put').mockRejectedValueOnce(new Error('Nie zapisano'))
    const agent = utworzAgenta()
    expect((await agent.obsluz('Dodaj zadanie: kupić olej', 'stt')).tekst).toContain('Nie zapisano')
    zapis.mockRestore()
    expect((await agent.obsluz('Dodaj zadanie: kupić olej', 'stt')).tekst).toContain('Dodałem zadanie')
    expect(await repozytoria.pobierzRepozytorium('zadania').lista()).toHaveLength(1)
  })

  it('błąd dziennika po zapisie nie zmienia sukcesu w niepowodzenie', async () => {
    const agent = utworzAgenta(grafik, new LokalnySemantycznyProviderEcho(), async () => { throw new Error('Dziennik niedostępny') })
    expect((await agent.obsluz('Dodaj zadanie: kupić olej', 'stt')).tekst).toContain('Dodałem zadanie')
    expect(await repozytoria.pobierzRepozytorium('zadania').lista()).toHaveLength(1)
  })
})
