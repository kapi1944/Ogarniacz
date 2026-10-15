import { cleanup as wyczysc, fireEvent as wywolaj, render as renderuj, screen as ekran, act as wykonaj } from '@testing-library/react'
import { MemoryRouter as RouterPamieci, Route as Trasa, Routes as Trasy } from 'react-router-dom'
import { afterEach as poKazdym, beforeEach as przedKazdym, describe as opisz, expect as oczekuj, it as sprawdz, vi } from 'vitest'
import { WidokPanelu } from './WidokPanelu'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { pobierzKonfiguracjeSynchronizacji } from '../../services/KonfiguracjaSynchronizacji'
import { UkladAplikacji } from '../../app/UkladAplikacji'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'

vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: vi.fn() }))
vi.mock('../../hooks/useRepozytorium', () => ({ useRepozytorium: vi.fn() }))
vi.mock('../../services/KonfiguracjaSynchronizacji', () => ({ pobierzKonfiguracjeSynchronizacji: vi.fn() }))
vi.mock('../../app/StanKlientaWeb', () => ({ StanKlientaWeb: () => null }))
vi.mock('../../app/PowiadomieniaSynchronizacji', () => ({ PowiadomieniaSynchronizacji: () => null }))

const kontekstTestowy: ReturnType<typeof useAplikacja> = {
  gotowyDostep: true, moze: () => true, ustawienia: DOMYSLNE_USTAWIENIA, zapisaneUstawienia: DOMYSLNE_USTAWIENIA,
  zapiszUstawienia: vi.fn(), ustawPodgladUstawien: vi.fn(), wyczyscPodgladUstawien: vi.fn(),
  otworzSzybkieDodawanie: vi.fn(), otworzSzybkieDodawanieZDanymi: vi.fn(), otworzWyszukiwanie: vi.fn(),
}

przedKazdym(() => {
  vi.mocked(useAplikacja).mockReturnValue(kontekstTestowy)
  vi.mocked(useRepozytorium).mockReturnValue({ dane: [], gotowe: true } as unknown as ReturnType<typeof useRepozytorium>)
  vi.mocked(pobierzKonfiguracjeSynchronizacji).mockReturnValue({})
})
poKazdym(() => { wyczysc(); vi.restoreAllMocks(); vi.useRealTimers() })

function pokazPanel() {
  return renderuj(<RouterPamieci initialEntries={['/panel']}><Trasy>
    <Trasa path="/panel" element={<WidokPanelu />} />
    <Trasa path="/" element={<p>Pulpit docelowy</p>} />
    <Trasa path="/echo" element={<p>Rozmowa Echo</p>} />
    <Trasa path="/zadania" element={<p>Lista zadań</p>} />
    <Trasa path="/planer" element={<p>Planer docelowy</p>} />
  </Trasy></RouterPamieci>)
}

opisz('panel domowy', () => {
  sprawdz('nie odczytuje modułów bez uprawnień ani przed ustaleniem dostępu', () => {
    vi.mocked(useAplikacja).mockReturnValue({ ...kontekstTestowy, moze: () => false })
    pokazPanel()
    oczekuj(vi.mocked(useRepozytorium).mock.calls.map(([nazwa]) => nazwa)).toEqual(['stanSynchronizacji'])
    oczekuj(ekran.queryByRole('link', { name: 'Otwórz Echo' })).not.toBeInTheDocument()
    oczekuj(ekran.queryByRole('link', { name: 'Otwórz zadania' })).not.toBeInTheDocument()
    oczekuj(ekran.queryByRole('link', { name: 'Otwórz planer' })).not.toBeInTheDocument()
  })

  sprawdz('czeka na ustalenie dostępu także dla właściciela', () => {
    vi.mocked(useAplikacja).mockReturnValue({ ...kontekstTestowy, gotowyDostep: false })
    pokazPanel()
    oczekuj(vi.mocked(useRepozytorium).mock.calls.every(([nazwa]) => nazwa === 'stanSynchronizacji')).toBe(true)
    oczekuj(ekran.queryByRole('link', { name: 'Otwórz Echo' })).not.toBeInTheDocument()
  })

  sprawdz('na trasie panelu pomija menu i globalne skróty dodawania oraz wyszukiwania', () => {
    const otworzDodawanie = vi.fn()
    const otworzWyszukiwanie = vi.fn()
    vi.mocked(useAplikacja).mockReturnValue({ moze: () => true, ustawienia: { nawigacja: { menuDomyslnieZwiniete: false } }, otworzSzybkieDodawanie: otworzDodawanie, otworzWyszukiwanie } as unknown as ReturnType<typeof useAplikacja>)
    renderuj(<RouterPamieci initialEntries={['/panel']}><UkladAplikacji><p>Zawartość panelu</p></UkladAplikacji></RouterPamieci>)
    oczekuj(ekran.getByRole('main')).toHaveTextContent('Zawartość panelu')
    oczekuj(ekran.queryByRole('navigation')).not.toBeInTheDocument()
    wywolaj.keyDown(window, { key: 'k', ctrlKey: true })
    wywolaj.keyDown(window, { key: 'Enter', ctrlKey: true })
    oczekuj(otworzDodawanie).not.toHaveBeenCalled()
    oczekuj(otworzWyszukiwanie).not.toHaveBeenCalled()
  })

  sprawdz.each([
    [undefined, 'Nie sprawdzono'], ['dostepne', 'Dostępny przy ostatnim sprawdzeniu'], ['niedostepne', 'Niedostępny przy ostatnim sprawdzeniu'],
  ])('pokazuje tylko znany stan serwera: %s', (polaczenie, opis) => {
    vi.mocked(pobierzKonfiguracjeSynchronizacji).mockReturnValue({ adresApi: 'https://test.invalid' })
    vi.mocked(useRepozytorium).mockImplementation(((nazwa: string) => ({ dane: nazwa === 'stanSynchronizacji' ? [{ id: 'glowny', stan: 'oczekuje', polaczenie, ostatniBlad: 'Sekretny szczegół błędu' }] : [] })) as typeof useRepozytorium)
    pokazPanel()
    oczekuj(ekran.getByRole('status')).toHaveTextContent(opis)
    oczekuj(ekran.getByRole('status')).not.toHaveTextContent('Sekretny szczegół błędu')
  })

  sprawdz('pokazuje podsumowanie bez tytułów zdrowotnych, treści zadań i danych kont', () => {
    const data = new Date().toLocaleDateString('sv-SE')
    vi.mocked(useRepozytorium).mockImplementation(((nazwa: string) => ({ dane: nazwa === 'zadania' ? [
      { id: '1', tytul: 'Prywatny tytuł', status: 'otwarte', termin: data, powiazania: [] },
      { id: '2', tytul: 'Terapia', sesjaTerapiiId: 'sekret', status: 'otwarte', termin: data, powiazania: [] },
      { id: '3', tytul: 'Lek', status: 'otwarte', termin: data, powiazania: [{ typ: 'leki', id: 'sekret' }] },
    ] : nazwa === 'blokiCzasu' ? [
      { tytul: 'Sekret wizyty', typ: 'wizyta', status: 'zaakceptowany', poczatek: data, koniec: data },
      { tytul: 'Praca prywatna', typ: 'praca', status: 'zaakceptowany', poczatek: data, koniec: data },
    ] : [], gotowe: true })) as typeof useRepozytorium)
    const { container: kontener } = pokazPanel()
    oczekuj(ekran.getByText(/zadań na dziś/)).toHaveTextContent('1 zadań na dziś')
    oczekuj(ekran.getByText(/bloków pracy/)).toHaveTextContent('1 bloków pracy')
    oczekuj(kontener).not.toHaveTextContent(/Prywatny tytuł|Terapia|Sekret wizyty|Praca prywatna/)
    oczekuj(kontener).toHaveTextContent('Zaloguj się online jako właściciel, aby sprawdzić Home Assistant.')
  })

  sprawdz.each([
    ['Otwórz Echo', 'Rozmowa Echo'], ['Otwórz zadania', 'Lista zadań'], ['Otwórz planer', 'Planer docelowy'], ['Wyjdź z panelu', 'Pulpit docelowy'],
  ])('przechodzi przez istniejący router: %s', (link, cel) => {
    pokazPanel()
    wywolaj.click(ekran.getByRole('link', { name: link }))
    oczekuj(ekran.getByText(cel)).toBeInTheDocument()
  })

  sprawdz('aktualizuje zegar i datę po północy', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 23, 59, 59))
    pokazPanel()
    oczekuj(ekran.getByText('23:59')).toBeInTheDocument()
    wykonaj(() => vi.advanceTimersByTime(1000))
    oczekuj(ekran.getByText('00:00')).toBeInTheDocument()
    oczekuj(ekran.getByText(/16 października 2026/)).toBeInTheDocument()
  })

  sprawdz('bez Fullscreen API zachowuje działający panel i wyjście', async () => {
    pokazPanel()
    wywolaj.click(ekran.getByRole('button', { name: 'Pełny ekran' }))
    oczekuj(await ekran.findByText(/Ta przeglądarka nie obsługuje/)).toBeInTheDocument()
    oczekuj(ekran.getByRole('link', { name: 'Wyjdź z panelu' })).toBeInTheDocument()
  })

  sprawdz('korzysta z Fullscreen API i aktualizuje przycisk po Escape', async () => {
    const pelnyEkran = vi.fn(async () => undefined)
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: pelnyEkran })
    const { container: kontener } = pokazPanel()
    wywolaj.click(ekran.getByRole('button', { name: 'Pełny ekran' }))
    oczekuj(pelnyEkran).toHaveBeenCalledOnce()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: kontener.querySelector('.panel-domowy') })
    wywolaj(document, new Event('fullscreenchange'))
    oczekuj(ekran.getByRole('button', { name: 'Wyłącz pełny ekran' })).toBeInTheDocument()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    wywolaj(document, new Event('fullscreenchange'))
    oczekuj(ekran.getByRole('button', { name: 'Pełny ekran' })).toBeInTheDocument()
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
  })
})
