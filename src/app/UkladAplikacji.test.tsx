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
    expect(screen.getByRole('link', { name: 'Poczekalnia' })).toBeInTheDocument()
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
    const przyciskWiecej = screen.getByRole('button', { name: 'Więcej' })
    fireEvent.click(przyciskWiecej)

    act(() => expect(obsluzWstecz()).toBe(true))

    expect(screen.queryByRole('dialog', { name: 'Więcej modułów' })).not.toBeInTheDocument()
    expect(przyciskWiecej).toHaveFocus()
  })

  it('otwiera panel bez fokusu wyszukiwarki także po ponownym otwarciu', () => {
    renderujNawigacje()
    const przyciskWiecej = screen.getByRole('button', { name: 'Więcej' })
    fireEvent.click(przyciskWiecej)
    expect(screen.getByRole('button', { name: 'Zamknij listę modułów' })).toHaveFocus()
    const wyszukiwarka = screen.getByRole('searchbox', { name: 'Znajdź moduł' })
    expect(wyszukiwarka).not.toHaveFocus()

    // jsdom nie wykonuje domyślnego przeniesienia fokusu po kliknięciu.
    fireEvent.click(wyszukiwarka)
    wyszukiwarka.focus()
    expect(wyszukiwarka).toHaveFocus()
    fireEvent.change(wyszukiwarka, { target: { value: 'sAmOcHóD' } })
    expect(screen.getByRole('link', { name: 'Samochód' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Zadania' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij listę modułów' }))
    expect(przyciskWiecej).toHaveFocus()
    fireEvent.click(przyciskWiecej)
    expect(screen.getByRole('button', { name: 'Zamknij listę modułów' })).toHaveFocus()
    expect(screen.getByRole('searchbox', { name: 'Znajdź moduł' })).toHaveValue('')
    expect(screen.getByRole('link', { name: 'Zadania' })).toBeInTheDocument()
  })

  it('zawija Tab wewnątrz panelu i przywraca fokus po Escape oraz wyborze modułu', () => {
    renderujNawigacje()
    const przyciskWiecej = screen.getByRole('button', { name: 'Więcej' })
    fireEvent.click(przyciskWiecej)
    const zamkniecie = screen.getByRole('button', { name: 'Zamknij listę modułów' })
    const ostatniModul = screen.getByRole('link', { name: 'Ustawienia' })
    fireEvent.keyDown(zamkniecie, { key: 'Tab', shiftKey: true })
    expect(ostatniModul).toHaveFocus()
    fireEvent.keyDown(ostatniModul, { key: 'Tab' })
    expect(zamkniecie).toHaveFocus()

    const wyszukiwarka = screen.getByRole('searchbox', { name: 'Znajdź moduł' })
    wyszukiwarka.focus()
    expect(fireEvent.keyDown(wyszukiwarka, { key: 'Tab' })).toBe(true)
    fireEvent.keyDown(wyszukiwarka, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(przyciskWiecej).toHaveFocus()

    fireEvent.click(przyciskWiecej)
    fireEvent.click(screen.getByRole('link', { name: 'Samochód' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(przyciskWiecej).toHaveFocus()
  })

  it('dopasowuje panel do zmiany widocznego obszaru i sprząta obsługę po zamknięciu', () => {
    const widok = Object.assign(new EventTarget(), { height: 500, offsetTop: 0 })
    const odpinanie = vi.spyOn(widok, 'removeEventListener')
    vi.stubGlobal('visualViewport', widok)
    try {
      renderujNawigacje()
      fireEvent.click(screen.getByRole('button', { name: 'Więcej' }))
      const panel = screen.getByRole('dialog')
      expect(panel.style.getPropertyValue('--wysokosc-widoku-modulow')).toBe('500px')
      widok.height = 280
      widok.offsetTop = 20
      widok.dispatchEvent(new Event('resize'))
      expect(panel.style.getPropertyValue('--wysokosc-widoku-modulow')).toBe('280px')
      expect(panel.style.getPropertyValue('--dol-widoku-modulow')).toBe(`${window.innerHeight - 300}px`)
      expect(screen.getByRole('button', { name: 'Zamknij listę modułów' })).toHaveFocus()

      widok.offsetTop = 40
      widok.dispatchEvent(new Event('scroll'))
      expect(panel.style.getPropertyValue('--dol-widoku-modulow')).toBe(`${window.innerHeight - 320}px`)
      fireEvent.click(screen.getByRole('button', { name: 'Zamknij listę modułów' }))
      expect(odpinanie).toHaveBeenCalledWith('resize', expect.any(Function))
      expect(odpinanie).toHaveBeenCalledWith('scroll', expect.any(Function))
    } finally {
      vi.unstubAllGlobals()
      odpinanie.mockRestore()
    }
  })
})
