import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AgentEcho } from './AgentEcho'
import { KonfiguracjaRozmowyEcho } from './KonfiguracjaRozmowyEcho'
import { LokalnySemantycznyProviderEcho } from './LokalnySemantycznyProviderEcho'
import { RejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'
import type { KontekstPlanowaniaEcho } from './typyEcho'

function utworzAgenta(kontekstPlanowania: KontekstPlanowaniaEcho, trybRozmowy: 'szybki' | 'swobodny' = 'szybki') {
  const zapisz = vi.fn(async (dane: { tytul: string; czas: string }) => ({ id: 'przypomnienie-1', ...dane }))
  const rejestr = new RejestrNarzedziEcho().zarejestruj({
    nazwa: 'create_reminder', opis: 'Tworzy przypomnienie',
    schematArgumentow: z.object({ tytul: z.string(), czas: z.string().datetime() }), ryzyko: 'niskie', wykonaj: zapisz,
  })
  return {
    zapisz,
    agent: new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(), rejestr,
      wykonawca: new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined),
      pobierzCzas: () => ({ teraz: '2026-09-07T08:00:00Z', dataLokalna: '2026-09-07', strefaCzasowa: 'Europe/Warsaw' }),
      pobierzKontekstPlanowania: async () => kontekstPlanowania,
      konfiguracjaRozmowy: new KonfiguracjaRozmowyEcho(trybRozmowy),
    }),
  }
}

describe('naturalne planowanie Echo', () => {
  it('wylicza „w połowie pracy” z grafiku i najpierw prosi o akceptację sugestii', async () => {
    const { agent, zapisz } = utworzAgenta({ praca: { od: '07:45', do: '16:00', zrodlo: 'grafik' }, zajetePrzedzialy: [] })
    const propozycja = await agent.obsluz('Przypomnij mi zadzwonić w połowie pracy.')
    expect(propozycja.tekst).toContain('Pracujesz 07:45–16:00')
    expect(propozycja.tekst).toContain('12:00')
    expect(zapisz).not.toHaveBeenCalled()
    await agent.obsluz('Tak')
    expect(new Date(zapisz.mock.calls[0][0].czas).getHours()).toBe(12)
  })

  it('wskazuje konflikt i proponuje termin bez przesuwania istniejącego planu', async () => {
    const { agent, zapisz } = utworzAgenta({
      zajetePrzedzialy: [{ tytul: 'Dentysta', od: '2026-09-07T15:00:00', do: '2026-09-07T16:00:00', zrodlo: 'blok_czasu' }],
    })
    const odpowiedz = await agent.obsluz('Przypomnij mi o raporcie dzisiaj o 15.')
    expect(odpowiedz.tekst).toContain('Dentysta')
    expect(odpowiedz.tekst).toContain('16:15')
    expect(odpowiedz.tekst).toContain('bez przesuwania')
    expect(zapisz).not.toHaveBeenCalled()
  })

  it('zadaje jedno krótkie pytanie, gdy bez grafiku nie da się wyliczyć połowy pracy', async () => {
    const { agent } = utworzAgenta({ zajetePrzedzialy: [] })
    expect((await agent.obsluz('Przypomnij mi zadzwonić w połowie pracy.')).tekst).toBe('O której?')
  })

  it('w trybie swobodnym nazywa wartość wyliczoną sugestią zamiast zapisywać ją po cichu', async () => {
    const { agent, zapisz } = utworzAgenta({ praca: { od: '08:00', do: '16:00', zrodlo: 'grafik' }, zajetePrzedzialy: [] }, 'swobodny')
    const odpowiedz = await agent.obsluz('Przypomnij mi o raporcie w połowie pracy.')
    expect(odpowiedz.tekst).toContain('To sugestia, nie zapisany fakt')
    expect(zapisz).not.toHaveBeenCalled()
  })
})
