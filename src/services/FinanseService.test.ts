import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { PlatnoscStala, Rachunek, Rata, Wydatek } from '../domain/typy'
import { czyZaksiegowanoZrodlo, obliczWykorzystanieBudzetow, podsumujCashFlow, przygotujWydatekZeZrodla } from './FinanseService'

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
    expect(przygotujWydatekZeZrodla(transakcje, { opis: 'Ponownie', kwota: 20, data: '2026-09-01', kategoria: 'Dom', powiazanie: { typ: 'zakupy', id: 'lista-1' } })).toBeUndefined()
  })

  it.each(['zakupy', 'samochod', 'rachunki'] as const)('deduplikuje transakcję źródłową: %s', (typ) => {
    const powiazanie = { typ, id: `${typ}-1` }
    const pierwsza = przygotujWydatekZeZrodla([], { opis: typ, kwota: 100, data: '2026-09-01', kategoria: 'Test', powiazanie })
    expect(pierwsza).toBeDefined()
    expect(przygotujWydatekZeZrodla([pierwsza!], { opis: typ, kwota: 100, data: '2026-09-01', kategoria: 'Test', powiazanie })).toBeUndefined()
  })

  it('nie zalicza przychodu ani transferu do wykorzystania budżetu', () => {
    const budzet = { ...utworzMetadane(), nazwa: 'Dom', okres: '2026-09', limit: 1000 }
    const transakcje: Wydatek[] = [
      { ...utworzMetadane(), opis: 'Legacy', kwota: 100, data: '2026-09-01', kategoria: 'Dom' },
      { ...utworzMetadane(), opis: 'Wydatek', kwota: 50, data: '2026-09-02', kategoria: 'Dom', rodzaj: 'wydatek' },
      { ...utworzMetadane(), opis: 'Przychód', kwota: 500, data: '2026-09-03', kategoria: 'Dom', rodzaj: 'przychod' },
      { ...utworzMetadane(), opis: 'Transfer', kwota: 200, data: '2026-09-04', kategoria: 'Dom', rodzaj: 'transfer' },
    ]
    expect(obliczWykorzystanieBudzetow([budzet], transakcje, '2026-09')[0].wydano).toBe(150)
    expect(podsumujCashFlow('2026-09', transakcje, [], [], [])).toMatchObject({ przychody: 500, wydatki: 150 })
  })
})
