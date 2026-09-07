import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AgentEcho } from './AgentEcho'
import { KonfiguracjaRozmowyEcho } from './KonfiguracjaRozmowyEcho'
import { LokalnySemantycznyProviderEcho } from './LokalnySemantycznyProviderEcho'
import { RejestrNarzedziEcho, WykonawcaNarzedziEcho } from './NarzedziaEcho'
import type { ProviderModeluEcho } from './typyEcho'

function agentPrzypomnien() {
  const zapisz = vi.fn(async (argumenty: { tytul: string; czas: string }) => ({ id: 'r-1', ...argumenty }))
  const rejestr = new RejestrNarzedziEcho().zarejestruj({ nazwa: 'create_reminder', opis: 'Utworzę przypomnienie', schematArgumentow: z.object({ tytul: z.string(), czas: z.string().datetime() }), ryzyko: 'niskie', wykonaj: zapisz })
  return { agent: new AgentEcho({ provider: new LokalnySemantycznyProviderEcho(), rejestr, wykonawca: new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined), pobierzCzas: () => ({ teraz: '2026-09-06T12:00:00Z', dataLokalna: '2026-09-06', strefaCzasowa: 'Europe/Warsaw' }) }), zapisz }
}

describe('Kontrolowana autonomia Echo', () => {
  it('dla niepełnego przypomnienia pyta kolejno o temat, datę i godzinę', async () => {
    const { agent } = agentPrzypomnien()
    expect((await agent.obsluz('Przypomnij mi.')).tekst).toContain('Czego mam Ci przypomnieć?')
    expect((await agent.obsluz('Lekarz.')).tekst).toContain('Na kiedy')
    expect((await agent.obsluz('Jutro rano.')).tekst).toBe('O której?')
  })

  it('nie wymyśla daty, godziny ani deadline’u zadania i wymaga potwierdzenia zapisu', async () => {
    const zapisz = vi.fn(async (dane: { tytul: string }) => ({ id: 'z-1', ...dane }))
    const rejestr = new RejestrNarzedziEcho().zarejestruj({ nazwa: 'create_task', opis: 'Utworzę zadanie', schematArgumentow: z.object({ tytul: z.string(), termin: z.string().optional() }), ryzyko: 'niskie', wykonaj: zapisz })
    const provider: ProviderModeluEcho = { nazwa: 'test', tryb: 'pelny_agent', odpowiedz: async () => ({ typ: 'narzedzia', wywolania: [{ id: 'z', nazwa: 'create_task', argumenty: { tytul: 'ABC' } }] }) }
    const agent = new AgentEcho({ provider, rejestr, wykonawca: new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined) })
    const przed = await agent.obsluz('Dodaj zadanie ABC.')
    expect(przed.tekst).toContain('Zapisać?')
    expect(przed.tekst).not.toContain('termin:')
    expect(zapisz).not.toHaveBeenCalled()
    await agent.obsluz('Tak.')
    expect(zapisz).toHaveBeenCalledWith({ tytul: 'ABC' })
  })

  it('aktualizuje oczekującą akcję po korekcie „nie, deadline na sobotę”', async () => {
    const zapisz = vi.fn(async (dane: { tytul: string; termin?: string }) => ({ id: 'z-1', ...dane }))
    const rejestr = new RejestrNarzedziEcho().zarejestruj({ nazwa: 'create_task', opis: 'Utworzę zadanie', schematArgumentow: z.object({ tytul: z.string(), termin: z.string().optional() }), ryzyko: 'niskie', wykonaj: zapisz })
    const provider: ProviderModeluEcho = { nazwa: 'test', tryb: 'pelny_agent', odpowiedz: async () => ({ typ: 'narzedzia', wywolania: [{ id: 'z', nazwa: 'create_task', argumenty: { tytul: 'ABC' } }] }) }
    const agent = new AgentEcho({ provider, rejestr, wykonawca: new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined), pobierzCzas: () => ({ teraz: '2026-09-06T12:00:00Z', dataLokalna: '2026-09-06', strefaCzasowa: 'Europe/Warsaw' }) })
    await agent.obsluz('Dodaj ABC')
    const poprawiona = await agent.obsluz('Nie, ustaw deadline na sobotę.')
    expect(poprawiona.tekst).toContain('2026-09-12')
    await agent.obsluz('Tak')
    expect(zapisz).toHaveBeenCalledWith({ tytul: 'ABC', termin: '2026-09-12' })
  })

  it('rozdziela tempo głosu od trybu rozmowy', async () => {
    const konfiguracja = new KonfiguracjaRozmowyEcho()
    const agent = new AgentEcho({ konfiguracjaRozmowy: konfiguracja })
    await agent.obsluz('Echo, tempo szybkie.')
    expect(konfiguracja.pobierzTempo()).toBe('szybki')
    expect(konfiguracja.pobierzParametryGlosu().limitKontynuacjiMs).toBe(4_000)
    await agent.obsluz('Echo, tempo spokojne.')
    expect(konfiguracja.pobierzTempo()).toBe('spokojny')
    await agent.obsluz('Echo, tryb swobodny.')
    expect(konfiguracja.pobierzTrybRozmowy()).toBe('swobodny')
    expect(konfiguracja.pobierzTempo()).toBe('spokojny')
  })
})
