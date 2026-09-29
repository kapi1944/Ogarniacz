import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import type { Repozytorium } from '../data/Repozytorium'
import { utworzMetadane } from '../domain/fabryki'
import type { PlatnoscStala } from '../domain/typy'
import { RejestrSubskrypcji } from './RejestrSubskrypcji'

const subskrypcja: PlatnoscStala = { ...utworzMetadane('sub-1'), nazwa: 'Muzyka', kwota: 25, dzienMiesiaca: 10, dataStartu: '2026-01-01', kategoria: 'Rozrywka', aktywna: true, rodzaj: 'subskrypcja' }
const zbuduj = (formularz: Record<string, string>, istniejaca?: PlatnoscStala): PlatnoscStala => ({ ...istniejaca!, ...formularz, nazwa: formularz.nazwa, kwota: Number(formularz.kwota), dzienMiesiaca: Number(formularz.dzienMiesiaca), aktywna: formularz.aktywna === 'true' })

describe.sequential('RejestrSubskrypcji', () => {
  beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze() })
  afterEach(() => { cleanup(); baza.close() })

  it('pokazuje stare dane domenowe, edytuje pole systemowe i zapisuje własną właściwość', async () => {
    const repozytorium = { zapisz: vi.fn().mockResolvedValue('sub-1') } as unknown as Repozytorium<PlatnoscStala>
    const { container } = render(<RejestrSubskrypcji dane={[subskrypcja]} repozytorium={repozytorium} zbuduj={zbuduj} />)
    expect(screen.getAllByText('Muzyka').length).toBeGreaterThan(0)
    expect(container.querySelector('.rejestr-subskrypcji__karty')).toBeTruthy()
    fireEvent.click(screen.getByTitle('Edytuj subskrypcję'))
    fireEvent.change(screen.getByDisplayValue('Muzyka'), { target: { value: 'Film' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))
    await waitFor(() => expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.objectContaining({ nazwa: 'Film' })))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Zapisz' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj właściwość' }))
    fireEvent.change(screen.getByLabelText('Nazwa'), { target: { value: 'Adres anulowania' } })
    fireEvent.change(screen.getByLabelText('Typ'), { target: { value: 'url' } })
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Utwórz' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Kolumny' }))
    expect(await screen.findByLabelText('Adres anulowania')).toBeInTheDocument()
    await waitFor(async () => expect(await baza.tabela('definicjeWlasnychPolRejestru').toArray()).toMatchObject([{ etykieta: 'Adres anulowania', id: expect.stringMatching(/^custom:/) }]))
  })
})
