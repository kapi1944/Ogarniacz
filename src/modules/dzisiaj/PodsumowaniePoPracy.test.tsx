import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { baza } from '../../data/BazaOgarniacza'
import { normalizujUstawienia } from '../../domain/ustawienia'
import { utworzZadanie } from '../../services/ZadaniaService'
import { PodsumowaniePoPracy } from './PodsumowaniePoPracy'

vi.mock('../../app/KontekstAplikacji', async () => {
  const { normalizujUstawienia } = await import('../../domain/ustawienia')
  const ustawienia = normalizujUstawienia({})
  return { useAplikacja: () => ({ ustawienia, gotowyDostep: true, moze: () => true }) }
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T17:10:00'))
  for (const tabela of ['zadania', 'przypomnienia', 'wyjatkiGrafiku', 'urlopy', 'ustawienia'] as const) await baza.tabela(tabela).clear()
  await baza.tabela('ustawienia').put(normalizujUstawienia({}))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('kliknięcie linku pokazuje wszystkie zadania, a wykonanie odświeża listę i licznik przez istniejącą akcję', async () => {
  const zadanie = { ...utworzZadanie({ tytul: 'Syntetyczne zadanie', termin: '2026-11-02', priorytet: 'wysoki' }), pokazNaPulpicie: false }
  await baza.tabela('zadania').put(zadanie)
  render(<MemoryRouter initialEntries={['/dzisiaj?poPracy=2026-11-02']}><PodsumowaniePoPracy teraz={new Date()} /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: zadanie.tytul })).toHaveAttribute('href', `/zadania?element=${zadanie.id}`)
  expect(screen.getByText('Wysoki')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: `Wykonaj: ${zadanie.tytul}` }))
  await waitFor(() => expect(screen.queryByRole('link', { name: zadanie.tytul })).not.toBeInTheDocument())
  expect(await screen.findByText('Nie masz już zadań w tym podsumowaniu.')).toBeInTheDocument()
  expect((await baza.tabela('zadania').get(zadanie.id))?.statusElementu).toBe('wykonany')
})
