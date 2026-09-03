import { describe, expect, it } from 'vitest'
import { parserRegulowySzybkiegoDodawania, uporzadkujTypySzybkiegoDodawania } from './parserSzybkiegoDodawania'
import { DOMYSLNE_USTAWIENIA } from './ustawienia'
import type { UstawieniaSzybkiegoDodawania } from './typy'

const kontekst = { referenceDate: new Date(2026, 7, 27, 12) }
describe('parser szybkiego dodawania', () => {
  it('rozpoznaje wydarzenie i przypomnienie', () => {
    expect(parserRegulowySzybkiegoDodawania.parse('spotkanie jutro o 12', { referenceDate: new Date(2026, 8, 2) }).suggestedType).toBe('wydarzenie')
    expect(parserRegulowySzybkiegoDodawania.parse('przypomnij jutro o 9', { referenceDate: new Date(2026, 8, 2) }).suggestedType).toBe('przypomnienie')
  })
  it.each([
    ['dentysta jutro 15:30', 'wizyta', '2026-08-28', '15:30'], ['kup olej do auta w sobotę', 'samochod', '2026-08-29', undefined],
    ['zapłać internet do 10 września', 'wydatek', '2026-09-10', undefined], ['weź lek o 20', 'lek', undefined, '20:00'],
    ['notatka pomysł na szafkę do garażu', 'notatka', undefined, undefined], ['zadzwoń do mechanika jutro', 'samochod', '2026-08-28', undefined],
  ])('rozpoznaje %s', (tekst, typ, data, godzina) => { const wynik = parserRegulowySzybkiegoDodawania.parse(tekst, kontekst); expect(wynik.suggestedType).toBe(typ); expect(wynik.suggestedDate).toBe(data); expect(wynik.suggestedTime).toBe(godzina) })
  it('nie tworzy daty dla nieprawidłowego zapisu', () => expect(parserRegulowySzybkiegoDodawania.parse('kup 31.02 śrub', kontekst).suggestedDate).toBeUndefined())
  it('zachowuje kolejność ręczną bez uczenia i stabilizuje remis', () => { const ustawienia: UstawieniaSzybkiegoDodawania = { ...DOMYSLNE_USTAWIENIA.szybkieDodawanie, kolejnoscTypow: ['notatka', 'zadanie', 'wizyta', 'lek', 'wydatek', 'samochod'], uczKolejnosci: false }; expect(uporzadkujTypySzybkiegoDodawania(ustawienia).slice(0, 2)).toEqual(['notatka', 'zadanie']); expect(uporzadkujTypySzybkiegoDodawania({ ...ustawienia, uczKolejnosci: true }).slice(0, 2)).toEqual(['notatka', 'zadanie']) })
  it('przesuwa częściej używany typ tylko przy włączonym uczeniu', () => { const ustawienia = { ...DOMYSLNE_USTAWIENIA.szybkieDodawanie, licznikiUzyc: { ...DOMYSLNE_USTAWIENIA.szybkieDodawanie.licznikiUzyc, lek: 3 } }; expect(uporzadkujTypySzybkiegoDodawania(ustawienia)[0]).toBe('lek') })
})
