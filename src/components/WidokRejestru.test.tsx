import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repozytorium } from '../data/Repozytorium'
import type { DefinicjaPolaRejestru } from '../domain/rejestr'
import type { EncjaBazowa } from '../domain/typy'
import { skonwertujWartoscPolaWlasnego } from './EdytorPolaRejestru'
import { WidokRejestru } from './WidokRejestru'

afterEach(cleanup)

it('zapisuje i ponownie odczytuje daty systemowe oraz własne w modalu rejestru', async () => {
  const repozytorium = utworzRepozytorium()
  let rekord: RekordTestowy & { termin: string } = { id: 'data-1', nazwa: 'Daty', termin: '2026-10-25', createdAt: '2026-10-01', updatedAt: '2026-10-01', polaWlasne: { 'custom:data': '2024-02-29' } }
  vi.mocked(repozytorium.zapisz).mockImplementation(async (encja) => { rekord = encja as typeof rekord; return rekord.id })
  function Rejestr() {
    return <WidokRejestru tytul="Daty" opis="Test" etykietaDodawania="Dodaj" dane={[rekord]} repozytorium={repozytorium}
      pola={[{ klucz: 'termin', etykieta: 'Termin', typ: 'date', wymagane: true, min: '2020-01-01', max: '2030-12-31' }]}
      polaRejestru={[{ id: 'custom:data', zrodlo: 'wlasne', etykieta: 'Data własna', typ: 'data' }]}
      zbuduj={(formularz) => ({ ...rekord, termin: formularz.termin })} etykieta={(encja) => encja.nazwa} szczegoly={() => null} />
  }
  const { rerender } = render(<Rejestr />)
  fireEvent.click(screen.getByTitle('Edytuj'))
  expect(screen.getByRole('textbox', { name: /^Termin/ })).toHaveProperty('value', '25.10.2026')
  expect(screen.getByLabelText('Data własna')).toHaveProperty('value', '29.02.2024')
  fireEvent.change(screen.getByRole('textbox', { name: /^Termin/ }), { target: { value: '31.04.2026' } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(repozytorium.zapisz).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: /^Termin/ }), { target: { value: '29.03.2026' } })
  fireEvent.click(screen.getByRole('button', { name: 'Kalendarz: Data własna' }))
  fireEvent.click(screen.getByRole('button', { name: '28.02.2024' }))
  fireEvent.click(screen.getByText('Zapisz'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.objectContaining({ termin: '2026-03-29', polaWlasne: { 'custom:data': '2024-02-28' } }))
  rerender(<Rejestr />)
  fireEvent.click(screen.getByTitle('Edytuj'))
  expect(screen.getByRole('textbox', { name: /^Termin/ })).toHaveProperty('value', '29.03.2026')
  expect(screen.getByLabelText('Data własna')).toHaveProperty('value', '28.02.2024')
})

interface RekordTestowy extends EncjaBazowa {
  nazwa: string
}

function utworzRepozytorium() {
  return { zapisz: vi.fn().mockResolvedValue('rekord-1') } as unknown as Repozytorium<RekordTestowy>
}

function renderujRejestr(opcje: { polaRejestru?: DefinicjaPolaRejestru[]; encja?: RekordTestowy; uzupelnijFormularz?: (element: RekordTestowy) => Record<string, string> } = {}) {
  const repozytorium = utworzRepozytorium()
  render(
    <WidokRejestru
      tytul="Testowy rejestr"
      opis="Test"
      etykietaDodawania="Dodaj rekord"
      dane={opcje.encja ? [opcje.encja] : []}
      repozytorium={repozytorium}
      pola={[{ klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true }]}
      polaRejestru={opcje.polaRejestru}
      zbuduj={(formularz, istniejacy) => ({
        ...(istniejacy ?? { id: 'rekord-1', createdAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z' }),
        nazwa: formularz.nazwa,
      })}
      uzupelnijFormularz={opcje.uzupelnijFormularz}
      etykieta={(rekord) => rekord.nazwa}
      szczegoly={() => null}
    />,
  )
  return repozytorium
}

describe('WidokRejestru z kontraktem Rejestru 2.0', () => {
  it('zachowuje działanie dotychczasowej definicji pola', async () => {
    const repozytorium = renderujRejestr()
    fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj rekord' })[0])
    fireEvent.change(screen.getByLabelText(/Nazwa/), { target: { value: 'Stary rekord' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.objectContaining({ nazwa: 'Stary rekord' })))
  })

  it('zachowuje uzupełnienia starego formularza po zmianie kluczy technicznych', async () => {
    const encja: RekordTestowy = { id: 'rekord-1', createdAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z', nazwa: 'Stara wartość' }
    const repozytorium = renderujRejestr({ encja, uzupelnijFormularz: () => ({ nazwa: 'Uzupełniona wartość' }) })
    fireEvent.click(screen.getByTitle('Edytuj'))
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.objectContaining({ nazwa: 'Uzupełniona wartość' })))
  })

  it('zapisuje tekst własnego pola pod jego trwałym ID', async () => {
    const repozytorium = renderujRejestr({ polaRejestru: [{ id: 'custom:nazwa_producenta', zrodlo: 'wlasne', etykieta: 'Producent', typ: 'tekst' }] })
    fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj rekord' })[0])
    fireEvent.change(screen.getByLabelText(/Nazwa/), { target: { value: 'Rekord' } })
    fireEvent.change(screen.getByLabelText('Producent'), { target: { value: 'Ogarniacz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.objectContaining({ polaWlasne: { 'custom:nazwa_producenta': 'Ogarniacz' } })))
  })

  it('konwertuje liczbę, kwotę, checkbox i multiselect do właściwych wartości', () => {
    expect(skonwertujWartoscPolaWlasnego({ id: 'custom:liczba', zrodlo: 'wlasne', etykieta: 'Liczba', typ: 'liczba' }, '12.5')).toBe(12.5)
    expect(skonwertujWartoscPolaWlasnego({ id: 'custom:kwota', zrodlo: 'wlasne', etykieta: 'Kwota', typ: 'kwota' }, '34.20')).toBe(34.2)
    expect(skonwertujWartoscPolaWlasnego({ id: 'custom:tak', zrodlo: 'wlasne', etykieta: 'Tak', typ: 'checkbox' }, 'true')).toBe(true)
    expect(skonwertujWartoscPolaWlasnego({ id: 'custom:tagi', zrodlo: 'wlasne', etykieta: 'Tagi', typ: 'multiselect' }, 'dom,pilne')).toEqual(['dom', 'pilne'])
  })

  it('nie zmienia lokalizacji wartości po zmianie etykiety definicji', async () => {
    const encja: RekordTestowy = { id: 'rekord-1', createdAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z', nazwa: 'Rekord', polaWlasne: { 'custom:nazwa_producenta': 'Ogarniacz' } }
    const repozytorium = renderujRejestr({ encja, polaRejestru: [{ id: 'custom:nazwa_producenta', zrodlo: 'wlasne', etykieta: 'Marka', typ: 'tekst' }] })
    fireEvent.click(screen.getByTitle('Edytuj'))
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.objectContaining({ polaWlasne: { 'custom:nazwa_producenta': 'Ogarniacz' } })))
  })

  it('nie zapisuje pola systemowego do polaWlasne', async () => {
    const repozytorium = renderujRejestr({ polaRejestru: [{ id: 'system:nazwa', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'nazwa', etykieta: 'Nazwa systemowa', typ: 'tekst' }] })
    fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj rekord' })[0])
    fireEvent.change(screen.getAllByLabelText(/Nazwa/)[0], { target: { value: 'Rekord' } })
    fireEvent.change(screen.getByLabelText('Nazwa systemowa'), { target: { value: 'Systemowa wartość' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.objectContaining({ nazwa: 'Systemowa wartość' })))
    expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.not.objectContaining({ polaWlasne: expect.anything() }))
  })

  it('traktuje semantykę wyłącznie jako metadane', async () => {
    const repozytorium = renderujRejestr({ polaRejestru: [{ id: 'custom:cena', zrodlo: 'wlasne', etykieta: 'Cena', typ: 'kwota', rolaSemantyczna: 'semantyka:kwota' }] })
    fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj rekord' })[0])
    fireEvent.change(screen.getByLabelText(/Nazwa/), { target: { value: 'Rekord' } })
    fireEvent.change(screen.getByLabelText('Cena'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }))

    await waitFor(() => expect(repozytorium.zapisz).toHaveBeenCalledTimes(1))
    expect(repozytorium.zapisz).toHaveBeenCalledWith(expect.objectContaining({ polaWlasne: { 'custom:cena': 10 } }))
  })
})
