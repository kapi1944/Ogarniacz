import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from './BazaOgarniacza'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie, Wizyta } from '../domain/typy'
import { pobierzRepozytorium } from './Repozytorium'

describe.sequential('usuwanie rekordów źródłowych przypomnień', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('usuwa przyszłe przypomnienie powiązane z usuwaną wizytą', async () => {
    const wizyta: Wizyta = {
      ...utworzMetadane('wizyta-1'),
      nazwa: 'Dentysta',
      status: 'umowiona',
      notatka: '',
      pytania: [],
      dokumentyIds: [],
      checklista: [],
    }
    const przypomnienie: Przypomnienie = {
      ...utworzMetadane('przypomnienie-1'),
      tytul: 'Dentysta',
      zrodlo: { typ: 'wizyty', id: wizyta.id },
      typ: 'absolutne',
      czas: '2026-09-01T10:00:00.000Z',
      priorytet: 'wysoki',
      stan: 'nowe',
      eskalacja: true,
    }
    await baza.tabela('wizyty').put(wizyta)
    await baza.tabela('przypomnienia').put(przypomnienie)

    await pobierzRepozytorium('wizyty').usun(wizyta.id)

    expect(await baza.tabela('przypomnienia').get(przypomnienie.id)).toMatchObject({ usunietoAt: expect.any(String) })
  })
})
