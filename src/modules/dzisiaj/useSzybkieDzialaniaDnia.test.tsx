import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSzybkieDzialaniaDnia } from './useSzybkieDzialaniaDnia'
import { KonfliktZmianyZadania, repozytoriumElementowZadan } from '../../data/RepozytoriumElementowZadan'
import type { ElementZadania } from '../../domain/elementyOgarniacza'

const element: ElementZadania = { id: 'zadanie', typ: 'zadanie', tytul: 'Telefon', data: '2026-10-24', godzina: '12:30', trybTerminu: 'o_godzinie', status: 'otwarty', createdAt: '', updatedAt: '' }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('blokuje równoległy zapis tego samego zadania i nie potwierdza sukcesu przed zapisem', async () => {
  let odrzuc!: (blad: Error) => void
  const zapis = vi.spyOn(repozytoriumElementowZadan, 'zmienZDnia').mockReturnValue(new Promise((_rozwiaz, odrzucenie) => { odrzuc = odrzucenie }))
  const { result } = renderHook(() => useSzybkieDzialaniaDnia(() => true))
  let pierwsza!: Promise<void>
  act(() => { pierwsza = result.current.zmien(element, 'wykonaj'); void result.current.zmien(element, 'wykonaj') })
  expect(zapis).toHaveBeenCalledTimes(1)
  expect(result.current.zapisywane.has(element.id)).toBe(true)
  expect(result.current.komunikat).toBeUndefined()
  await act(async () => { odrzuc(new Error('Prywatne szczegóły błędu')); await pierwsza })
  expect(result.current.zapisywane.size).toBe(0)
  expect(result.current.komunikat).toMatchObject({ typ: 'blad' })
  expect(result.current.komunikat?.tresc).not.toContain('Prywatne')
  await act(async () => { await result.current.zmien(element, 'wykonaj') })
  expect(zapis).toHaveBeenCalledTimes(2)
})

it('sprawdza uprawnienia przed wywołaniem repozytorium', async () => {
  const zapis = vi.spyOn(repozytoriumElementowZadan, 'zmienZDnia')
  const { result } = renderHook(() => useSzybkieDzialaniaDnia(() => false))
  await act(async () => { await result.current.zmien(element, 'wykonaj') })
  expect(zapis).not.toHaveBeenCalled()
  expect(result.current.komunikat?.tresc).toContain('uprawnień')
})

it('zachowuje godzinę przekładania, komunikuje sukces i bezpieczną odmowę cofnięcia', async () => {
  const zmiana = { przed: { id: element.id, tytul: element.tytul }, po: { id: element.id } } as Awaited<ReturnType<typeof repozytoriumElementowZadan.zmienZDnia>>
  const zapis = vi.spyOn(repozytoriumElementowZadan, 'zmienZDnia').mockResolvedValue(zmiana)
  const cofanie = vi.spyOn(repozytoriumElementowZadan, 'cofnijZmianeDnia').mockRejectedValueOnce(new KonfliktZmianyZadania()).mockResolvedValueOnce()
  const { result } = renderHook(() => useSzybkieDzialaniaDnia(() => true))
  await act(async () => { await result.current.zmien(element, 'przeloz') })
  expect(zapis).toHaveBeenCalledWith(element, expect.objectContaining({ godzina: '12:30', trybTerminu: 'o_godzinie' }))
  expect(result.current.komunikat).toMatchObject({ typ: 'sukces', tresc: expect.stringContaining('12:30') })
  await act(async () => { await result.current.cofnij() })
  expect(result.current.komunikat).toMatchObject({ typ: 'blad' })
  expect(result.current.ostatniaZmiana).toBe(zmiana)
  await act(async () => { await result.current.cofnij() })
  expect(cofanie).toHaveBeenCalledTimes(2)
  expect(result.current.ostatniaZmiana).toBeUndefined()
  expect(result.current.komunikat?.tresc).toContain('Cofnięto')
})
