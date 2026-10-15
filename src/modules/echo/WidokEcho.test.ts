import { describe, expect, it, vi } from 'vitest'
import { adresWyniku, czyPokazacSugestieEcho, elementyWyniku, uruchomAutomatycznyOdczytEcho, WidokEcho } from './WidokEcho'
import { modulNarzedziaEcho } from '../../services/echo/NarzedziaEcho'
import { createElement as utworzElement } from 'react'
import { renderToStaticMarkup as renderujZnaczniki } from 'react-dom/server'
import { MemoryRouter as RouterPamieci } from 'react-router-dom'
import { useSesjaEcho } from '../../app/DostawcaSesjiEcho'

vi.mock('../../app/DostawcaSesjiEcho', () => ({ useSesjaEcho: vi.fn() }))
vi.mock('../../app/KontekstAplikacji', () => ({ useAplikacja: () => ({ ustawienia: { glosEcho: false } }) }))
vi.mock('../../hooks/useRepozytorium', () => ({ useRepozytorium: () => ({ dane: [] }) }))

describe('ustawienia i wyniki Widoku Echo', () => {
  it.each([
    ['wykonane', '✓'], ['blad', 'Błąd'], ['zablokowane', 'Zablokowane'], ['wymaga_potwierdzenia', 'Wymaga potwierdzenia'],
  ] as const)('renderuje zgodne z wynikiem oznaczenie %s', (status, etykieta) => {
    vi.mocked(useSesjaEcho).mockReturnValue({
      stan: 'bezczynny', wiadomosci: [{ id: '1', autor: 'echo', tresc: 'Wynik', wyniki: [{ wywolanieId: '1', nazwa: 'create_task', status, komunikat: 'Nie wykonano', dane: { id: 'z-1', tytul: 'Raport' } }] }],
    } as ReturnType<typeof useSesjaEcho>)
    const widok = renderujZnaczniki(utworzElement(RouterPamieci, null, utworzElement(WidokEcho)))
    expect(widok).toContain(etykieta)
    if (status !== 'wykonane') {
      expect(widok).not.toContain('✓')
      expect(widok).not.toContain('Otwórz')
      expect(widok).not.toContain('>Popraw</button>')
    }
  })

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

  it('nie dubluje TTS dla odpowiedzi rozpoczętej głosowo', () => {
    const odczytaj = vi.fn()
    uruchomAutomatycznyOdczytEcho(
      true,
      true,
      { id: 'odpowiedz-1', autor: 'echo', tresc: 'Gotowe.', zrodloWejscia: 'stt' },
      undefined,
      odczytaj,
    )
    expect(odczytaj).not.toHaveBeenCalled()
  })

  it('odczytuje odpowiedź tekstową tylko po włączeniu ustawienia', () => {
    const odczytaj = vi.fn()
    const ostatnioOdczytana = uruchomAutomatycznyOdczytEcho(
      true,
      true,
      { id: 'odpowiedz-1', autor: 'echo', tresc: 'Gotowe.', zrodloWejscia: 'tekst' },
      undefined,
      odczytaj,
    )
    expect(odczytaj).toHaveBeenCalledWith('Gotowe.')
    expect(ostatnioOdczytana).toBe('odpowiedz-1')
  })

  it('proaktywność i wyciszenie realnie sterują widocznością sugestii', () => {
    expect(czyPokazacSugestieEcho(true, false)).toBe(true)
    expect(czyPokazacSugestieEcho(false, false)).toBe(false)
    expect(czyPokazacSugestieEcho(true, true)).toBe(false)
  })

  it('wiąże narzędzia przekrojowe z właściwymi uprawnieniami modułów', () => {
    expect(modulNarzedziaEcho('finance_period_summary')).toBe('finanse')
    expect(modulNarzedziaEcho('assess_purchase_affordability')).toBe('finanse')
    expect(modulNarzedziaEcho('assess_mechanic_trip')).toBe('samochod')
    expect(modulNarzedziaEcho('pharmacy_overview')).toBe('zdrowie')
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

  it.each(['create_reminder', 'reschedule_reminder'])('pokazuje czas i link przypomnienia z %s', (nazwa) => {
    const [element] = elementyWyniku({ wywolanieId: '1', nazwa, status: 'wykonane', dane: { id: 'p-1', tytul: 'Telefon', czas: '2026-10-16T16:00:00Z' } })
    expect(element.termin).toBe('2026-10-16T16:00:00Z')
    expect(adresWyniku(element)).toBe('/przypomnienia?element=p-1')
  })

  it.each(['blad', 'zablokowane', 'wymaga_potwierdzenia'] as const)('zachowuje status %s bez linku do niewykonanego działania', (status) => {
    const [element] = elementyWyniku({ wywolanieId: '1', nazwa: 'create_task', status, komunikat: 'Nie wykonano', dane: { id: '1' } })
    expect(element.status).toBe(status)
    expect(element.tytul).toBe('Nie wykonano')
    expect(adresWyniku(element)).toBeUndefined()
  })
})
