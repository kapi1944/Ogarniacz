import { describe, expect, it } from 'vitest'
import { normalizujOdebraneUdostepnienie } from './ShareService'

describe('odbieranie udostępnionej treści', () => {
  it('przyjmuje tekst lub link z opcjonalnym tytułem', () => {
    expect(normalizujOdebraneUdostepnienie({ tekst: ' https://example.com/a ', tytul: ' Artykuł ' })).toEqual({
      tekst: 'https://example.com/a',
      tytul: 'Artykuł',
    })
  })

  it('odrzuca puste i niepoprawne dane', () => {
    expect(normalizujOdebraneUdostepnienie({ tekst: '   ' })).toBeNull()
    expect(normalizujOdebraneUdostepnienie({ tekst: 123 })).toBeNull()
  })
})
