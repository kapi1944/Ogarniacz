import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WidokDzisiaj } from './WidokDzisiaj'
import { useDaneDni } from '../pulpit/useDaneDni'
import { utworzDaneDnia } from '../pulpit/logikaDanychDnia'
import { datyZakresu } from './logikaHoryzontu'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'

vi.mock('../pulpit/useDaneDni', () => ({ useDaneDni: vi.fn() }))
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => ({ elementy: [], liczba: 0, blad: false }) }))
vi.mock('../../app/KontekstAplikacji', async () => {
  const { DOMYSLNE_USTAWIENIA } = await import('../../domain/ustawienia')
  return { useAplikacja: () => ({ ustawienia: DOMYSLNE_USTAWIENIA, moze: () => true, otworzSzybkieDodawanie: vi.fn() }) }
})
vi.mock('../pulpit/PlanWybranegoDnia', () => ({ PlanWybranegoDnia: ({ data }: { data: string }) => <p>Podgląd dnia: {data}</p> }))
vi.mock('../../components/kalendarz/SkupienieDnia', () => ({ SkupienieDnia: ({ children }: { children: (zamknij: () => void) => React.ReactNode }) => <div role="dialog">{children(() => undefined)}</div> }))

let elementy: ElementOgarniacza[] = []
const zadanie = (id: string, zmiany: Partial<ElementOgarniacza<'zadanie'>> = {}): ElementOgarniacza<'zadanie'> => ({ id, typ: 'zadanie', tytul: id, data: '2026-10-24', status: 'otwarty', createdAt: '', updatedAt: '', ...zmiany })
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-24T12:00:00'))
  elementy = []
  vi.mocked(useDaneDni).mockImplementation((zakres) => ({ dni: datyZakresu(zakres).map((data) => utworzDaneDnia(data, elementy, DOMYSLNE_USTAWIENIA.harmonogram, [], [])), ladowanie: false, blad: false }))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('rozróżnia minione terminy i zakończone statusy bez sumowania opóźnień', () => {
  elementy = [zadanie('Zaległe', { godzina: '09:00', trybTerminu: 'o_godzinie' }), zadanie('Wykonane', { godzina: '09:30', status: 'wykonany', trybTerminu: 'o_godzinie' }), zadanie('Pominięte', { status: 'pominiety' }), zadanie('Anulowane', { status: 'anulowany' }), zadanie('Bez godziny')]
  render(<MemoryRouter><WidokDzisiaj /></MemoryRouter>)
  expect(screen.getByText('Zaległe zadania: 1. Wybierz, co wykonać lub przełożyć.')).toBeInTheDocument()
  expect(screen.queryByText(/min po planie|korekty o/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Wykonaj: Wykonane' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Wykonaj: Pominięte' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Wykonaj: Anulowane' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Zakończone i pominięte (3)'))
  expect(screen.getByText(/09:30 · Wykonano/)).toBeInTheDocument()
  expect(screen.getByText('Pominięto')).toBeInTheDocument()
})

it('otwiera użyteczny podgląd dnia wybranego z horyzontu', () => {
  render(<MemoryRouter><WidokDzisiaj /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /Otwórz dzień: niedziela, 25 października/ }))
  expect(within(screen.getByRole('dialog')).getByText('Podgląd dnia: 2026-10-25')).toBeInTheDocument()
})

it('zmienia datę i dane dnia po północy bez przeładowania', () => {
  vi.setSystemTime(new Date('2026-10-24T23:59:30'))
  render(<MemoryRouter><WidokDzisiaj /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Przeplanuj resztę dnia' })).toHaveAttribute('href', '/planer?data=2026-10-24&od=23:59')
  act(() => { vi.advanceTimersByTime(60_000) })
  expect(screen.getByRole('link', { name: 'Przeplanuj resztę dnia' })).toHaveAttribute('href', '/planer?data=2026-10-25&od=00:00')
})
