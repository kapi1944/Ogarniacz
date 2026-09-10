import { cleanup as wyczysc, render, waitFor } from '@testing-library/react'
import { afterEach as poKazdym, beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { SilnikPrzypomnien } from './SilnikPrzypomnien'

const stan = vi.hoisted(() => ({
  dane: [] as Przypomnienie[],
  synchronizuj: vi.fn(),
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
    cyklZycia: { nasluchuj: vi.fn().mockResolvedValue(vi.fn()) },
    powiadomienia: { synchronizuj: stan.synchronizuj },
  },
}))

vi.mock('./KontekstAplikacji', () => ({
  useAplikacja: () => ({
    ustawienia: {
      powiadomienia: true,
      ukrywajSzczegolyZdrowotneWPowiadomieniach: false,
    },
  }),
}))

poKazdym(wyczysc)

beforeEach(() => {
  vi.clearAllMocks()
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
})
