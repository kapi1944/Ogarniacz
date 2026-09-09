import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { utworzMetadane } from '../domain/fabryki'
import type { Projekt, Zadanie } from '../domain/typy'
import { szukajGlobalnie } from './WyszukiwanieService'

describe.sequential('wyszukiwanie globalne', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('zwraca typ, ważny kontekst i bezpośredni adres elementu', async () => {
    const projekt: Projekt = { ...utworzMetadane('projekt-1'), nazwa: 'Dom', opis: '', status: 'aktywne', blokady: '' }
    const zadanie: Zadanie = {
      ...utworzMetadane('zadanie ze spacją'),
      tytul: 'Naprawić kran',
      opis: '',
      status: 'w_toku',
      priorytet: 'normalny',
      termin: '2026-09-12',
      projektId: projekt.id,
      tagi: [],
      podzadania: [],
      powiazania: [],
    }
    await baza.tabela('projekty').put(projekt)
    await baza.tabela('zadania').put(zadanie)

    const [wynik] = await szukajGlobalnie('naprawic kran')

    expect(wynik).toMatchObject({
      id: zadanie.id,
      typ: 'Zadanie',
      etykieta: 'Naprawić kran',
      opis: 'Projekt: Dom · Status: w toku · Termin: 2026-09-12',
      url: '/zadania?element=zadanie%20ze%20spacj%C4%85',
    })
  })

  it('rozróżnia konkretny typ elementu zdrowotnego', async () => {
    await baza.tabela('wizyty').put({ ...utworzMetadane('wizyta-1'), nazwa: 'Dentysta', status: 'umowiona', data: '2026-09-15', godzina: '10:30', notatka: '', pytania: [], dokumentyIds: [], checklista: [] })

    await expect(szukajGlobalnie('dentysta')).resolves.toEqual([
      expect.objectContaining({ typ: 'Wizyta', opis: 'Data: 2026-09-15 · Godzina: 10:30', url: '/zdrowie/wizyty?element=wizyta-1' }),
    ])
  })
})
