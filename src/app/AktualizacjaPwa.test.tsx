import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AktualizacjaPwa } from './AktualizacjaPwa'

const { rejestruj, aktualizuj, platformaTestowa } = vi.hoisted(() => ({ rejestruj: vi.fn(), aktualizuj: vi.fn().mockResolvedValue(undefined), platformaTestowa: { natywna: false } }))
vi.mock('virtual:pwa-register', () => ({ registerSW: rejestruj }))
vi.mock('../platform/platforma', () => ({ platforma: platformaTestowa }))
const sprawdz = vi.fn().mockResolvedValue(undefined)
let oczekujacy: ServiceWorker

beforeEach(() => {
  vi.clearAllMocks()
  platformaTestowa.natywna = false
  oczekujacy = {} as ServiceWorker
  rejestruj.mockReturnValue(aktualizuj)
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    ready: Promise.resolve({ update: sprawdz }),
    getRegistration: vi.fn(async () => ({ waiting: oczekujacy })),
  } })
})
afterEach(cleanup)

it('sprawdza przy starcie, rejestruje raz w StrictMode i odświeża dopiero po decyzji', async () => {
  render(<StrictMode><AktualizacjaPwa /></StrictMode>)
  await waitFor(() => expect(sprawdz).toHaveBeenCalled())
  expect(rejestruj).toHaveBeenCalledTimes(1)
  await act(async () => rejestruj.mock.calls[0][0].onNeedRefresh())
  expect(screen.getByRole('button', { name: 'Zaktualizuj' })).toBeInTheDocument()
  expect(aktualizuj).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Zaktualizuj' }))
  expect(aktualizuj).toHaveBeenCalledWith(true)
})

it('Później nie aktywuje workera i nie powtarza komunikatu, ale pokazuje kolejnego workera', async () => {
  const widok = render(<AktualizacjaPwa />)
  await act(async () => rejestruj.mock.calls[0][0].onNeedRefresh())
  fireEvent.click(screen.getByRole('button', { name: 'Później' }))
  widok.rerender(<AktualizacjaPwa />)
  await act(async () => rejestruj.mock.calls[0][0].onNeedRefresh())
  expect(screen.queryByRole('button', { name: 'Zaktualizuj' })).not.toBeInTheDocument()
  expect(aktualizuj).not.toHaveBeenCalled()
  oczekujacy = {} as ServiceWorker
  await act(async () => rejestruj.mock.calls[0][0].onNeedRefresh())
  expect(screen.getByRole('button', { name: 'Zaktualizuj' })).toBeInTheDocument()
})

it('nie rejestruje PWA na Androidzie', () => {
  platformaTestowa.natywna = true
  render(<AktualizacjaPwa />)
  expect(rejestruj).not.toHaveBeenCalled()
})
