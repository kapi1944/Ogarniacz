import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { addDays, format, parseISO } from 'date-fns'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { dzisiajIso } from '../../domain/fabryki'
import { WidokPulpitu } from './WidokPulpitu'

vi.mock('../../app/KontekstAplikacji', async () => {
  const { DOMYSLNE_USTAWIENIA } = await import('../../domain/ustawienia')
  return {
    useAplikacja: () => ({
      ustawienia: { ...DOMYSLNE_USTAWIENIA, pulpit: { ...DOMYSLNE_USTAWIENIA.pulpit, pokazOsCzasu: false } },
      zapiszUstawienia: vi.fn(),
      otworzSzybkieDodawanie: vi.fn(),
      otworzSzybkieDodawanieZDanymi: vi.fn(),
    }),
  }
})

afterEach(cleanup)

it('zawsze pokazuje jedną oś pod nagłówkiem mimo starszej preferencji ukrywania i synchronizuje datę', async () => {
  const { container } = render(<MemoryRouter><WidokPulpitu /></MemoryRouter>)
  const pulpit = container.querySelector('.widok-pulpitu')!
  const os = screen.getByRole('heading', { name: 'Oś czasu' }).closest('section')!

  expect(pulpit.children[0]).toContainElement(screen.getByRole('heading', { name: 'Pulpit' }))
  expect(pulpit.children[1]).toBe(os)
  expect(screen.getAllByRole('heading', { name: 'Oś czasu' })).toHaveLength(1)
  expect(screen.getAllByRole('group', { name: 'Nawigacja wybranego dnia' })).toHaveLength(1)

  const jutro = format(addDays(parseISO(dzisiajIso()), 1), 'yyyy-MM-dd')
  fireEvent.click(screen.getByRole('button', { name: 'Następny dzień' }))
  await waitFor(() => expect(screen.getByLabelText(`Oś czasu dla ${jutro}`)).toBeInTheDocument())
  expect(screen.getByLabelText('Wybierz datę osi czasu')).toHaveValue(jutro)
  expect(pulpit.children[1]).toBe(os)
})
