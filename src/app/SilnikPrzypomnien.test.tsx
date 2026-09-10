import { cleanup as wyczysc, render, waitFor } from '@testing-library/react'
import { afterEach as poKazdym, beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { SilnikPrzypomnien } from './SilnikPrzypomnien'

const stan = vi.hoisted(() => ({
  dane: [] as Przypomnienie[],
  nasluchujCykluZycia: vi.fn(),
  synchronizuj: vi.fn(),
  ustawienia: {
    updatedAt: '2026-09-10T10:00:00.000Z',
    powiadomienia: true,
    ukrywajSzczegolyZdrowotneWPowiadomieniach: false,
  },
  zapisz: vi.fn(),
  zapiszWiele: vi.fn(),
}))

vi.mock('../hooks/useRepozytorium', () => ({
  useRepozytorium: () => ({
    dane: stan.dane,
    repozytorium: { zapisz: stan.zapisz, zapiszWiele: stan.zapiszWiele },
  }),
}))

vi.mock('../platform/platforma', () => ({
  platforma: {
    natywna: true,
    cyklZycia: { nasluchuj: stan.nasluchujCykluZycia },
    powiadomienia: { synchronizuj: stan.synchronizuj },
  },
}))

vi.mock('./KontekstAplikacji', () => ({
  useAplikacja: () => ({
    ustawienia: stan.ustawienia,
  }),
}))

poKazdym(wyczysc)

beforeEach(() => {
  vi.clearAllMocks()
  stan.nasluchujCykluZycia.mockResolvedValue(vi.fn())
  stan.ustawienia = {
    updatedAt: '2026-09-10T10:00:00.000Z',
    powiadomienia: true,
    ukrywajSzczegolyZdrowotneWPowiadomieniach: false,
  }
  stan.dane = [{
    ...utworzMetadane('przypomnienie-1'),
    tytul: 'Spotkanie',
    typ: 'absolutne',
    czas: '2026-09-10T20:00:00.000Z',
    priorytet: 'normalny',
    stan: 'nowe',
    eskalacja: false,
  }]
  stan.synchronizuj.mockResolvedValue({ zaplanowanePrzypomnieniaIds: ['przypomnienie-1'] })
})

describe('połączenie Reminder Engine z Androidem', () => {
  it('uzgadnia harmonogram bez zmiany stanu domenowego po samym zaplanowaniu', async () => {
    render(<SilnikPrzypomnien />)

    await waitFor(() => expect(stan.synchronizuj).toHaveBeenCalledWith(stan.dane, true, false))
    expect(stan.dane[0].stan).toBe('nowe')
    expect(stan.zapisz).not.toHaveBeenCalled()
    expect(stan.zapiszWiele).not.toHaveBeenCalled()
  })

  it('uzgadnia harmonogram po ponownym uruchomieniu aplikacji', async () => {
    render(<SilnikPrzypomnien />)
    await waitFor(() => expect(stan.synchronizuj).toHaveBeenCalledTimes(1))
    const zmienStan = stan.nasluchujCykluZycia.mock.calls[0][0]

    zmienStan('aktywny')

    await waitFor(() => expect(stan.synchronizuj).toHaveBeenCalledTimes(2))
  })

  it('uzgadnia harmonogram po zapisaniu wyniku ponownego przyznania uprawnienia', async () => {
    const widok = render(<SilnikPrzypomnien />)
    await waitFor(() => expect(stan.synchronizuj).toHaveBeenCalledTimes(1))
    stan.ustawienia = {
      ...stan.ustawienia,
      updatedAt: '2026-09-10T10:01:00.000Z',
    }

    widok.rerender(<SilnikPrzypomnien />)

    await waitFor(() => expect(stan.synchronizuj).toHaveBeenCalledTimes(2))
  })
})
