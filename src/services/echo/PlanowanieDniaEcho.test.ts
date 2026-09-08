import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { AgentEcho } from './AgentEcho'
import { LokalnySemantycznyProviderEcho } from './LokalnySemantycznyProviderEcho'
import { RejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'

const czas = { teraz: '2026-09-08T10:00:00.000Z', dataLokalna: '2026-09-08', strefaCzasowa: 'Europe/Warsaw' }

function utworzAgenta() {
  const zapisz = vi.fn(async () => ({ liczba: 1, typ: 'planer' }))
  const podglad = vi.fn(async ({ data }: { data: string }) => ({
    data,
    pozycje: [{ id: 'draft:dokumenty', zadanieId: 'dokumenty', tytul: 'Dokumenty', poczatek: `${data}T12:00:00`, koniec: `${data}T13:00:00`, status: 'zaplanowana' }],
  }))
  const przeplanuj = vi.fn(async ({ data }: { data: string }) => ({
    data,
    pozycje: [{ id: 'draft:raport', zadanieId: 'raport', tytul: 'Raport', poczatek: `${data}T13:00:00`, status: 'zaplanowana' }],
  }))
  const rejestr = new RejestrNarzedziEcho()
    .zarejestruj({ nazwa: 'preview_day_plan', opis: 'Podgląd planu', schematArgumentow: z.object({ data: z.string() }), ryzyko: 'niskie', wykonaj: podglad })
    .zarejestruj({ nazwa: 'preview_replan_from_now', opis: 'Podgląd przeplanowania', schematArgumentow: z.object({ data: z.string(), odGodziny: z.string() }), ryzyko: 'niskie', wykonaj: przeplanuj })
    .zarejestruj({ nazwa: 'find_free_slots', opis: 'Wolne okna', schematArgumentow: z.object({ data: z.string(), minuty: z.number() }), ryzyko: 'niskie', wykonaj: async ({ data, minuty }) => [{ poczatek: `${data}T14:00:00`, koniec: `${data}T15:00:00`, minuty }] })
    .zarejestruj({ nazwa: 'accept_plan_selection', opis: 'Zapis planu', schematArgumentow: z.object({
      data: z.string(), zadaniaIds: z.array(z.string()), godzinaStartu: z.string().optional(), godzinaObiadu: z.string().optional(),
      propozycje: z.array(z.object({ zadanieId: z.string(), tytul: z.string(), poczatek: z.string(), koniec: z.string() })).optional(),
      ograniczenia: z.array(z.object({ zadanieId: z.string(), nieWczesniejNiz: z.string().optional(), niePozniejNiz: z.string().optional() })).optional(),
    }), ryzyko: 'umiarkowane', wykonaj: zapisz })
  return {
    agent: new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(), rejestr,
      wykonawca: new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined),
      pobierzCzas: () => czas,
      pobierzKontekstPlanowania: async () => ({ zajetePrzedzialy: [] }),
    }),
    zapisz, podglad, przeplanuj,
  }
}

describe('planowanie dnia przez Echo', () => {
  it('najpierw pokazuje propozycję, a po jednym potwierdzeniu zapisuje ją istniejącym narzędziem', async () => {
    const { agent, zapisz } = utworzAgenta()

    const propozycja = await agent.obsluz('Echo, zaplanuj mi jutro.')
    expect(propozycja).toMatchObject({ wymagaPotwierdzenia: true })
    expect(propozycja.tekst).toContain('12:00 — Dokumenty')
    expect(zapisz).not.toHaveBeenCalled()

    expect((await agent.obsluz('Tak')).tekst).toBe('Plan dnia został zapisany.')
    expect(zapisz).toHaveBeenCalledOnce()
  })

  it('prośbę po opóźnieniu kieruje do podglądu przeplanowania od bieżącej godziny', async () => {
    const { agent, przeplanuj } = utworzAgenta()
    await agent.obsluz('Nie wyrobię się dzisiaj, przeplanuj resztę.')
    expect(przeplanuj).toHaveBeenCalledWith({ data: '2026-09-08', odGodziny: '12:00' })
  })

  it('modyfikuje oczekującą propozycję przed zapisem zamiast tworzyć nową rozmowę', async () => {
    const { agent, zapisz } = utworzAgenta()
    await agent.obsluz('Zaplanuj mi jutro')

    const korekta = await agent.obsluz('Dokumenty przed obiadem')
    expect(korekta.tekst).toContain('przed obiadem')
    expect(zapisz).not.toHaveBeenCalled()
    await agent.obsluz('Tak')

    expect(zapisz).toHaveBeenCalledWith(expect.objectContaining({
      ograniczenia: [{ zadanieId: 'dokumenty', niePozniejNiz: '12:00' }],
    }))
  })

  it('szuka godzinnego okna bez zapisywania zmian', async () => {
    const { agent, zapisz } = utworzAgenta()
    const odpowiedz = await agent.obsluz('Gdzie mogę wcisnąć godzinę na dokumenty?')
    expect(odpowiedz.tekst).toContain('14:00–15:00')
    expect(zapisz).not.toHaveBeenCalled()
  })
})
