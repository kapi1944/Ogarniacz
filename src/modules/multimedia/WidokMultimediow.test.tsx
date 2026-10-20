// @ts-expect-error Odczyt rzeczywistego katalogu odbywa się wyłącznie w środowisku testowym Node.
import { readFileSync } from 'node:fs'
// @ts-expect-error Ścieżki Node są używane wyłącznie w testach.
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WidokMultimediow } from './WidokMultimediow'
import { parsujKatalog } from './bibliotekaMultimediow'

const { pobierzKatalog, pobierzOryginal, zapisz } = vi.hoisted(() => ({ pobierzKatalog: vi.fn(), pobierzOryginal: vi.fn(), zapisz: vi.fn() }))
vi.mock('./bibliotekaMultimediow', async (oryginal) => ({ ...await oryginal<typeof import('./bibliotekaMultimediow')>(), pobierzKatalog, pobierzOryginal }))
vi.mock('../../platform/platforma', () => ({ platforma: { pliki: { zapiszZWynikiem: zapisz } } }))
const katalog = parsujKatalog(JSON.parse(readFileSync(resolve('multimedia/katalog.json'), 'utf8')))
const odpowiedz = { katalog, zapisanoAt: '2026-10-21T12:00:00.000Z', zapamietano: true }

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear()
  pobierzKatalog.mockResolvedValue(odpowiedz)
  pobierzOryginal.mockResolvedValue(new Blob(['test'], { type: 'image/png' }))
  zapisz.mockResolvedValue({ status: 'pobieranie' })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('ładuje listę, nie pobiera dużych miniatur i łączy filtry', async () => {
  const { container } = render(<WidokMultimediow />)
  await screen.findByText('Materiały: 8 z 8. Duże miniatury wczytasz na żądanie.')
  expect(container.querySelectorAll('img')).toHaveLength(2)
  expect(pobierzOryginal).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('combobox', { name: 'Status materiału' }), { target: { value: 'ARCHIWALNE' } })
  expect(screen.getByText('Materiały: 2 z 8. Duże miniatury wczytasz na żądanie.')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kafel' } })
  expect(screen.getByText('Materiały: 1 z 8. Duże miniatury wczytasz na żądanie.')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Kategoria' }), { target: { value: 'Arkusze identyfikacji' } })
  expect(screen.getByText('Brak pasujących materiałów')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Wyczyść filtry'))
  expect(screen.getAllByRole('button', { name: /Podgląd i szczegóły:/ })).toHaveLength(8)
})

it('pokazuje zachowany katalog po awarii sieci i umożliwia skuteczne ponowienie', async () => {
  localStorage.setItem('ogarniacz.multimedia.katalog.v1', JSON.stringify(odpowiedz))
  pobierzKatalog.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  render(<WidokMultimediow />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się pobrać aktualnego katalogu')
  expect(screen.getByText(/Ostatni poprawny katalog z pamięci/)).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /Podgląd i szczegóły:/ })).toHaveLength(8)
  fireEvent.click(screen.getByRole('button', { name: 'Ponów pobieranie' }))
  await screen.findByText(/Katalog pobrany z GitHub/)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('rozróżnia pusty katalog od braku połączenia bez zapamiętanej listy', async () => {
  pobierzKatalog.mockResolvedValueOnce({ ...odpowiedz, katalog: { ...katalog, materialy: [] } })
  const widok = render(<WidokMultimediow />)
  await screen.findByText('Katalog jest pusty')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  widok.unmount()
  pobierzKatalog.mockRejectedValueOnce(new Error('Brak sieci'))
  render(<WidokMultimediow />)
  await screen.findByRole('alert')
  expect(screen.queryByText('Katalog jest pusty')).not.toBeInTheDocument()
})

it('otwiera podgląd, kopiuje adres i przekazuje oryginalną nazwę do zapisu', async () => {
  const schowek = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: schowek } })
  render(<WidokMultimediow />)
  const otworz = (await screen.findAllByRole('button', { name: /Podgląd i szczegóły:/ }))[0]
  otworz.focus()
  fireEvent.click(otworz)
  const podglad = within(screen.getByRole('dialog'))
  expect(podglad.getByText(katalog.materialy[0].sha256)).toBeInTheDocument()
  fireEvent.click(podglad.getByRole('button', { name: 'Kopiuj odnośnik' }))
  await podglad.findByText('Skopiowano odnośnik do oryginalnego pliku.')
  expect(schowek).toHaveBeenCalledWith(expect.stringContaining('raw.githubusercontent.com'))
  fireEvent.click(podglad.getByRole('button', { name: 'Pobierz oryginał' }))
  await podglad.findByText(/Rozpoczęto pobieranie oryginału/)
  expect(zapisz).toHaveBeenCalledWith(katalog.materialy[0].sciezka.split('/').at(-1), expect.any(Blob))
  fireEvent.keyDown(podglad.getByRole('button', { name: 'Zamknij' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(otworz).toHaveFocus()
})

it('blokuje podwójne pobranie, rozróżnia anulowanie i pokazuje błąd integralności', async () => {
  let zakoncz!: (wynik: { status: 'anulowano' }) => void
  zapisz.mockImplementationOnce(() => new Promise((rozwiaz) => { zakoncz = rozwiaz }))
  render(<WidokMultimediow />)
  const przycisk = (await screen.findAllByRole('button', { name: 'Pobierz oryginał' }))[0]
  fireEvent.click(przycisk)
  expect(przycisk).toBeDisabled()
  await vi.waitFor(() => expect(zapisz).toHaveBeenCalledOnce())
  await act(async () => zakoncz({ status: 'anulowano' }))
  expect(screen.getByText('Anulowano zapis pliku.')).toBeInTheDocument()
  expect(przycisk).not.toBeDisabled()
  pobierzOryginal.mockRejectedValueOnce(new Error('Plik nie zgadza się z katalogiem.'))
  fireEvent.click(przycisk)
  expect(await screen.findByRole('alert')).toHaveTextContent('Plik nie zgadza się z katalogiem.')
  expect(zapisz).toHaveBeenCalledOnce()
})

it('dla nowego formatu bez podglądu pokazuje ikonę i pozostawia pobieranie', async () => {
  pobierzKatalog.mockResolvedValueOnce({ ...odpowiedz, katalog: { ...katalog, materialy: [{ ...katalog.materialy[0], mime: 'application/pdf', sciezka: 'multimedia/ulotka.pdf', sciezkaMiniatury: undefined }] } })
  render(<WidokMultimediow />)
  expect(await screen.findByText('Brak podglądu tego formatu')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pobierz oryginał' })).toBeEnabled()
})
