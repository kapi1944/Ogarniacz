import { cleanup as wyczysc, fireEvent as wywolajZdarzenie, render as renderuj, screen as ekran, waitFor as czekajNa } from '@testing-library/react'
import { MemoryRouter as RouterPamieci } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import { WidokUstawien } from './WidokUstawien'

const { szyfruj, przygotuj, przywroc, zapiszPlik } = vi.hoisted(() => ({ szyfruj: vi.fn(), przygotuj: vi.fn(), przywroc: vi.fn(), zapiszPlik: vi.fn() }))

vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ ustawienia: DOMYSLNE_USTAWIENIA, zapiszUstawienia: vi.fn() }) }))
vi.mock('../../app/DostawcaKonta', () => ({ useKonto: () => ({ konto: undefined }) }))
vi.mock('../../hooks/useRepozytorium', () => ({ useRepozytorium: () => ({ dane: [], repozytorium: {} }) }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: (_zapytanie: unknown, _zaleznosci: unknown, domyslne: unknown) => domyslne }))
vi.mock('./PanelUstawienAplikacji', () => ({ PanelUstawienAplikacji: () => null }))
vi.mock('./SekcjaPolaczeniaIAktualizacji', () => ({ SekcjaPolaczeniaIAktualizacji: () => null }))
vi.mock('../../services/DaneDemonstracyjneService', () => ({ czyMoznaWczytacDemo: () => false }))
vi.mock('../../platform/platforma', () => ({ platforma: { rodzaj: 'web', natywna: false, haptyka: { ostrzezenie: async () => undefined }, powiadomienia: { sprawdzStan: async () => ({}) }, pliki: { zapisz: zapiszPlik } } }))
vi.mock('../../services/BackupService', async (importujOryginal) => {
  const oryginal = await importujOryginal<typeof import('../../services/BackupService')>()
  return { ...oryginal, utworzBackup: vi.fn(async () => kopiaTestowa), szyfrujBackup: szyfruj, przygotujBackupDoPrzywracania: przygotuj, przywrocBackup: przywroc }
})

const kopiaTestowa = {
  manifest: { formatVersion: 3, createdAt: '2026-10-11T10:00:00Z', appVersion: '1.0.0', dexieSchemaVersion: 17, installationId: 'test', backupType: 'export', sections: ['notatki'], recordCounts: { notatki: 0 }, schemaVersions: { notatki: 1 }, checksum: 'sha256:test' },
  payload: { notatki: { notatki: [] } },
}
const kopertaTestowa = { naglowek: { format: 'ogarniacz-backup-szyfrowany', wersja: 1 }, szyfrogram: 'test' }

beforeEach(() => {
  vi.clearAllMocks()
  szyfruj.mockResolvedValue(kopertaTestowa)
  przygotuj.mockResolvedValue(kopiaTestowa)
  zapiszPlik.mockResolvedValue(true)
  renderuj(<RouterPamieci><WidokUstawien /></RouterPamieci>)
})
afterEach(wyczysc)

function wpiszHaslo(haslo = 'Wyłącznie testowe hasło') {
  wywolajZdarzenie.change(ekran.getByLabelText('Hasło kopii zapasowej'), { target: { value: haslo } })
  const powtorzenie = ekran.queryByLabelText('Powtórz hasło')
  if (powtorzenie) wywolajZdarzenie.change(powtorzenie, { target: { value: haslo } })
}

async function wybierzKoperte() {
  const plik = new File([], 'test.json', { type: 'application/json' })
  Object.defineProperty(plik, 'text', { value: async () => JSON.stringify(kopertaTestowa) })
  wywolajZdarzenie.change(ekran.getByLabelText('Wybierz backup do restore'), { target: { files: [plik] } })
  await ekran.findByRole('dialog')
}

it('pobiera wyłącznie zaszyfrowany plik, bez zapisywania hasła w ustawieniach', async () => {
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Utwórz zaszyfrowany backup' }))
  expect(ekran.getByLabelText('Hasło kopii zapasowej')).toHaveAttribute('type', 'password')
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: /^Zaszyfruj$/ }))
  await czekajNa(() => expect(ekran.queryByRole('dialog')).not.toBeInTheDocument())
  expect(szyfruj).toHaveBeenCalledWith(kopiaTestowa, 'Wyłącznie testowe hasło')
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Pobierz plik JSON' }))
  await czekajNa(() => expect(zapiszPlik).toHaveBeenCalledOnce())
  const plik = zapiszPlik.mock.calls[0][1] as Blob
  const tresc = await new Promise<string>((rozwiaz) => { const czytnik = new FileReader(); czytnik.onload = () => rozwiaz(String(czytnik.result)); czytnik.readAsText(plik) })
  expect(JSON.parse(tresc)).toEqual(kopertaTestowa)
  expect(JSON.stringify({ ...localStorage })).not.toContain('Wyłącznie testowe hasło')
})

it('po błędzie kryptografii nie udostępnia jawnego eksportu', async () => {
  szyfruj.mockRejectedValue(new Error('Bezpieczna kryptografia niedostępna'))
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Utwórz zaszyfrowany backup' }))
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: /^Zaszyfruj$/ }))
  await ekran.findByText('Bezpieczna kryptografia niedostępna')
  expect(ekran.getByLabelText('Hasło kopii zapasowej')).toHaveValue('')
  expect(ekran.queryByRole('button', { name: 'Pobierz plik JSON' })).not.toBeInTheDocument()
  expect(zapiszPlik).not.toHaveBeenCalled()
})

it('pyta o hasło przed importem, pozwala ponowić błąd i pokazuje restore dopiero po walidacji', async () => {
  przygotuj.mockRejectedValueOnce(new Error('Błędne hasło lub uszkodzony plik'))
  await wybierzKoperte()
  expect(przygotuj).not.toHaveBeenCalled()
  wpiszHaslo('błędne hasło')
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Odszyfruj i sprawdź' }))
  await ekran.findByText('Błędne hasło lub uszkodzony plik')
  expect(ekran.queryByRole('button', { name: 'Przywróć wybrane sekcje' })).not.toBeInTheDocument()
  expect(przywroc).not.toHaveBeenCalled()
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Odszyfruj i sprawdź' }))
  await ekran.findByRole('button', { name: 'Przywróć wybrane sekcje' })
  expect(przywroc).not.toHaveBeenCalled()
  expect(przygotuj).toHaveBeenLastCalledWith(JSON.stringify(kopertaTestowa), 'Wyłącznie testowe hasło')
})

it('szyfruje również pobieraną kopię before-restore', async () => {
  const kopiaOchronna = { ...kopiaTestowa, manifest: { ...kopiaTestowa.manifest, backupType: 'before-restore' } }
  przywroc.mockResolvedValue({ backupPrzedPrzywracaniem: kopiaOchronna, liczbaRekordow: 0 })
  await wybierzKoperte()
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Odszyfruj i sprawdź' }))
  wywolajZdarzenie.click(await ekran.findByRole('button', { name: 'Przywróć wybrane sekcje' }))
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Utwórz kopię i przywróć' }))
  wywolajZdarzenie.click(await ekran.findByRole('button', { name: 'Zaszyfruj i pobierz kopię' }))
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: /^Zaszyfruj$/ }))
  await czekajNa(() => expect(zapiszPlik).toHaveBeenCalledOnce())
  expect(szyfruj).toHaveBeenCalledWith(kopiaOchronna, 'Wyłącznie testowe hasło')
})
