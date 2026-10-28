import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PoleLiczbowe } from './PoleLiczbowe'
import { WidokRejestru } from './WidokRejestru'
import { normalizujStarePolaRejestru, wartoscFormularzaPola } from './EdytorPolaRejestru'
import type { OgraniczeniaPolaLiczbowego } from '../domain/liczby'
import type { Pojazd } from '../domain/typy'
import { utworzMetadane } from '../domain/fabryki'
import { pobierzRepozytorium } from '../data/Repozytorium'

afterEach(cleanup)

function renderuj(opcje: OgraniczeniaPolaLiczbowego & { etykieta?: string; wartosc?: string; wymagane?: boolean } = {}) {
  const zapis = vi.fn()
  function Formularz() {
    const [wartosc, zmien] = useState(opcje.wartosc ?? '')
    return <form onSubmit={(zdarzenie) => { zdarzenie.preventDefault(); zapis(wartosc) }}>
      <PoleLiczbowe {...opcje} etykieta={opcje.etykieta ?? 'Liczba'} wartosc={wartosc} zmien={zmien} />
      <button>Zapisz</button>
    </form>
  }
  render(<Formularz />)
  return { pole: screen.getByRole('textbox') as HTMLInputElement, zapis }
}

it.each(['125430,5', '42.75', '82,4', '5', '-12,5', '0'])('pozwala wpisać i zapisać %s bez przestawiania tekstu', (tekst) => {
  const { pole, zapis } = renderuj()
  fireEvent.change(pole, { target: { value: tekst } })
  expect(pole.value).toBe(tekst)
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith(tekst.replace(',', '.'))
})

it.each(['abc', '12a', '1e3', 'NaN', 'Infinity', '12,5,6'])('nie wpuszcza liter i nie zapisuje odrzuconego ciągu %s', (tekst) => {
  const { pole, zapis } = renderuj({ wartosc: '12' })
  fireEvent.change(pole, { target: { value: tekst } })
  expect(pole.value).toBe('12')
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('Dozwolone')
  fireEvent.change(pole, { target: { value: '12,5' } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith('12.5')
})

it.each(['12,', '-', '9007199254740993', '0.1234567890123456789'])('blokuje niepełny lub tracący precyzję zapis %s', (tekst) => {
  const { pole, zapis } = renderuj()
  fireEvent.change(pole, { target: { value: tekst } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(pole.value).toBe(tekst)
  expect(pole.checkValidity()).toBe(false)
  expect(zapis).not.toHaveBeenCalled()
})

it('pilnuje minimum, maksimum i całkowitego kroku oraz dopuszcza granice', () => {
  const { pole, zapis } = renderuj({ min: 0, max: 10, krok: 1 })
  for (const tekst of ['-1', '11', '5,5']) {
    fireEvent.change(pole, { target: { value: tekst } })
    fireEvent.click(screen.getByText('Zapisz'))
  }
  expect(zapis).not.toHaveBeenCalled()
  for (const tekst of ['0', '10']) {
    fireEvent.change(pole, { target: { value: tekst } })
    fireEvent.click(screen.getByText('Zapisz'))
    expect(zapis).toHaveBeenLastCalledWith(tekst)
  }
})

it.each(['km', 'm', 'kg', 'g', 'l', 'ml', 'szt.', '%'])('pokazuje jednostkę %s i nie dubluje jej z etykiety', (jednostka) => {
  const { pole } = renderuj({ jednostka, wartosc: '5' })
  const opis = document.getElementById(pole.getAttribute('aria-describedby')!)
  expect(opis?.textContent).toBe(jednostka)
  cleanup()
  renderuj({ jednostka, etykieta: `Wartość (${jednostka})` })
  expect(screen.queryByText(jednostka)).toBeNull()
})

it('czyści wartość opcjonalną i wymaga liczby bez automatycznego zera', () => {
  const { pole, zapis } = renderuj({ wartosc: '42,75' })
  fireEvent.click(screen.getByLabelText('Wyczyść liczbę: Liczba'))
  expect(pole.value).toBe('')
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith('')
  cleanup()
  const wymagane = renderuj({ wymagane: true })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(wymagane.zapis).not.toHaveBeenCalled()
  expect(wymagane.pole.validationMessage).toBe('Wpisz liczbę.')
})

it('zachowuje domyślny całkowity krok starego number', () => {
  expect(normalizujStarePolaRejestru([{ klucz: 'liczba', etykieta: 'Liczba', typ: 'number' }])[0].krok).toBe(1)
})

it('tworzy własną jednostkę przez istniejące okno właściwości i używa jej w formularzu', async () => {
  const rejestrId = `liczby-${crypto.randomUUID()}`
  render(<WidokRejestru<Pojazd> tytul="Jednostki" opis="Test" etykietaDodawania="Dodaj rekord" dane={[]} repozytorium={pobierzRepozytorium('pojazdy')}
    konfiguracjaWlasciwosci={{ rejestrId, polaSystemowe: [] }} pola={[{ klucz: 'nazwa', etykieta: 'Pojazd', wymagane: true }]}
    zbuduj={(formularz) => ({ ...utworzMetadane(), nazwa: formularz.nazwa })} etykieta={(encja) => encja.nazwa} szczegoly={() => null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj właściwość' }))
  fireEvent.change(screen.getByLabelText('Nazwa'), { target: { value: 'Paliwo' } })
  fireEvent.change(screen.getByLabelText('Typ'), { target: { value: 'liczba' } })
  fireEvent.change(screen.getByLabelText('Jednostka (opcjonalnie)'), { target: { value: 'l' } })
  fireEvent.click(screen.getByRole('button', { name: 'Utwórz' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const definicja = (await pobierzRepozytorium('definicjeWlasnychPolRejestru').lista()).find((pole) => pole.rejestrId === rejestrId)!
  expect(definicja).toMatchObject({ jednostka: 'l', typ: 'liczba' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj rekord' })[0])
  const paliwo = await screen.findByLabelText('Paliwo')
  expect(document.getElementById(paliwo.getAttribute('aria-describedby')!)?.textContent).toBe('l')
  fireEvent.change(screen.getByLabelText(/^Pojazd/), { target: { value: 'Jednostka testowa' } })
  fireEvent.change(paliwo, { target: { value: '42,75' } })
  fireEvent.click(screen.getByText('Zapisz'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect((await pobierzRepozytorium('pojazdy').lista()).find((pojazd) => pojazd.nazwa === 'Jednostka testowa')?.polaWlasne?.[definicja.id]).toBe(42.75)
})

it('zapisuje i odczytuje w IndexedDB stary przebieg oraz własną liczbę z jednostką', async () => {
  const repozytorium = pobierzRepozytorium('pojazdy')
  let rekord: Pojazd = { ...utworzMetadane(), nazwa: 'Auto testowe', przebieg: 125430.5, polaWlasne: { 'custom:masa': 82.4 } }
  await repozytorium.zapisz(rekord)
  function Rejestr() {
    return <WidokRejestru tytul="Liczby" opis="Test" etykietaDodawania="Dodaj" dane={[rekord]} repozytorium={repozytorium}
      pola={[{ klucz: 'przebieg', etykieta: 'Przebieg (km)', typ: 'number', min: 0, krok: 0.1, jednostka: 'km' }]}
      polaRejestru={[{ id: 'custom:masa', zrodlo: 'wlasne', etykieta: 'Masa', typ: 'liczba', min: 0, max: 500, krok: 0.1, jednostka: 'kg' }]}
      zbuduj={(formularz, istniejacy) => ({ ...istniejacy!, przebieg: Number(formularz.przebieg) })} etykieta={(encja) => encja.nazwa} szczegoly={() => null} />
  }
  const { rerender } = render(<Rejestr />)
  fireEvent.click(screen.getByTitle('Edytuj'))
  expect(screen.getByLabelText('Przebieg (km)')).toHaveProperty('value', '125430.5')
  expect(screen.getByLabelText('Masa')).toHaveProperty('value', '82.4')
  fireEvent.change(screen.getByLabelText('Masa'), { target: { value: '501' } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect((await repozytorium.pobierz(rekord.id))?.polaWlasne?.['custom:masa']).toBe(82.4)
  fireEvent.change(screen.getByLabelText('Przebieg (km)'), { target: { value: '125431,5' } })
  fireEvent.change(screen.getByLabelText('Masa'), { target: { value: '83,2' } })
  fireEvent.click(screen.getByText('Zapisz'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  rekord = (await repozytorium.pobierz(rekord.id))!
  expect(rekord).toMatchObject({ przebieg: 125431.5, polaWlasne: { 'custom:masa': 83.2 } })
  rerender(<Rejestr />)
  fireEvent.click(screen.getByTitle('Edytuj'))
  expect(screen.getByLabelText('Przebieg (km)')).toHaveProperty('value', '125431.5')
  expect(screen.getByLabelText('Masa')).toHaveProperty('value', '83.2')
  expect(wartoscFormularzaPola(rekord, { definicja: { id: 'custom:masa', zrodlo: 'wlasne', etykieta: 'Masa', typ: 'liczba', jednostka: 'kg' } }, true)).toBe('83.2 kg')
})
