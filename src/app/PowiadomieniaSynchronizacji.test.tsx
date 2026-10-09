import { MemoryRouter } from 'react-router-dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { StanSynchronizacji } from '../domain/typy'
import { utworzMetadane } from '../domain/fabryki'
import { PowiadomieniaSynchronizacji } from './PowiadomieniaSynchronizacji'
import { StanKlientaWeb } from './StanKlientaWeb'
import { UstawieniaPowiadomienSynchronizacji } from '../modules/ustawienia/UstawieniaPowiadomienSynchronizacji'
import { pobierzPowiadomieniaSynchronizacji, powiadomOWynikuSynchronizacji, zamknijKomunikatSynchronizacji, powiadomOEtapieSynchronizacji } from '../services/PowiadomieniaSynchronizacji'

const { dane, poprosOUprawnienie, pokaz } = vi.hoisted(() => ({
  dane: { stan: undefined as StanSynchronizacji | undefined },
  poprosOUprawnienie: vi.fn(), pokaz: vi.fn().mockResolvedValue(true),
}))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => dane.stan }))
vi.mock('../platform/platforma', () => ({ platforma: { powiadomienia: { pokaz, poprosOUprawnienie } } }))
vi.mock('../services/SynchronizacjaAplikacji', () => ({ czySynchronizacjaSkonfigurowana: () => true }))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  dane.stan = { ...utworzMetadane('glowny'), stan: 'zsynchronizowano', liczbaOczekujacych: 0, liczbaKonfliktow: 0 }
  powiadomOWynikuSynchronizacji({ wyslane: 0, pobrane: 0, konflikty: 0, stan: 'zsynchronizowano' })
  const komunikat = pobierzPowiadomieniaSynchronizacji().komunikat
  if (komunikat) zamknijKomunikatSynchronizacji(komunikat.id)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('sam dostępny serwer bez ukończonej synchronizacji nie oznacza zsynchronizowanych danych', () => {
  dane.stan!.polaczenie = 'dostepne'
  render(<MemoryRouter><StanKlientaWeb /></MemoryRouter>)
  expect(screen.getByText('Oczekuje na pierwszą synchronizację')).toBeInTheDocument()
  expect(screen.getByRole('link')).toHaveAttribute('href', '/ustawienia#synchronizacja')
})

it('pokazuje trwały konflikt i status wymagający uwagi, a w trakcie operacji pokazuje synchronizację', () => {
  dane.stan!.liczbaKonfliktow = 1
  const widok = render(<MemoryRouter><StanKlientaWeb /><PowiadomieniaSynchronizacji /></MemoryRouter>)
  expect(screen.getByText('Wymaga uwagi')).toBeInTheDocument()
  expect(screen.getByText(/Konflikty danych: 1/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Szczegóły synchronizacji' })).toHaveAttribute('href', '/ustawienia#synchronizacja')
  dane.stan!.stan = 'synchronizacja'
  widok.rerender(<MemoryRouter><StanKlientaWeb /><PowiadomieniaSynchronizacji /></MemoryRouter>)
  expect(screen.getByText('Trwa synchronizacja')).toBeInTheDocument()
})

it('toast znika po sześciu sekundach, nie wraca po zmianie widoku i szybki przebieg bez zmian nie wyświetla postępu', () => {
  vi.useFakeTimers()
  const widok = render(<MemoryRouter><PowiadomieniaSynchronizacji /></MemoryRouter>)
  act(() => powiadomOEtapieSynchronizacji('pobieranie'))
  act(() => powiadomOWynikuSynchronizacji({ wyslane: 0, pobrane: 0, konflikty: 0, stan: 'zsynchronizowano' }))
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.queryByText('Pobieranie zmian…')).not.toBeInTheDocument()
  act(() => powiadomOWynikuSynchronizacji({ wyslane: 3, pobrane: 7, konflikty: 0, stan: 'zsynchronizowano' }))
  expect(screen.getByText(/Wysłano: 3, pobrano: 7/)).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(6000))
  widok.rerender(<MemoryRouter><PowiadomieniaSynchronizacji /></MemoryRouter>)
  expect(screen.queryByText(/Wysłano: 3/)).not.toBeInTheDocument()
})

it('systemowe powiadomienia są domyślnie wyłączone, a odmowa zgody pozostawia komunikaty w aplikacji', async () => {
  poprosOUprawnienie.mockResolvedValue(false)
  render(<UstawieniaPowiadomienSynchronizacji />)
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(poprosOUprawnienie).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(await screen.findByText(/Nie przyznano zgody/)).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(localStorage.getItem('ogarniacz:systemowe-powiadomienia-synchronizacji')).not.toBe('true')
})

it('włączenie po zgodzie jest zapamiętane na urządzeniu, a wyłączenie nie żąda kolejnej zgody', async () => {
  poprosOUprawnienie.mockResolvedValue(true)
  const widok = render(<UstawieniaPowiadomienSynchronizacji />)
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
  widok.unmount()
  render(<UstawieniaPowiadomienSynchronizacji />)
  expect(screen.getByRole('checkbox')).toBeChecked()
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked())
  expect(poprosOUprawnienie).toHaveBeenCalledTimes(1)
})
