import { cleanup as wyczysc, fireEvent as wywolaj, render as renderuj, screen as ekran, act as wykonaj } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter as RouterPamieci, RouterProvider } from 'react-router-dom'
import { afterEach as poKazdym, beforeEach as przedKazdym, describe as opisz, expect as oczekuj, it as sprawdz, vi } from 'vitest'
import { WidokPanelu } from './WidokPanelu'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { pobierzKonfiguracjeSynchronizacji } from '../../services/KonfiguracjaSynchronizacji'
import { UkladAplikacji } from '../../app/UkladAplikacji'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import { domyslnyKokpit } from '../../domain/kokpit'
import * as kontekstKonta from '../../app/DostawcaKonta'
import * as serwisKonta from '../../services/KontaService'

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
  const router = createMemoryRouter([
    { path: '/panel', element: <WidokPanelu /> }, { path: '/', element: <p>Pulpit docelowy</p> },
    { path: '/echo', element: <p>Rozmowa Echo</p> }, { path: '/zadania', element: <p>Lista zadań</p> },
    { path: '/planer', element: <p>Planer docelowy</p> },
  ], { initialEntries: ['/', '/panel'] })
  return { ...renderuj(<RouterProvider router={router} />), router }
}

opisz('ekran kokpitu', () => {
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
    wywolaj.click(ekran.getByRole('button', { name: 'Następna plansza' }))
    oczekuj(ekran.getByText(/zadań na dziś/)).toHaveTextContent('1 zadań na dziś')
    oczekuj(ekran.getByText(/bloków pracy/)).toHaveTextContent('1 bloków pracy')
    oczekuj(kontener).not.toHaveTextContent(/Prywatny tytuł|Terapia|Sekret wizyty|Praca prywatna/)
    oczekuj(kontener).toHaveTextContent('Zaloguj się online jako właściciel, aby sprawdzić Home Assistant.')
  })

  sprawdz.each([
    ['Otwórz Echo', 'Rozmowa Echo'], ['Otwórz zadania', 'Lista zadań'], ['Otwórz planer', 'Planer docelowy'], ['Wyjdź z kokpitu', 'Pulpit docelowy'],
  ])('przechodzi przez istniejący router: %s', (link, cel) => {
    pokazPanel()
    if (link !== 'Wyjdź z kokpitu') wywolaj.click(ekran.getByRole('button', { name: 'Następna plansza' }))
    wywolaj.click(ekran.getByRole('link', { name: link }))
    oczekuj(ekran.getByText(cel)).toBeInTheDocument()
  })

  sprawdz('domyślnie otwiera plansze i przełącza na niezależny widok ciągły', () => {
    pokazPanel()
    oczekuj(ekran.getByRole('navigation', { name: 'Plansze kokpitu' })).toBeInTheDocument()
    oczekuj(ekran.queryByRole('region', { name: 'Organizacja' })).not.toBeInTheDocument()
    wywolaj.click(ekran.getByRole('button', { name: 'Widok ciągły' }))
    oczekuj(ekran.getByRole('region', { name: 'Organizacja' })).toBeInTheDocument()
    oczekuj(ekran.queryByRole('navigation', { name: 'Plansze kokpitu' })).not.toBeInTheDocument()
  })

  sprawdz('historia edycji jest robocza aż do zapisu', async () => {
    const zapiszUstawienia = vi.fn(async () => undefined)
    vi.mocked(useAplikacja).mockReturnValue({ ...kontekstTestowy, zapiszUstawienia })
    pokazPanel()
    wywolaj.click(ekran.getByRole('button', { name: 'Edytuj kokpit' }))
    wywolaj.click(ekran.getByRole('button', { name: 'Dodaj pustą' }))
    wywolaj.click(ekran.getByRole('button', { name: 'Dodaj blok' }))
    oczekuj(ekran.getByRole('button', { name: 'Usuń blok' })).toBeInTheDocument()
    wywolaj.click(ekran.getByRole('button', { name: 'Cofnij' }))
    oczekuj(ekran.queryByRole('button', { name: 'Usuń blok' })).not.toBeInTheDocument()
    wywolaj.click(ekran.getByRole('button', { name: 'Ponów' }))
    oczekuj(ekran.getByRole('button', { name: 'Usuń blok' })).toBeInTheDocument()
    oczekuj(zapiszUstawienia).not.toHaveBeenCalled()
    wywolaj.click(ekran.getByRole('button', { name: 'Zapisz' }))
    oczekuj(zapiszUstawienia).toHaveBeenCalledWith({ kokpit: oczekuj.objectContaining({ wersja: 1 }) })
    oczekuj(await ekran.findByRole('button', { name: 'Edytuj kokpit' })).toBeInTheDocument()
  })

  sprawdz('ostrzega przed utratą zmian przy nawigacji Wstecz', async () => {
    const { router } = pokazPanel()
    wywolaj.click(ekran.getByRole('button', { name: 'Edytuj kokpit' }))
    wywolaj.click(ekran.getByRole('button', { name: 'Dodaj pustą' }))
    await wykonaj(() => router.navigate(-1))
    oczekuj(ekran.getByRole('dialog', { name: 'Opuścić edytor?' })).toBeInTheDocument()
    wywolaj.click(ekran.getByRole('button', { name: 'Potwierdz' }))
    oczekuj(await ekran.findByText('Pulpit docelowy')).toBeInTheDocument()
  })

  sprawdz('przełącza plansze według interwału i wstrzymuje go podczas edycji', () => {
    vi.useFakeTimers()
    vi.mocked(useAplikacja).mockReturnValue({ ...kontekstTestowy, zapisaneUstawienia: { ...DOMYSLNE_USTAWIENIA, kokpit: { ...domyslnyKokpit, interwal: 10 } } })
    pokazPanel()
    wykonaj(() => vi.advanceTimersByTime(10_000))
    oczekuj(ekran.getByRole('region', { name: 'Organizacja' })).toBeInTheDocument()
    wywolaj.click(ekran.getByRole('button', { name: 'Edytuj kokpit' }))
    wykonaj(() => vi.advanceTimersByTime(20_000))
    wywolaj.click(ekran.getByRole('button', { name: 'Anuluj' }))
    oczekuj(ekran.getByRole('region', { name: 'Organizacja' })).toBeInTheDocument()
  })

  sprawdz('po bezczynności pokazuje Ambient i wraca do tego samego układu', () => {
    vi.useFakeTimers()
    vi.mocked(useAplikacja).mockReturnValue({ ...kontekstTestowy, zapisaneUstawienia: { ...DOMYSLNE_USTAWIENIA, kokpit: {
      ...domyslnyKokpit, ambient: { ...domyslnyKokpit.ambient, wlaczony: true, sekundy: 10 },
    } } })
    pokazPanel()
    wywolaj.click(ekran.getByRole('button', { name: 'Następna plansza' }))
    wykonaj(() => vi.advanceTimersByTime(10_000))
    oczekuj(ekran.getByRole('region', { name: 'Informacje Ambient' })).toBeInTheDocument()
    oczekuj(ekran.queryByRole('region', { name: 'Organizacja' })).not.toBeInTheDocument()
    wywolaj.click(ekran.getByRole('button', { name: 'Zakończ Ambient' }))
    oczekuj(ekran.getByRole('region', { name: 'Organizacja' })).toBeInTheDocument()
  })

  sprawdz('zmienia planszę po poziomym geście i ignoruje gest pionowy', () => {
    pokazPanel()
    const gest = { pointerType: 'touch', pointerId: 1, isPrimary: true }
    const plansza = ekran.getByRole('region', { name: 'Przegląd' })
    wywolaj.pointerDown(plansza, { ...gest, clientX: 200, clientY: 100 })
    wywolaj.pointerUp(plansza, { ...gest, clientX: 200, clientY: 180 })
    oczekuj(plansza).toBeInTheDocument()
    wywolaj.pointerDown(plansza, { ...gest, clientX: 200, clientY: 100 })
    wywolaj.pointerUp(plansza, { ...gest, clientX: 100, clientY: 102 })
    oczekuj(ekran.getByRole('region', { name: 'Organizacja' })).toBeInTheDocument()
  })

  sprawdz('usuwa prywatny tytuł z DOM i blokuje akcje po wygaśnięciu sesji', async () => {
    const konto = { zalogowany: true, uzytkownikId: 'test', wlascicielId: 'test', email: 'test@invalid', rola: 'wlasciciel', granty: [], edytorzy: [] } as const
    const sesja = { ...konto, granty: [], edytorzy: [] }
    vi.spyOn(kontekstKonta, 'useKonto').mockReturnValue({ konto: sesja, offline: false })
    vi.spyOn(serwisKonta, 'pobierzSesjeKonta').mockResolvedValue(sesja)
    vi.spyOn(serwisKonta, 'czyKontoZgodneZDanymiLokalnymi').mockReturnValue(true)
    vi.mocked(pobierzKonfiguracjeSynchronizacji).mockReturnValue({ adresApi: 'https://test.invalid' })
    vi.mocked(useRepozytorium).mockImplementation(((nazwa: string) => ({
      dane: nazwa === 'zadania' ? [{ id: 'zadanie', tytul: 'Prywatny tytuł', status: 'otwarte', termin: new Date().toLocaleDateString('sv-SE'), powiazania: [] }] : [],
    })) as typeof useRepozytorium)
    pokazPanel()
    wywolaj.click(ekran.getByRole('button', { name: 'Następna plansza' }))
    wywolaj.click(ekran.getByLabelText('Tryb publiczny'))
    wywolaj.click(await ekran.findByRole('button', { name: 'Użyj prywatnego' }))
    oczekuj(ekran.getByText('Prywatny tytuł')).toBeInTheDocument()
    oczekuj(ekran.getByRole('button', { name: 'Wykonaj zadanie: Prywatny tytuł' })).toBeInTheDocument()
    wykonaj(() => window.dispatchEvent(new Event('ogarniacz:sesja-wygasla')))
    oczekuj(ekran.queryByText('Prywatny tytuł')).not.toBeInTheDocument()
    oczekuj(ekran.queryByRole('button', { name: 'Wykonaj zadanie: Prywatny tytuł' })).not.toBeInTheDocument()
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
    oczekuj(ekran.getByRole('link', { name: 'Wyjdź z kokpitu' })).toBeInTheDocument()
  })

  sprawdz('korzysta z Fullscreen API i aktualizuje przycisk po Escape', async () => {
    const pelnyEkran = vi.fn(async () => undefined)
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: pelnyEkran })
    const { container: kontener } = pokazPanel()
    wywolaj.click(ekran.getByRole('button', { name: 'Pełny ekran' }))
    oczekuj(pelnyEkran).toHaveBeenCalledOnce()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: kontener.querySelector('.kokpit') })
    wywolaj(document, new Event('fullscreenchange'))
    oczekuj(ekran.queryByRole('heading', { name: 'Ekran kokpitu' })).not.toBeInTheDocument()
    oczekuj(ekran.getByRole('button', { name: 'Wyłącz pełny ekran' })).toBeInTheDocument()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    wywolaj(document, new Event('fullscreenchange'))
    oczekuj(ekran.getByRole('button', { name: 'Pełny ekran' })).toBeInTheDocument()
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
  })
})
