import { describe, expect, it } from 'vitest'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type { Urlop, WyjatekGrafiku } from '../../domain/typy'
import { utworzDaneDnia } from './logikaDanychDnia'

const data = '2026-10-09'
function zadanie(id: string, zmiany: Partial<ElementOgarniacza<'zadanie'>> = {}): ElementOgarniacza<'zadanie'> {
  return { id, typ: 'zadanie', tytul: id, data, status: 'otwarty', createdAt: data, updatedAt: data, ...zmiany }
}

describe('wspólne dane dnia', () => {
  it('agreguje tylko wybraną datę, liczy otwarte, wykonane i pilne bez anulowanych i pominiętych', () => {
    const elementy = [
      zadanie('pilne', { priorytet: 'pilny', godzina: '09:00', trybTerminu: 'o_godzinie' }),
      zadanie('asap', { priorytet: 'asap' }), zadanie('wykonane', { status: 'wykonany', priorytet: 'pilny' }),
      zadanie('anulowane', { status: 'anulowany', priorytet: 'asap' }), zadanie('pominięte', { status: 'pominiety' }),
      zadanie('jutro', { data: '2026-10-10' }), zadanie('bez daty', { data: undefined }),
      zadanie('zła godzina', { godzina: '99:99', trybTerminu: 'o_godzinie' }),
    ]
    const dzien = utworzDaneDnia(data, elementy, DOMYSLNE_USTAWIENIA.harmonogram, [], [])
    expect(dzien.elementy).toHaveLength(6)
    expect(dzien.liczbaOtwartych).toBe(3)
    expect(dzien.liczbaWykonanych).toBe(1)
    expect(dzien.liczbaPilnych).toBe(2)
    expect(dzien.najwazniejszeTerminy.map((element) => element.id)).toEqual(['pilne', 'asap'])
    expect(dzien.elementyZGodzina.map((element) => element.id)).toEqual(['pilne'])
    expect(dzien.elementyBezGodziny).toHaveLength(5)
    expect(dzien.elementyOsi.map((element) => element.id)).toEqual(['pilne'])
    expect(dzien.charakterDnia).toBe('roboczy')
    expect(dzien.zakresPracy).toEqual({ od: '07:45', do: '16:00' })
    expect(elementy).toHaveLength(8)
  })
  it('zachowuje wykonaną dawkę leku na osi, lecz nie liczy jej jako otwartej', () => {
    const lek: ElementOgarniacza<'lek'> = { id: 'lek', typ: 'lek', tytul: 'Dawka', data, godzina: '08:00', trybTerminu: 'o_godzinie', status: 'wykonany', createdAt: data, updatedAt: data }
    const dzien = utworzDaneDnia(data, [lek, zadanie('zrobione', { godzina: '07:00', trybTerminu: 'o_godzinie', status: 'wykonany' })], DOMYSLNE_USTAWIENIA.harmonogram, [], [])
    expect(dzien.elementyZGodzina).toHaveLength(2)
    expect(dzien.elementyOsi).toEqual([lek])
    expect(dzien.liczbaWykonanych).toBe(2)
    expect(dzien.liczbaOtwartych).toBe(0)
  })
  it('stosuje najnowszy wyjątek i oblicza wolny weekend', () => {
    const wyjatek: WyjatekGrafiku = { id: 'nowy', data, pracuje: false, createdAt: data, updatedAt: '2026-10-09T12:00:00' }
    const starszy: WyjatekGrafiku = { ...wyjatek, id: 'stary', pracuje: true, updatedAt: '2026-10-09T08:00:00' }
    const dzien = utworzDaneDnia(data, [], DOMYSLNE_USTAWIENIA.harmonogram, [wyjatek, starszy], [])
    expect(dzien.wyjatekDnia).toBe(wyjatek)
    expect(dzien.charakterDnia).toBe('wolny')
    expect(dzien.zakresPracy).toBeUndefined()
    expect(utworzDaneDnia('2026-10-11', [], DOMYSLNE_USTAWIENIA.harmonogram, [], []).charakterDnia).toBe('wolny')
  })
  it('uwzględnia urlop w modelu kafelka', () => {
    const urlop: Urlop = { id: 'urlop', dataOd: data, dataDo: data, typ: 'chorobowe', status: 'potwierdzony', createdAt: data, updatedAt: data }
    expect(utworzDaneDnia(data, [], DOMYSLNE_USTAWIENIA.harmonogram, [], [urlop]).zakresPracy).toBeUndefined()
  })
})
