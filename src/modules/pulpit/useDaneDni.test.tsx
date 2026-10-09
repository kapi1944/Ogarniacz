import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { repozytoriumElementowZadan } from '../../data/RepozytoriumElementowZadan'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { useDaneDni } from './useDaneDni'
import { usePlanDniaPulpitu } from './usePlanDniaPulpitu'

vi.mock('../../app/KontekstAplikacji', async () => {
  const { DOMYSLNE_USTAWIENIA } = await import('../../domain/ustawienia')
  return { useAplikacja: () => ({ ustawienia: DOMYSLNE_USTAWIENIA }) }
})
afterEach(cleanup)

it('aktualizuje model dnia i licznik horyzontu po zmianie zadania w istniejącym repozytorium', async () => {
  const data = '2026-10-09'
  const zadanie = await repozytoriumElementowZadan.utworz({ typ: 'zadanie', tytul: 'Wspólne zadanie', data, status: 'otwarty', priorytet: 'pilny', trybTerminu: 'bez_godziny' })
  const { result } = renderHook(() => useDaneDni({ od: '2026-10-05', do: '2026-11-01' }))
  const dzien = () => result.current.dni.find((dane) => dane.data === data)!
  await waitFor(() => expect(result.current.ladowanie).toBe(false))
  expect(result.current.dni).toHaveLength(28)
  expect(dzien().elementy.map((element) => element.id)).toContain(zadanie.id)
  expect(dzien().liczbaOtwartych).toBe(1)
  expect(dzien().liczbaPilnych).toBe(1)
  await act(async () => { await repozytoriumElementowZadan.aktualizuj(zadanie.id, { status: 'wykonany' }) })
  await waitFor(() => expect(dzien().liczbaOtwartych).toBe(0))
  expect(dzien().liczbaWykonanych).toBe(1)
  expect(dzien().liczbaPilnych).toBe(0)
  await act(async () => { await pobierzRepozytorium('zadania').usun(zadanie.id) })
})

it('pokazuje ten sam wyjątek grafiku w planie dnia i horyzoncie bez zmiany sąsiedniego dnia', async () => {
  const data = '2026-10-12'
  const { result } = renderHook(() => ({ plan: usePlanDniaPulpitu(data), horyzont: useDaneDni({ od: data, do: '2026-10-13' }) }))
  await waitFor(() => expect(result.current.horyzont.ladowanie).toBe(false))
  expect(result.current.plan.harmonogram.pracuje).toBe(true)
  await act(async () => {
    await result.current.plan.zapiszZmianeHarmonogramu({ pracuje: false, odPracy: '07:45', doPracy: '16:00', dojazdDoPracyMinuty: 0, powrotZPracyMinuty: 0, dostepnoscDojazdu: 'czesciowa' }, 'tylko_ten_dzien')
  })
  await waitFor(() => {
    expect(result.current.horyzont.dni[0].charakterDnia).toBe('wolny')
    expect(result.current.plan.harmonogram.pracuje).toBe(false)
  })
  expect(result.current.horyzont.dni[0].zakresPracy).toBeUndefined()
  expect(result.current.horyzont.dni[1].charakterDnia).toBe('roboczy')
})
