import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PoleCzasu } from './PoleCzasu'
import { WidokRejestru } from './WidokRejestru'
import { obsluzWstecz } from '../platform/obslugaWstecz'
import type { Repozytorium } from '../data/Repozytorium'

afterEach(cleanup)

function renderuj(opcje: { wartosc?: string; wymagane?: boolean; min?: string; max?: string; krok?: number } = {}) {
  const zapis = vi.fn()
  function Formularz() {
    const [wartosc, zmien] = useState(opcje.wartosc ?? '08:30')
    return <form onSubmit={(zdarzenie) => { zdarzenie.preventDefault(); zapis(wartosc) }}>
      <PoleCzasu {...opcje} etykieta="Godzina" wartosc={wartosc} zmien={zmien} />
      <button>Zapisz</button>
    </form>
  }
  render(<Formularz />)
  return { pole: screen.getByRole('textbox', { name: /^Godzina/ }) as HTMLInputElement, zapis,
    otworz: () => fireEvent.click(screen.getByRole('button', { name: 'Zegar: Godzina' })) }
}

it.each(['08:30', '00:00', '23:59'])('zapisuje lokalną godzinę %s bez zmiany reprezentacji', (wartosc) => {
  const { pole, zapis } = renderuj()
  fireEvent.change(pole, { target: { value: wartosc } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith(wartosc)
  expect(pole.value).toBe(wartosc)
})

it.each(['24:00', '12:60', '8:30', '12:', '12', '12:30:01'])('blokuje błędny lub niepełny zapis %s bez cichej normalizacji', (wartosc) => {
  const { pole, zapis } = renderuj()
  fireEvent.change(pole, { target: { value: wartosc } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).not.toHaveBeenCalled()
  expect(pole.value).toBe(wartosc)
  expect(screen.getByRole('alert').textContent).toContain('HH:mm')
})

it('wybiera 14:45, wyróżnia wybór i pozwala go poprawić w otwartym panelu', () => {
  const { pole, zapis, otworz } = renderuj()
  otworz()
  fireEvent.change(screen.getByLabelText('Godziny'), { target: { value: '14' } })
  fireEvent.change(screen.getByLabelText('Minuty'), { target: { value: '45' } })
  expect(screen.getByLabelText('Godziny').querySelector('option:checked')?.textContent).toBe('14')
  expect(screen.getByLabelText('Minuty').querySelector('option:checked')?.textContent).toBe('45')
  expect(pole.value).toBe('14:45')
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith('14:45')
  fireEvent.change(pole, { target: { value: '15:46' } })
  expect(screen.getByLabelText('Godziny')).toHaveProperty('value', '15')
  expect(screen.getByRole('group')).toBeTruthy()
})

it('obsługuje czyszczenie, wymagalność, granice i krok sekundowy starego time', () => {
  const { pole, zapis, otworz } = renderuj({ min: '08:05', max: '18:00', krok: 900 })
  otworz()
  expect(screen.getByLabelText('Minuty').querySelector('option[value="06"]')).toHaveProperty('disabled', true)
  for (const wartosc of ['08:00', '08:06', '18:05']) {
    fireEvent.change(pole, { target: { value: wartosc } })
    fireEvent.click(screen.getByText('Zapisz'))
  }
  expect(zapis).not.toHaveBeenCalled()
  fireEvent.change(pole, { target: { value: '08:20' } })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenCalledWith('08:20')
  fireEvent.click(screen.getByRole('button', { name: /Wyczyść godzinę/ }))
  fireEvent.click(screen.getByText('Zapisz'))
  expect(zapis).toHaveBeenLastCalledWith('')
  cleanup()
  const wymagane = renderuj({ wartosc: '', wymagane: true })
  fireEvent.click(screen.getByText('Zapisz'))
  expect(wymagane.pole.validationMessage).toBe('Wpisz godzinę.')
  expect(wymagane.zapis).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /Wyczyść/ })).toBeNull()
})

it('zamyka panel przez Escape, Wstecz, kliknięcie poza nim i wyjście klawiaturą', () => {
  const { pole, otworz } = renderuj()
  otworz()
  fireEvent.keyDown(screen.getByLabelText('Minuty'), { key: 'Escape' })
  expect(screen.queryByRole('group')).toBeNull()
  expect(document.activeElement).toBe(pole)
  otworz()
  act(() => { expect(obsluzWstecz()).toBe(true) })
  expect(screen.queryByRole('group')).toBeNull()
  otworz()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('group')).toBeNull()
  otworz()
  fireEvent.blur(pole, { relatedTarget: screen.getByText('Zapisz') })
  expect(screen.queryByRole('group')).toBeNull()
  expect(pole.value).toBe('08:30')
})

it('edytuje stary time i własny czas w modalu, zapisuje i ponownie odczytuje dane', async () => {
  let rekord = { id: 'czas-1', createdAt: '2026-10-28', updatedAt: '2026-10-28', godzina: '08:30', polaWlasne: { 'custom:czas': '23:59' } }
  const zapisz = vi.fn(async (encja) => { rekord = encja; return encja.id })
  function Rejestr() {
    return <WidokRejestru tytul="Czasy" opis="Test" etykietaDodawania="Dodaj" dane={[rekord]} repozytorium={{ zapisz } as unknown as Repozytorium<typeof rekord>}
      pola={[{ klucz: 'godzina', etykieta: 'Godzina systemowa', typ: 'time', wymagane: true }]}
      polaRejestru={[{ id: 'custom:czas', zrodlo: 'wlasne', etykieta: 'Czas własny', typ: 'czas' }]}
      zbuduj={(formularz) => ({ ...rekord, godzina: formularz.godzina })} etykieta={() => 'Rekord'} szczegoly={() => null} />
  }
  const { rerender } = render(<Rejestr />)
  fireEvent.click(screen.getByTitle('Edytuj'))
  expect(screen.getByLabelText('Czas własny')).toHaveProperty('value', '23:59')
  fireEvent.click(screen.getByRole('button', { name: 'Zegar: Godzina systemowa' }))
  act(() => { obsluzWstecz() })
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: /^Godzina systemowa/ }), { target: { value: '14:45' } })
  fireEvent.click(screen.getByText('Zapisz'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(rekord.godzina).toBe('14:45')
  expect(rekord.polaWlasne['custom:czas']).toBe('23:59')
  rerender(<Rejestr />)
  fireEvent.click(screen.getByTitle('Edytuj'))
  expect(screen.getByRole('textbox', { name: /^Godzina systemowa/ })).toHaveProperty('value', '14:45')
})
