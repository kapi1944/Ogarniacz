import { describe, expect, it } from 'vitest'
import { parsujDeepLink } from './trasy'

describe('parser deep linków Ogarniacza', () => {
  it('mapuje poprawny URL na trasę aplikacji', () => {
    expect(parsujDeepLink('ogarniacz://zadania')).toBe('/zadania')
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

  it('odrzuca nieznaną trasę i niedozwolony parametr', () => {
    expect(parsujDeepLink('ogarniacz://admin')).toBeNull()
    expect(parsujDeepLink('ogarniacz://pulpit/zadania')).toBeNull()
    expect(parsujDeepLink('ogarniacz://zadania?przekieruj=https://example.com')).toBeNull()
  })
})
