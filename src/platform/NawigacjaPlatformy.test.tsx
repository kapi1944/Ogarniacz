import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { utworzMetadane } from '../domain/fabryki'
import type { Lek } from '../domain/typy'
import { zapiszLekZDodanymZapasem } from '../services/LekiService'
import { sciezkaAlarmuDawki, uzgodnijPrzypomnieniaLekow } from '../services/PrzypomnieniaLekow'
import { mapujPrzypomnienieNaPowiadomienie } from './NotificationService'
import { NawigacjaPlatformy } from './NawigacjaPlatformy'
import type { AkcjaPowiadomienia } from './typy'

const stan = vi.hoisted(() => ({ gotowy: true, dostep: true, obsluga: undefined as ((akcja: AkcjaPowiadomienia) => void) | undefined }))
vi.mock('./platforma', () => ({ platforma: { natywna: false, powiadomienia: {
  nasluchujAkcji: (obsluga: (akcja: AkcjaPowiadomienia) => void) => { stan.obsluga = obsluga; return () => { stan.obsluga = undefined } },
} } }))
vi.mock('../app/KontekstAplikacji', () => ({ useAplikacja: () => ({
  gotowyDostep: stan.gotowy, moze: () => stan.dostep, otworzSzybkieDodawanieZDanymi: vi.fn(),
  ustawienia: { ukrywajSzczegolyZdrowotneWPowiadomieniach: true },
}) }))
vi.mock('./obslugaWstecz', () => ({ useObslugaWstecz: () => undefined, obsluzWstecz: () => false }))
vi.mock('./ObslugaCelowPlatformy', () => ({ utworzObslugeCelowPlatformy: ({ nawiguj }: { nawiguj: (trasa: string) => void }) => ({
  obsluz: async (trasa: string) => nawiguj(trasa), zakoncz: () => undefined,
}) }))

function Trasa() { const trasa = useLocation(); return <output data-testid="trasa">{trasa.pathname + trasa.search}</output> }
function Widok() { return <MemoryRouter><NawigacjaPlatformy /><Trasa /></MemoryRouter> }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T07:00:00'))
  stan.gotowy = true; stan.dostep = true; stan.obsluga = undefined
  await inicjalizujBaze()
  for (const tabela of ['leki', 'dziennikLekow', 'przypomnienia', 'kolejkaSynchronizacji'] as const) await baza.tabela(tabela).clear()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

async function przygotuj() {
  const lek: Lek = { ...utworzMetadane('lek-syntetyczny'), nazwa: 'Lek syntetyczny', dawkaInstrukcja: '', godziny: ['08:00'],
    dawki: [{ id: 'rano', godzina: '08:00', ilosc: 1 }], jednostka: 'szt.', aktywny: true }
  await zapiszLekZDodanymZapasem(lek, 10)
  return (await uzgodnijPrzypomnieniaLekow())[0]
}

describe('lokalne rozwiązywanie zminimalizowanej akcji Androida', () => {
  it.each(['otworz', 'wykonane', 'przyjeto', 'pominieto', 'odrocz'] as const)('otwiera właściwe wystąpienie i potwierdzenie: %s', async (typ) => {
    const alarm = await przygotuj()
    const wersja = mapujPrzypomnienieNaPowiadomienie(alarm, true)!.wersja
    render(<Widok />)
    await act(async () => stan.obsluga!({ typ, przypomnienieId: alarm.id, sciezka: '/przypomnienia', wersjaPowiadomienia: wersja }))
    await waitFor(() => expect(screen.getByTestId('trasa').textContent).toBe(sciezkaAlarmuDawki(alarm, typ === 'wykonane' ? undefined : typ)))
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
  })

  it.each(['wersja', 'uprawnienie', 'usuniecie'] as const)('odrzuca nieaktualny lub niedostępny alarm: %s', async (powod) => {
    const alarm = await przygotuj()
    const wersja = mapujPrzypomnienieNaPowiadomienie(alarm, true)!.wersja
    if (powod === 'wersja') await baza.tabela('przypomnienia').put({ ...alarm, dawkaLeku: { ...alarm.dawkaLeku!, wersjaStanu: 'nowsza' } })
    if (powod === 'usuniecie') await baza.tabela('przypomnienia').delete(alarm.id)
    if (powod === 'uprawnienie') stan.dostep = false
    render(<Widok />)
    await act(async () => stan.obsluga!({ typ: 'wykonane', przypomnienieId: alarm.id, sciezka: '/przypomnienia', wersjaPowiadomienia: wersja }))
    await screen.findByText(powod === 'uprawnienie' ? 'Brak uprawnienia do leku.' : 'Ten alarm jest niedostępny lub nieaktualny. Sprawdź aktualne przypomnienia.')
    expect(screen.getByTestId('trasa').textContent).toBe('/')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
  })

  it('czeka z odbiorem akcji do inicjalizacji dostępu', () => {
    stan.gotowy = false
    const widok = render(<Widok />)
    expect(stan.obsluga).toBeUndefined()
    stan.gotowy = true
    widok.rerender(<Widok />)
    expect(stan.obsluga).toBeTypeOf('function')
  })

  it('rozwiązuje osobno obydwie dawki z powtórzonej jesiennej godziny', async () => {
    const srodowisko = (globalThis as typeof globalThis & { process: { env: Record<string, string | undefined> } }).process.env
    const poprzedniaStrefa = srodowisko.TZ
    srodowisko.TZ = 'Europe/Warsaw'
    try {
      vi.setSystemTime(new Date('2026-10-25T00:00:00'))
      const lek: Lek = { ...utworzMetadane('interwal-syntetyczny'), nazwa: 'Interwał syntetyczny', dawkaInstrukcja: '', godziny: ['00:00'],
        dawki: [{ id: 'dawka', godzina: '00:00', ilosc: 1 }], trybDawkowania: 'co_x_godzin', interwalGodzin: 1, pierwszaGodzina: '00:00', jednostka: 'szt.', aktywny: true }
      await zapiszLekZDodanymZapasem(lek, 100)
      const alarmy = (await uzgodnijPrzypomnieniaLekow()).filter((alarm) => alarm.dawkaLeku?.data === '2026-10-25' && new Date(alarm.czas!).getHours() === 2)
      expect(alarmy).toHaveLength(2)
      const powiadomienia = alarmy.map((alarm) => mapujPrzypomnienieNaPowiadomienie(alarm, true)!)
      expect(powiadomienia[0].id).not.toBe(powiadomienia[1].id)
      expect(powiadomienia[0].wersja).not.toBe(powiadomienia[1].wersja)
      render(<Widok />)
      for (const [indeks, alarm] of alarmy.entries()) {
        await act(async () => stan.obsluga!({ typ: 'otworz', przypomnienieId: alarm.id, sciezka: '/przypomnienia', wersjaPowiadomienia: powiadomienia[indeks].wersja }))
        await waitFor(() => expect(screen.getByTestId('trasa').textContent).toBe(sciezkaAlarmuDawki(alarm, 'otworz')))
      }
    } finally { if (poprzedniaStrefa === undefined) delete srodowisko.TZ; else srodowisko.TZ = poprzedniaStrefa }
  })
})
