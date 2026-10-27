import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AktualizacjaAndroid } from './AktualizacjaAndroid'
import { platforma } from '../platform/platforma'

const { dane, nasluchujacy, pobierz } = vi.hoisted(() => ({
  dane: { stan: { wynikApk: { czyNowsza: true, manifest: { versionCode: 1000015, versionName: '1.0.15' } } } },
  nasluchujacy: new Set<() => void>(),
  pobierz: vi.fn(),
}))
vi.mock('../platform/platforma', () => ({ platforma: { natywna: true,
  cyklZycia: { nasluchuj: vi.fn().mockResolvedValue(() => undefined) },
  aktualizacje: { pobierz, pobierzStanInstalacji: vi.fn().mockResolvedValue({}), nasluchujStanuInstalacji: vi.fn().mockResolvedValue(() => undefined) },
} }))
vi.mock('../services/KontrolaAktualizacjiAplikacji', () => ({
  pobierzStanKontroliAktualizacji: () => dane.stan,
  nasluchujKontroliAktualizacji: (obsluga: () => void) => { nasluchujacy.add(obsluga); return () => nasluchujacy.delete(obsluga) },
}))
vi.mock('../modules/ustawienia/PanelAktualizacji', () => ({ PanelAktualizacji: () => <p>Istniejący instalator APK</p> }))
afterEach(cleanup)

it('odkłada wersję przez zmiany widoku i ponowną kontrolę, a nową wersję pokazuje', () => {
  const widok = render(<AktualizacjaAndroid />)
  fireEvent.click(screen.getByRole('button', { name: 'Później' }))
  widok.rerender(<AktualizacjaAndroid />)
  act(() => { dane.stan = { ...dane.stan }; nasluchujacy.forEach((obsluga) => obsluga()) })
  expect(screen.queryByRole('button', { name: 'Zaktualizuj' })).not.toBeInTheDocument()
  act(() => {
    dane.stan = { wynikApk: { czyNowsza: true, manifest: { versionCode: 1000016, versionName: '1.0.16' } } }
    nasluchujacy.forEach((obsluga) => obsluga())
  })
  expect(screen.getByRole('button', { name: 'Zaktualizuj' })).toBeInTheDocument()
})

it('Zaktualizuj otwiera istniejący panel APK bez automatycznego pobrania', async () => {
  render(<AktualizacjaAndroid />)
  fireEvent.click(screen.getByRole('button', { name: 'Zaktualizuj' }))
  expect(await screen.findByText('Istniejący instalator APK')).toBeInTheDocument()
  expect(pobierz).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }))
  expect(screen.queryByRole('button', { name: 'Zaktualizuj' })).not.toBeInTheDocument()
})

it('bez sesji konta i bez wyniku sieciowego umożliwia ponowienie zachowanej instalacji', async () => {
  act(() => { dane.stan = { wynikApk: undefined } as unknown as typeof dane.stan })
  vi.mocked(platforma.aktualizacje.pobierzStanInstalacji).mockResolvedValueOnce({ status: 'ANULOWANO', wymagaZgody: false,
    maZweryfikowanyApk: true, moznaPonowicInstalacje: true, versionCodeDocelowy: 1001000 })
  render(<AktualizacjaAndroid />)
  fireEvent.click(await screen.findByRole('button', { name: 'Zaktualizuj' }))
  expect(await screen.findByText('Istniejący instalator APK')).toBeInTheDocument()
  expect(pobierz).not.toHaveBeenCalled()
})
