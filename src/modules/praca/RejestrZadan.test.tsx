import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import type { Zadanie } from '../../domain/typy'
import { WidokZadan } from './WidokiPracy'

describe.sequential('Rejestr Zadania', () => {
  beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze() })

  it('zachowuje stare zadanie, edytuje zwykłe pole i własną właściwość', async () => {
    const zadanie: Zadanie = { ...utworzMetadane('zadanie-rejestr-1'), tytul: 'Stare zadanie', opis: 'Opis', status: 'otwarte', priorytet: 'normalny', tagi: [], podzadania: [], powiazania: [] }
    await pobierzRepozytorium('zadania').zapisz(zadanie)
    render(<MemoryRouter><WidokZadan /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj właściwość' }))
    fireEvent.change(screen.getByLabelText('Nazwa'), { target: { value: 'Klient' } })
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dodaj właściwość' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Stare zadanie')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Edytuj'))
    fireEvent.change(screen.getByLabelText('Tytuł'), { target: { value: 'Zmienione zadanie' } })
    fireEvent.change(screen.getByLabelText('Klient'), { target: { value: 'Ogarniacz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))
    await waitFor(async () => { const zapisane = await pobierzRepozytorium('zadania').pobierz(zadanie.id); expect(zapisane?.tytul).toBe('Zmienione zadanie'); expect(Object.values(zapisane?.polaWlasne ?? {}) as unknown[]).toContain('Ogarniacz') })
  })

  it('zmienia priorytet przez istniejącą akcję domenową Zadania', async () => {
    const zadanie: Zadanie = { ...utworzMetadane('zadanie-rejestr-2'), tytul: 'Priorytet', opis: '', status: 'otwarte', priorytet: 'normalny', tagi: [], podzadania: [], powiazania: [] }
    await pobierzRepozytorium('zadania').zapisz(zadanie)
    render(<MemoryRouter><WidokZadan /></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByLabelText('Priorytet zadania Priorytet').length).toBeGreaterThan(0))
    fireEvent.change(screen.getAllByLabelText('Priorytet zadania Priorytet')[0], { target: { value: 'wysoki' } })
    await waitFor(async () => expect(await pobierzRepozytorium('zadania').pobierz(zadanie.id)).toMatchObject({ priorytet: 'wysoki' }))
  })
})
