import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PoleKwoty } from './PoleKwoty'

afterEach(cleanup)

function renderuj(opcje: { wymagane?: boolean; min?: number; max?: number; krok?: number; modelLiczbowy?: boolean } = {}) {
  const zapis = vi.fn()
  function Formularz() {
    const [kwota, zmien] = useState('125.50')
    const [waluta, zmienWalute] = useState('PLN')
    return <form onSubmit={(zdarzenie) => { zdarzenie.preventDefault(); zapis({ kwota, waluta }) }}>
      <PoleKwoty {...opcje} etykieta="Kwota" wartosc={kwota} zmien={zmien} waluta={waluta} zmienWalute={zmienWalute} />
      <button>Zapisz</button>
    </form>
  }
  render(<Formularz />)
  return { pole: screen.getByRole('textbox', { name: /^Kwota/ }) as HTMLInputElement, zapis }
}

it.each(['PLN', 'EUR', 'USD'])('przyjmuje oba separatory i zachowuje %s', (waluta) => {
  const { pole, zapis } = renderuj()
  fireEvent.change(screen.getByLabelText('Waluta: Kwota'), { target: { value: waluta } })
  for (const tekst of ['125,50', '125.50']) {
    fireEvent.change(pole, { target: { value: tekst } })
    expect(pole.value).toBe(tekst)
    fireEvent.click(screen.getByText('Zapisz'))
    expect(zapis).toHaveBeenLastCalledWith({ kwota: '125.50', waluta })
  }
})

it.each(['NaN', 'Infinity', '12,345', '12,', 'abc', '9007199254740993.01'])('blokuje niedozwoloną kwotę %s', (tekst) => {
  const { pole, zapis } = renderuj({ modelLiczbowy: true })
  fireEvent.change(pole, { target: { value: tekst } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).not.toHaveBeenCalled()
  expect(pole.value).toBe(tekst)
  expect(screen.getByRole('alert')).toBeTruthy()
})

it('zapisuje zero, czyści wartość opcjonalną i pilnuje wymagalności', () => {
  const { pole, zapis } = renderuj()
  fireEvent.change(pole, { target: { value: '0' } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenLastCalledWith({ kwota: '0.00', waluta: 'PLN' })
  fireEvent.click(screen.getByLabelText('Wyczyść kwotę: Kwota'))
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenLastCalledWith({ kwota: '', waluta: 'PLN' })
  cleanup()
  const wymagane = renderuj({ wymagane: true })
  fireEvent.change(wymagane.pole, { target: { value: '' } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(wymagane.zapis).not.toHaveBeenCalled()
  expect(wymagane.pole.validationMessage).toBe('Wpisz kwotę.')
})

it('sprawdza minimum, maksimum i krok w groszach', () => {
  const { pole, zapis } = renderuj({ min: 0.05, max: 100, krok: 0.1 })
  for (const tekst of ['0', '100.05', '1.01']) {
    fireEvent.change(pole, { target: { value: tekst } })
    fireEvent.click(screen.getByText('Zapisz'))
  }
  expect(zapis).not.toHaveBeenCalled()
  fireEvent.change(pole, { target: { value: '1,15' } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith({ kwota: '1.15', waluta: 'PLN' })
})
