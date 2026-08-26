import { describe, expect, it } from 'vitest'
import { czyZadanieNaDzis, czyZadanieZalegle, ukonczZadanie, utworzZadanie } from './ZadaniaService'

describe('zadania', () => {
  it('tworzy zadanie z opcjonalnym terminem i bez wymaganej estymacji', () => {
    const zadanie = utworzZadanie({ tytul: 'Kupić karmę', opis: '', priorytet: 'wysoki', termin: '2026-08-14' })
    expect(zadanie.status).toBe('otwarte')
    expect(zadanie.szacowanyCzasMin).toBeUndefined()
    expect(zadanie.termin).toBe('2026-08-14')
  })

  it('oznacza zadanie jako wykonane', () => {
    const zadanie = utworzZadanie({ tytul: 'Telefon', opis: '', priorytet: 'normalny' })
    expect(ukonczZadanie(zadanie).wykonane.status).toBe('wykonane')
  })

  it('rozpoznaje termin dzisiejszy i zadanie zaległe', () => {
    const dzisiejsze = utworzZadanie({ tytul: 'Dziś', opis: '', priorytet: 'normalny', termin: '2026-08-14' })
    const zalegle = utworzZadanie({ tytul: 'Wczoraj', opis: '', priorytet: 'normalny', termin: '2026-08-13' })
    expect(czyZadanieNaDzis(dzisiejsze, '2026-08-14')).toBe(true)
    expect(czyZadanieZalegle(zalegle, '2026-08-14')).toBe(true)
  })

  it('po wykonaniu zadania cyklicznego tworzy kolejne wystąpienie', () => {
    const zadanie = { ...utworzZadanie({ tytul: 'Co tydzień', opis: '', priorytet: 'normalny', termin: '2026-08-14' }), powtarzanie: { typ: 'tygodniowo' as const, coIle: 1 } }
    const wynik = ukonczZadanie(zadanie)
    expect(wynik.nastepne?.termin).toBe('2026-08-21')
    expect(wynik.nastepne?.id).not.toBe(zadanie.id)
  })
})
