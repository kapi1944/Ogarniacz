import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { AgentEcho } from './AgentEcho'
import { RejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'
import { utworzPlanWykonaniaEcho } from './PlanWykonaniaEcho'
import type { DecyzjaModeluEcho, ProviderModeluEcho, ZadanieModeluEcho } from './typyEcho'

class ProviderPlanu implements ProviderModeluEcho {
  readonly nazwa = 'test-planu'
  readonly tryb = 'pelny_agent' as const
  readonly zadania: ZadanieModeluEcho[] = []

  constructor(private readonly decyzje: DecyzjaModeluEcho[]) {}

  async odpowiedz(zadanie: ZadanieModeluEcho): Promise<DecyzjaModeluEcho> {
    this.zadania.push(zadanie)
    const decyzja = this.decyzje.shift()
    if (!decyzja) throw new Error('Brak decyzji testowej')
    return decyzja
  }
}

function rejestrPlanu(ryzykoDrugiego: 'niskie' | 'umiarkowane' = 'niskie', drugieWykonanie = vi.fn(async () => 'drugie')) {
  const kolejnosc: string[] = []
  const pierwsze = vi.fn(async () => { kolejnosc.push('pierwsze'); return 'pierwsze' })
  const drugie = vi.fn(async () => { kolejnosc.push('drugie'); return drugieWykonanie() })
  const trzecie = vi.fn(async () => { kolejnosc.push('trzecie'); return 'trzecie' })
  const rejestr = new RejestrNarzedziEcho()
    .zarejestruj({ nazwa: 'pierwsze', opis: 'Dodaj zakupy', schematArgumentow: z.object({}), ryzyko: 'niskie', wykonaj: pierwsze })
    .zarejestruj({ nazwa: 'drugie', opis: 'Przenieś zadania', schematArgumentow: z.object({}), ryzyko: ryzykoDrugiego, wykonaj: drugie })
    .zarejestruj({ nazwa: 'trzecie', opis: 'Dodaj przypomnienie', schematArgumentow: z.object({}), ryzyko: 'niskie', wykonaj: trzecie })
  return { rejestr, kolejnosc, pierwsze, drugie, trzecie }
}

function wykonawca(rejestr: RejestrNarzedziEcho) {
  return new WykonawcaNarzedziEcho(rejestr)
}

describe('plan wykonania Echo', () => {
  it('zapisuje kolejność, parametry, zależności, ryzyko i potwierdzenie', () => {
    const { rejestr } = rejestrPlanu('umiarkowane')
    const plan = utworzPlanWykonaniaEcho('Przełóż wieczór', [
      { id: 'k1', nazwa: 'pierwsze', argumenty: { nazwa: 'środki czystości' } },
      { id: 'k2', nazwa: 'drugie', argumenty: { data: '2026-09-13' }, zaleznosci: ['k1'] },
    ], rejestr)

    expect(plan.kroki).toMatchObject([
      { kolejnosc: 1, narzedzie: 'pierwsze', parametry: { nazwa: 'środki czystości' }, zaleznosci: [], ryzyko: 'niskie', wymagaPotwierdzenia: false },
      { kolejnosc: 2, narzedzie: 'drugie', zaleznosci: ['k1'], ryzyko: 'umiarkowane', wymagaPotwierdzenia: true },
    ])
  })

  it('wykonuje plan niskiego ryzyka w ustalonej kolejności', async () => {
    const { rejestr, kolejnosc } = rejestrPlanu()
    const provider = new ProviderPlanu([
      { typ: 'narzedzia', wywolania: [{ id: 'k1', nazwa: 'pierwsze', argumenty: {} }, { id: 'k2', nazwa: 'drugie', argumenty: {}, zaleznosci: ['k1'] }] },
      { typ: 'odpowiedz', tresc: 'Gotowe.' },
    ])
    const odpowiedz = await new AgentEcho({ provider, rejestr, wykonawca: wykonawca(rejestr) }).obsluz('Dodaj zakupy i przypomnienie')

    expect(kolejnosc).toEqual(['pierwsze', 'drugie'])
    expect(odpowiedz.tekst).toBe('Gotowe.')
    expect(provider.zadania[1].kontekstRozmowy.planWykonania?.status).toBe('wykonany')
  })

  it('przed planem z istotnym przesunięciem prosi o jedno krótkie potwierdzenie', async () => {
    const { rejestr, drugie } = rejestrPlanu('umiarkowane')
    const provider = new ProviderPlanu([
      { typ: 'narzedzia', wywolania: [{ id: 'k1', nazwa: 'pierwsze', argumenty: {} }, { id: 'k2', nazwa: 'drugie', argumenty: {} }] },
      { typ: 'odpowiedz', tresc: 'Plan wykonany.' },
    ])
    const agent = new AgentEcho({ provider, rejestr, wykonawca: wykonawca(rejestr) })

    const przed = await agent.obsluz('Przełóż wieczór, ale trening zostaw')
    expect(przed.tekst).toContain('Mogę wykonać 2 kroki')
    expect(przed.tekst).not.toContain('{')
    expect(drugie).not.toHaveBeenCalled()

    const po = await agent.potwierdz(przed.akcjaDoPotwierdzenia!)
    expect(po.tekst).toBe('Plan wykonany.')
    expect(drugie).toHaveBeenCalledOnce()
  })

  it('zachowuje wykonane kroki i jasno raportuje częściowe niepowodzenie bez rollbacku', async () => {
    const blad = vi.fn(async () => { throw new Error('Brak wolnego terminu') })
    const { rejestr, pierwsze, trzecie } = rejestrPlanu('niskie', blad)
    const provider = new ProviderPlanu([{ typ: 'narzedzia', wywolania: [
      { id: 'k1', nazwa: 'pierwsze', argumenty: {} },
      { id: 'k2', nazwa: 'drugie', argumenty: {}, zaleznosci: ['k1'] },
      { id: 'k3', nazwa: 'trzecie', argumenty: {}, zaleznosci: ['k2'] },
    ] }])
    const odpowiedz = await new AgentEcho({ provider, rejestr, wykonawca: wykonawca(rejestr) }).obsluz('Wykonaj trzy kroki')

    expect(pierwsze).toHaveBeenCalledOnce()
    expect(trzecie).not.toHaveBeenCalled()
    expect(odpowiedz.tekst).toContain('Wykonałem: Dodaj zakupy')
    expect(odpowiedz.tekst).toContain('Nie udało się: Przenieś zadania')
  })

  it('przekazuje oczekujący plan do kolejnej tury i zastępuje go poprawionym planem', async () => {
    const { rejestr } = rejestrPlanu('umiarkowane')
    const provider = new ProviderPlanu([
      { typ: 'narzedzia', wywolania: [{ id: 'a', nazwa: 'pierwsze', argumenty: {} }, { id: 'b', nazwa: 'drugie', argumenty: {} }, { id: 'c', nazwa: 'trzecie', argumenty: {} }] },
      { typ: 'narzedzia', wywolania: [{ id: 'b2', nazwa: 'drugie', argumenty: { data: '2026-09-13' } }, { id: 'c2', nazwa: 'trzecie', argumenty: {} }] },
    ])
    const agent = new AgentEcho({ provider, rejestr, wykonawca: wykonawca(rejestr) })
    await agent.obsluz('Zrób trzy rzeczy')
    const poprawiony = await agent.obsluz('Tak, ale bez zakupów. Jednak zrób to w niedzielę.')

    expect(provider.zadania[1].kontekstRozmowy.planWykonania?.kroki).toHaveLength(3)
    expect(poprawiony.akcjaDoPotwierdzenia?.plan?.kroki.map((krok) => krok.narzedzie)).toEqual(['drugie', 'trzecie'])
  })
})
