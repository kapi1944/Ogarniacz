import { cleanup as wyczysc, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PanelAktualizacjiWeb } from './PanelAktualizacjiWeb'
import { komunikatBleduAktualizacji } from './PanelAktualizacji'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'
import { SekcjaPolaczeniaIAktualizacji } from './SekcjaPolaczeniaIAktualizacji'

const { pobierzStan } = vi.hoisted(() => ({ pobierzStan: vi.fn() }))

vi.mock('../../platform/platforma', () => ({
  platforma: {
    natywna: true,
    aktualizacje: { skonfigurowane: () => true, sprawdz: vi.fn(), pobierzInformacje: vi.fn().mockResolvedValue({ wersja: '1.0.9', kod: 1_000_009 }), pobierzStanInstalacji: vi.fn().mockResolvedValue({}), nasluchujStanuInstalacji: vi.fn().mockResolvedValue(() => undefined) },
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
