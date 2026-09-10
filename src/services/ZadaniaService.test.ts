import { describe, expect, it } from 'vitest'
import { czyZadanieNaDzis, czyZadanieZalegle, przypiszZadanieDoProjektu, ukonczZadanie, utworzZadanie, zmienPriorytetZadania, zmienTerminZadania } from './ZadaniaService'

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

  it('szybko zmienia priorytet, termin i projekt bez utraty pozostałych danych', () => {
    const zadanie = utworzZadanie({ tytul: 'Telefon', opis: 'Notatka', priorytet: 'normalny' })
    const zPriorytetem = zmienPriorytetZadania(zadanie, 'wysoki')
    const zTerminem = zmienTerminZadania(zPriorytetem, '2026-09-12')
    const zProjektem = przypiszZadanieDoProjektu(zTerminem, 'projekt-1')

    expect(zProjektem).toMatchObject({ tytul: 'Telefon', opis: 'Notatka', priorytet: 'wysoki', termin: '2026-09-12', dataElementu: '2026-09-12', trybTerminuElementu: 'koniec_dnia', projektId: 'projekt-1' })
    expect(zmienTerminZadania(zProjektem)).toMatchObject({ termin: undefined, dataElementu: undefined, trybTerminuElementu: 'bez_godziny' })
  })
})
