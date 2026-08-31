import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { AgentEcho } from './AgentEcho'
import { RejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'
import type { DecyzjaModeluEcho, ProviderModeluEcho, ZadanieModeluEcho } from './typyEcho'

class ProviderSkryptowy implements ProviderModeluEcho {
  readonly nazwa = 'testowy'
  readonly tryb = 'pelny_agent' as const
  readonly zadania: ZadanieModeluEcho[] = []

  constructor(private readonly decyzje: DecyzjaModeluEcho[]) {}

  async odpowiedz(zadanie: ZadanieModeluEcho, _sygnal: AbortSignal): Promise<DecyzjaModeluEcho> {
    this.zadania.push(zadanie)
    const decyzja = this.decyzje.shift()
    if (!decyzja) throw new Error('Brak decyzji testowej')
    return decyzja
  }
}

function utworzWykonawce(rejestr: RejestrNarzedziEcho): WykonawcaNarzedziEcho {
  return new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined)
}

describe('Agent Echo', () => {
  it('realizuje model request -> tool call -> wynik -> odpowiedź', async () => {
    const wykonaj = vi.fn(async ({ dzien }: { dzien: string }) => [{ id: '1', tytul: 'Raport', termin: dzien }])
    const rejestr = new RejestrNarzedziEcho().zarejestruj({ nazwa: 'list_tasks', opis: 'Lista zadań', schematArgumentow: z.object({ dzien: z.string() }), ryzyko: 'niskie', wykonaj })
    const provider = new ProviderSkryptowy([
      { typ: 'narzedzia', wywolania: [{ id: 'w1', nazwa: 'list_tasks', argumenty: { dzien: '2026-09-01' } }] },
      { typ: 'odpowiedz', tresc: 'Jutro masz raport.' },
    ])
    const agent = new AgentEcho({ provider, rejestr, wykonawca: utworzWykonawce(rejestr) })

    const odpowiedz = await agent.obsluz('Co mam jutro?')

    expect(odpowiedz.tekst).toBe('Jutro masz raport.')
    expect(wykonaj).toHaveBeenCalledWith({ dzien: '2026-09-01' })
    expect(provider.zadania[1]?.kontekstRozmowy.ostatnieWynikiNarzedzi[0]?.dane).toEqual([{ id: '1', tytul: 'Raport', termin: '2026-09-01' }])
  })

  it('wykonuje kilka narzędzi w jednej turze', async () => {
    const pierwsze = vi.fn(async () => ['zadanie'])
    const drugie = vi.fn(async () => ['przypomnienie'])
    const rejestr = new RejestrNarzedziEcho()
      .zarejestruj({ nazwa: 'list_tasks', opis: 'Zadania', schematArgumentow: z.object({}), ryzyko: 'niskie', wykonaj: pierwsze })
      .zarejestruj({ nazwa: 'list_reminders', opis: 'Przypomnienia', schematArgumentow: z.object({}), ryzyko: 'niskie', wykonaj: drugie })
    const provider = new ProviderSkryptowy([
      { typ: 'narzedzia', wywolania: [{ id: 'w1', nazwa: 'list_tasks', argumenty: {} }, { id: 'w2', nazwa: 'list_reminders', argumenty: {} }] },
      { typ: 'odpowiedz', tresc: 'Sprawdziłem oba źródła.' },
    ])
    const agent = new AgentEcho({ provider, rejestr, wykonawca: utworzWykonawce(rejestr) })

    await agent.obsluz('Jak wygląda jutro?')

    expect(pierwsze).toHaveBeenCalledOnce()
    expect(drugie).toHaveBeenCalledOnce()
  })

  it('przekazuje follow-up razem z ograniczonym kontekstem wcześniejszych tur', async () => {
    const provider = new ProviderSkryptowy([{ typ: 'odpowiedz', tresc: 'Plan na jutro.' }, { typ: 'odpowiedz', tresc: 'Plan na pojutrze.' }])
    const agent = new AgentEcho({ provider, rejestr: new RejestrNarzedziEcho() })

    await agent.obsluz('Co mam jutro?')
    await agent.obsluz('A pojutrze?')

    expect(provider.zadania[1]?.kontekstRozmowy.tury.map((tura) => tura.tresc)).toEqual(['Co mam jutro?', 'Plan na jutro.', 'A pojutrze?'])
  })

  it('blokuje niepoprawne argumenty i nieistniejące narzędzie', async () => {
    const wykonaj = vi.fn(async () => 'ok')
    const rejestr = new RejestrNarzedziEcho().zarejestruj({ nazwa: 'get_task', opis: 'Zadanie', schematArgumentow: z.object({ id: z.string().min(1) }), ryzyko: 'niskie', wykonaj })
    const wykonawca = utworzWykonawce(rejestr)

    const zleArgumenty = await wykonawca.wykonaj({ id: 'w1', nazwa: 'get_task', argumenty: {} })
    const obceNarzedzie = await wykonawca.wykonaj({ id: 'w2', nazwa: 'run_sql', argumenty: { sql: 'DELETE' } })

    expect(zleArgumenty.status).toBe('zablokowane')
    expect(obceNarzedzie.status).toBe('zablokowane')
    expect(wykonaj).not.toHaveBeenCalled()
  })

  it('wymaga potwierdzenia działania wysokiego ryzyka', async () => {
    const wykonaj = vi.fn(async () => ({ usunieto: true }))
    const rejestr = new RejestrNarzedziEcho().zarejestruj({ nazwa: 'delete_important', opis: 'Usunięcie ważnych danych', schematArgumentow: z.object({ id: z.string() }), ryzyko: 'wysokie', wykonaj })
    const provider = new ProviderSkryptowy([
      { typ: 'narzedzia', wywolania: [{ id: 'w1', nazwa: 'delete_important', argumenty: { id: '1' } }] },
      { typ: 'odpowiedz', tresc: 'Usunąłem wskazany element.' },
    ])
    const agent = new AgentEcho({ provider, rejestr, wykonawca: utworzWykonawce(rejestr) })

    const przed = await agent.obsluz('Usuń to')
    expect(przed.wymagaPotwierdzenia).toBe(true)
    expect(wykonaj).not.toHaveBeenCalled()

    const po = await agent.potwierdz(przed.akcjaDoPotwierdzenia!)
    expect(wykonaj).toHaveBeenCalledOnce()
    expect(po.tekst).toBe('Usunąłem wskazany element.')
  })

  it('kończy bezpiecznie po błędzie, timeoutcie i limicie kroków', async () => {
    const providerBledu: ProviderModeluEcho = { nazwa: 'blad', tryb: 'pelny_agent', odpowiedz: async () => { throw new Error('awaria') } }
    const providerTimeoutu: ProviderModeluEcho = { nazwa: 'timeout', tryb: 'pelny_agent', odpowiedz: async () => new Promise(() => undefined) }
    const providerPetli: ProviderModeluEcho = { nazwa: 'petla', tryb: 'pelny_agent', odpowiedz: async () => ({ typ: 'narzedzia', wywolania: [] }) }

    expect((await new AgentEcho({ provider: providerBledu }).obsluz('Test')).tekst).toContain('nie zostały zmienione')
    expect((await new AgentEcho({ provider: providerTimeoutu, limitCzasuMs: 5 }).obsluz('Test')).tekst).toContain('Przerwałem')
    expect((await new AgentEcho({ provider: providerPetli, limitKrokow: 2 }).obsluz('Test')).tekst).toContain('zbyt wielu kroków')
  })

  it('przekazuje brak danych do modelu zamiast uzupełniać wynik', async () => {
    const rejestr = new RejestrNarzedziEcho().zarejestruj({ nazwa: 'get_task', opis: 'Zadanie', schematArgumentow: z.object({ id: z.string() }), ryzyko: 'niskie', wykonaj: async () => null })
    const provider = new ProviderSkryptowy([
      { typ: 'narzedzia', wywolania: [{ id: 'w1', nazwa: 'get_task', argumenty: { id: 'brak' } }] },
      { typ: 'odpowiedz', tresc: 'Nie mam zapisanej takiej informacji.' },
    ])
    const agent = new AgentEcho({ provider, rejestr, wykonawca: utworzWykonawce(rejestr) })

    const odpowiedz = await agent.obsluz('Pokaż zadanie')

    expect(provider.zadania[1]?.kontekstRozmowy.ostatnieWynikiNarzedzi[0]?.dane).toBeNull()
    expect(odpowiedz.tekst).toBe('Nie mam zapisanej takiej informacji.')
  })

  it('prowadzi tekst i transkrypcję STT przez ten sam agent i kontekst', async () => {
    const provider = new ProviderSkryptowy([{ typ: 'odpowiedz', tresc: 'Pierwsza odpowiedź.' }, { typ: 'odpowiedz', tresc: 'Druga odpowiedź.' }])
    const agent = new AgentEcho({ provider, rejestr: new RejestrNarzedziEcho() })

    await agent.obsluz('Wiadomość tekstowa', 'tekst')
    await agent.obsluz('Dalsza wypowiedź', 'stt')

    expect(provider.zadania[1]?.kontekstRozmowy.tury.map((tura) => tura.tresc)).toContain('Wiadomość tekstowa')
    expect(provider.zadania[1]?.kontekstRozmowy.tury.map((tura) => tura.tresc)).toContain('Dalsza wypowiedź')
  })
})
