import { describe, expect, it } from 'vitest'
import { parsujTekstOcrLeku } from './LekiOcrParser'

describe('parser OCR opakowania leku', () => {
  it.each([
    ['IBUPROM MAX 400 mg 24 tabletki powlekane', 'IBUPROM MAX', '400 mg', 'tabletka_powlekana', 24, 'szt.'],
    ['AUGMENTIN 875 mg + 125 mg 14 tabletek', 'AUGMENTIN', '875 mg + 125 mg', 'tabletka', 14, 'szt.'],
    ['XYZ 20 mg/ml 100 ml syrop', 'XYZ', '20 mg/ml', 'syrop', 100, 'ml'],
    ['ABC 30 kapsułek 10 mg', 'ABC', '10 mg', 'kapsulka', 30, 'szt.'],
  ] as const)('rozpoznaje %s', (tekst, nazwa, moc, postac, ilosc, jednostka) => {
    const wynik = parsujTekstOcrLeku(tekst)
    expect(wynik.nazwa).toMatchObject({ wartosc: nazwa, pewne: true })
    expect(wynik.moc).toMatchObject({ wartosc: moc, pewne: true })
    expect(wynik.postac).toMatchObject({ wartosc: postac, pewne: true })
    expect(wynik.opakowanie).toMatchObject({ wartosc: { ilosc, jednostka }, pewne: true })
  })
})
