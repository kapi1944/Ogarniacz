import { describe, expect, it } from 'vitest'
import {
  zapiszWartoscPolaWlasnego,
  utworzDefinicjePolaRejestru,
  type DefinicjaPolaRejestru,
  type PolaWlasne,
} from './rejestr'

const definicjaPolaCheckbox: DefinicjaPolaRejestru<'checkbox'> = {
  id: 'custom:potwierdzone',
  zrodlo: 'wlasne',
  etykieta: 'Potwierdzone',
  typ: 'checkbox',
  // @ts-expect-error Rola kwoty nie może zostać przypisana polu checkbox.
  rolaSemantyczna: 'semantyka:kwota',
}
void definicjaPolaCheckbox

describe('fundament Rejestru 2.0', () => {
  it('zapisuje wszystkie dozwolone wartości własne pod technicznymi ID', () => {
    let polaWlasne: PolaWlasne | undefined
    polaWlasne = zapiszWartoscPolaWlasnego(polaWlasne, 'custom:opis', 'Treść')
    polaWlasne = zapiszWartoscPolaWlasnego(polaWlasne, 'custom:liczba', 12.5)
    polaWlasne = zapiszWartoscPolaWlasnego(polaWlasne, 'custom:aktywny', true)
    polaWlasne = zapiszWartoscPolaWlasnego(polaWlasne, 'custom:tagi', ['dom', 'pilne'])
    polaWlasne = zapiszWartoscPolaWlasnego(polaWlasne, 'custom:brak', null)

    expect(polaWlasne).toEqual({
      'custom:opis': 'Treść',
      'custom:liczba': 12.5,
      'custom:aktywny': true,
      'custom:tagi': ['dom', 'pilne'],
      'custom:brak': null,
    })
  })

  it('zachowuje ID własnego pola po zmianie etykiety', () => {
    const pole = utworzDefinicjePolaRejestru({
      id: 'custom:ulubiony_kolor',
      zrodlo: 'wlasne',
      etykieta: 'Ulubiony kolor',
      typ: 'tekst',
    })
    const poZmianieEtykiety = { ...pole, etykieta: 'Preferowany kolor' }

    expect(poZmianieEtykiety.id).toBe('custom:ulubiony_kolor')
  })

  it('jednoznacznie rozróżnia pole systemowe od własnego', () => {
    const systemowe = utworzDefinicjePolaRejestru({
      id: 'system:nazwa',
      zrodlo: 'systemowe',
      kluczWlasciwosci: 'nazwa',
      etykieta: 'Nazwa',
      typ: 'tekst',
    })
    const wlasne = utworzDefinicjePolaRejestru({
      id: 'custom:nazwa_wlasna',
      zrodlo: 'wlasne',
      etykieta: 'Nazwa własna',
      typ: 'tekst',
    })

    expect(systemowe.zrodlo).toBe('systemowe')
    expect(systemowe.kluczWlasciwosci).toBe('nazwa')
    expect(wlasne.zrodlo).toBe('wlasne')
  })

  it('odrzuca nieistniejącą lub niezgodną rolę semantyczną', () => {
    expect(() => utworzDefinicjePolaRejestru({
      id: 'custom:flaga',
      zrodlo: 'wlasne',
      etykieta: 'Flaga',
      typ: 'checkbox',
      rolaSemantyczna: 'semantyka:kwota',
    } as unknown as DefinicjaPolaRejestru<'checkbox'>)).toThrow('Rola semantyczna')
    expect(() => utworzDefinicjePolaRejestru({
      id: 'custom:termin',
      zrodlo: 'wlasne',
      etykieta: 'Termin',
      typ: 'data',
      rolaSemantyczna: 'semantyka:nieistniejaca',
    } as unknown as DefinicjaPolaRejestru<'data'>)).toThrow('Rola semantyczna')
  })
})
