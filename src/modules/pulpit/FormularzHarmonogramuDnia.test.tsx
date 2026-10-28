import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FormularzHarmonogramuDnia } from './FormularzHarmonogramuDnia'
import { utworzHarmonogramDnia } from './logikaOsiCzasu'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'

afterEach(cleanup)

it('edytuje godziny i dojazdy bez zmiany zakresu oraz blokuje nieprawidłowe wartości', async () => {
  const zapisz = vi.fn().mockResolvedValue(undefined)
  const harmonogram = utworzHarmonogramDnia('2026-10-28', DOMYSLNE_USTAWIENIA.harmonogram)
  render(<FormularzHarmonogramuDnia harmonogram={harmonogram} domyslnyZakres="tylko_ten_dzien" zezwalajNaPelnaDostepnosc zapisz={zapisz} zamknij={vi.fn()} />)
  expect(screen.getByLabelText('Praca od')).toHaveValue(harmonogram.odPracy)
  fireEvent.change(screen.getByLabelText('Praca od'), { target: { value: '09:' } })
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmianę' }))
  expect(zapisz).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Praca od'), { target: { value: '09:15' } })
  fireEvent.change(screen.getByLabelText('Dojazd'), { target: { value: '181' } })
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmianę' }))
  expect(zapisz).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Dojazd'), { target: { value: '25' } })
  fireEvent.change(screen.getByLabelText('Powrót'), { target: { value: '35' } })
  fireEvent.click(screen.getByRole('button', { name: 'Zegar: Praca do' }))
  fireEvent.keyDown(screen.getByLabelText('Praca do'), { key: 'Escape' })
  expect(screen.queryByRole('group', { name: 'Wybór godziny: Praca do' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmianę' }))
  await waitFor(() => expect(zapisz).toHaveBeenCalledWith(expect.objectContaining({ odPracy: '09:15', doPracy: harmonogram.doPracy, dojazdDoPracyMinuty: 25, powrotZPracyMinuty: 35 }), 'tylko_ten_dzien'))
})
