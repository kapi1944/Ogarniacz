import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { PlatnoscStala, Rachunek, Rata, Wydatek } from '../domain/typy'
import { czyZaksiegowanoZrodlo, obliczWykorzystanieBudzetow, podsumujCashFlow, podsumujWaluty, przygotujKwoteTransakcji, przygotujWydatekZeZrodla } from './FinanseService'

describe('cash flow', () => {
  it('oddziela PLN, EUR i USD, zachowuje starsze PLN oraz precyzję sum', () => {
    const transakcje: Wydatek[] = [
      { ...utworzMetadane(), opis: 'Stare PLN', kwota: 0.1, data: '2026-10-01', kategoria: 'Dom' },
      { ...utworzMetadane(), opis: 'PLN', kwota: 0.2, waluta: 'PLN', data: '2026-10-01', kategoria: 'Dom' },
      { ...utworzMetadane(), opis: 'EUR', kwota: 100, waluta: 'EUR', data: '2026-10-01', kategoria: 'Dom' },
      { ...utworzMetadane(), opis: 'USD', kwota: 200, waluta: 'USD', data: '2026-10-01', kategoria: 'Dom', rodzaj: 'przychod' },
      { ...utworzMetadane(), opis: 'Transfer', kwota: 999, waluta: 'EUR', data: '2026-10-01', kategoria: 'Dom', rodzaj: 'transfer' },
    ]
    expect(podsumujCashFlow('2026-10', transakcje, [], [], [])).toMatchObject({ wydatki: 0.3, przychody: 0, bilansBiezacy: -0.3 })
    expect(obliczWykorzystanieBudzetow([{ ...utworzMetadane(), nazwa: 'Dom', okres: '2026-10', limit: 100 }], transakcje, '2026-10')[0]).toMatchObject({ wydano: 0.3, pozostalo: 99.7 })
    expect(podsumujWaluty('2026-10', transakcje)).toEqual([
      { waluta: 'PLN', przychody: 0, wydatki: 0.3, bilans: -0.3 },
      { waluta: 'EUR', przychody: 0, wydatki: 100, bilans: -100 },
      { waluta: 'USD', przychody: 200, wydatki: 0, bilans: 200 },
    ])
  })

  it('waliduje zapis kwoty i nie zmienia waluty źródeł rozliczanych w PLN', () => {
    expect(przygotujKwoteTransakcji('125,50', 'EUR')).toEqual({ kwota: 125.5, waluta: 'EUR' })
    const powiazana: Wydatek = { ...utworzMetadane(), opis: 'Rata', kwota: 100, data: '2026-10-01', kategoria: 'Dom', rataId: 'rata-1' }
    expect(() => przygotujKwoteTransakcji('100', 'EUR', powiazana)).toThrow('pozostać w PLN')
    expect(() => przygotujKwoteTransakcji('0', 'PLN')).toThrow('0,01')
    expect(() => przygotujKwoteTransakcji('NaN', 'PLN')).toThrow()
  })
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
