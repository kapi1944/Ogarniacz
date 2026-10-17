import { cleanup as wyczysc, fireEvent as zdarzenie, render, screen } from '@testing-library/react'
import { afterEach as poKazdym, beforeEach as przedKazdym, expect, it, vi } from 'vitest'
import { EkranResetowaniaHasla, FormularzLinkuResetowania, pobierzTokenResetuZAdresu } from './OdzyskiwanieHasla'
import { poprosOLinkResetowaniaHasla, ustawHasloPrzezLink } from '../services/KontaService'

vi.mock('../services/KontaService', () => ({ poprosOLinkResetowaniaHasla: vi.fn(), ustawHasloPrzezLink: vi.fn() }))
przedKazdym(() => { window.history.replaceState({}, '', '/'); localStorage.clear(); sessionStorage.clear(); vi.resetAllMocks() })
poKazdym(wyczysc)

it('usuwa sekret z adresu i nie zapisuje go w storage, zachowując inne fragmenty aplikacji', () => {
  window.history.replaceState({}, '', '/#reset-hasla=syntetyczny-token')
  expect(pobierzTokenResetuZAdresu()).toBe('syntetyczny-token')
  expect(window.location.hash).toBe('')
  expect(localStorage.length + sessionStorage.length).toBe(0)
  expect(pobierzTokenResetuZAdresu()).toBeUndefined()
  window.history.replaceState({}, '', '/#inna-sekcja')
  expect(pobierzTokenResetuZAdresu()).toBeUndefined()
  expect(window.location.hash).toBe('#inna-sekcja')
})

it('prosi tylko o e-mail, pokazuje neutralny komunikat i zachowuje powrót do kodów', async () => {
  vi.mocked(poprosOLinkResetowaniaHasla).mockResolvedValue('Jeśli konto jest aktywne i poczta jest skonfigurowana, otrzymasz link.')
  const powrot = vi.fn()
  render(<FormularzLinkuResetowania powrot={powrot} />)
  expect(screen.getByLabelText('E-mail konta')).not.toHaveFocus()
  zdarzenie.change(screen.getByLabelText('E-mail konta'), { target: { value: 'konto@example.test' } })
  zdarzenie.click(screen.getByRole('button', { name: 'Wyślij link' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Jeśli konto jest aktywne')
  expect(poprosOLinkResetowaniaHasla).toHaveBeenCalledWith('konto@example.test')
  zdarzenie.click(screen.getByRole('button', { name: 'Wróć do logowania i kodów odzyskiwania' }))
  expect(powrot).toHaveBeenCalledOnce()
})

it('wymaga zgodnych nowych haseł i po resecie czyści formularz bez zapisywania sekretów', async () => {
  vi.mocked(ustawHasloPrzezLink).mockResolvedValue(undefined)
  render(<EkranResetowaniaHasla token="syntetyczny-token" />)
  expect(screen.getByLabelText('Nowe hasło')).not.toHaveFocus()
  zdarzenie.change(screen.getByLabelText('Nowe hasło'), { target: { value: 'Nowe-haslo' } })
  zdarzenie.change(screen.getByLabelText('Powtórz nowe hasło'), { target: { value: 'Inne-haslo' } })
  zdarzenie.click(screen.getByRole('button', { name: 'Ustaw nowe hasło' }))
  expect(screen.getByText('Nowe hasła muszą być jednakowe.')).toBeInTheDocument()
  expect(ustawHasloPrzezLink).not.toHaveBeenCalled()
  zdarzenie.change(screen.getByLabelText('Powtórz nowe hasło'), { target: { value: 'Nowe-haslo' } })
  zdarzenie.click(screen.getByRole('button', { name: 'Ustaw nowe hasło' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Wszystkie dotychczasowe sesje zostały wylogowane')
  expect(ustawHasloPrzezLink).toHaveBeenCalledWith('syntetyczny-token', 'Nowe-haslo')
  expect(screen.queryByLabelText('Nowe hasło')).not.toBeInTheDocument()
  expect(localStorage.length + sessionStorage.length).toBe(0)
})

it('wygasły link pokazuje błąd i czyści hasła, pozostawiając przejście do logowania', async () => {
  vi.mocked(ustawHasloPrzezLink).mockRejectedValue(new Error('Link wygasł lub jest nieprawidłowy. Poproś o nowy link.'))
  render(<EkranResetowaniaHasla token="syntetyczny-token" />)
  for (const etykieta of ['Nowe hasło', 'Powtórz nowe hasło']) zdarzenie.change(screen.getByLabelText(etykieta), { target: { value: 'Nowe-haslo' } })
  zdarzenie.click(screen.getByRole('button', { name: 'Ustaw nowe hasło' }))
  expect(await screen.findByText(/Link wygasł/)).toBeInTheDocument()
  expect(screen.getByLabelText('Nowe hasło')).toHaveValue('')
  expect(screen.getByLabelText('Powtórz nowe hasło')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Przejdź do logowania' })).toBeEnabled()
})
