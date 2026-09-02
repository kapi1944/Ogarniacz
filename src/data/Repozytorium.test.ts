import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from './BazaOgarniacza'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie, Wizyta } from '../domain/typy'
import { pobierzRepozytorium } from './Repozytorium'

describe.sequential('powiązane przypomnienia rekordów źródłowych', () => {
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

  it('po zmianie terminu wizyty aktualizuje i ponownie uzbraja powiązane przypomnienie', async () => {
    const wizyta: Wizyta = {
      ...utworzMetadane('wizyta-1'),
      nazwa: 'Dentysta',
      status: 'umowiona',
      data: '2026-09-03',
      godzina: '10:00',
      notatka: '',
      pytania: [],
      dokumentyIds: [],
      checklista: [],
    }
    const przypomnienie: Przypomnienie = {
      ...utworzMetadane('przypomnienie-1'),
      tytul: 'Dentysta',
      zrodlo: { typ: 'wizyty', id: wizyta.id },
      typ: 'wzgledne',
      czas: '2026-09-03T10:00:00',
      przesuniecieMin: 1440,
      priorytet: 'wysoki',
      stan: 'odroczone',
      odroczoneDo: '2026-09-03T12:00:00.000Z',
      eskalacja: true,
    }
    await baza.tabela('wizyty').put(wizyta)
    await baza.tabela('przypomnienia').put(przypomnienie)

    await pobierzRepozytorium('wizyty').zapisz({ ...wizyta, data: '2026-09-04', godzina: '11:30' })

    expect(await baza.tabela('przypomnienia').get(przypomnienie.id)).toMatchObject({
      czas: '2026-09-04T11:30:00',
      stan: 'nowe',
      odroczoneDo: undefined,
    })
  })
})
