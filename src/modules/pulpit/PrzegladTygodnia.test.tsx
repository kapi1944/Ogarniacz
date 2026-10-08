import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PrzegladTygodnia } from './PrzegladTygodnia'
import { obsluzWstecz } from '../../platform/obslugaWstecz'

vi.mock('./useElementyPlanuDnia', () => ({
  useElementyPlanuDnia: () => ({ elementy: [
    { id: 'wizyta', typ: 'wizyta', tytul: 'Dentysta', data: '2026-10-08', godzina: '12:00', status: 'otwarty' },
    { id: 'zadanie', typ: 'zadanie', tytul: 'Zrobione', data: '2026-10-08', status: 'wykonany' },
  ], blad: false }),
}))
vi.mock('./PlanWybranegoDnia', () => ({ PlanWybranegoDnia: ({ data }: { data: string }) => <p>Plan daty {data}</p> }))

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false } })
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal
  delete (HTMLDialogElement.prototype as { close?: unknown }).close
})

it('pokazuje tydzień od poniedziałku, liczy aktywne działania i rozwija dokładnie trzy tygodnie', () => {
  render(<PrzegladTygodnia dzisiaj="2026-10-08" />)
  expect(screen.getAllByRole('button', { name: /^Otwórz dzień:/ })).toHaveLength(7)
  expect(screen.getAllByRole('button', { name: /^Otwórz dzień:/ })[0]).toHaveAccessibleName('Otwórz dzień: poniedziałek, 5 października 2026')
  const dzisiaj = screen.getByRole('button', { name: /czwartek, 8 października 2026/ })
  expect(within(dzisiaj).getByText('DZIŚ')).toBeInTheDocument()
  expect(within(dzisiaj).getByText('Działania: 1')).toBeInTheDocument()
  expect(within(dzisiaj).getByText('12:00 · Dentysta')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Pokaż kolejne 3 tygodnie'))
  expect(screen.getAllByRole('button', { name: /^Otwórz dzień:/ })).toHaveLength(28)
  fireEvent.click(screen.getByText('Zwiń kolejne 3 tygodnie'))
  expect(screen.getAllByRole('button', { name: /^Otwórz dzień:/ })).toHaveLength(7)
})

it.each(['przycisk', 'Escape', 'tło', 'Wstecz'])('wybiera datę i zamyka skupienie przez %s bez zoomu przy ograniczonym ruchu', (sposob) => {
  render(<PrzegladTygodnia dzisiaj="2026-10-08" />)
  const kafelek = screen.getByRole('button', { name: /piątek, 9 października 2026/ })
  fireEvent.click(kafelek)
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveAccessibleName('piątek, 9 października 2026')
  expect(within(dialog).getByText('Plan daty 2026-10-09')).toBeInTheDocument()
  expect(document.body.style.overflow).toBe('hidden')
  if (sposob === 'przycisk') fireEvent.click(screen.getByRole('button', { name: 'Zamknij dzień' }))
  if (sposob === 'Escape') fireEvent.keyDown(dialog, { key: 'Escape' })
  if (sposob === 'tło') fireEvent.click(dialog)
  if (sposob === 'Wstecz') act(() => { expect(obsluzWstecz()).toBe(true) })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(kafelek).toHaveFocus()
  expect(kafelek.style.visibility).toBe('')
  expect(document.body.style.overflow).toBe('')
})

it('animuje transformację od geometrii kafelka i wraca do niej przy zamykaniu', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  const animacje: { zakoncz: () => void }[] = []
  const animuj = vi.fn((_klatki: Keyframe[], _opcje: KeyframeAnimationOptions) => {
    let zakoncz!: () => void
    const finished = new Promise<void>((rozwiaz) => { zakoncz = rozwiaz })
    animacje.push({ zakoncz })
    return { finished, cancel: vi.fn() }
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animuj })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this.tagName === 'BUTTON' ? { left: 20, top: 400, width: 80, height: 120 } : { left: 100, top: 60, width: 1000, height: 800 }) as DOMRect
  })
  try {
    render(<PrzegladTygodnia dzisiaj="2026-10-08" />)
    fireEvent.click(screen.getByRole('button', { name: /czwartek, 8 października 2026/ }))
    expect(animuj.mock.calls[0]).toEqual([
      [{ transform: 'translate(-80px, 340px) scale(0.08, 0.15)' }, { transform: 'none' }],
      expect.objectContaining({ easing: 'cubic-bezier(.16, 1, .3, 1)' }),
    ])
    expect(screen.getByRole('dialog')).toHaveAttribute('data-faza', 'otwieranie')
    await act(async () => { animacje[0].zakoncz() })
    expect(screen.getByRole('dialog')).toHaveAttribute('data-faza', 'otwarty')
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij dzień' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-faza', 'zamykanie')
    expect(animuj.mock.calls[1][0]).toEqual([expect.anything(), { transform: 'translate(-80px, 340px) scale(0.08, 0.15)' }])
    await act(async () => { animacje[1].zakoncz() })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  } finally { delete (HTMLElement.prototype as { animate?: unknown }).animate }
})
