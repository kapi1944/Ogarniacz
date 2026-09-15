import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { WidokNotatek } from './WidokiWiedzy'

describe.sequential('Rejestr Notatki', () => {
  beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze() })

  it('tworzy własną właściwość z UI i zapisuje jej wartość', async () => {
    render(<MemoryRouter><WidokNotatek /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj właściwość' }))
    fireEvent.change(screen.getByLabelText('Nazwa'), { target: { value: 'Źródło pomysłu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dodaj właściwość' })).not.toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'Nowa notatka' })[0])
    fireEvent.change(screen.getByLabelText('Tytuł'), { target: { value: 'Pomysł' } })
    fireEvent.change(screen.getByLabelText('Treść'), { target: { value: 'Treść notatki' } })
    await waitFor(() => expect(screen.getByLabelText('Źródło pomysłu')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Źródło pomysłu'), { target: { value: 'Rozmowa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))
    await waitFor(async () => { const [notatka] = await pobierzRepozytorium('notatki').lista(); expect(notatka?.tytul).toBe('Pomysł'); expect(Object.values(notatka?.polaWlasne ?? {}) as unknown[]).toContain('Rozmowa') })
  })
})