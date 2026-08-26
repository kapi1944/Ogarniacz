import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { zadanieLegacyNaElement } from '../domain/adapterZadania'
import { baza, inicjalizujBaze } from './BazaOgarniacza'
import { RepozytoriumElementowZadan } from './RepozytoriumElementowZadan'

describe('wspólne repozytorium elementów zadań', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('normalizuje niepełne zadanie legacy bez modyfikowania źródła', () => {
    const zadanieLegacy = {
      id: 'legacy-1',
      tytul: '  Telefon do urzędu  ',
      status: 'w_toku',
      priorytet: 'wysoki',
      termin: '2026-09-02T08:30:00',
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-21T10:00:00.000Z',
    }

    const element = zadanieLegacyNaElement(zadanieLegacy)

    expect(element).toMatchObject({
      id: 'legacy-1',
      typ: 'zadanie',
      tytul: 'Telefon do urzędu',
      data: '2026-09-02',
      godzina: '08:30',
      trybTerminu: 'o_godzinie',
      priorytet: 'pilny',
      status: 'otwarty',
      tagi: [],
      referencjaZrodla: { modul: 'zadania', encjaId: 'legacy-1' },
    })
    expect(zadanieLegacy).not.toHaveProperty('tagi')
  })

  it('obsługuje pełny cykl utworzenia, odczytu, aktualizacji i usunięcia', async () => {
    const repozytorium = new RepozytoriumElementowZadan()
    const utworzony = await repozytorium.utworz({
      typ: 'zadanie',
      tytul: 'Pierwszy element',
      data: '2026-09-05',
      godzina: '12:15',
      terminGraniczny: '2026-09-07',
      priorytet: 'normalny',
      przypomnienia: [{ id: 'przypomnienie-1', przesuniecieMinuty: 15 }],
      dostepnoscPlanistyczna: 'pelna',
      zasobyIds: ['zasob-1'],
    })

    expect(await repozytorium.pobierz(utworzony.id)).toMatchObject({
      tytul: 'Pierwszy element',
      data: '2026-09-05',
      godzina: '12:15',
      terminGraniczny: '2026-09-07',
      przypomnienia: [{ id: 'przypomnienie-1', przesuniecieMinuty: 15 }],
      dostepnoscPlanistyczna: 'pelna',
      zasobyIds: ['zasob-1'],
    })

    const zaktualizowany = await repozytorium.aktualizuj(utworzony.id, {
      tytul: 'Zmieniony element',
      status: 'wykonany',
    })
    expect(zaktualizowany).toMatchObject({ tytul: 'Zmieniony element', status: 'wykonany' })

    await repozytorium.usun(utworzony.id)
    expect(await repozytorium.pobierz(utworzony.id)).toBeUndefined()
  })

  it('utrzymuje referencję źródłową podczas aktualizacji', async () => {
    const repozytorium = new RepozytoriumElementowZadan()
    const utworzony = await repozytorium.utworz({ typ: 'zadanie', tytul: 'Ze źródłem' })

    const zaktualizowany = await repozytorium.aktualizuj(utworzony.id, {
      opis: 'Po zmianie',
    })

    expect(zaktualizowany.referencjaZrodla).toEqual({
      modul: 'zadania',
      encjaId: utworzony.id,
    })
  })

  it('zwraca elementy wyłącznie z podanego zakresu dat', async () => {
    const repozytorium = new RepozytoriumElementowZadan()
    await repozytorium.utworz({ typ: 'zadanie', tytul: 'Przed', data: '2026-09-01' })
    await repozytorium.utworz({ typ: 'zadanie', tytul: 'W zakresie', data: '2026-09-05' })
    await repozytorium.utworz({ typ: 'zadanie', tytul: 'Po', data: '2026-09-10' })
    await repozytorium.utworz({ typ: 'zadanie', tytul: 'Bez daty' })

    const elementy = await repozytorium.lista({ od: '2026-09-02', do: '2026-09-08' })

    expect(elementy.map((element) => element.tytul)).toEqual(['W zakresie'])
  })
})
