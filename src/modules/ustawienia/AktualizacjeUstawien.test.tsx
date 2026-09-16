import { cleanup as wyczysc, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelAktualizacjiWeb } from './PanelAktualizacjiWeb'
import { komunikatBleduAktualizacji, PanelAktualizacji } from './PanelAktualizacji'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'
import { SekcjaPolaczeniaIAktualizacji } from './SekcjaPolaczeniaIAktualizacji'

const { nasluchujKontroli, pobierzApk, pobierzStan, pobierzStanKontroli, sprawdzAktualizacjeApk, uruchomInstalator } = vi.hoisted(() => ({
  nasluchujKontroli: vi.fn(() => () => undefined),
  pobierzApk: vi.fn(),
  pobierzStan: vi.fn(),
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
    aktualizacje: { skonfigurowane: () => true, sprawdz: vi.fn(), pobierz: pobierzApk, uruchomInstalator, pobierzInformacje: vi.fn().mockResolvedValue({ wersja: '1.0.11', kod: 1_000_011 }), pobierzStanInstalacji: vi.fn().mockResolvedValue({}), nasluchujStanuInstalacji: vi.fn().mockResolvedValue(() => undefined) },
    aktualizacjeWeb: {
      skonfigurowane: () => true,
      pobierzStan,
      sprawdz: vi.fn(),
      pobierzIAktywuj: vi.fn(),
      przywrocPoprzednia: vi.fn(),
      przywrocWbudowana: vi.fn(),
    },
  },
}))

vi.mock('../../services/KontrolaAktualizacjiAplikacji', () => ({
  nasluchujKontroliAktualizacji: nasluchujKontroli,
  pobierzStanKontroliAktualizacji: pobierzStanKontroli,
  sprawdzAktualizacjeApk,
  sprawdzAktualizacjeWeb: vi.fn(),
}))

beforeEach(() => {
  stanKontroli = { sprawdzono: true, wynikApk: dostepnaAktualizacja }
  pobierzStanKontroli.mockImplementation(() => stanKontroli)
  pobierzStan.mockResolvedValue(stanWeb)
  sprawdzAktualizacjeApk.mockResolvedValue(dostepnaAktualizacja)
  pobierzApk.mockReset()
  uruchomInstalator.mockReset()
})

afterEach(() => {
  wyczysc()
  vi.clearAllMocks()
})

const stanWeb = {
  aktualny: { bundleVersion: '1.0.9', commitSha: 'a'.repeat(40), installedAt: '2026-09-14T10:00:00.000Z', source: 'web-ota' as const },
  odrzucone: [],
  pending: false,
}

describe('końcowa sekcja synchronizacji i aktualizacji', () => {
  it('wyjaśnia brakującą przestrzeń na podstawie danych błędu natywnego', () => {
    expect(komunikatBleduAktualizacji({
      code: 'BRAK_MIEJSCA',
      data: { wolneBajty: 495 * 1024 ** 2, wymaganeBajty: 2 * 1024 ** 3, brakujaceBajty: 1.5 * 1024 ** 3 },
    }, 'błąd')).toContain('Zwolnij co najmniej 1,5 GB')
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

    await screen.findByRole('button', { name: 'Uruchom instalator' })
    fireEvent.click(screen.getByRole('button', { name: 'Uruchom instalator' }))

    await waitFor(() => expect(uruchomInstalator).toHaveBeenCalledTimes(2))
    expect(pobierzApk).toHaveBeenCalledTimes(1)
  })

  it('układa Synchronizację przed aktualizacją aplikacji i szybkimi poprawkami', () => {
    pobierzStan.mockResolvedValue(stanWeb)
    const { container } = render(<SekcjaPolaczeniaIAktualizacji synchronizacjaSkonfigurowana dzieci={<h2>Synchronizacja</h2>} />)
    const tekst = container.textContent ?? ''
    expect(tekst.indexOf('Synchronizacja')).toBeLessThan(tekst.indexOf('Aktualizacja aplikacji'))
    expect(tekst.indexOf('Aktualizacja aplikacji')).toBeLessThan(tekst.indexOf('Szybkie poprawki'))
  })

  it('promuje dostępne APK ponad szybką poprawkę', () => {
    render(<PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana stan={{
      sprawdzono: true,
      wynikApk: { czyNowsza: true, adresApk: 'https://example.test/app.apk', manifest: { versionName: '1.0.10', versionCode: 1_000_010, apkUrl: 'app.apk', sha256: 'a'.repeat(64) } },
    }} />)
    expect(screen.getAllByText('Dostępna nowa wersja aplikacji')).not.toHaveLength(0)
  })

  it('pokazuje dostępną szybką poprawkę dla zgodnego APK', () => {
    render(<PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana stan={{
      sprawdzono: true,
      wynikWeb: { czyDostepna: true, czyOdrzucona: false, wymagaNowszegoApk: false, stan: stanWeb, manifest: { ...stanWeb.aktualny, url: 'https://example.test/web.zip', sha256: 'a'.repeat(64), signature: 'c2ln', minNativeVersionCode: 1, publishedAt: '2026-09-14T10:00:00.000Z' } },
    }} />)
    expect(screen.getAllByText('Dostępna szybka poprawka')).not.toHaveLength(0)
  })

  it('wymaga nowego APK, gdy szybka poprawka nie jest zgodna', () => {
    render(<PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana stan={{
      sprawdzono: true,
      wynikWeb: { czyDostepna: true, czyOdrzucona: false, wymagaNowszegoApk: true, stan: stanWeb, manifest: { ...stanWeb.aktualny, url: 'https://example.test/web.zip', sha256: 'a'.repeat(64), signature: 'c2ln', minNativeVersionCode: 2, publishedAt: '2026-09-14T10:00:00.000Z' } },
    }} />)
    expect(screen.getAllByText('Dostępna nowa wersja aplikacji')).not.toHaveLength(0)
  })

  it('wyjaśnia awaryjne przywrócenie wersji wbudowanej', async () => {
    pobierzStan.mockResolvedValue(stanWeb)
    render(<PanelAktualizacjiWeb />)
    await waitFor(() => expect(screen.getByText('Przywróć wersję wbudowaną w APK')).toBeInTheDocument())
    expect(screen.getByText('Nie zmienia wersji APK ani danych. Przywraca tylko interfejs dostarczony razem z aktualnie zainstalowaną aplikacją.')).toBeInTheDocument()
  })
})
