import { platforma } from '../../platform/platforma'
import { act, cleanup as wyczysc, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { komunikatBleduAktualizacji, PanelAktualizacji } from './PanelAktualizacji'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'
import { SekcjaPolaczeniaIAktualizacji } from './SekcjaPolaczeniaIAktualizacji'
import { utworzDiagnostykeSynchronizacji } from '../../services/DiagnostykaSynchronizacji'
import { utworzMetadane } from '../../domain/fabryki'

vi.mock('./PanelAktualizacjiRaspberry', () => ({ PanelAktualizacjiRaspberry: () => <div>Raspberry / serwer</div> }))

const { nasluchujKontroli, nasluchujCykluZycia, pobierzApk, pobierzStanKontroli, sprawdzAktualizacjeApk, uruchomInstalator } = vi.hoisted(() => ({
  nasluchujKontroli: vi.fn(() => () => undefined),
  nasluchujCykluZycia: vi.fn(),
  pobierzApk: vi.fn(),
  pobierzStanKontroli: vi.fn(),
  sprawdzAktualizacjeApk: vi.fn(),
  uruchomInstalator: vi.fn(),
}))

const dostepnaAktualizacja = {
  czyNowsza: true,
  adresApk: 'https://example.test/Ogarniacz-1.0.12-release.apk',
  manifest: { versionName: '1.0.12', versionCode: 1_000_012, apkUrl: 'Ogarniacz-1.0.12-release.apk', sha256: 'a'.repeat(64) },
}

let stanKontroli = { sprawdzono: true, wynikApk: dostepnaAktualizacja }

vi.mock('../../platform/platforma', () => ({
  platforma: {
    natywna: true,
    cyklZycia: { nasluchuj: nasluchujCykluZycia },
    aktualizacje: { skonfigurowane: () => true, sprawdz: vi.fn(), pobierz: pobierzApk, uruchomInstalator, pobierzInformacje: vi.fn().mockResolvedValue({ wersja: '1.0.11', kod: 1_000_011 }), pobierzStanInstalacji: vi.fn().mockResolvedValue({}), nasluchujStanuInstalacji: vi.fn().mockResolvedValue(() => undefined) },
  },
}))

vi.mock('../../services/KontrolaAktualizacjiAplikacji', () => ({
  nasluchujKontroliAktualizacji: nasluchujKontroli,
  pobierzStanKontroliAktualizacji: pobierzStanKontroli,
  sprawdzAktualizacjeApk,
}))

beforeEach(() => {
  platforma.natywna = true
  stanKontroli = { sprawdzono: true, wynikApk: dostepnaAktualizacja }
  pobierzStanKontroli.mockImplementation(() => stanKontroli)
  sprawdzAktualizacjeApk.mockResolvedValue(dostepnaAktualizacja)
  pobierzApk.mockReset()
  uruchomInstalator.mockReset()
  nasluchujCykluZycia.mockResolvedValue(() => undefined)
})

afterEach(() => {
  platforma.natywna = true
  wyczysc()
  vi.clearAllMocks()
})

it.each([
  { sesjaWymagaLogowania: true, liczbaKonfliktow: 0, liczbaOczekujacych: 1, tytul: 'Synchronizacja wymaga logowania' },
  { sesjaWymagaLogowania: false, liczbaKonfliktow: 1, liczbaOczekujacych: 1, tytul: 'Synchronizacja wymaga decyzji' },
  { sesjaWymagaLogowania: false, liczbaKonfliktow: 0, liczbaOczekujacych: 2, tytul: 'Zmiany czekają na synchronizację' },
])('pokazuje przyczynę braku synchronizacji: $tytul', ({ tytul, ...dane }) => {
  const diagnostyka = utworzDiagnostykeSynchronizacji({
    czyAndroid: true, adresApi: 'https://example.test', installationId: '12345678', csrfDostepny: true,
    konto: { zalogowany: true, uzytkownikId: 'konto', wlascicielId: 'konto', email: 'konto@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] },
    stan: { ...utworzMetadane('glowny'), stan: 'oczekuje', ...dane },
  })
  render(<PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana diagnostyka={diagnostyka} />)
  expect(screen.getByRole('heading', { name: tytul })).toBeInTheDocument()
})

it('pokazuje brak połączenia nawet przy pustym outboxie', () => {
  const diagnostyka = utworzDiagnostykeSynchronizacji({
    czyAndroid: true, adresApi: 'https://example.test', installationId: '12345678', csrfDostepny: true,
    konto: { zalogowany: true, uzytkownikId: 'konto', wlascicielId: 'konto', email: 'konto@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] },
    stan: { ...utworzMetadane('glowny'), stan: 'blad', polaczenie: 'niedostepne', liczbaOczekujacych: 0, liczbaKonfliktow: 0 },
  })
  render(<PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana diagnostyka={diagnostyka} />)
  expect(screen.getByRole('heading', { name: 'Brak połączenia z backendem' })).toBeInTheDocument()
})

it('kopiuje raport diagnostyczny i potwierdza powodzenie', async () => {
  const zapisanoDoSchowka = vi.fn().mockResolvedValue(undefined)
  const schowekPoprzedni = navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: zapisanoDoSchowka } })
  try {
    const diagnostyka = utworzDiagnostykeSynchronizacji({ czyAndroid: true, adresApi: 'https://prywatny-serwer.example', installationId: 'pelne-id', csrfDostepny: true })
    render(<PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana diagnostyka={diagnostyka} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kopiuj raport diagnostyczny' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Raport diagnostyczny skopiowano do schowka.'))
    expect(zapisanoDoSchowka).toHaveBeenCalledWith(expect.stringContaining('Platforma: Android'))
    expect(zapisanoDoSchowka.mock.calls[0][0]).not.toContain('prywatny-serwer.example')
    expect(zapisanoDoSchowka.mock.calls[0][0]).not.toContain('pelne-id')
  } finally {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: schowekPoprzedni })
  }
})

it('udostępnia raport do ręcznego skopiowania, gdy schowek jest niedostępny', async () => {
  const schowekPoprzedni = navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  try {
    const diagnostyka = utworzDiagnostykeSynchronizacji({ czyAndroid: false, csrfDostepny: false, installationId: '' })
    render(<PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana={false} diagnostyka={diagnostyka} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kopiuj raport diagnostyczny' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się skopiować raportu')
    expect((screen.getByLabelText('Raport do ręcznego skopiowania') as HTMLTextAreaElement).value).toContain('Konfiguracja połączenia: brak konfiguracji')
    expect(screen.getByRole('button', { name: 'Zaznacz raport' })).toBeInTheDocument()
  } finally {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: schowekPoprzedni })
  }
})

it('po sukcesie 1.0.14 i sprzątnięciu starego APK pozwala pobrać następną wersję', async () => {
  const nastepna = { ...dostepnaAktualizacja, adresApk: 'https://example.test/Ogarniacz-1.0.15-release.apk',
    manifest: { ...dostepnaAktualizacja.manifest, versionName: '1.0.15', versionCode: 1_000_015, apkUrl: 'Ogarniacz-1.0.15-release.apk' } }
  stanKontroli = { sprawdzono: true, wynikApk: nastepna }
  sprawdzAktualizacjeApk.mockResolvedValueOnce(nastepna)
  vi.mocked(platforma.aktualizacje.pobierzInformacje).mockResolvedValueOnce({ wersja: '1.0.14', kod: 1_000_014 })
  vi.mocked(platforma.aktualizacje.pobierzStanInstalacji).mockResolvedValueOnce({
    status: 'SUKCES', wymagaZgody: false, maZweryfikowanyApk: false, moznaPonowicInstalacje: false,
    wersjaDocelowa: '1.0.14', versionCodeDocelowy: 1_000_014,
    nazwaPliku: 'Ogarniacz-1.0.14-release.apk', sha256: 'a'.repeat(64),
  })
  pobierzApk.mockResolvedValue({ nazwaPliku: 'Ogarniacz-1.0.15-release.apk', sha256: 'a'.repeat(64) })
  uruchomInstalator.mockResolvedValue({ status: 'INSTALOWANIE', wymagaZgody: false })
  render(<PanelAktualizacji />)
  await screen.findByText('Aktualizacja zakończona.')
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź aktualizacje' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Pobierz i zainstaluj' }))
  await waitFor(() => expect(uruchomInstalator).toHaveBeenCalledWith(
    { nazwaPliku: 'Ogarniacz-1.0.15-release.apk', sha256: 'a'.repeat(64) }, nastepna.manifest,
  ))
  expect(pobierzApk).toHaveBeenCalledTimes(1)
})

describe('końcowa sekcja synchronizacji i aktualizacji', () => {
  it('wyjaśnia brakującą przestrzeń na podstawie danych błędu natywnego', () => {
    expect(komunikatBleduAktualizacji({
      code: 'BRAK_MIEJSCA',
      data: { wolneBajty: 100 * 1024 ** 2, wymaganeBajty: 154 * 1024 ** 2, brakujaceBajty: 54 * 1024 ** 2 },
    }, 'błąd')).toContain('Wymagane: około 154 MB')
    expect(komunikatBleduAktualizacji({ code: 'BRAK_MIEJSCA' }, 'błąd')).not.toContain('2 GB')
    expect(komunikatBleduAktualizacji(new Error('java.lang.IllegalStateException'), 'Bezpieczny komunikat')).toBe('Bezpieczny komunikat')
  })

  it('nie nadpisuje błędu pobierania automatycznie wykrytą wersją 1.0.12', async () => {
    pobierzApk.mockRejectedValue({
      code: 'BRAK_MIEJSCA',
      data: { wolneBajty: 495 * 1024 ** 2, wymaganeBajty: 2 * 1024 ** 3, brakujaceBajty: 1.5 * 1024 ** 3 },
    })
    render(<PanelAktualizacji />)

    await screen.findByRole('button', { name: 'Pobierz i zainstaluj' })
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz i zainstaluj' }))

    await waitFor(() => expect(screen.getByText('za mało miejsca')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Za mało wolnego miejsca')
    expect(screen.getByRole('button', { name: 'Ponów pobieranie' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pobierz i zainstaluj' })).not.toBeInTheDocument()
  })

  it('nie nadpisuje błędu uruchomienia instalatora automatycznie wykrytą wersją 1.0.12', async () => {
    pobierzApk.mockResolvedValue({ nazwaPliku: 'Ogarniacz-1.0.12-release.apk', sha256: 'a'.repeat(64) })
    uruchomInstalator.mockRejectedValue({ code: 'BRAK_INSTALATORA' })
    render(<PanelAktualizacji />)

    await screen.findByRole('button', { name: 'Pobierz i zainstaluj' })
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz i zainstaluj' }))

    await waitFor(() => expect(screen.getByText('błąd instalatora')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się uruchomić systemowego instalatora Androida')
    expect(screen.getByRole('button', { name: 'Ponów instalację' })).toBeInTheDocument()
    expect(pobierzApk).toHaveBeenCalledTimes(1)
  })

  it('po zgodzie na instalowanie nieznanych aplikacji ponawia instalator bez pobierania APK', async () => {
    pobierzApk.mockResolvedValue({ nazwaPliku: 'Ogarniacz-1.0.12-release.apk', sha256: 'a'.repeat(64) })
    uruchomInstalator
      .mockResolvedValueOnce({ wymagaZgody: true })
      .mockResolvedValueOnce({ wymagaZgody: false, status: 'INSTALOWANIE' })
    render(<PanelAktualizacji />)

    await screen.findByRole('button', { name: 'Pobierz i zainstaluj' })
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz i zainstaluj' }))

    await screen.findByRole('button', { name: 'Ponów instalację' })
    fireEvent.click(screen.getByRole('button', { name: 'Ponów instalację' }))

    await waitFor(() => expect(uruchomInstalator).toHaveBeenCalledTimes(2))
    expect(pobierzApk).toHaveBeenCalledTimes(1)
  })

  it('układa Synchronizację przed jedynym kanałem Android APK', () => {
    const { container } = render(<SekcjaPolaczeniaIAktualizacji synchronizacjaSkonfigurowana dzieci={<h2>Synchronizacja</h2>} />)
    const tekst = container.textContent ?? ''
    expect(tekst.indexOf('Synchronizacja')).toBeLessThan(tekst.indexOf('Android APK'))
    expect(tekst).not.toContain('Android Web OTA')
    expect(tekst).not.toContain('szybka poprawka')
  })

  it('na Web/PWA pokazuje wyłącznie panel Raspberry, bez instalatorów Androida', () => {
    platforma.natywna = false
    render(<SekcjaPolaczeniaIAktualizacji synchronizacjaSkonfigurowana dzieci={<h2>Synchronizacja</h2>} />)
    expect(screen.getByText('Raspberry / serwer')).toBeInTheDocument()
    expect(screen.queryByText('Android Web OTA')).not.toBeInTheDocument()
    expect(screen.queryByText('Android APK')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pobierz i zainstaluj' })).not.toBeInTheDocument()
  })

  it('promuje dostępne APK ponad szybką poprawkę', () => {
    render(<PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana stan={{
      sprawdzono: true,
      wynikApk: { czyNowsza: true, adresApk: 'https://example.test/app.apk', manifest: { versionName: '1.0.10', versionCode: 1_000_010, apkUrl: 'app.apk', sha256: 'a'.repeat(64) } },
    }} />)
    expect(screen.getAllByText('Dostępna nowa wersja aplikacji')).not.toHaveLength(0)
  })


})

it('pokazuje błąd odczytu instalatora bez odrzucenia Promise poza panelem', async () => {
  vi.mocked(platforma.aktualizacje.pobierzStanInstalacji).mockRejectedValueOnce(new Error('most niedostępny'))
  render(<PanelAktualizacji />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się odczytać stanu instalatora'))
  expect(screen.getByRole('button', { name: 'Sprawdź aktualizacje' })).toBeEnabled()
})

it('nie pozostawia sprawdzania bez końca po utracie konfiguracji', async () => {
  sprawdzAktualizacjeApk.mockResolvedValueOnce(undefined)
  render(<PanelAktualizacji />)
  fireEvent.click(screen.getByRole('button', { name: 'Sprawdź aktualizacje' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Źródło aktualizacji nie jest skonfigurowane'))
  expect(screen.getByRole('button', { name: 'Sprawdź aktualizacje' })).toBeEnabled()
})

it('po przerwaniu pobierania pokazuje retry i uruchamia instalator dopiero po poprawnym pobraniu', async () => {
  pobierzApk.mockRejectedValueOnce({ code: 'BLAD_POBIERANIA' })
    .mockResolvedValueOnce({ nazwaPliku: 'Ogarniacz-1.0.12-release.apk', sha256: 'a'.repeat(64) })
  uruchomInstalator.mockResolvedValue({ status: 'INSTALOWANIE', wymagaZgody: false })
  render(<PanelAktualizacji />)
  fireEvent.click(await screen.findByRole('button', { name: 'Pobierz i zainstaluj' }))
  await screen.findByRole('button', { name: 'Ponów pobieranie' })
  expect(uruchomInstalator).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Ponów pobieranie' }))
  await waitFor(() => expect(uruchomInstalator).toHaveBeenCalledTimes(1))
  expect(pobierzApk).toHaveBeenCalledTimes(2)
})

it('błędny SHA blokuje instalator i pozwala ponowić pobranie', async () => {
  pobierzApk.mockRejectedValueOnce({ code: 'BLEDNY_SHA' })
  render(<PanelAktualizacji />)
  fireEvent.click(await screen.findByRole('button', { name: 'Pobierz i zainstaluj' }))
  await screen.findByRole('button', { name: 'Ponów pobieranie' })
  expect(screen.getByRole('alert')).toHaveTextContent('nie przeszedł weryfikacji SHA-256')
  expect(uruchomInstalator).not.toHaveBeenCalled()
})

it.each([
  { code: 'BLAD_SIECI', data: { rodzaj: 'TIMEOUT' }, etykieta: 'błąd sieci', opis: 'Przekroczono czas oczekiwania' },
  { code: 'BLAD_SIECI', data: { rodzaj: 'DNS' }, etykieta: 'błąd sieci', opis: 'Nie udało się odnaleźć serwera' },
  { code: 'BLAD_SIECI', data: { rodzaj: 'TLS' }, etykieta: 'błąd sieci', opis: 'bezpiecznego połączenia HTTPS' },
  { code: 'BLAD_HTTP', data: { http: 406 }, etykieta: 'błąd HTTP', opis: 'HTTP 406' },
  { code: 'BLAD_ZAPISU', data: {}, etykieta: 'błąd zapisu APK', opis: 'prywatnej pamięci' },
  { code: 'BLAD_ROZMIARU', data: {}, etykieta: 'niezgodny rozmiar APK', opis: 'Rozmiar APK nie zgadza się' },
  { code: 'BLAD_HTTP', data: { http: 302, rodzaj: 'BRAK_LOCATION' }, etykieta: 'błąd HTTP', opis: 'bez adresu docelowego' },
  { code: 'BLAD_HTTP', data: { http: 302, rodzaj: 'LIMIT' }, etykieta: 'błąd HTTP', opis: 'limit przekierowań' },
])('rozróżnia $code i pozwala ponowić bez instalowania częściowego pliku', async ({ code, data, etykieta, opis }) => {
  pobierzApk.mockRejectedValueOnce({ code, data, message: 'https://cdn.test/?token=TAJNY' })
    .mockResolvedValueOnce({ nazwaPliku: 'Ogarniacz-1.0.12-release.apk', sha256: 'a'.repeat(64) })
  uruchomInstalator.mockResolvedValue({ status: 'INSTALOWANIE', wymagaZgody: false })
  render(<PanelAktualizacji />)
  fireEvent.click(await screen.findByRole('button', { name: 'Pobierz i zainstaluj' }))
  await screen.findByRole('button', { name: 'Ponów pobieranie' })
  expect(screen.getByText(etykieta)).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent(opis)
  expect(screen.getByRole('alert')).not.toHaveTextContent('TAJNY')
  expect(uruchomInstalator).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Ponów pobieranie' }))
  await waitFor(() => expect(uruchomInstalator).toHaveBeenCalledTimes(1))
  expect(pobierzApk).toHaveBeenCalledTimes(2)
})

it.each([
  { message: 'Serwer APK zwrócił HTTP 403.', opis: 'HTTP 403' },
  { message: 'Adres APK musi używać HTTPS.', opis: 'Adres APK musi używać HTTPS.' },
  { message: 'Manifest nie zawiera prawidłowej wersji APK.', opis: 'Manifest nie zawiera prawidłowej wersji APK.' },
  { message: 'Pobieranie APK już trwa.', opis: 'Pobieranie APK już trwa.' },
  { message: 'https://cdn.test/?token=TAJNY', opis: 'Brak bezpiecznych szczegółów błędu' },
  { message: 'Serwer APK zwrócił HTTP 403. https://cdn.test/?token=TAJNY', opis: 'Brak bezpiecznych szczegółów błędu' },
])('nie maskuje rozpoznanego BLAD_POBIERANIA i nie pokazuje surowych sekretów: $opis', ({ message, opis }) => {
  const komunikat = komunikatBleduAktualizacji({ code: 'BLAD_POBIERANIA', message }, 'Błąd')
  expect(komunikat).toContain(opis)
  expect(komunikat).not.toContain('TAJNY')
  expect(komunikat).not.toContain('Sprawdź połączenie z internetem')
})

it('zachowuje bezpieczny szczegół błędu instalatora i odrzuca surowe komunikaty', () => {
  expect(komunikatBleduAktualizacji({ code: 'BRAK_INSTALATORA', message: 'Brakuje danych zweryfikowanej aktualizacji. Pobierz APK ponownie.' }, 'Błąd'))
    .toBe('Brakuje danych zweryfikowanej aktualizacji. Pobierz APK ponownie.')
  expect(komunikatBleduAktualizacji({ code: 'BRAK_INSTALATORA', message: 'https://cdn.test/?token=TAJNY' }, 'Błąd'))
    .toBe('Nie udało się uruchomić systemowego instalatora Androida. Sprawdź ustawienia urządzenia i spróbuj ponownie.')
})

it('po ponownym otwarciu panelu i anulowaniu instalacji ponawia zachowany APK bez pobierania', async () => {
  vi.mocked(platforma.aktualizacje.pobierzStanInstalacji).mockResolvedValueOnce({
    status: 'ANULOWANO', wymagaZgody: false, maZweryfikowanyApk: true, moznaPonowicInstalacje: true,
    nazwaPliku: 'Ogarniacz-1.0.12-release.apk', sha256: 'a'.repeat(64),
  })
  const ponow = vi.fn().mockResolvedValue({ status: 'INSTALOWANIE', wymagaZgody: false })
  platforma.aktualizacje.ponowInstalacje = ponow
  render(<PanelAktualizacji />)
  fireEvent.click(await screen.findByRole('button', { name: 'Ponów instalację' }))
  await waitFor(() => expect(ponow).toHaveBeenCalledTimes(1))
  expect(pobierzApk).not.toHaveBeenCalled()
})

it('pokazuje wersję i versionCode w jedynym panelu Android APK', async () => {
  render(<PanelAktualizacji />)
  expect(screen.getByRole('heading', { name: 'Android APK' })).toBeInTheDocument()
  await screen.findByText('1.0.11 (versionCode: 1000011)')
  expect(screen.getByText('1.0.12')).toBeInTheDocument()
  expect(screen.queryByText('Android Web OTA')).not.toBeInTheDocument()
})

it.each([
  { status: 'POBRANO' as const, opis: 'APK pobrano. Trwa weryfikacja SHA-256.' },
  { status: 'ZWERYFIKOWANO' as const, opis: 'APK pobrano i zweryfikowano. Możesz uruchomić instalację.' },
  { status: 'INSTALOWANIE' as const, opis: 'Instalowanie aktualizacji…' },
  { status: 'ANULOWANO' as const, opis: 'Instalacja została anulowana.' },
  { status: 'NIEPOTWIERDZONO' as const, opis: 'Nie udało się potwierdzić wyniku instalacji. Sprawdź zainstalowaną wersję aplikacji.' },
])('po ponownym otwarciu zachowuje stan $status bez ogłaszania sukcesu', async ({ status, opis }) => {
  vi.mocked(platforma.aktualizacje.pobierzStanInstalacji).mockResolvedValueOnce({ status, wymagaZgody: false })
  render(<PanelAktualizacji />)
  await screen.findByText(opis)
  expect(screen.queryByText('Aktualizacja zakończona.')).not.toBeInTheDocument()
})

it('po powrocie do aplikacji odczytuje wersję i potwierdzony wynik instalacji', async () => {
  render(<PanelAktualizacji />)
  await screen.findByText('1.0.11 (versionCode: 1000011)')
  await waitFor(() => expect(platforma.aktualizacje.pobierzStanInstalacji).toHaveBeenCalled())
  vi.mocked(platforma.aktualizacje.pobierzInformacje).mockResolvedValueOnce({ wersja: '1.0.12', kod: 1_000_012 })
  vi.mocked(platforma.aktualizacje.pobierzStanInstalacji).mockResolvedValueOnce({ status: 'SUKCES', wymagaZgody: false, versionCodeDocelowy: 1_000_012 })
  act(() => nasluchujCykluZycia.mock.calls[0][0]('aktywny'))
  await screen.findByText('1.0.12 (versionCode: 1000012)')
  await screen.findByText('Aktualizacja zakończona.')
  expect(pobierzApk).not.toHaveBeenCalled()
})

it('po powrocie bez zmiany wersji pokazuje wynik niepotwierdzony', async () => {
  render(<PanelAktualizacji />)
  await screen.findByText('1.0.11 (versionCode: 1000011)')
  await waitFor(() => expect(platforma.aktualizacje.pobierzStanInstalacji).toHaveBeenCalled())
  vi.mocked(platforma.aktualizacje.pobierzStanInstalacji).mockResolvedValueOnce({ status: 'NIEPOTWIERDZONO', wymagaZgody: false, versionCodeDocelowy: 1_000_012 })
  act(() => nasluchujCykluZycia.mock.calls[0][0]('nieaktywny'))
  expect(platforma.aktualizacje.pobierzInformacje).toHaveBeenCalledTimes(1)
  act(() => nasluchujCykluZycia.mock.calls[0][0]('aktywny'))
  await screen.findByText('wynik niepotwierdzony')
  expect(screen.getByText('1.0.11 (versionCode: 1000011)')).toBeInTheDocument()
  expect(screen.queryByText('Aktualizacja zakończona.')).not.toBeInTheDocument()
})
