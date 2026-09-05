import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { PlatnoscStala, Rachunek, Rata, Wydatek } from '../domain/typy'
import { czyZaksiegowanoZrodlo, podsumujCashFlow } from './FinanseService'

describe('cash flow', () => {
  it('uwzględnia tylko zapisane przychody, wydatki i znane zobowiązania', () => {
    const transakcje: Wydatek[] = [
      { ...utworzMetadane('p'), opis: 'Pensja', kwota: 5000, data: '2026-09-01', kategoria: 'Praca', rodzaj: 'przychod' },
      { ...utworzMetadane('w'), opis: 'Zakupy', kwota: 400, data: '2026-09-02', kategoria: 'Dom' },
    ]
    const rachunki: Rachunek[] = [{ ...utworzMetadane('r'), nazwa: 'Internet', kwota: 80, termin: '2026-09-15', status: 'niezaplacony' }]
    const stale: PlatnoscStala[] = [{ ...utworzMetadane('s'), nazwa: 'Muzyka', kwota: 25, dzienMiesiaca: 5, dataStartu: '2026-01-01', kategoria: 'Rozrywka', aktywna: true }]
    const raty: Rata[] = [{ ...utworzMetadane('ra'), planRatId: 'plan', numer: 1, data: '2026-09-20', kwota: 100, nadplata: 0, status: 'planowana' }]
    expect(podsumujCashFlow('2026-09', transakcje, rachunki, stale, raty)).toEqual({ przychody: 5000, wydatki: 400, zobowiazania: 205, bilansBiezacy: 4600, prognozowanyBilans: 4395 })
  })

  it('nie księguje drugi raz tego samego źródła', () => {
    const transakcje: Wydatek[] = [{ ...utworzMetadane(), opis: 'Zakupy', kwota: 20, data: '2026-09-01', kategoria: 'Dom', powiazanie: { typ: 'zakupy', id: 'lista-1' } }]
    expect(czyZaksiegowanoZrodlo(transakcje, { typ: 'zakupy', id: 'lista-1' })).toBe(true)
    expect(czyZaksiegowanoZrodlo(transakcje, { typ: 'zakupy', id: 'lista-2' })).toBe(false)
  })
})
