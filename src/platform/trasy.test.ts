import { describe, expect, it } from 'vitest'
import { daneSzybkiegoDodawaniaZeSciezki, normalizujSciezkePowiadomienia, parsujDeepLink, sciezkaDlaCeluNawigacji, sciezkaDlaSourceRef } from './trasy'

describe('parser deep linków Ogarniacza', () => {
  it('mapuje poprawny URL na trasę aplikacji', () => {
    expect(parsujDeepLink('ogarniacz://zadania')).toBe('/zadania')
  })

  it('obsługuje trasę Dzisiaj', () => {
    expect(parsujDeepLink('ogarniacz://dzisiaj')).toBe('/dzisiaj')
  })

  it('odrzuca nieobsługiwany schemat', () => {
    expect(parsujDeepLink('https://zadania')).toBeNull()
  })

  it('odrzuca błędny URL', () => {
    expect(parsujDeepLink('to nie jest adres')).toBeNull()
  })

  it('zachowuje dozwolony identyfikator elementu', () => {
    expect(parsujDeepLink('ogarniacz://zadania?element=zadanie%207')).toBe('/zadania?element=zadanie+7')
  })

  it('otwiera wspólne szybkie dodawanie z typu skrótu i przekazanej treści', () => {
    const sciezka = parsujDeepLink('ogarniacz://dodaj?typ=notatka&tekst=https%3A%2F%2Fexample.com')
    expect(sciezka).toBe('/dodaj?typ=notatka&tekst=https%3A%2F%2Fexample.com')
    expect(daneSzybkiegoDodawaniaZeSciezki(sciezka!)).toEqual({ typ: 'notatka', tresc: 'https://example.com' })
  })

  it('buduje trasę z jednego celu route, entityId i sourceRef', () => {
    expect(sciezkaDlaCeluNawigacji({ route: '/przypomnienia', entityId: 'r-1' })).toBe('/przypomnienia?element=r-1')
    expect(sciezkaDlaCeluNawigacji({ route: '/przypomnienia', entityId: 'r-1', sourceRef: { typ: 'zadania', id: 'z-1' } })).toBe('/zadania?element=z-1')
  })

  it('odrzuca nieznaną trasę i niedozwolony parametr', () => {
    expect(parsujDeepLink('ogarniacz://admin')).toBeNull()
    expect(parsujDeepLink('ogarniacz://pulpit/zadania')).toBeNull()
    expect(parsujDeepLink('ogarniacz://zadania?przekieruj=https://example.com')).toBeNull()
  })

  it('odrzuca nieznaną trasę powiadomienia i niepoprawny sourceRef', () => {
    expect(normalizujSciezkePowiadomienia('/admin?element=1')).toBeNull()
    expect(normalizujSciezkePowiadomienia('/zadania?element=')).toBeNull()
    expect(sciezkaDlaSourceRef({ typ: 'nieistniejacy' as never, id: 'x' }, 'przypomnienie-1')).toBe('/przypomnienia?element=przypomnienie-1')
  })
})
