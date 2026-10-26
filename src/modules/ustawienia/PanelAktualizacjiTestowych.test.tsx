import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PanelAktualizacjiTestowych } from './PanelAktualizacjiTestowych'
import { BladAktualizacjiTestowej } from '../../platform/AktualizacjeTestoweService'

const { sprawdzCommit, sprawdzBuild, pobierz, instaluj } = vi.hoisted(() => ({ sprawdzCommit: vi.fn(), sprawdzBuild: vi.fn(), pobierz: vi.fn(), instaluj: vi.fn() }))
vi.mock('../../platform/AktualizacjeTestoweService', async (importOryginalu) => ({
  ...await importOryginalu<typeof import('../../platform/AktualizacjeTestoweService')>(),
  aktualizacjeTestowe: { sprawdzCommit, sprawdzBuild },
}))
vi.mock('../../platform/platforma', () => ({ platforma: { natywna: false, aktualizacje: {
  pobierzInformacje: vi.fn().mockResolvedValue({ wersja: '1.0.23', kod: 1000023 }), pobierz, uruchomInstalator: instaluj,
} } }))

const sha = 'a'.repeat(40)
const commit = { sha, opis: 'Opis najnowszego commita.', data: '2026-10-26T10:00:00Z' }
const ci = { stan: 'sukces' }

beforeEach(() => {
  vi.clearAllMocks()
  sprawdzCommit.mockResolvedValue({ commit, ci })
  sprawdzBuild.mockResolvedValue({ commit, ci, dostepnyDlaMain: false })
})
afterEach(cleanup)

it('nie odpytuje GitHub przy otwarciu panelu i blokuje niewdrożone operacje', async () => {
  render(<PanelAktualizacjiTestowych />)
  await screen.findByText('1.0.23 (kod: 1000023)')
  expect(screen.getByRole('heading', { name: 'Aktualizacje testowe' })).toBeInTheDocument()
  expect(screen.getByText(__METADANE_BUILDU__.sha ?? 'Nieustalony w tym buildzie')).toBeInTheDocument()
  expect(sprawdzCommit).not.toHaveBeenCalled()
  expect(sprawdzBuild).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Pobierz wersję testową' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Uruchom / zainstaluj wersję testową' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Otwórz stabilną wersję' })).not.toBeInTheDocument()
})

it('oddziela sprawdzenie commita od sprawdzenia buildu i nigdy nie uruchamia instalatora', async () => {
  render(<PanelAktualizacjiTestowych />)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź najnowszy commit' }))
  await screen.findByText(sha)
  expect(sprawdzBuild).not.toHaveBeenCalled()
  expect(screen.getByText('Opis najnowszego commita.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  await screen.findByText('Nie ma opublikowanego, zweryfikowanego buildu testowego.')
  expect(pobierz).not.toHaveBeenCalled()
  expect(instaluj).not.toHaveBeenCalled()
})

it('pokazuje starszy SHA jawnie i nie proponuje go jako aktualizacji main', async () => {
  sprawdzBuild.mockResolvedValue({ commit, ci, dostepnyDlaMain: false, manifest: { sha: 'b'.repeat(40), wersja: '1.1.0-beta.42', numerBuildu: 42, data: commit.data, opis: 'Starsza zmiana.', artefakty: [] } })
  render(<PanelAktualizacjiTestowych />)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  await screen.findByText(/Najnowszy main nie ma gotowego buildu/)
  expect(screen.getByText('b'.repeat(40))).toBeInTheDocument()
  expect(screen.getByText('Niedostępny')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pobierz wersję testową' })).toBeDisabled()
})

it('potwierdza Web i Raspberry bez APK oraz pokazuje brak artefaktu Android', async () => {
  sprawdzBuild.mockResolvedValue({ commit, ci, dostepnyDlaMain: true, manifest: {
    sha, wersja: '1.1.0-beta.42', numerBuildu: 42, data: commit.data, opis: 'Build Etapu B.',
    artefakty: [{ platforma: 'web' }, { platforma: 'raspberry' }],
  } })
  render(<PanelAktualizacjiTestowych />)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  await screen.findByText(/Potwierdzono manifest i pomyślny build/)
  expect(screen.getByText('web, raspberry')).toBeInTheDocument()
  expect(screen.getByText('Potwierdzony')).toBeInTheDocument()
  expect(screen.getByText(/Brak artefaktu Android Beta w tym buildzie/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pobierz wersję testową' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Uruchom / zainstaluj wersję testową' })).toBeDisabled()
  expect(pobierz).not.toHaveBeenCalled()
  expect(instaluj).not.toHaveBeenCalled()
})

it('informuje o blokadzie po nieudanym CI nawet przy zgodnym SHA manifestu', async () => {
  sprawdzBuild.mockResolvedValue({ commit, ci: { stan: 'blad' }, dostepnyDlaMain: false, manifest: { sha, wersja: '1.1.0-beta.42', numerBuildu: 42, data: commit.data, artefakty: [] } })
  render(<PanelAktualizacjiTestowych />)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  await screen.findByText(/CI najnowszego main nie zakończyło się sukcesem/)
  expect(screen.getByRole('button', { name: 'Uruchom / zainstaluj wersję testową' })).toBeDisabled()
})

it('nie przypisuje zmian aktualnego main do starszego buildu bez opisu', async () => {
  sprawdzBuild.mockResolvedValue({ commit, ci, dostepnyDlaMain: false, manifest: { sha: 'b'.repeat(40), wersja: '1.1.0-beta.42', numerBuildu: 42, data: commit.data, opis: '', artefakty: [] } })
  render(<PanelAktualizacjiTestowych />)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  await screen.findByText(/Najnowszy main nie ma gotowego buildu/)
  expect(screen.queryByText(commit.opis)).not.toBeInTheDocument()
})

it('obsługuje błąd GitHub, usuwa stare wyniki i pozwala ponowić sprawdzenie', async () => {
  sprawdzBuild.mockRejectedValueOnce(new BladAktualizacjiTestowej('GitHub zwrócił HTTP 503.'))
  render(<PanelAktualizacjiTestowych />)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź najnowszy commit' }))
  await screen.findByText(sha)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert')).toHaveTextContent('GitHub zwrócił HTTP 503.')
  expect(screen.queryByText(sha)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  await screen.findByText('Nie ma opublikowanego, zweryfikowanego buildu testowego.')
})

it('blokuje równoległe kliknięcia, anuluje sprawdzanie i nie pokazuje późnego sukcesu', async () => {
  sprawdzBuild.mockImplementation((sygnal: AbortSignal) => new Promise((_wynik, odrzuc) => {
    sygnal.addEventListener('abort', () => odrzuc(new BladAktualizacjiTestowej('Anulowano sprawdzanie GitHub.')))
  }))
  render(<PanelAktualizacjiTestowych />)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  expect(screen.getByRole('button', { name: 'Sprawdź najnowszy commit' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' }))
  expect(sprawdzBuild).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Anuluj sprawdzanie' }))
  await screen.findByText('Anulowano sprawdzanie GitHub.')
  expect(screen.getByRole('button', { name: 'Sprawdź build testowy' })).toBeEnabled()
  expect(pobierz).not.toHaveBeenCalled()
})

it('przerywa odczyt po zamknięciu panelu', async () => {
  let sygnalOperacji: AbortSignal | undefined
  sprawdzBuild.mockImplementation((sygnal: AbortSignal) => { sygnalOperacji = sygnal; return new Promise(() => {}) })
  const { unmount } = render(<PanelAktualizacjiTestowych />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sprawdź build testowy' })))
  unmount()
  await waitFor(() => expect(sygnalOperacji?.aborted).toBe(true))
})
