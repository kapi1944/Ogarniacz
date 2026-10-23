import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SzybkieDodawanie } from './SzybkieDodawanie'
import { baza } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'

vi.mock('./KontekstAplikacji', async () => {
  const { DOMYSLNE_USTAWIENIA } = await import('../domain/ustawienia')
  return { useAplikacja: () => ({ ustawienia: DOMYSLNE_USTAWIENIA, zapiszUstawienia: vi.fn().mockResolvedValue(undefined) }) }
})
vi.mock('../platform/platforma', () => ({ platforma: { haptyka: { sukces: vi.fn().mockResolvedValue(undefined) } } }))

beforeEach(async () => { await baza.tabela('zadania').clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('zapisuje raz przy podwójnym submit i odmawia cofnięcia po nowszej edycji', async () => {
  render(<MemoryRouter><SzybkieDodawanie moze={() => true} zamknij={vi.fn()} danePoczatkowe={{ typ: 'zadanie' }} /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Co chcesz ogarnąć? *'), { target: { value: 'Próba szybkiego dodania' } })
  const formularz = screen.getByRole('button', { name: 'Dodaj' }).closest('form')!
  act(() => { fireEvent.submit(formularz); fireEvent.submit(formularz) })
  await screen.findByRole('heading', { name: 'Dodano do Ogarniacza' })
  const zapisane = await pobierzRepozytorium('zadania').lista()
  expect(zapisane).toHaveLength(1)
  await baza.tabela('zadania').update(zapisane[0].id, { opis: 'Nowsza edycja' })
  fireEvent.click(screen.getByRole('button', { name: 'Cofnij' }))
  await screen.findByRole('alert')
  expect(await pobierzRepozytorium('zadania').pobierz(zapisane[0].id)).toMatchObject({ opis: 'Nowsza edycja' })
  expect(screen.getByRole('button', { name: 'Cofnij' })).toBeEnabled()
})

it('sprawdza uprawnienie przed zapisem także przy wymuszonym submit formularza', async () => {
  render(<MemoryRouter><SzybkieDodawanie moze={() => false} zamknij={vi.fn()} danePoczatkowe={{ typ: 'zadanie' }} /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Co chcesz ogarnąć? *'), { target: { value: 'Bez uprawnień' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Dodaj' }).closest('form')!)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Nie masz uprawnień'))
  expect(await baza.tabela('zadania').count()).toBe(0)
})
