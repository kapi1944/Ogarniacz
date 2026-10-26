import { cleanup as wyczysc, fireEvent as wywolajZdarzenie, render as renderuj, screen as ekran, waitFor as czekajNa } from '@testing-library/react'
import { MemoryRouter as RouterPamieci } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import { WidokUstawien } from './WidokUstawien'
import { platforma } from '../../platform/platforma'

const { szyfruj, przygotuj, przywroc, zapiszPlik, zapiszZWynikiem, plikTymczasowy, udostepnijPlik, zapisWBazie, zapiszUstawienia } = vi.hoisted(() => ({ szyfruj: vi.fn(), przygotuj: vi.fn(), przywroc: vi.fn(), zapiszPlik: vi.fn(), zapiszZWynikiem: vi.fn(), plikTymczasowy: vi.fn(), udostepnijPlik: vi.fn(), zapisWBazie: vi.fn(), zapiszUstawienia: vi.fn() }))

vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ ustawienia: DOMYSLNE_USTAWIENIA, zapiszUstawienia }) }))
vi.mock('../../hooks/useRepozytorium', () => ({ useRepozytorium: () => ({ dane: [], repozytorium: {} }) }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: (_zapytanie: unknown, _zaleznosci: unknown, domyslne: unknown) => domyslne }))
vi.mock('./PanelUstawienAplikacji', () => ({ PanelUstawienAplikacji: () => null }))
vi.mock('./SekcjaPolaczeniaIAktualizacji', () => ({ SekcjaPolaczeniaIAktualizacji: () => null }))
vi.mock('../../services/DaneDemonstracyjneService', () => ({ czyMoznaWczytacDemo: () => false }))
vi.mock('../../platform/platforma', () => ({ platforma: { rodzaj: 'web', natywna: false, haptyka: { ostrzezenie: async () => undefined }, powiadomienia: { sprawdzStan: async () => ({}) }, udostepnianie: { dostepne: () => true, udostepnijPlikJson: udostepnijPlik }, pliki: { zapisz: zapiszPlik, zapiszZWynikiem, zapiszTymczasowo: plikTymczasowy } } }))
vi.mock('../../services/BackupService', async (importujOryginal) => {
  const oryginal = await importujOryginal<typeof import('../../services/BackupService')>()
  return { ...oryginal, utworzBackup: vi.fn(async () => kopiaTestowa), szyfrujBackup: szyfruj, przygotujBackupDoPrzywracania: przygotuj, przywrocBackup: przywroc }
})

const kopiaTestowa = {
  manifest: { formatVersion: 3, createdAt: '2026-10-11T10:00:00Z', appVersion: '1.0.0', dexieSchemaVersion: 17, installationId: 'test', backupType: 'export', sections: ['notatki'], recordCounts: { notatki: 0 }, schemaVersions: { notatki: 1 }, checksum: 'sha256:test' },
  payload: { notatki: { notatki: [] } },
}
const kopertaTestowa = { naglowek: { format: 'ogarniacz-backup-szyfrowany', wersja: 1 }, szyfrogram: 'test' }
const kopiaOchronna = { ...kopiaTestowa, manifest: { ...kopiaTestowa.manifest, backupType: 'before-restore' } }

beforeEach(() => {
  vi.clearAllMocks()
  platforma.natywna = false
  szyfruj.mockResolvedValue(kopertaTestowa)
  przygotuj.mockResolvedValue(kopiaTestowa)
  zapiszPlik.mockResolvedValue(true)
  zapiszZWynikiem.mockImplementation(async (...argumenty) => {
    const zapisano = await zapiszPlik(...argumenty)
    return { status: zapisano ? (platforma.natywna ? 'zapisano' : 'pobieranie') : 'blad', uri: 'content://test/kopia.json' }
  })
  plikTymczasowy.mockResolvedValue('file:///cache/eksport/test/kopia.json')
  udostepnijPlik.mockResolvedValue('niepotwierdzone')
  przywroc.mockImplementation(async (_backup, _sekcje, opcje) => {
    await opcje.poUtworzeniuKopii(kopiaOchronna)
    zapisWBazie()
    return { backupPrzedPrzywracaniem: kopiaOchronna, liczbaRekordow: 0 }
  })
  renderuj(<RouterPamieci initialEntries={['/ustawienia?kategoria=dane']}><WidokUstawien /></RouterPamieci>)
})
afterEach(wyczysc)

async function utworzZaszyfrowanaKopie() {
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Utwórz zaszyfrowany backup' }))
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: /^Zaszyfruj$/ }))
  await czekajNa(() => expect(ekran.queryByRole('dialog')).not.toBeInTheDocument())
}

it.each([
  ['zapisano', 'ZAPISANO:'],
  ['anulowano', 'ANULOWANO:'],
  ['blad', 'BŁĄD:'],
])('pokazuje rzeczywisty wynik zapisu Android: %s', async (status, komunikat) => {
  platforma.natywna = true
  await utworzZaszyfrowanaKopie()
  zapiszZWynikiem.mockResolvedValue({ status, uri: 'content://test/kopia.json' })
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Zapisz plik JSON' }))
  await ekran.findByText(new RegExp(`^${komunikat}`))
  expect(zapisWBazie).not.toHaveBeenCalled()
})

it.each([
  ['niepotwierdzone', 'Brak potwierdzenia udostępnienia.'],
  ['przekazano', 'Wybrano aplikację dla pliku JSON. Zapis nie jest potwierdzony'],
  ['anulowano', 'ANULOWANO:'],
  ['blad', 'BŁĄD:'],
])('nie ogłasza zapisu backupu przez samo udostępnienie: %s', async (wynik, komunikat) => {
  platforma.natywna = true
  await utworzZaszyfrowanaKopie()
  udostepnijPlik.mockResolvedValue(wynik)
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Udostępnij backup' }))
  await ekran.findByText(new RegExp(`^${komunikat}`))
  expect(ekran.queryByText(/^ZAPISANO:/)).not.toBeInTheDocument()
  expect(udostepnijPlik).toHaveBeenCalledWith('file:///cache/eksport/test/kopia.json')
  expect(zapisWBazie).not.toHaveBeenCalled()
})

it('po błędzie przygotowania pliku nie uruchamia udostępniania', async () => {
  platforma.natywna = true
  await utworzZaszyfrowanaKopie()
  plikTymczasowy.mockResolvedValue(undefined)
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Udostępnij backup' }))
  await ekran.findByText(/^BŁĄD: Nie udało się przygotować/)
  expect(udostepnijPlik).not.toHaveBeenCalled()
})

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
  expect(ekran.getByLabelText('Hasło kopii zapasowej')).not.toHaveFocus()
  expect(ekran.getByLabelText('Hasło kopii zapasowej')).not.toHaveAttribute('autofocus')
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
  expect(JSON.stringify({ ...sessionStorage })).not.toContain('Wyłącznie testowe hasło')
  expect(zapiszUstawienia).not.toHaveBeenCalled()
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

it('czeka na zapis szyfrowanej kopii before-restore i potwierdzenie pobrania w PWA', async () => {
  await wybierzKoperte()
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Odszyfruj i sprawdź' }))
  wywolajZdarzenie.click(await ekran.findByRole('button', { name: 'Przywróć wybrane sekcje' }))
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Zapisz kopię ochronną i przywróć' }))
  const potwierdzenie = await ekran.findByRole('button', { name: 'Mam zapisaną kopię — przywróć' })
  expect(zapiszPlik).toHaveBeenCalledOnce()
  expect(zapisWBazie).not.toHaveBeenCalled()
  expect(szyfruj).toHaveBeenCalledWith(kopiaOchronna, 'Wyłącznie testowe hasło')
  wywolajZdarzenie.click(potwierdzenie)
  await czekajNa(() => expect(zapisWBazie).toHaveBeenCalledOnce())
  expect(zapiszUstawienia).not.toHaveBeenCalled()
})

it('pokazuje oba hasła dopiero po wybraniu opcji i sprawdza ich zgodność', async () => {
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Utwórz zaszyfrowany backup' }))
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByLabelText('Pokaż hasło'))
  expect(ekran.getByLabelText('Hasło kopii zapasowej')).toHaveAttribute('type', 'text')
  expect(ekran.getByLabelText('Powtórz hasło')).toHaveAttribute('type', 'text')
  wywolajZdarzenie.change(ekran.getByLabelText('Powtórz hasło'), { target: { value: 'inne' } })
  wywolajZdarzenie.click(ekran.getByRole('button', { name: /^Zaszyfruj$/ }))
  await ekran.findByText('Hasła muszą być identyczne.')
  expect(szyfruj).not.toHaveBeenCalled()
  expect(ekran.getByLabelText('Hasło kopii zapasowej')).toHaveValue('')
})

it('anulowanie importu usuwa formularz i nie uruchamia walidacji ani restore', async () => {
  await wybierzKoperte()
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Anuluj' }))
  expect(ekran.queryByRole('dialog')).not.toBeInTheDocument()
  expect(przygotuj).not.toHaveBeenCalled()
  expect(przywroc).not.toHaveBeenCalled()
})

it.each([1, 2, 3])('rozpoznaje historyczny plik v%i bez pytania o hasło i informuje o braku zabezpieczenia', async (wersja) => {
  const historyczna = { ...kopiaTestowa, manifest: { ...kopiaTestowa.manifest, formatVersion: wersja } }
  const plik = new File([], 'historyczna.json', { type: 'application/json' })
  Object.defineProperty(plik, 'text', { value: async () => JSON.stringify(historyczna) })
  wywolajZdarzenie.change(ekran.getByLabelText('Wybierz backup do restore'), { target: { files: [plik] } })
  await ekran.findByText('Plik historyczny bez zabezpieczenia hasłem — integralność zweryfikowana.')
  expect(przygotuj).toHaveBeenCalledWith(JSON.stringify(historyczna))
  expect(ekran.queryByRole('dialog')).not.toBeInTheDocument()
  expect(przywroc).not.toHaveBeenCalled()
})

async function rozpocznijPrzywracanie() {
  await wybierzKoperte()
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Odszyfruj i sprawdź' }))
  wywolajZdarzenie.click(await ekran.findByRole('button', { name: 'Przywróć wybrane sekcje' }))
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Zapisz kopię ochronną i przywróć' }))
}

it.each(['szyfrowanie', 'zapis'])('blokuje modyfikacje bazy po błędzie kopii ochronnej: %s', async (etap) => {
  if (etap === 'szyfrowanie') szyfruj.mockRejectedValue(new Error('Błąd szyfrowania kopii ochronnej'))
  if (etap === 'zapis') zapiszPlik.mockResolvedValue(false)
  await rozpocznijPrzywracanie()
  await czekajNa(() => expect(ekran.getAllByText(etap === 'szyfrowanie' ? 'Błąd szyfrowania kopii ochronnej' : 'BŁĄD: Nie udało się zapisać szyfrowanej kopii ochronnej. Przywracanie nie zostało rozpoczęte.').length).toBeGreaterThan(0))
  expect(zapisWBazie).not.toHaveBeenCalled()
  if (etap === 'szyfrowanie') expect(zapiszPlik).not.toHaveBeenCalled()
})

it('anulowanie po pobraniu kopii ochronnej nie zmienia bazy', async () => {
  await rozpocznijPrzywracanie()
  await ekran.findByRole('button', { name: 'Mam zapisaną kopię — przywróć' })
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Anuluj' }))
  await ekran.findByText('Przywracanie anulowano przed zmianą danych.')
  expect(zapisWBazie).not.toHaveBeenCalled()
})

it('zamknięcie panelu podczas oczekiwania na kopię ochronną blokuje restore', async () => {
  await rozpocznijPrzywracanie()
  await ekran.findByRole('button', { name: 'Mam zapisaną kopię — przywróć' })
  wyczysc()
  await czekajNa(() => expect(przywroc.mock.results[0].value).rejects.toThrow('Przywracanie anulowano'))
  expect(zapisWBazie).not.toHaveBeenCalled()
})

it('na Androidzie czeka na wynik zapisu pliku przed restore', async () => {
  platforma.natywna = true
  let zakonczZapis!: (zapisano: boolean) => void
  zapiszPlik.mockImplementationOnce(() => new Promise<boolean>((rozwiaz) => { zakonczZapis = rozwiaz }))
  await rozpocznijPrzywracanie()
  await czekajNa(() => expect(zapiszPlik).toHaveBeenCalledOnce())
  expect(zapisWBazie).not.toHaveBeenCalled()
  zakonczZapis(true)
  await czekajNa(() => expect(zapisWBazie).toHaveBeenCalledOnce())
  expect(ekran.queryByRole('button', { name: 'Mam zapisaną kopię — przywróć' })).not.toBeInTheDocument()
})

it('anulowanie systemowego zapisu kopii ochronnej blokuje restore na Androidzie', async () => {
  platforma.natywna = true
  zapiszZWynikiem.mockResolvedValue({ status: 'anulowano' })
  await rozpocznijPrzywracanie()
  await czekajNa(() => expect(ekran.getAllByText('ANULOWANO: Zapis kopii ochronnej anulowany. Przywracanie nie zostało rozpoczęte.').length).toBeGreaterThan(0))
  expect(zapisWBazie).not.toHaveBeenCalled()
})

it('przekazuje tylko zaznaczone sekcje i blokuje pusty wybór', async () => {
  przygotuj.mockResolvedValue({ ...kopiaTestowa, manifest: { ...kopiaTestowa.manifest, sections: ['notatki', 'zdrowie'], recordCounts: { notatki: 0, zdrowie: 0 } } })
  await wybierzKoperte()
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Odszyfruj i sprawdź' }))
  await ekran.findByRole('button', { name: 'Przywróć wybrane sekcje' })
  wywolajZdarzenie.click(ekran.getByLabelText('Pozostałe dane zdrowotne (0)'))
  wywolajZdarzenie.click(ekran.getByLabelText('Notatki (0)'))
  expect(ekran.getByRole('button', { name: 'Przywróć wybrane sekcje' })).toBeDisabled()
  wywolajZdarzenie.click(ekran.getByLabelText('Notatki (0)'))
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Przywróć wybrane sekcje' }))
  wpiszHaslo()
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Zapisz kopię ochronną i przywróć' }))
  await ekran.findByRole('button', { name: 'Mam zapisaną kopię — przywróć' })
  expect(przywroc.mock.calls[0][1]).toEqual(['notatki'])
  wywolajZdarzenie.click(ekran.getByRole('button', { name: 'Anuluj' }))
  await ekran.findByText('Przywracanie anulowano przed zmianą danych.')
})
