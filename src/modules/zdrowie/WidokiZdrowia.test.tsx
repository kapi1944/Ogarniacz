import { cleanup as wyczysc, fireEvent as zdarzenie, render as pokaz, screen as ekran, waitFor as poczekaj } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../../domain/fabryki'
import type { Lek } from '../../domain/typy'
import { RozbieznoscApteczki, zapiszLekZDodanymZapasem, zapiszStatusDawkiZApteczka } from '../../services/LekiService'
import { WidokLekow } from './WidokiZdrowia'

const stan = vi.hoisted(() => ({ leki: [] as Lek[] }))
vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ ustawienia: { harmonogram: { koniecSnu: '07:00', poczatekSnu: '22:00' } } }) }))
vi.mock('../../hooks/useRepozytorium', () => ({ useRepozytorium: (tabela: string) => ({ dane: tabela === 'leki' ? stan.leki : [], repozytorium: {} }) }))
vi.mock('../../services/LekiService', async (oryginal) => ({ ...await oryginal<typeof import('../../services/LekiService')>(), zapiszStatusDawkiZApteczka: vi.fn(), zapiszLekZDodanymZapasem: vi.fn() }))

afterEach(wyczysc)
beforeEach(() => {
  vi.resetAllMocks()
  stan.leki = [{ ...utworzMetadane('lek-test'), nazwa: 'Lek testowy', dawkaInstrukcja: '', godziny: ['08:00'], dawki: [{ id: 'rano', godzina: '08:00', ilosc: 2 }], jednostka: 'szt.', aktywny: true }]
})

describe('formularz wersji dawkowania', () => {
  it('pokazuje aktywną i przyszłą wersję oraz przekazuje początek, notatkę i dotychczasowe ID', async () => {
    const lek = stan.leki[0]
    const konfiguracja = { dawkaInstrukcja: '', godziny: ['08:00'], dawki: lek.dawki, jednostka: lek.jednostka }
    stan.leki = [{ ...lek, jednostka: 'mg', godziny: ['09:00'], dawki: [{ ...lek.dawki![0], godzina: '09:00' }], historiaDawkowania: [
      { id: 'wersja-stara', obowiazujeOd: '2020-01-01T00:00:00Z', zapisanoAt: '2020-01-01T00:00:00Z', konfiguracja, notatka: 'Pierwotny schemat' },
      { id: 'wersja-przyszla', obowiazujeOd: '2999-01-01T00:00:00Z', zapisanoAt: '2020-01-01T00:00:00Z', konfiguracja: { ...konfiguracja, jednostka: 'mg', godziny: ['09:00'], dawki: [{ ...lek.dawki![0], godzina: '09:00' }] } },
    ] }]
    pokaz(<MemoryRouter><WidokLekow /></MemoryRouter>)
    expect(ekran.getByText('2 szt.')).toBeInTheDocument()
    zdarzenie.click(ekran.getByRole('button', { name: 'Edytuj' }))
    expect(ekran.getByText('Aktualny schemat: 08:00 — 2 szt.')).toBeInTheDocument()
    expect(ekran.getByText('Pierwotny schemat')).toBeInTheDocument()
    expect(ekran.getByText('Wersja 2')).toBeInTheDocument()
    expect(ekran.getByLabelText('Godzina dawki')).toHaveValue('09:00')
    zdarzenie.change(ekran.getByLabelText('Godzina dawki'), { target: { value: '10:00' } })
    zdarzenie.change(ekran.getByLabelText('Nowy schemat obowiązuje od'), { target: { value: '2999-01-02T12:00' } })
    zdarzenie.change(ekran.getByLabelText('Notatka o zmianie (opcjonalnie)'), { target: { value: 'Zmiana godziny' } })
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz' }))
    await poczekaj(() => expect(zapiszLekZDodanymZapasem).toHaveBeenCalledWith(expect.objectContaining({ id: lek.id, dawki: [expect.objectContaining({ id: 'rano', godzina: '10:00' })], historiaDawkowania: stan.leki[0].historiaDawkowania }), undefined, { obowiazujeOd: '2999-01-02T12:00', notatka: 'Zmiana godziny' }))
  })

  it('pozostawia domyślny początek do wyznaczenia w transakcji i pokazuje nieznaną starszą historię', async () => {
    pokaz(<MemoryRouter><WidokLekow /></MemoryRouter>)
    zdarzenie.click(ekran.getByRole('button', { name: 'Edytuj' }))
    expect(ekran.getByText('Starsze dane: wcześniejsze wersje i początek schematu nieznane.')).toBeInTheDocument()
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz' }))
    await poczekaj(() => expect(zapiszLekZDodanymZapasem).toHaveBeenCalledWith(expect.anything(), undefined, { obowiazujeOd: undefined, notatka: '' }))
  })

  it('wymaga wskazania wystąpienia powtórzonej godziny i przekazuje pełny czas', async () => {
    const srodowisko = (globalThis as typeof globalThis & { process: { env: Record<string, string | undefined> } }).process.env
    const poprzedniaStrefa = srodowisko.TZ
    srodowisko.TZ = 'Europe/Warsaw'
    try {
      pokaz(<MemoryRouter><WidokLekow /></MemoryRouter>)
      zdarzenie.click(ekran.getByRole('button', { name: 'Edytuj' }))
      zdarzenie.change(ekran.getByLabelText('Nowy schemat obowiązuje od'), { target: { value: '2026-10-25T02:30' } })
      const wybor = ekran.getByLabelText('Wystąpienie powtórzonej godziny')
      expect(wybor).toBeRequired()
      zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz' }))
      expect(zapiszLekZDodanymZapasem).not.toHaveBeenCalled()
      zdarzenie.change(wybor, { target: { value: '2026-10-25T01:30:00.000Z' } })
      zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz' }))
      await poczekaj(() => expect(zapiszLekZDodanymZapasem).toHaveBeenCalledWith(expect.anything(), undefined, { obowiazujeOd: '2026-10-25T01:30:00.000Z', notatka: '' }))
    } finally {
      if (poprzedniaStrefa === undefined) delete srodowisko.TZ
      else srodowisko.TZ = poprzedniaStrefa
    }
  })
})

describe('formularz statusu dawki', () => {
  it('przekazuje faktyczny czas i ilość oraz wymaga osobnego potwierdzenia rozbieżności', async () => {
    vi.mocked(zapiszStatusDawkiZApteczka).mockRejectedValueOnce(new RozbieznoscApteczki('Niedobór zapasu: potwierdź rozbieżność.')).mockResolvedValue(undefined)
    pokaz(<MemoryRouter><WidokLekow /></MemoryRouter>)
    zdarzenie.change(ekran.getByRole('combobox', { name: 'Status Lek testowy 08:00' }), { target: { value: 'zazyte' } })
    zdarzenie.change(ekran.getByLabelText('Rzeczywista data i godzina przyjęcia'), { target: { value: '2026-08-14T09:15' } })
    zdarzenie.change(ekran.getByLabelText('Rzeczywista ilość (opcjonalnie)'), { target: { value: '3' } })
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz' }))
    await ekran.findByText('Niedobór zapasu: potwierdź rozbieżność.')
    expect(ekran.getByRole('button', { name: 'Zapisz' })).toBeDisabled()
    expect(zapiszStatusDawkiZApteczka).toHaveBeenCalledTimes(1)
    zdarzenie.click(ekran.getByRole('checkbox'))
    zdarzenie.click(ekran.getByRole('button', { name: 'Zapisz' }))
    await poczekaj(() => expect(zapiszStatusDawkiZApteczka).toHaveBeenLastCalledWith(expect.anything(), 'zazyte', undefined, { przyjetoAt: '2026-08-14T09:15', przyjetaIlosc: 3, przyjetaJednostka: 'szt.', potwierdzRozbieznosc: true }))
  })

  it('zbiera termin odroczenia i pozwala anulować bez zapisu', () => {
    pokaz(<MemoryRouter><WidokLekow /></MemoryRouter>)
    zdarzenie.change(ekran.getByRole('combobox', { name: 'Status Lek testowy 08:00' }), { target: { value: 'odroczone' } })
    expect(ekran.getByLabelText('Odroczone do')).toBeRequired()
    zdarzenie.click(ekran.getByRole('button', { name: 'Anuluj' }))
    expect(zapiszStatusDawkiZApteczka).not.toHaveBeenCalled()
  })
})
