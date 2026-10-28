import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import type { Pojazd } from '../../domain/typy'
import { obsluzWstecz } from '../../platform/obslugaWstecz'
import { WidokSamochodu } from './WidokSamochodu'

beforeEach(async () => {
  baza.close()
  await Dexie.delete('ogarniacz-v1')
  await inicjalizujBaze()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Brak internetu')))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); baza.close() })

function renderuj() { return render(<MemoryRouter><WidokSamochodu /></MemoryRouter>) }

it('dodaje offline samochód po wyborze marki i modelu, zapisuje i ponownie odczytuje', async () => {
  const { unmount } = renderuj()
  fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj pojazd' })[0])
  fireEvent.change(screen.getByLabelText(/^Pojazd/), { target: { value: 'Nowe auto' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Marka' }), { target: { value: 'skoda' } })
  fireEvent.click(screen.getByRole('option', { name: 'Škoda' }))
  const model = screen.getByRole('combobox', { name: 'Model' })
  fireEvent.focus(model)
  fireEvent.change(model, { target: { value: 'oct' } })
  fireEvent.keyDown(model, { key: 'ArrowDown' })
  fireEvent.keyDown(model, { key: 'Enter' })
  expect(model).toHaveProperty('value', 'Octavia')
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect((await pobierzRepozytorium('pojazdy').lista())[0]).toMatchObject({ nazwa: 'Nowe auto', marka: 'Škoda', model: 'Octavia' })
  unmount()
  renderuj()
  await screen.findByText('Nowe auto')
  fireEvent.click(screen.getByTitle('Edytuj'))
  expect(screen.getByRole('combobox', { name: 'Marka' })).toHaveProperty('value', 'Škoda')
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveProperty('value', 'Octavia')
  expect(fetch).not.toHaveBeenCalled()
})

it('zmienia markę i listę modeli, zachowuje model do decyzji użytkownika oraz wszystkie dane pojazdu', async () => {
  const pojazd: Pojazd = {
    ...utworzMetadane('pojazd-historyczny'), nazwa: 'Istniejące auto', marka: 'Škoda', model: 'Octavia', rok: 2016,
    numerRejestracyjny: 'TEST123', vin: 'VIN-TESTOWY', przebieg: 125430.5,
    historiaPrzebiegu: [{ data: '2026-10-01', przebieg: 125430.5 }],
    historiaSerwisowa: [{ id: 'serwis-1', typ: 'olej', data: '2026-10-01', przebieg: 125000, opis: 'Testowa wymiana oleju', koszt: 300 }],
    tankowania: [{ id: 'paliwo-1', data: '2026-10-01', przebieg: 125000, litry: 42.75, cena: 260, pelnyBak: true }],
    opony: [{ id: 'opony-1', nazwa: 'Testowe opony', typ: 'zimowe', dataZmiany: '2026-10-01', przebieg: 125000, sezon: '2026' }],
    ocDo: '2027-10-01', kosztOc: 1500, dataOplatyOc: '2026-10-01', ubezpieczyciel: 'Testowy ubezpieczyciel', numerPolisy: 'POLISA-TEST',
    przegladDo: '2027-10-01', wymianaOlejuDo: '2027-04-01', wymianaOlejuPrzebieg: 135000,
    planowanySerwisData: '2026-12-01', planowanySerwisGodzina: '08:30', notatka: 'Notatka testowa', polaWlasne: { 'custom:kolor': 'zielony' },
  }
  await pobierzRepozytorium('pojazdy').zapisz(pojazd)
  const potwierdzenie = vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderuj()
  await screen.findByText('Istniejące auto')
  fireEvent.click(screen.getByTitle('Edytuj'))
  fireEvent.change(screen.getByRole('combobox', { name: 'Marka' }), { target: { value: 'toy' } })
  fireEvent.click(screen.getByRole('option', { name: 'Toyota' }))
  const model = screen.getByRole('combobox', { name: 'Model' })
  expect(model).toHaveProperty('value', 'Octavia')
  fireEvent.focus(model)
  expect(screen.getAllByRole('option').filter((opcja) => opcja.closest('[role="listbox"]')).map((opcja) => opcja.textContent)).toEqual(['Camry', 'Corolla', 'RAV4', 'Yaris'])
  act(() => { expect(obsluzWstecz()).toBe(true) })
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.keyDown(model, { key: 'ArrowUp' })
  fireEvent.keyDown(model, { key: 'Enter' })
  expect(model).toHaveProperty('value', 'Yaris')
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(await pobierzRepozytorium('pojazdy').pobierz(pojazd.id)).toMatchObject({ ...pojazd, marka: 'Toyota', model: 'Yaris', updatedAt: expect.any(String) })
  expect(potwierdzenie).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('zachowuje niestandardowe nazwy i podpowiada je po ponownym otwarciu offline', async () => {
  const { unmount } = renderuj()
  fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj pojazd' })[0])
  fireEvent.change(screen.getByLabelText(/^Pojazd/), { target: { value: 'Własne auto' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Marka' }), { target: { value: 'Własna Marka' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'Prototyp 42' } })
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect((await pobierzRepozytorium('pojazdy').lista())[0]).toMatchObject({ marka: 'Własna Marka', model: 'Prototyp 42' })
  unmount()
  renderuj()
  await screen.findByText('Własne auto')
  fireEvent.click(screen.getByTitle('Edytuj'))
  const marka = screen.getByRole('combobox', { name: 'Marka' })
  fireEvent.change(marka, { target: { value: '  WŁASNA   MARKA ' } })
  expect(screen.getByRole('option', { name: 'Własna Marka' })).toBeTruthy()
  fireEvent.click(screen.getByRole('option', { name: 'Własna Marka' }))
  const model = screen.getByRole('combobox', { name: 'Model' })
  fireEvent.focus(model)
  expect(screen.getByRole('option', { name: 'Prototyp 42' })).toBeTruthy()
  fireEvent.keyDown(model, { key: 'Escape' })
  fireEvent.change(marka, { target: { value: '' } })
  expect(model).toHaveProperty('value', 'Prototyp 42')
  expect(fetch).not.toHaveBeenCalled()
})
