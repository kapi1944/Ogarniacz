import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, it, expect, vi } from 'vitest'
import { PanelAdministracjiKont } from './PanelAdministracjiKont'
import { pobierzUzytkownikow, zapiszUzytkownika, resetujHasloUzytkownika } from '../services/KontaService'

vi.mock('../services/KontaService', () => ({ pobierzUzytkownikow: vi.fn(), zapiszUzytkownika: vi.fn(), resetujHasloUzytkownika: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('tworzy konto bez kopiowania uprawnień i czyści hasło; nie ustawia fokusu', async () => {
  vi.mocked(pobierzUzytkownikow).mockResolvedValue([])
  vi.mocked(zapiszUzytkownika).mockResolvedValue(undefined)
  render(<PanelAdministracjiKont />)
  expect(screen.getByLabelText('Hasło tymczasowe')).not.toHaveFocus()
  fireEvent.change(screen.getByLabelText('E-mail użytkownika'), { target: { value: 'nowy@example.test' } })
  fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'nowy' } })
  fireEvent.change(screen.getByLabelText('Hasło tymczasowe'), { target: { value: 'Tymczasowe-haslo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz konto' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Dane kont zostały odświeżone.')
  expect(zapiszUzytkownika).toHaveBeenCalledWith({ email: 'nowy@example.test', login: 'nowy', nazwa: '', rolaSystemowa: 'uzytkownik', statusKonta: 'aktywne', haslo: 'Tymczasowe-haslo' })
  expect(screen.getByLabelText('Hasło tymczasowe')).toHaveValue('')
})

it('reset wymaga potwierdzenia; anulowanie nie zmienia hasła', async () => {
  vi.mocked(pobierzUzytkownikow).mockResolvedValue([{ id: 'konto', email: 'konto@example.test', login: null, nazwa: null, rolaSystemowa: 'uzytkownik', statusKonta: 'aktywne' }])
  vi.mocked(resetujHasloUzytkownika).mockResolvedValue({ kodOdzyskiwania: 'fikcyjny-jednorazowy-kod', wygasaAt: '2099-01-01T00:00:00Z' })
  render(<PanelAdministracjiKont />)
  fireEvent.click(screen.getByRole('button', { name: 'Pokaż konta' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edytuj konto' }))
  fireEvent.change(screen.getByLabelText('Hasło tymczasowe'), { target: { value: 'Nowe-tymczasowe' } })
  fireEvent.click(screen.getByRole('button', { name: 'Resetuj hasło i wyloguj sesje' }))
  expect(resetujHasloUzytkownika).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }))
  expect(resetujHasloUzytkownika).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Hasło tymczasowe'), { target: { value: 'Nowe-tymczasowe' } })
  fireEvent.click(screen.getByRole('button', { name: 'Resetuj hasło i wyloguj sesje' }))
  fireEvent.click(screen.getByRole('button', { name: 'Potwierdź reset hasła' }))
  await vi.waitFor(() => expect(resetujHasloUzytkownika).toHaveBeenCalledWith('konto'))
  expect(await screen.findByLabelText('Jednorazowy kod odzyskiwania')).toHaveValue('fikcyjny-jednorazowy-kod')
  expect(localStorage.getItem('fikcyjny-jednorazowy-kod')).toBeNull()
})
