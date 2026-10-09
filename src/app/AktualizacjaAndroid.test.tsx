import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AktualizacjaAndroid } from './AktualizacjaAndroid'

const { dane, nasluchujacy, pobierz } = vi.hoisted(() => ({
  dane: { stan: { wynikApk: { czyNowsza: true, manifest: { versionCode: 1000015, versionName: '1.0.15' } } } },
  nasluchujacy: new Set<() => void>(),
  pobierz: vi.fn(),
}))
vi.mock('../platform/platforma', () => ({ platforma: { natywna: true, aktualizacje: { pobierz } } }))
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
