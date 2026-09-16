import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GranicaBledu, KomunikatBleduAsynchronicznego } from './GranicaBledu'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('zastępuje uszkodzony widok komunikatem i pozwala ponowić render', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  let uszkodzony = true
  function Widok() { if (uszkodzony) throw new Error('test'); return <p>Ustawienia działają</p> }
  render(<GranicaBledu><Widok /></GranicaBledu>)
  expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się wyświetlić')
  uszkodzony = false
  fireEvent.click(screen.getByText('Spróbuj ponownie'))
  expect(screen.getByText('Ustawienia działają')).toBeInTheDocument()
})

it('pokazuje błąd operacji asynchronicznej bez usuwania widoku', () => {
  render(<><KomunikatBleduAsynchronicznego /><p>Ustawienia</p></>)
  fireEvent(window, new Event('unhandledrejection'))
  expect(screen.getByRole('alert')).toHaveTextContent('Sprawdź jej wynik')
  expect(screen.getByText('Ustawienia')).toBeInTheDocument()
})
