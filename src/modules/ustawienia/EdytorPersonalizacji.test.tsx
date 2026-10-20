import Dexie from 'dexie'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { repozytoriumUstawien } from '../../data/RepozytoriumUstawien'
import { normalizujUstawienia, zastosujUstawieniaInterfejsu } from '../../domain/ustawienia'
import { EdytorPersonalizacji } from './EdytorPersonalizacji'

vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: vi.fn() }))

let zapisane = normalizujUstawienia(undefined)
const zapisz = vi.fn(async (zmiany) => {
  zapisane = await repozytoriumUstawien.zapisz({ ...zapisane, ...zmiany })
  zastosujUstawieniaInterfejsu(zapisane, false)
})
const podglad = vi.fn((ustawienia) => zastosujUstawieniaInterfejsu(ustawienia, false))
const anuluj = vi.fn(() => zastosujUstawieniaInterfejsu(zapisane, false))

function pokazEdytor() {
  vi.mocked(useAplikacja).mockReturnValue({
    zapisaneUstawienia: zapisane,
    zapiszUstawienia: zapisz,
    ustawPodgladUstawien: podglad,
    wyczyscPodgladUstawien: anuluj,
  } as unknown as ReturnType<typeof useAplikacja>)
  return render(<MemoryRouter><EdytorPersonalizacji /></MemoryRouter>)
}

beforeEach(async () => {
  baza.close()
  await Dexie.delete('ogarniacz-v1')
  await inicjalizujBaze()
  zapisane = await repozytoriumUstawien.wczytaj()
  zastosujUstawieniaInterfejsu(zapisane, false)
  vi.clearAllMocks()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('wybór stylu w personalizacji', () => {
  it('podgląda Premium i anuluje bez zapisu do bazy', async () => {
    const przed = await repozytoriumUstawien.wczytaj()
    pokazEdytor()
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: 'premium' } })
    expect(document.documentElement.dataset.styl).toBe('premium')
    expect(screen.getByRole('button', { name: 'Zapisz ustawienia' })).toBeEnabled()
    expect(await repozytoriumUstawien.wczytaj()).toEqual(przed)
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj podgląd' }))
    expect(document.documentElement.dataset.styl).toBe('klasyczny')
    expect(screen.getByRole('combobox', { name: /Styl interfejsu/ })).toHaveValue('klasyczny')
    expect(await repozytoriumUstawien.wczytaj()).toEqual(przed)
    expect(zapisz).not.toHaveBeenCalled()
  })

  it('zapisuje Premium, odtwarza po ponownym otwarciu i pozwala wrócić do Klasycznego', async () => {
    const widok = pokazEdytor()
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: 'premium' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz ustawienia' }))
    await waitFor(() => expect(screen.getByText('Motyw i personalizacja zostały zapisane.')).toBeInTheDocument())
    widok.unmount()
    baza.close()
    await baza.open()
    zapisane = await repozytoriumUstawien.wczytaj()
    pokazEdytor()
    expect(screen.getByRole('combobox', { name: /Styl interfejsu/ })).toHaveValue('premium')
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: 'klasyczny' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz ustawienia' }))
    await waitFor(() => expect(screen.getByText('Motyw i personalizacja zostały zapisane.')).toBeInTheDocument())
    expect((await repozytoriumUstawien.wczytaj()).wyglad.personalizacja.styl).toBe('klasyczny')
    expect(document.documentElement.style.getPropertyValue('--tlo')).toBe('')
  })

  it('przy wyjściu bez zapisu przywraca poprzedni styl Premium', () => {
    zapisane = normalizujUstawienia({ wyglad: { personalizacja: { styl: 'premium' } } })
    zastosujUstawieniaInterfejsu(zapisane, false)
    const widok = pokazEdytor()
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: 'klasyczny' } })
    expect(document.documentElement.dataset.styl).toBe('klasyczny')
    widok.unmount()
    expect(document.documentElement.dataset.styl).toBe('premium')
    expect(zapisz).not.toHaveBeenCalled()
  })

  it('nie zmienia stylu przy wyborze presetu ani kolorów przy zmianie stylu', () => {
    pokazEdytor()
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: 'premium' } })
    fireEvent.click(screen.getByRole('button', { name: /Midnight/ }))
    const wlasna = podglad.mock.calls.at(-1)![0].wyglad.personalizacja
    expect(wlasna.styl).toBe('premium')
    expect(wlasna.uzyjWlasnejPalety).toBe(true)
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: 'klasyczny' } })
    expect(podglad.mock.calls.at(-1)![0].wyglad.personalizacja.paleta).toEqual(wlasna.paleta)
    expect(podglad.mock.calls.at(-1)![0].wyglad.personalizacja.animacje).toEqual(wlasna.animacje)
  })
})
