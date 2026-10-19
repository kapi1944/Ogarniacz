import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NawigatorDnia } from './NawigatorDnia'

afterEach(cleanup)

it('przechodzi przez granicę tygodnia i miesiąca w obu kierunkach', () => {
  const zmienDate = vi.fn()
  const widok = render(<NawigatorDnia data="2026-12-31" zmienDate={zmienDate} />)

  fireEvent.click(screen.getByRole('button', { name: 'Następny dzień' }))
  expect(zmienDate).toHaveBeenLastCalledWith('2027-01-01')

  widok.rerender(<NawigatorDnia data="2027-01-01" zmienDate={zmienDate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Poprzedni dzień' }))
  expect(zmienDate).toHaveBeenLastCalledWith('2026-12-31')
})

it('przekazuje datę wybraną w kalendarzu', () => {
  const zmienDate = vi.fn()
  render(<NawigatorDnia data="2026-10-19" zmienDate={zmienDate} />)

  fireEvent.change(screen.getByLabelText('Wybierz datę osi czasu'), { target: { value: '2026-11-03' } })
  expect(zmienDate).toHaveBeenCalledWith('2026-11-03')
})
