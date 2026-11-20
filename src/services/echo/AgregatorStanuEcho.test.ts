import { describe, expect, it } from 'vitest'
import { agregujStanEcho } from './AgregatorStanuEcho'

describe('agregujStanEcho', () => {
  const baza = { stanSesji: 'bezczynny' as const, stanAgenta: 'gotowy' as const, tekstAktywny: false, oczekujePotwierdzenia: false, oczekujeDoprecyzowania: false }

  it('mapuje zdarzenia sesji i agenta na stany prezentacji', () => {
    expect(agregujStanEcho({ ...baza, stanSesji: 'sluchanie' })).toBe('nasluchiwanie')
    expect(agregujStanEcho({ ...baza, stanSesji: 'transkrypcja' })).toBe('rozpoznawanie')
    expect(agregujStanEcho({ ...baza, stanSesji: 'myslenie' })).toBe('przetwarzanie')
    expect(agregujStanEcho({ ...baza, stanSesji: 'mowienie' })).toBe('odtwarzanieGlosu')
    expect(agregujStanEcho({ ...baza, stanSesji: 'oczekujePotwierdzenia' })).toBe('oczekiwanieNaPotwierdzenie')
    expect(agregujStanEcho({ ...baza, stanSesji: 'oczekujeDoprecyzowania' })).toBe('oczekiwanieNaDoprecyzowanie')
    expect(agregujStanEcho({ ...baza, oczekujePotwierdzenia: true })).toBe('oczekiwanieNaPotwierdzenie')
    expect(agregujStanEcho({ ...baza, oczekujeDoprecyzowania: true })).toBe('oczekiwanieNaDoprecyzowanie')
    expect(agregujStanEcho({ ...baza, tekstAktywny: true, stanAgenta: 'generuje' })).toBe('generowanieOdpowiedzi')
    expect(agregujStanEcho({ ...baza, stanSesji: 'anulowanie' })).toBe('anulowanie')
    expect(agregujStanEcho({ ...baza, stanSesji: 'blad' })).toBe('blad')
    expect(agregujStanEcho(baza)).toBe('bezczynny')
  })

  it('utrzymuje priorytet aktywnego głosu nad tekstem i anuluje odtwarzanie natychmiast', () => {
    expect(agregujStanEcho({ ...baza, stanSesji: 'mowienie', tekstAktywny: true, stanAgenta: 'generuje' })).toBe('odtwarzanieGlosu')
    expect(agregujStanEcho({ ...baza, stanSesji: 'anulowanie', tekstAktywny: true, stanAgenta: 'generuje' })).toBe('anulowanie')
  })
})
