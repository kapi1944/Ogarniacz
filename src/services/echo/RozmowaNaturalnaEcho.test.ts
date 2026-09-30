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
  it('zapisuje „w połowie pracy” dokładnie z grafiku bez zbędnego potwierdzenia', async () => {
    const { agent, zapisz } = utworzAgenta({ praca: { od: '07:45', do: '16:00', zrodlo: 'grafik' }, zajetePrzedzialy: [] })
    const odpowiedz = await agent.obsluz('Przypomnij mi zadzwonić w połowie pracy.')
    expect(odpowiedz.tekst).toContain('11:52:30')
    expect(zapisz).toHaveBeenCalledOnce()
    expect(new Date(zapisz.mock.calls[0][0].czas).getHours()).toBe(11)
    expect(new Date(zapisz.mock.calls[0][0].czas).getMinutes()).toBe(52)
    expect(new Date(zapisz.mock.calls[0][0].czas).getSeconds()).toBe(30)
  })

  it('nie przesuwa jawnie wybranej godziny przypomnienia z powodu zajętego kalendarza', async () => {
    const { agent, zapisz } = utworzAgenta({
      zajetePrzedzialy: [{ tytul: 'Dentysta', od: '2026-09-07T15:00:00', do: '2026-09-07T16:00:00', zrodlo: 'blok_czasu' }],
    })
    const odpowiedz = await agent.obsluz('Przypomnij mi o raporcie dzisiaj o 15.')
    expect(odpowiedz.tekst).toContain('dodałem')
    expect(new Date(zapisz.mock.calls[0][0].czas).getHours()).toBe(15)
    expect(zapisz).toHaveBeenCalledOnce()
  })

  it('zadaje jedno krótkie pytanie, gdy bez grafiku nie da się wyliczyć połowy pracy', async () => {
    const { agent } = utworzAgenta({ zajetePrzedzialy: [] })
    expect((await agent.obsluz('Przypomnij mi zadzwonić w połowie pracy.')).tekst).toBe('O której?')
  })

  it('tryb swobodny również wykonuje kompletne polecenie bez zbędnego pytania', async () => {
    const { agent, zapisz } = utworzAgenta({ praca: { od: '08:00', do: '16:00', zrodlo: 'grafik' }, zajetePrzedzialy: [] }, 'swobodny')
    const odpowiedz = await agent.obsluz('Przypomnij mi o raporcie w połowie pracy.')
    expect(odpowiedz.tekst).toContain('dodałem')
    expect(zapisz).toHaveBeenCalledOnce()
  })
})
