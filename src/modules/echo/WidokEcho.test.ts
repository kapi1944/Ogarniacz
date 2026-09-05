import { describe, expect, it, vi } from 'vitest'
import { adresWyniku, czyPokazacSugestieEcho, elementyWyniku, modulNarzedzia, uruchomAutomatycznyOdczytEcho } from './WidokEcho'

describe('ustawienia i wyniki Widoku Echo', () => {
  it('nie uruchamia auto-TTS, gdy głos Echo jest wyłączony', () => {
    const odczytaj = vi.fn()
    uruchomAutomatycznyOdczytEcho(
      false,
      true,
      { id: 'odpowiedz-1', autor: 'echo', tresc: 'Gotowe.' },
      undefined,
      odczytaj,
    )
    expect(odczytaj).not.toHaveBeenCalled()
  })

  it('proaktywność i wyciszenie realnie sterują widocznością sugestii', () => {
    expect(czyPokazacSugestieEcho(true, false)).toBe(true)
    expect(czyPokazacSugestieEcho(false, false)).toBe(false)
    expect(czyPokazacSugestieEcho(true, true)).toBe(false)
  })

  it('wiąże narzędzia przekrojowe z właściwymi uprawnieniami modułów', () => {
    expect(modulNarzedzia('finance_period_summary')).toBe('finanse')
    expect(modulNarzedzia('assess_purchase_affordability')).toBe('finanse')
    expect(modulNarzedzia('assess_mechanic_trip')).toBe('samochod')
    expect(modulNarzedzia('pharmacy_overview')).toBe('zdrowie')
  })

  it.each([
    ['zadanie', '/zadania?element=1'],
    ['projekt', '/projekty?element=1'],
    ['zakupy', '/zakupy?element=1'],
    ['rachunek', '/rachunki?element=1'],
    ['samochod', '/samochod?element=1'],
    ['lek', '/zdrowie/leki?element=1'],
    ['wizyta', '/zdrowie/wizyty?element=1'],
    ['dokument', '/dokumenty?element=1'],
  ])('buduje link strukturalnego wyniku typu %s', (typ, adres) => {
    expect(adresWyniku({ id: '1', typ })).toBe(adres)
  })

  it('normalizuje wynik narzędzia zadania bez pola typ', () => {
    const [element] = elementyWyniku({
      wywolanieId: '1',
      nazwa: 'create_task',
      status: 'wykonane',
      dane: { id: 'zadanie-1', tytul: 'Raport' },
    })
    expect(adresWyniku(element)).toBe('/zadania?element=zadanie-1')
  })
})
