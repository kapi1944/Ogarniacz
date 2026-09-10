import { cleanup as wyczysc, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach as poKazdym, beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../../domain/fabryki'
import type { ElementSkrzynki, Projekt, Zadanie } from '../../domain/typy'
import { cofnijPrzeksztalcenieInbox, przeksztalcElementInbox } from '../../services/PoczekalniaService'
import { WidokProjektow, WidokSkrzynki, WidokZadan } from './WidokiPracy'

const stan = vi.hoisted(() => ({
  zadania: [] as Zadanie[],
  projekty: [] as Projekt[],
  skrzynka: [] as ElementSkrzynki[],
  zapiszZadanie: vi.fn(),
  usunZadanie: vi.fn(),
  usunInbox: vi.fn(),
}))

vi.mock('../../hooks/usePodswietlenie', () => ({ usePodswietlenie: vi.fn() }))
vi.mock('../../hooks/useRepozytorium', () => ({
  useRepozytorium: (tabela: string) => {
    if (tabela === 'zadania') return { dane: stan.zadania, repozytorium: { zapisz: stan.zapiszZadanie, usun: stan.usunZadanie } }
    if (tabela === 'projekty') return { dane: stan.projekty, repozytorium: { zapisz: vi.fn(), usun: vi.fn() } }
    if (tabela === 'skrzynka') return { dane: stan.skrzynka, repozytorium: { zapisz: vi.fn(), usun: stan.usunInbox } }
    return { dane: [], repozytorium: { zapisz: vi.fn(), usun: vi.fn() } }
  },
}))
vi.mock('../../platform/platforma', () => ({ platforma: { haptyka: { sukces: vi.fn().mockResolvedValue(undefined) }, udostepnianie: { dostepne: () => false } } }))
vi.mock('../../services/PoczekalniaService', async (importujOryginal) => ({
  ...await importujOryginal<typeof import('../../services/PoczekalniaService')>(),
  przeksztalcElementInbox: vi.fn(),
  cofnijPrzeksztalcenieInbox: vi.fn(),
  zapiszDoInbox: vi.fn(),
}))

poKazdym(wyczysc)

beforeEach(() => {
  vi.clearAllMocks()
  stan.zadania = []
  stan.projekty = []
  stan.skrzynka = []
  stan.zapiszZadanie.mockResolvedValue(undefined)
  stan.usunZadanie.mockResolvedValue(undefined)
})

describe('codzienny przepływ pracy', () => {
  it('przekształca wpis Inboxu jednym kliknięciem, pokazuje wynik i pozwala cofnąć', async () => {
    const element: ElementSkrzynki = { ...utworzMetadane('inbox-1'), tresc: 'Oddzwonić do administracji', zrodlo: 'tekst', status: 'do_sklasyfikowania' }
    stan.skrzynka = [element]
    vi.mocked(przeksztalcElementInbox).mockResolvedValue({ typ: 'zadania', id: 'zadanie-1' })
    vi.mocked(cofnijPrzeksztalcenieInbox).mockResolvedValue(undefined)

    render(<MemoryRouter><WidokSkrzynki /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Zadanie' }))

    await screen.findByText(/Utworzono zadanie/)
    expect(screen.getByRole('link', { name: /Otwórz utworzony element/ })).toHaveAttribute('href', '/zadania?element=zadanie-1')
    fireEvent.click(screen.getByRole('button', { name: 'Cofnij' }))
    await waitFor(() => expect(cofnijPrzeksztalcenieInbox).toHaveBeenCalledWith(element, { typ: 'zadania', id: 'zadanie-1' }))
    expect(screen.getByText(/Wpis znowu czeka w Inboxie/)).toBeInTheDocument()
  })

  it('zmienia priorytet, termin i projekt zadania bez otwierania formularza', async () => {
    const zadanie: Zadanie = { ...utworzMetadane('zadanie-1'), tytul: 'Przygotować ofertę', opis: '', status: 'otwarte', priorytet: 'normalny', tagi: [], podzadania: [], powiazania: [] }
    const projekt: Projekt = { ...utworzMetadane('projekt-1'), nazwa: 'Nowa strona', opis: '', status: 'aktywne', blokady: '', nastepneDzialanie: 'Ustalić zakres' }
    stan.zadania = [zadanie]
    stan.projekty = [projekt]

    render(<MemoryRouter><WidokZadan /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Priorytet zadania Przygotować ofertę'), { target: { value: 'wysoki' } })
    fireEvent.change(screen.getByLabelText('Termin zadania Przygotować ofertę'), { target: { value: '2026-09-12' } })
    fireEvent.change(screen.getByLabelText('Projekt zadania Przygotować ofertę'), { target: { value: projekt.id } })

    await waitFor(() => expect(stan.zapiszZadanie).toHaveBeenCalledTimes(3))
    expect(stan.zapiszZadanie).toHaveBeenNthCalledWith(1, expect.objectContaining({ priorytet: 'wysoki' }))
    expect(stan.zapiszZadanie).toHaveBeenNthCalledWith(2, expect.objectContaining({ termin: '2026-09-12', dataElementu: '2026-09-12' }))
    expect(stan.zapiszZadanie).toHaveBeenNthCalledWith(3, expect.objectContaining({ projektId: projekt.id }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('wyjaśnia zniknięcie wykonanego zadania i oferuje Cofnij', async () => {
    const zadanie: Zadanie = { ...utworzMetadane('zadanie-1'), tytul: 'Wysłać ofertę', opis: '', status: 'otwarte', priorytet: 'wysoki', tagi: [], podzadania: [], powiazania: [] }
    stan.zadania = [zadanie]
    render(<MemoryRouter><WidokZadan /></MemoryRouter>)

    fireEvent.click(screen.getByTitle('Oznacz jako wykonane'))

    await screen.findByText(/Oznaczono „Wysłać ofertę” jako wykonane/)
    fireEvent.click(screen.getByRole('button', { name: 'Cofnij' }))
    await waitFor(() => expect(stan.zapiszZadanie).toHaveBeenLastCalledWith(zadanie))
    expect(screen.getByText('Cofnięto ostatnią zmianę zadania.')).toBeInTheDocument()
  })

  it('pokazuje następne działanie projektu i wyraźnie oznacza zaległe zadanie', () => {
    stan.projekty = [{ ...utworzMetadane('projekt-1'), nazwa: 'Nowa strona', opis: '', status: 'aktywne', blokady: '', nastepneDzialanie: 'Zebrać wymagania' }]
    stan.zadania = [{ ...utworzMetadane('zadanie-1'), tytul: 'Rozmowa z klientem', opis: '', status: 'otwarte', priorytet: 'wysoki', termin: '2020-01-01', projektId: 'projekt-1', tagi: [], podzadania: [], powiazania: [] }]

    render(<MemoryRouter><WidokProjektow /></MemoryRouter>)

    expect(screen.getByText((_, element) => element?.classList.contains('komunikat') === true && element.textContent?.includes('Następne działanie: Zebrać wymagania') === true)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Rozmowa z klientem · zaległe od 2020-01-01/ })).toHaveClass('tekst-bledu')
  })
})
