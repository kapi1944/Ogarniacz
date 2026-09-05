import { describe, expect, it } from 'vitest'
import { zaproponujPodzialPoczekalni } from './PoczekalniaService'

describe('Poczekalnia', () => {
  it('proponuje bezpieczny podział wieloczęściowego wpisu', () => {
    expect(zaproponujPodzialPoczekalni('Kupić mleko, zadzwonić do dentysty i sprawdzić OC')).toEqual([
      { tresc: 'Kupić mleko', typ: 'zakupy' },
      { tresc: 'zadzwonić do dentysty', typ: 'wizyty' },
      { tresc: 'sprawdzić OC', typ: 'na_pozniej' },
    ])
  })
})
