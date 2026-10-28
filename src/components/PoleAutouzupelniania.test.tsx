import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PoleAutouzupelniania } from './PoleAutouzupelniania'
import { obsluzWstecz } from '../platform/obslugaWstecz'

afterEach(cleanup)

function renderuj(wartoscPoczatkowa = '', propozycje = ['Škoda', 'Toyota', 'Volkswagen']) {
  const zapisz = vi.fn()
  function Formularz() {
    const [wartosc, zmien] = useState(wartoscPoczatkowa)
    return <form onSubmit={(zdarzenie) => { zdarzenie.preventDefault(); zapisz(wartosc) }}>
      <PoleAutouzupelniania etykieta="Marka" wartosc={wartosc} zmien={zmien} propozycje={propozycje} opis="Możesz wpisać własną nazwę." />
      <button>Zapisz</button>
    </form>
  }
  render(<Formularz />)
  return { pole: screen.getByRole('combobox', { name: 'Marka' }) as HTMLInputElement, zapisz }
}

it('filtruje bez zmiany wpisanej wartości, wybiera i pozwala dalej edytować', () => {
  const { pole } = renderuj()
  fireEvent.change(pole, { target: { value: '  skODA  ' } })
  expect(pole.value).toBe('  skODA  ')
  expect(screen.getAllByRole('option').map((opcja) => opcja.textContent)).toEqual(['Škoda'])
  fireEvent.click(screen.getByRole('option', { name: 'Škoda' }))
  expect(pole.value).toBe('Škoda')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(document.activeElement).toBe(pole)
  fireEvent.change(pole, { target: { value: 'Škoda własna' } })
  expect(pole.value).toBe('Škoda własna')
  expect(screen.getByRole('status').textContent).toContain('własną wartość')
})

it('obsługuje strzałki, zawijanie, Enter i atrybuty aktywnej opcji bez wysłania formularza', () => {
  const { pole, zapisz } = renderuj()
  act(() => pole.focus())
  expect(pole.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id)
  fireEvent.keyDown(pole, { key: 'ArrowUp' })
  expect(screen.getByRole('option', { name: 'Volkswagen' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(pole, { key: 'ArrowDown' })
  expect(document.getElementById(pole.getAttribute('aria-activedescendant')!)?.textContent).toBe('Škoda')
  fireEvent.keyDown(pole, { key: 'ArrowDown' })
  fireEvent.keyDown(pole, { key: 'Enter' })
  expect(pole.value).toBe('Toyota')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(pole.getAttribute('aria-expanded')).toBe('false')
  expect(pole.hasAttribute('aria-activedescendant')).toBe(false)
  expect(zapisz).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapisz).toHaveBeenCalledWith('Toyota')
})

it('zachowuje ręczną niestandardową wartość oraz nie wybiera samoczynnie pierwszej sugestii', () => {
  const { pole, zapisz } = renderuj('Własna marka')
  act(() => pole.focus())
  fireEvent.keyDown(pole, { key: 'Enter' })
  expect(pole.value).toBe('Własna marka')
  expect(zapisz).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapisz).toHaveBeenCalledWith('Własna marka')
})

it('wybiera przez zdarzenia wskaźnika dotykowego i zamyka panel po wyborze', () => {
  const { pole } = renderuj()
  fireEvent.focus(pole)
  const opcja = screen.getByRole('option', { name: 'Toyota' })
  fireEvent.pointerDown(opcja, { pointerType: 'touch' })
  fireEvent.pointerUp(opcja, { pointerType: 'touch' })
  fireEvent.click(opcja)
  expect(pole.value).toBe('Toyota')
  expect(screen.queryByRole('listbox')).toBeNull()
})

it('zamyka Escape, Wstecz, kliknięciem poza polem i przejściem Tab poza komponent', () => {
  const { pole } = renderuj('Toyota')
  fireEvent.focus(pole)
  const nasluch = vi.fn()
  document.addEventListener('keydown', nasluch)
  fireEvent.keyDown(pole, { key: 'Escape' })
  expect(nasluch).not.toHaveBeenCalled()
  document.removeEventListener('keydown', nasluch)
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.keyDown(pole, { key: 'ArrowDown' })
  act(() => { expect(obsluzWstecz()).toBe(true) })
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.click(screen.getByLabelText('Pokaż podpowiedzi: Marka'))
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.keyDown(pole, { key: 'ArrowDown' })
  fireEvent.blur(pole, { relatedTarget: screen.getByText('Zapisz') })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(pole.value).toBe('Toyota')
})

it('po zmianie zależnych propozycji nie wybiera starego aktywnego modelu', () => {
  const zmien = vi.fn()
  const { rerender } = render(<PoleAutouzupelniania etykieta="Model" wartosc="Corolla" zmien={zmien} propozycje={['Corolla', 'Yaris']} />)
  const pole = screen.getByRole('combobox')
  fireEvent.focus(pole)
  fireEvent.keyDown(pole, { key: 'ArrowDown' })
  rerender(<PoleAutouzupelniania etykieta="Model" wartosc="Corolla" zmien={zmien} propozycje={['Fabia', 'Octavia']} />)
  expect(screen.getAllByRole('option').map((opcja) => opcja.textContent)).toEqual(['Fabia', 'Octavia'])
  expect(pole.hasAttribute('aria-activedescendant')).toBe(false)
  fireEvent.keyDown(pole, { key: 'Enter' })
  expect(zmien).not.toHaveBeenCalled()
  expect(pole).toHaveProperty('value', 'Corolla')
})

it('obsługuje pusty katalog i Enter podczas składania tekstu', () => {
  const { pole } = renderuj('Niestandardowa', [])
  fireEvent.focus(pole)
  fireEvent.keyDown(pole, { key: 'ArrowDown' })
  expect(pole.hasAttribute('aria-activedescendant')).toBe(false)
  fireEvent.keyDown(pole, { key: 'Enter', isComposing: true })
  expect(screen.getByRole('status')).toBeTruthy()
  expect(pole.value).toBe('Niestandardowa')
})
