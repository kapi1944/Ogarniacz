import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelAktualizacjiRaspberry } from './PanelAktualizacjiRaspberry'
import { BladKonta } from '../../services/KontaService'

const { pobierzStatus, uruchomAktualizacje, konto } = vi.hoisted(() => ({
  pobierzStatus: vi.fn(),
  uruchomAktualizacje: vi.fn(),
  konto: { biezace: { rola: 'wlasciciel' as const } as { rola: 'wlasciciel' | 'edytor' } | undefined },
}))

vi.mock('../../app/DostawcaKonta', () => ({ useKonto: () => ({ konto: konto.biezace }) }))
vi.mock('../../services/KontaService', async (importOryginalu) => {
  const oryginal = await importOryginalu<typeof import('../../services/KontaService')>()
  return { ...oryginal, pobierzStatusAktualizacjiRaspberry: pobierzStatus, uruchomAktualizacjeRaspberry: uruchomAktualizacje }
})

const dostepnyStatus = { wersja: '1.0.13', commit: 'abcdef0123456789', originStable: 'b'.repeat(40), dostepnosc: 'dostepna' as const, stan: 'idle' as const, komunikat: 'Dostępna jest nowsza wersja.', moznaPrzywrocic: false }

beforeEach(() => {
  vi.useRealTimers()
  konto.biezace = { rola: 'wlasciciel' }
  pobierzStatus.mockResolvedValue(dostepnyStatus)
  uruchomAktualizacje.mockResolvedValue(undefined)
})

afterEach(() => { vi.useRealTimers(); cleanup(); vi.clearAllMocks() })

describe('PanelAktualizacjiRaspberry', () => {
  it('pokazuje panel tylko przy dostępnym API', async () => {
    render(<PanelAktualizacjiRaspberry />)
    expect(await screen.findByText('Raspberry / serwer')).toBeInTheDocument()
    expect(screen.getByText('abcdef01')).toBeInTheDocument()
    pobierzStatus.mockRejectedValueOnce(new BladKonta(404, 'wyłączone'))
    cleanup()
    render(<PanelAktualizacjiRaspberry />)
    await waitFor(() => expect(screen.queryByText('Raspberry / serwer')).not.toBeInTheDocument())
    pobierzStatus.mockRejectedValueOnce(new Error('brak połączenia'))
    cleanup()
    render(<PanelAktualizacjiRaspberry />)
    await waitFor(() => expect(screen.queryByText('Raspberry / serwer')).not.toBeInTheDocument())
  })

  it('Właściciel wysyła CSRF-zabezpieczone akcje API', async () => {
    pobierzStatus.mockReset().mockResolvedValueOnce(dostepnyStatus).mockResolvedValueOnce({ ...dostepnyStatus, stan: 'checking' as const, dostepnosc: 'nieznana' as const })
    render(<PanelAktualizacjiRaspberry />)
    await screen.findByText('Raspberry / serwer')
    fireEvent.click(screen.getByRole('button', { name: 'Sprawdź aktualizacje' }))
    await waitFor(() => expect(uruchomAktualizacje).toHaveBeenCalledWith('check'))
    expect(screen.getByRole('button', { name: 'Sprawdź aktualizacje' })).toBeDisabled()
  })

  it('Edytor nie dostaje aktywnych akcji', async () => {
    konto.biezace = { rola: 'edytor' }
    render(<PanelAktualizacjiRaspberry />)
    await screen.findByText('Edytor nie może uruchamiać aktualizacji Raspberry.')
    expect(screen.getByRole('button', { name: 'Sprawdź aktualizacje' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Zainstaluj aktualizację' })).toBeDisabled()
  })

  it('rozróżnia brak sesji od niedostępnego endpointu', async () => {
    konto.biezace = undefined
    pobierzStatus.mockReset().mockRejectedValue(new BladKonta(401, 'Wymagana sesja właściciela.'))
    render(<PanelAktualizacjiRaspberry />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Brak sesji')
    expect(screen.getByRole('button', { name: 'Sprawdź aktualizacje' })).toBeDisabled()
  })

  it('odświeża stan podczas update i toleruje chwilowy restart backendu', async () => {
    pobierzStatus.mockReset().mockResolvedValueOnce(dostepnyStatus).mockResolvedValueOnce({ ...dostepnyStatus, stan: 'restarting' as const, dostepnosc: 'nieznana' as const }).mockRejectedValueOnce(new Error('restart')).mockResolvedValue({ ...dostepnyStatus, stan: 'success' as const, dostepnosc: 'aktualna' as const, komunikat: 'Aktualizacja zakończona.' })
    render(<PanelAktualizacjiRaspberry />)
    await screen.findByText('Raspberry / serwer')
    fireEvent.click(screen.getByRole('button', { name: 'Zainstaluj aktualizację' }))
    await waitFor(() => expect(screen.getAllByText('restart')).not.toHaveLength(0))
    await waitFor(() => expect(screen.getAllByText('sukces')).not.toHaveLength(0), { timeout: 7_000 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const liczbaOdczytow = pobierzStatus.mock.calls.length
    await new Promise((rozwiaz) => setTimeout(rozwiaz, 3_200))
    expect(pobierzStatus).toHaveBeenCalledTimes(liczbaOdczytow)
  }, 13_000)

  it('po utracie odpowiedzi start nadal śledzi backend i blokuje drugą akcję', async () => {
    uruchomAktualizacje.mockRejectedValueOnce(new Error('restart'))
    pobierzStatus.mockReset().mockResolvedValueOnce(dostepnyStatus).mockResolvedValueOnce({ ...dostepnyStatus, stan: 'restarting' as const }).mockResolvedValue({ ...dostepnyStatus, stan: 'success' as const, komunikat: 'Aktualizacja zakończona.' })
    render(<PanelAktualizacjiRaspberry />)
    await screen.findByText('Raspberry / serwer')
    fireEvent.click(screen.getByRole('button', { name: 'Zainstaluj aktualizację' }))
    await waitFor(() => expect(uruchomAktualizacje).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Sprawdź aktualizacje' })).toBeDisabled()
    await waitFor(() => expect(screen.getAllByText('sukces')).not.toHaveLength(0), { timeout: 7_000 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  }, 9_000)

  it('pokazuje rollback wyłącznie, gdy backend potwierdza podstawę do rollbacku', async () => {
    pobierzStatus.mockReset().mockResolvedValue({ ...dostepnyStatus, stan: 'error' as const, komunikat: 'Build nie przeszedł.', moznaPrzywrocic: true })
    render(<PanelAktualizacjiRaspberry />)
    expect(await screen.findByRole('button', { name: 'Przywróć poprzednią wersję' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Przywróć poprzednią wersję' }))
    await waitFor(() => expect(uruchomAktualizacje).toHaveBeenCalledWith('rollback'))
  })
})
