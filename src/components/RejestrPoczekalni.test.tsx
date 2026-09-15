import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { utworzMetadane } from '../domain/fabryki'
import type { ElementPoczekalni } from '../domain/typy'
import { utworzWlasnePoleRejestru } from '../services/RejestrService'
import { RejestrPoczekalni } from './RejestrPoczekalni'

describe.sequential('RejestrPoczekalni', () => {
  beforeEach(async () => { baza.close(); await Dexie.delete('ogarniacz-v1'); await inicjalizujBaze() })

  it('edytuje stary element i zapisuje własną właściwość pod trwałym ID', async () => {
    const element: ElementPoczekalni = { ...utworzMetadane('poczekalnia-1'), tresc: 'Stary wpis', zrodlo: 'tekst', status: 'nowe' }
    await pobierzRepozytorium('skrzynka').zapisz(element)
    const definicja = await utworzWlasnePoleRejestru({ rejestrId: 'poczekalnia', etykieta: 'Kontekst', typ: 'tekst' })
    render(<RejestrPoczekalni />)
    await waitFor(() => expect(screen.getAllByText('Stary wpis').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByTitle('Edytuj element Poczekalni'))
    fireEvent.change(screen.getByLabelText('Treść'), { target: { value: 'Zmieniony wpis' } })
    fireEvent.change(screen.getByLabelText('Kontekst'), { target: { value: 'dom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))
    await waitFor(async () => expect(await pobierzRepozytorium('skrzynka').pobierz(element.id)).toMatchObject({ tresc: 'Zmieniony wpis', polaWlasne: { [definicja.id]: 'dom' } }))
  })

  it('przekształca element przez domenową akcję Poczekalni', async () => {
    const element: ElementPoczekalni = { ...utworzMetadane('poczekalnia-2'), tresc: 'Napraw rower', zrodlo: 'tekst', status: 'do_sklasyfikowania' }
    await pobierzRepozytorium('skrzynka').zapisz(element)
    render(<RejestrPoczekalni />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Zadanie' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Zadanie' })[0])
    await waitFor(async () => expect(await pobierzRepozytorium('zadania').lista()).toMatchObject([{ tytul: 'Napraw rower' }]))
    expect(await pobierzRepozytorium('skrzynka').pobierz(element.id)).toMatchObject({ status: 'przetworzone' })
  })
})
