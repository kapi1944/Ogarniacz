import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { AgentEcho } from './AgentEcho'
import { LokalnySemantycznyProviderEcho } from './LokalnySemantycznyProviderEcho'
import { RejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'
import { KonfiguracjaRozmowyEcho } from './KonfiguracjaRozmowyEcho'

function agentBriefingu(tryb: 'szybki' | 'swobodny' = 'szybki') {
  const briefing = vi.fn(async ({ rodzaj }: { rodzaj: string }) => ({ tekst: rodzaj === 'poranny' ? 'Poranny briefing.' : 'Wieczorne podsumowanie.' }))
  const rejestr = new RejestrNarzedziEcho().zarejestruj({
    nazwa: 'daily_briefing', opis: 'Briefing', ryzyko: 'niskie',
    schematArgumentow: z.object({ data: z.string(), rodzaj: z.enum(['poranny', 'wieczorny']), tryb: z.enum(['szybki', 'swobodny']) }),
    wykonaj: briefing,
  })
  return {
    agent: new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(), rejestr,
      wykonawca: new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined),
      konfiguracjaRozmowy: new KonfiguracjaRozmowyEcho(tryb),
      pobierzCzas: () => ({ teraz: '2026-09-08T06:00:00Z', dataLokalna: '2026-09-08', strefaCzasowa: 'Europe/Warsaw' }),
      pobierzKontekstPlanowania: async () => ({ zajetePrzedzialy: [] }),
    }),
    briefing,
  }
}

describe('briefing Echo', () => {
  it('rozpoznaje pytanie o dzień i przekazuje wybrany tryb wypowiedzi', async () => {
    const { agent, briefing } = agentBriefingu('swobodny')
    expect((await agent.obsluz('Echo, co mnie dziś czeka?')).tekst).toBe('Poranny briefing.')
    expect(briefing).toHaveBeenCalledWith({ data: '2026-09-08', rodzaj: 'poranny', tryb: 'swobodny' })
  })

  it('rozpoznaje wieczorne podsumowanie bez automatycznego zapisu', async () => {
    const { agent, briefing } = agentBriefingu()
    expect((await agent.obsluz('Podsumuj dzisiaj.')).tekst).toBe('Wieczorne podsumowanie.')
    expect(briefing).toHaveBeenCalledWith({ data: '2026-09-08', rodzaj: 'wieczorny', tryb: 'szybki' })
  })
})
