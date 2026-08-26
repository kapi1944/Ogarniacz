import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Lek } from '../domain/typy'
import { generujDawkiDnia, zapiszStatusDawki } from './LekiService'

const lek: Lek = { ...utworzMetadane('lek-1'), nazwa: 'Lek testowy', dawkaInstrukcja: '1 tabletka', godziny: ['08:00', '20:00'], aktywny: true }

describe('leki', () => {
  it('generuje wszystkie dzisiejsze dawki aktywnego leku', () => {
    const dawki = generujDawkiDnia([lek], [], '2026-08-14')
    expect(dawki.map((dawka) => dawka.planowanaGodzina)).toEqual(['08:00', '20:00'])
    expect(dawki.every((dawka) => dawka.status === 'oczekuje')).toBe(true)
  })

  it('zapisuje status dawki', () => {
    const dawka = generujDawkiDnia([lek], [], '2026-08-14')[0]!
    expect(zapiszStatusDawki(dawka, 'zazyte').status).toBe('zazyte')
  })

  it('utrzymuje jedną bieżącą decyzję dla danego wystąpienia', () => {
    const dawka = generujDawkiDnia([lek], [], '2026-08-14')[0]!
    const pierwszy = zapiszStatusDawki(dawka, 'zazyte')
    const odswiezona = generujDawkiDnia([lek], [pierwszy], '2026-08-14')[0]!
    const drugi = zapiszStatusDawki(odswiezona, 'pominiete')
    expect(drugi.id).toBe(pierwszy.id)
    expect(drugi.status).toBe('pominiete')
  })
})
