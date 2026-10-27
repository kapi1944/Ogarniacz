import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PoleDaty } from './PoleDaty'
import { obsluzWstecz } from '../platform/obslugaWstecz'

afterEach(cleanup)

function renderuj(opcje: { wartosc?: string; wymagane?: boolean; min?: string; max?: string; krok?: number } = {}) {
  const zapis = vi.fn()
  function Formularz() {
    const [wartosc, zmien] = useState(opcje.wartosc ?? '2026-10-27')
    return <form onSubmit={(zdarzenie) => { zdarzenie.preventDefault(); zapis(wartosc) }}>
      <PoleDaty {...opcje} etykieta="Termin" wartosc={wartosc} zmien={zmien} />
      <button>Zapisz</button>
    </form>
  }
  render(<Formularz />)
  const pole = screen.getByLabelText(/^Termin/) as HTMLInputElement
  return { pole, zapis, otworz: () => fireEvent.click(screen.getByRole('button', { name: 'Kalendarz: Termin' })) }
}

it('zachowuje istniejącą datę i wysyła ISO po ręcznej edycji bez przestawiania tekstu', () => {
  const { pole, zapis } = renderuj()
  expect(pole.value).toBe('27.10.2026')
  fireEvent.change(pole, { target: { value: '2.10.' } })
  expect(pole.value).toBe('2.10.')
  expect(pole.checkValidity()).toBe(false)
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).not.toHaveBeenCalled()
  fireEvent.change(pole, { target: { value: '25.10.2026' } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenLastCalledWith('2026-10-25')
  expect(pole.value).toBe('25.10.2026')
})

it.each(['31.04.2026', '29.02.2026', '29.02.1900', '00.10.2026', '27.13.2026', '27.10.', '2026-10-27', '01.01.0000'])('blokuje zapis błędnej daty %s po polsku', (tekst) => {
  const { pole, zapis } = renderuj()
  fireEvent.change(pole, { target: { value: tekst } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(pole.validationMessage).toContain('DD.MM.RRRR')
  expect(screen.getByRole('alert').textContent).toContain('prawidłową datę')
  expect(zapis).not.toHaveBeenCalled()
})

it.each(['29.02.2024', '29.02.2000', '01.01.0001', '31.12.9999', '29.03.2026', '25.10.2026'])('zapisuje datę %s bez konwersji przez UTC', (tekst) => {
  const { pole, zapis } = renderuj()
  fireEvent.change(pole, { target: { value: tekst } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith(tekst.split('.').reverse().join('-'))
})

it('obsługuje pustą datę opcjonalną i wyczyszczenie', () => {
  const { pole, zapis } = renderuj()
  fireEvent.click(screen.getByRole('button', { name: 'Wyczyść datę: Termin' }))
  expect(pole.value).toBe('')
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith('')
})

it('wymaga daty i nie pokazuje przycisku czyszczenia', () => {
  const { pole, zapis } = renderuj({ wartosc: '', wymagane: true })
  expect(screen.queryByRole('button', { name: /Wyczyść/ })).toBeNull()
  fireEvent.click(screen.getByText('Zapisz'))
  expect(pole.validationMessage).toBe('Wpisz datę.')
  expect(zapis).not.toHaveBeenCalled()
})

it('wybiera miesiąc, rok i dzień, zaznacza wartość oraz przywraca fokus', () => {
  const { pole, zapis, otworz } = renderuj()
  otworz()
  expect(screen.getByRole('button', { name: '27.10.2026' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Następny miesiąc' }))
  expect(screen.getByLabelText('Miesiąc')).toHaveProperty('value', '10')
  fireEvent.click(screen.getByRole('button', { name: 'Poprzedni miesiąc' }))
  fireEvent.change(screen.getByLabelText('Miesiąc'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Rok'), { target: { value: '2024' } })
  fireEvent.click(screen.getByRole('button', { name: '29.02.2024' }))
  expect(pole.value).toBe('29.02.2024')
  expect(document.activeElement).toBe(pole)
  expect(screen.queryByRole('group')).toBeNull()
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith('2024-02-29')
})

it('pozwala edytować pole przy otwartym kalendarzu i zamknąć go bez zmiany daty', () => {
  const { pole, otworz } = renderuj()
  otworz()
  fireEvent.change(pole, { target: { value: '28.10.2026' } })
  expect(screen.getByRole('button', { name: '28.10.2026' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.keyDown(pole, { key: 'Escape' })
  expect(screen.queryByRole('group')).toBeNull()
  otworz()
  fireEvent.click(screen.getByText('Zamknij kalendarz'))
  expect(screen.queryByRole('group')).toBeNull()
  otworz()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('group')).toBeNull()
  otworz()
  fireEvent.blur(pole, { relatedTarget: screen.getByText('Zapisz') })
  expect(screen.queryByRole('group')).toBeNull()
  otworz()
  act(() => { obsluzWstecz() })
  expect(screen.queryByRole('group')).toBeNull()
  expect(pole.value).toBe('28.10.2026')
})

it('stosuje granice i odstęp dni w edycji oraz kalendarzu', () => {
  const { pole, zapis, otworz } = renderuj({ min: '2026-10-20', max: '2026-10-30', krok: 2 })
  otworz()
  expect(screen.getByRole('button', { name: '19.10.2026' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: '21.10.2026' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: '31.10.2026' })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: '28.10.2026' })).toHaveProperty('disabled', false)
  for (const tekst of ['19.10.2026', '21.10.2026', '31.10.2026']) {
    fireEvent.change(pole, { target: { value: tekst } })
    fireEvent.click(screen.getByText('Zapisz'))
    expect(pole.checkValidity()).toBe(false)
  }
  expect(zapis).not.toHaveBeenCalled()
})
