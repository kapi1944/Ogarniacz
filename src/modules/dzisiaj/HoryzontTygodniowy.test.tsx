import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { HoryzontTygodniowy } from './HoryzontTygodniowy'
import { datyZakresu, zakresHoryzontu } from './logikaHoryzontu'
import { utworzDaneDnia } from '../pulpit/logikaDanychDnia'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'

const dzisiaj = '2026-10-09'
const dni = datyZakresu(zakresHoryzontu(dzisiaj)).map((data) => utworzDaneDnia(data, [{ id: 'zadanie', typ: 'zadanie', tytul: 'Zadanie', data: dzisiaj, status: 'otwarty', createdAt: dzisiaj, updatedAt: dzisiaj }], DOMYSLNE_USTAWIENIA.harmonogram, [], []))
afterEach(cleanup)

it('oznacza dzisiaj, pokazuje licznik, zakres pracy i stan pusty', () => {
  render(<HoryzontTygodniowy dzisiaj={dzisiaj} dni={dni} />)
  const dzien = screen.getByRole('button', { name: /piątek, 9 października 2026/ })
  expect(dzien).toHaveAttribute('aria-current', 'date')
  expect(dzien).toHaveAttribute('aria-pressed', 'true')
  expect(within(dzien).getByText('DZIŚ')).toBeInTheDocument()
  expect(within(dzien).getByText('Działania: 1')).toBeInTheDocument()
  expect(within(dzien).getByText('Praca 07:45–16:00')).toBeInTheDocument()
  const niedziela = screen.getByRole('button', { name: /niedziela, 11 października 2026/ })
  expect(within(niedziela).getByText('Nic nie zaplanowano')).toBeInTheDocument()
  expect(within(niedziela).queryByText(/Praca/)).not.toBeInTheDocument()
})
it('rozwija trzy pełne tygodnie i pozwala wybrać dzień bez otwierania panelu focus', () => {
  render(<HoryzontTygodniowy dzisiaj={dzisiaj} dni={dni} />)
  expect(screen.getAllByRole('button', { name: /^Wybierz dzień/ })).toHaveLength(7)
  const kontrolka = screen.getByRole('button', { name: 'Pokaż kolejne 3 tygodnie' })
  fireEvent.click(kontrolka)
  expect(kontrolka).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getAllByRole('button', { name: /^Wybierz dzień/ })).toHaveLength(28)
  const dzien = screen.getByRole('button', { name: /niedziela, 1 listopada 2026/ })
  fireEvent.click(dzien)
  expect(dzien).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(kontrolka)
  expect(screen.getAllByRole('button', { name: /^Wybierz dzień/ })).toHaveLength(7)
})
it('odróżnia ładowanie i niepełne dane od pustego dnia', () => {
  render(<HoryzontTygodniowy dzisiaj={dzisiaj} dni={dni} ladowanie blad />)
  expect(screen.getAllByText('Ładowanie…')).toHaveLength(7)
  expect(screen.getByText(/Liczniki mogą być niepełne/)).toBeInTheDocument()
  expect(screen.queryByText('Nic nie zaplanowano')).not.toBeInTheDocument()
})
