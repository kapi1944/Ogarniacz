import { describe, expect, it } from 'vitest'
import type { ElementOgarniacza } from '../domain/elementyOgarniacza'
import type { WpisHistoriiZmian } from '../domain/typy'
import { utworzBriefingDnia } from './BriefingDniaService'

const data = '2026-09-08'
const element = (id: string, zmiany: Partial<ElementOgarniacza> = {}): ElementOgarniacza => ({
  id, typ: 'zadanie', tytul: id, data, status: 'otwarty', priorytet: 'normalny', createdAt: `${data}T07:00:00Z`, updatedAt: `${data}T07:00:00Z`, ...zmiany,
} as ElementOgarniacza)

describe('briefing dnia', () => {
  it('poranny agreguje pracę, pierwsze wydarzenie, priorytet, deadline, konflikt i przypomnienie bez pełnej listy', () => {
    const dane = {
      data,
      praca: { od: '08:00', do: '16:00' },
      elementyDzisiaj: [
        element('raport', { tytul: 'Raport', priorytet: 'asap', terminGraniczny: `${data}T12:00:00` }),
        element('dentysta', { typ: 'wizyta', tytul: 'Dentysta', godzina: '15:00', czasTrwaniaMinuty: 60 }),
        element('trening', { tytul: 'Trening', godzina: '15:30', czasTrwaniaMinuty: 60 }),
        element('drobiazg-1'), element('drobiazg-2'), element('drobiazg-3'),
      ],
      elementyJutro: [],
      przypomnienia: [{ tytul: 'Telefon', czas: `${data}T10:00:00` }],
    }
    const wynik = utworzBriefingDnia(dane, 'poranny')

    expect(wynik.tekst).toContain('Pracujesz 08:00–16:00')
    expect(wynik.tekst).toContain('O 15:00 masz Dentysta')
    expect(wynik.tekst).toContain('Najważniejsze: Raport')
    expect(wynik.tekst).toContain('Termin dzisiaj')
    expect(wynik.tekst).toContain('Konflikt:')
    expect(wynik.tekst).not.toContain('drobiazg-3')
  })

  it('wieczorny rozróżnia wykonane, niewykonane, przeniesione i jutro', () => {
    const historia: WpisHistoriiZmian = {
      id: 'h', modul: 'zadania', typEncji: 'zadania', encjaId: 'raport', operacja: 'aktualizacja', znacznikCzasu: `${data}T18:00:00Z`,
      zmienionePola: ['dataElementu'], przed: { tytul: 'Raport', dataElementu: data }, po: { tytul: 'Raport', dataElementu: '2026-09-09' }, createdAt: `${data}T18:00:00Z`, updatedAt: `${data}T18:00:00Z`,
    }
    const wynik = utworzBriefingDnia({
      data,
      elementyDzisiaj: [element('zakupy', { tytul: 'Zakupy', status: 'wykonany' }), element('dokumenty', { tytul: 'Dokumenty' })],
      elementyJutro: [element('raport', { tytul: 'Raport', data: '2026-09-09' })],
      historia: [historia],
    }, 'wieczorny')

    expect(wynik.tekst).toContain('Wykonane: Zakupy')
    expect(wynik.tekst).toContain('Zostało: Dokumenty')
    expect(wynik.tekst).toContain('Przeniesione: Raport')
    expect(wynik.tekst).toContain('Jutro najważniejsze: Raport')
    expect(wynik.tekst).toContain('Przenieść to zadanie na jutro?')
  })

  it('tryb swobodny zmienia ton, ale zachowuje te same dane', () => {
    const dane = { data, elementyDzisiaj: [element('raport', { tytul: 'Raport', priorytet: 'asap' })], elementyJutro: [] }
    expect(utworzBriefingDnia(dane, 'poranny', 'swobodny').tekst).toBe('Dzień wygląda tak: Najważniejsze: Raport.')
  })
})
