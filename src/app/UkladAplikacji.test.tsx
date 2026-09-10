import { act, cleanup as wyczysc, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach as poKazdym, describe, expect, it, vi } from 'vitest'
import type { NazwaModulu } from '../domain/typy'
import { obsluzWstecz } from '../platform/obslugaWstecz'
import { DolnaNawigacjaMobilna } from './UkladAplikacji'

const wszystkieUprawnienia = () => true

poKazdym(wyczysc)

function renderujNawigacje(
  otworzSzybkieDodawanie = vi.fn(),
  moze: (modul: NazwaModulu) => boolean = wszystkieUprawnienia,
) {
  const wynik = render(
    <MemoryRouter>
      <DolnaNawigacjaMobilna otworzSzybkieDodawanie={otworzSzybkieDodawanie} moze={moze} />
    </MemoryRouter>,
  )
  return { otworzSzybkieDodawanie, kontener: wynik.container }
}

describe('dolna nawigacja mobilna', () => {
  it('pokazuje pięć głównych akcji mobilnych', () => {
    renderujNawigacje()

    const nawigacja = screen.getByRole('navigation', { name: 'Dolna nawigacja' })
    expect(nawigacja).toHaveTextContent('Pulpit')
    expect(nawigacja).toHaveTextContent('Dzisiaj')
    expect(nawigacja).toHaveTextContent('Dodaj')
    expect(nawigacja).toHaveTextContent('Echo')
    expect(nawigacja).toHaveTextContent('Więcej')
  })

  it('centralnym plusem otwiera istniejący globalny Quick Add', () => {
    const { otworzSzybkieDodawanie } = renderujNawigacje()

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj nowy element' }))

    expect(otworzSzybkieDodawanie).toHaveBeenCalledOnce()
  })

  it('Więcej pokazuje pozostałe moduły zgodnie z uprawnieniami', () => {
    renderujNawigacje(vi.fn(), (modul) => modul !== 'finanse')

    fireEvent.click(screen.getByRole('button', { name: 'Więcej' }))

    expect(screen.getByRole('dialog', { name: 'Więcej modułów' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Planer dnia' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Samochód' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Wydatki i budżet' })).not.toBeInTheDocument()
  })

  it('filtruje moduły i nie zamyka drawera po przypadkowym dotknięciu tła', () => {
    const { kontener } = renderujNawigacje()
    fireEvent.click(screen.getByRole('button', { name: 'Więcej' }))

    fireEvent.change(screen.getByRole('searchbox', { name: 'Znajdź moduł' }), { target: { value: 'samochód' } })
    expect(screen.getByRole('link', { name: 'Samochód' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Zadania' })).not.toBeInTheDocument()

    fireEvent.click(kontener.querySelector('.mobilny-drawer-tlo')!)
    expect(screen.getByRole('dialog', { name: 'Więcej modułów' })).toBeInTheDocument()
  })

  it('Android Back najpierw zamyka drawer Więcej', () => {
    renderujNawigacje()
    fireEvent.click(screen.getByRole('button', { name: 'Więcej' }))

    act(() => expect(obsluzWstecz()).toBe(true))

    expect(screen.queryByRole('dialog', { name: 'Więcej modułów' })).not.toBeInTheDocument()
  })
})
