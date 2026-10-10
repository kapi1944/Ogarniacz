import { cleanup as wyczysc, fireEvent as zdarzenie, render as pokaz, screen as ekran, waitFor as poczekaj } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../../domain/fabryki'
import type { Lek } from '../../domain/typy'
import { RozbieznoscApteczki, zapiszStatusDawkiZApteczka } from '../../services/LekiService'
import { WidokLekow } from './WidokiZdrowia'

const stan = vi.hoisted(() => ({ leki: [] as Lek[] }))
vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ ustawienia: { harmonogram: { koniecSnu: '07:00', poczatekSnu: '22:00' } } }) }))
vi.mock('../../hooks/useRepozytorium', () => ({ useRepozytorium: (tabela: string) => ({ dane: tabela === 'leki' ? stan.leki : [], repozytorium: {} }) }))
vi.mock('../../services/LekiService', async (oryginal) => ({ ...await oryginal<typeof import('../../services/LekiService')>(), zapiszStatusDawkiZApteczka: vi.fn() }))

afterEach(wyczysc)
beforeEach(() => {
  vi.resetAllMocks()
  stan.leki = [{ ...utworzMetadane('lek-test'), nazwa: 'Lek testowy', dawkaInstrukcja: '', godziny: ['08:00'], dawki: [{ id: 'rano', godzina: '08:00', ilosc: 2 }], jednostka: 'szt.', aktywny: true }]
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
