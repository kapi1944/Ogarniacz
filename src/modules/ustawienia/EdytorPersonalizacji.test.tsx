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
  it.each(['premium', 'flat'] as const)('podgląda styl %s i anuluje bez zapisu do bazy', async (styl) => {
    const przed = await repozytoriumUstawien.wczytaj()
    pokazEdytor()
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: styl } })
    expect(document.documentElement.dataset.styl).toBe(styl)
    expect(screen.getByRole('button', { name: 'Zapisz ustawienia' })).toBeEnabled()
    expect(await repozytoriumUstawien.wczytaj()).toEqual(przed)
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj podgląd' }))
    expect(document.documentElement.dataset.styl).toBe('klasyczny')
    expect(screen.getByRole('combobox', { name: /Styl interfejsu/ })).toHaveValue('klasyczny')
    expect(await repozytoriumUstawien.wczytaj()).toEqual(przed)
    expect(zapisz).not.toHaveBeenCalled()
  })

  it.each(['premium', 'flat'] as const)('zapisuje styl %s, odtwarza po ponownym otwarciu i pozwala wrócić do Klasycznego', async (styl) => {
    const widok = pokazEdytor()
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: styl } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz ustawienia' }))
    await waitFor(() => expect(screen.getByText('Motyw i personalizacja zostały zapisane.')).toBeInTheDocument())
    widok.unmount()
    baza.close()
    await baza.open()
    zapisane = await repozytoriumUstawien.wczytaj()
    pokazEdytor()
    expect(screen.getByRole('combobox', { name: /Styl interfejsu/ })).toHaveValue(styl)
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

  it.each([
    ['klasyczny', 'flat'], ['premium', 'flat'], ['flat', 'premium'], ['flat', 'klasyczny'],
  ] as const)('przełącza %s → %s na żywo i zachowuje poprzednie preferencje', (poprzedni, nastepny) => {
    zapisane = normalizujUstawienia({ wyglad: { personalizacja: { styl: poprzedni, uzyjWlasnejPalety: true, animacje: { profil: 'wlasne', hoverMs: 270 }, komponenty: { kartaCien: 'mocny' } } } })
    const przed = structuredClone(zapisane)
    zastosujUstawieniaInterfejsu(zapisane, false)
    pokazEdytor()
    for (const nazwa of ['Klasyczny', 'Premium', 'Flat']) expect(screen.getByRole('option', { name: nazwa })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: /Styl interfejsu/ }), { target: { value: nastepny } })
    expect(document.documentElement.dataset.styl).toBe(nastepny)
    const ostatniPodglad = podglad.mock.calls.at(-1)![0].wyglad.personalizacja
    expect(ostatniPodglad.paleta).toEqual(przed.wyglad.personalizacja.paleta)
    expect(ostatniPodglad.animacje).toEqual(przed.wyglad.personalizacja.animacje)
    expect(ostatniPodglad.komponenty).toEqual(przed.wyglad.personalizacja.komponenty)
    expect(zapisane).toEqual(przed)
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj podgląd' }))
    expect(document.documentElement.dataset.styl).toBe(poprzedni)
  })

  it('resetuje Flat do domyślnego stylu Klasycznego dopiero po zapisie', async () => {
    zapisane = normalizujUstawienia({ wyglad: { personalizacja: { styl: 'flat' } } })
    zastosujUstawieniaInterfejsu(zapisane, false)
    pokazEdytor()
    fireEvent.click(screen.getByRole('button', { name: 'Resetuj' }))
    expect(document.documentElement.dataset.styl).toBe('klasyczny')
    expect(zapisane.wyglad.personalizacja.styl).toBe('flat')
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz ustawienia' }))
    await waitFor(() => expect(screen.getByText('Motyw i personalizacja zostały zapisane.')).toBeInTheDocument())
    expect((await repozytoriumUstawien.wczytaj()).wyglad.personalizacja.styl).toBe('klasyczny')
  })
})
