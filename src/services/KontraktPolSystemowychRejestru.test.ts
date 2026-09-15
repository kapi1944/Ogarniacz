import { describe, expect, it, vi } from 'vitest'
import type { DefinicjaPolaRejestru } from '../domain/rejestr'
import type { EncjaBazowa } from '../domain/typy'
import {
  RejestrAkcjiDomenowychPolSystemowych,
  RejestrResolverowPolSystemowych,
  zapiszBezposredniaWartoscPolaSystemowego,
} from './KontraktPolSystemowychRejestru'

interface RekordTestowy extends EncjaBazowa {
  nazwa: string
  kwota: number
}

const rekord: RekordTestowy = { id: 'rekord-1', createdAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z', nazwa: 'Plan', kwota: 20 }
const poleBezposrednie: DefinicjaPolaRejestru<'tekst'> = { id: 'system:nazwa', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'nazwa', etykieta: 'Nazwa', typ: 'tekst' }
const poleResolvera: DefinicjaPolaRejestru<'kwota'> = { id: 'system:suma', zrodlo: 'systemowe', trybObslugi: 'tylko_odczyt', resolverId: 'resolver:testowa-suma', etykieta: 'Suma', typ: 'kwota' }
const poleAkcji: DefinicjaPolaRejestru<'checkbox'> = { id: 'system:zatwierdz', zrodlo: 'systemowe', trybObslugi: 'akcja_domenowa', actionId: 'action:zatwierdz-plan', etykieta: 'Zatwierdź', typ: 'checkbox' }

describe('kontrakt pól systemowych Rejestru', () => {
  it('wylicza resolver z kilku źródeł i odświeża tylko po jego revision', () => {
    const resolvery = new RejestrResolverowPolSystemowych()
    const rozwiaz = vi.fn(({ encja, daneZrodlowe }: { encja: RekordTestowy; daneZrodlowe: Record<string, unknown> }) => encja.kwota + Number(daneZrodlowe.doplata))
    resolvery.zarejestruj({
      id: 'resolver:testowa-suma',
      wyznaczRevision: ({ encja, daneZrodlowe }) => `${encja.updatedAt}:${daneZrodlowe.doplata}`,
      rozwiaz,
    })

    expect(resolvery.odczytaj(poleResolvera, { encja: rekord, daneZrodlowe: { doplata: 5, niepowiazane: 'a' } })).toEqual({ stan: 'gotowe', wartosc: 25 })
    expect(resolvery.odczytaj(poleResolvera, { encja: rekord, daneZrodlowe: { doplata: 5, niepowiazane: 'b' } })).toEqual({ stan: 'gotowe', wartosc: 25 })
    expect(rozwiaz).toHaveBeenCalledTimes(1)
    expect(resolvery.odczytaj(poleResolvera, { encja: rekord, daneZrodlowe: { doplata: 7 } })).toEqual({ stan: 'gotowe', wartosc: 27 })
    expect(rozwiaz).toHaveBeenCalledTimes(2)
  })

  it('zwraca błąd tylko dla pola, którego resolver zawiódł', () => {
    const resolvery = new RejestrResolverowPolSystemowych()
    resolvery.zarejestruj({
      id: 'resolver:testowa-suma',
      wyznaczRevision: () => '1',
      rozwiaz: () => { throw new Error('brak kursu') },
    })

    expect(resolvery.odczytaj(poleResolvera, { encja: rekord, daneZrodlowe: {} })).toEqual({ stan: 'blad', komunikat: 'Nie udało się wyliczyć wartości: brak kursu' })
  })

  it('uruchamia handler wskazany przez actionId', async () => {
    const akcje = new RejestrAkcjiDomenowychPolSystemowych()
    const zatwierdz = vi.fn().mockResolvedValue(undefined)
    const innaAkcja = vi.fn().mockResolvedValue(undefined)
    akcje.zarejestruj({ id: 'action:zatwierdz-plan', wykonaj: zatwierdz })
    akcje.zarejestruj({ id: 'action:inna', wykonaj: innaAkcja })

    await akcje.uruchom(poleAkcji, { encja: rekord, daneZrodlowe: {} })

    expect(zatwierdz).toHaveBeenCalledWith({ encja: rekord, daneZrodlowe: {} })
    expect(innaAkcja).not.toHaveBeenCalled()
  })

  it('blokuje bezpośredni zapis pola tylko do odczytu i pola z akcją', () => {
    expect(zapiszBezposredniaWartoscPolaSystemowego(rekord, poleBezposrednie, 'Nowa nazwa')).toMatchObject({ nazwa: 'Nowa nazwa' })
    expect(() => zapiszBezposredniaWartoscPolaSystemowego(rekord, poleResolvera, 25)).toThrow('nie pozwala na bezpośredni zapis')
    expect(() => zapiszBezposredniaWartoscPolaSystemowego(rekord, poleAkcji, true)).toThrow('nie pozwala na bezpośredni zapis')
  })
})
