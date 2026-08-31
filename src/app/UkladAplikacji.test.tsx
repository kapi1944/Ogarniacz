import { cleanup as wyczysc, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach as poKazdym, describe, expect, it, vi } from 'vitest'
import type { NazwaModulu } from '../domain/typy'
import { DolnaNawigacjaMobilna } from './UkladAplikacji'

const wszystkieUprawnienia = () => true

poKazdym(wyczysc)

function renderujNawigacje(
  otworzSzybkieDodawanie = vi.fn(),
  moze: (modul: NazwaModulu) => boolean = wszystkieUprawnienia,
) {
  render(
    <MemoryRouter>
      <DolnaNawigacjaMobilna otworzSzybkieDodawanie={otworzSzybkieDodawanie} moze={moze} />
    </MemoryRouter>,
  )
  return { otworzSzybkieDodawanie }
}

describe('dolna nawigacja mobilna', () => {
  it('pokazuje pięć głównych akcji mobilnych', () => {
    renderujNawigacje()

    const nawigacja = screen.getByRole('navigation', { name: 'Dolna nawigacja' })
    expect(nawigacja).toHaveTextContent('Pulpit')
    expect(nawigacja).toHaveTextContent('Zadania')
    expect(nawigacja).toHaveTextContent('Dodaj')
    expect(nawigacja).toHaveTextContent('Planer')
    expect(nawigacja).toHaveTextContent('Więcej')
  })

  it('centralnym plusem otwiera istniejący globalny Quick Add', () => {
    const { otworzSzybkieDodawanie } = renderujNawigacje()

    fireEvent.click(screen.getByRole('button', { name: 'Szybko dodaj' }))

    expect(otworzSzybkieDodawanie).toHaveBeenCalledOnce()
  })

  it('Więcej pokazuje pozostałe moduły zgodnie z uprawnieniami', () => {
    renderujNawigacje(vi.fn(), (modul) => modul !== 'finanse')

    fireEvent.click(screen.getByRole('button', { name: 'Więcej' }))

    expect(screen.getByRole('dialog', { name: 'Więcej modułów' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skrzynka' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Wydatki i budżet' })).not.toBeInTheDocument()
  })
})
