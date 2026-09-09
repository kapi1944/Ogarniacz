import { cleanup as wyczysc, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach as poKazdym, describe, expect, it, vi } from 'vitest'
import { szukajGlobalnie } from '../services/WyszukiwanieService'
import { WyszukiwanieGlobalne } from './WyszukiwanieGlobalne'

vi.mock('../services/WyszukiwanieService', () => ({ szukajGlobalnie: vi.fn() }))

poKazdym(() => { wyczysc(); vi.clearAllMocks() })

function BiezacyAdres() {
  const polozenie = useLocation()
  return <output aria-label="Bieżący adres">{polozenie.pathname}{polozenie.search}</output>
}

describe('globalne wyszukiwanie', () => {
  it('pozwala wybrać wynik strzałkami i otworzyć go Enterem', async () => {
    vi.mocked(szukajGlobalnie).mockResolvedValue([
      { id: '1', modul: 'zadania', typ: 'Zadanie', etykieta: 'Pierwszy wynik', opis: 'Status: otwarte', url: '/zadania?element=1' },
      { id: '2', modul: 'wizyty', typ: 'Wizyta', etykieta: 'Drugi wynik', opis: 'Data: 2026-09-15', url: '/zdrowie/wizyty?element=2' },
    ])
    const zamknij = vi.fn()
    render(<MemoryRouter><WyszukiwanieGlobalne zamknij={zamknij} moze={() => true} otworzDodawanie={vi.fn()} /><BiezacyAdres /></MemoryRouter>)

    const pole = screen.getByRole('combobox')
    fireEvent.change(pole, { target: { value: 'wynik' } })
    await screen.findByRole('option', { name: /Pierwszy wynik/ })
    fireEvent.keyDown(pole, { key: 'ArrowDown' })
    fireEvent.keyDown(pole, { key: 'Enter' })

    expect(screen.getByLabelText('Bieżący adres')).toHaveTextContent('/zdrowie/wizyty?element=2')
    expect(zamknij).toHaveBeenCalledOnce()
  })

  it('przenosi brakującą frazę do istniejącego szybkiego dodawania', async () => {
    vi.mocked(szukajGlobalnie).mockResolvedValue([])
    const otworzDodawanie = vi.fn()
    render(<MemoryRouter><WyszukiwanieGlobalne zamknij={vi.fn()} moze={() => true} otworzDodawanie={otworzDodawanie} /></MemoryRouter>)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Nowa rzecz' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dodaj „Nowa rzecz”' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj „Nowa rzecz”' }))

    expect(otworzDodawanie).toHaveBeenCalledWith({ tresc: 'Nowa rzecz' })
  })
})
