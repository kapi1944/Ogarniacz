import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { zadanieLegacyNaElement } from '../domain/adapterZadania'
import { baza, inicjalizujBaze } from './BazaOgarniacza'
import { KonfliktZmianyZadania, RepozytoriumElementowZadan } from './RepozytoriumElementowZadan'
import { pobierzRepozytorium } from './Repozytorium'
import { ustawBiezacyDostep } from '../services/UprawnieniaService'

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

  it('wykonuje zadanie tylko raz przy dwóch równoległych próbach i przywraca dokładny status źródła', async () => {
    const repozytorium = new RepozytoriumElementowZadan()
    const element = await repozytorium.utworz({ typ: 'zadanie', tytul: 'Telefon' })
    await baza.tabela('zadania').update(element.id, { status: 'w_toku' })
    const aktualny = (await repozytorium.pobierz(element.id))!
    const wyniki = await Promise.allSettled([repozytorium.zmienZDnia(aktualny, { status: 'wykonany' }), repozytorium.zmienZDnia(aktualny, { status: 'wykonany' })])
    expect(wyniki.filter((wynik) => wynik.status === 'fulfilled')).toHaveLength(1)
    const zapis = wyniki.find((wynik) => wynik.status === 'fulfilled')!
    if (zapis.status !== 'fulfilled') throw new Error('Brak zapisu')
    expect(await repozytorium.pobierz(element.id)).toMatchObject({ status: 'wykonany' })
    await repozytorium.cofnijZmianeDnia(zapis.value)
    expect(await baza.tabela('zadania').get(element.id)).toMatchObject({ status: 'w_toku' })
  })

  it('przekłada zadanie z godziną i cofa bez utraty wcześniejszego terminu', async () => {
    const repozytorium = new RepozytoriumElementowZadan()
    const element = await repozytorium.utworz({ typ: 'zadanie', tytul: 'Telefon', data: '2026-10-24', godzina: '12:30', trybTerminu: 'o_godzinie' })
    const zmiana = await repozytorium.zmienZDnia(element, { data: '2026-10-25', godzina: element.godzina, trybTerminu: element.trybTerminu })
    expect(await repozytorium.pobierz(element.id)).toMatchObject({ data: '2026-10-25', godzina: '12:30' })
    await repozytorium.cofnijZmianeDnia(zmiana)
    expect(await repozytorium.pobierz(element.id)).toMatchObject({ data: '2026-10-24', godzina: '12:30', trybTerminu: 'o_godzinie' })
  })

  it('odmawia cofnięcia po nowszej edycji, nawet w tej samej milisekundzie', async () => {
    const repozytorium = new RepozytoriumElementowZadan()
    const element = await repozytorium.utworz({ typ: 'zadanie', tytul: 'Telefon' })
    const zmiana = await repozytorium.zmienZDnia(element, { status: 'wykonany' })
    await baza.tabela('zadania').update(element.id, { opis: 'Nowsza zmiana', updatedAt: zmiana.po.updatedAt })
    await expect(repozytorium.cofnijZmianeDnia(zmiana)).rejects.toBeInstanceOf(KonfliktZmianyZadania)
    expect(await baza.tabela('zadania').get(element.id)).toMatchObject({ opis: 'Nowsza zmiana', status: 'wykonane' })
  })

  it('egzekwuje brak edycji w warstwie danych i zachowuje rekord', async () => {
    const repozytorium = new RepozytoriumElementowZadan()
    const element = await repozytorium.utworz({ typ: 'zadanie', tytul: 'Telefon' })
    ustawBiezacyDostep((_modul, operacja) => operacja === 'odczyt')
    await expect(repozytorium.zmienZDnia(element, { status: 'wykonany' })).rejects.toThrow('Brak uprawnień')
    expect(await repozytorium.pobierz(element.id)).toMatchObject({ status: 'otwarty' })
  })

  it('liczy zaległości bez wykonanych, pominiętych, prywatnych i przyszłych; ogranicza wynik do trzech', async () => {
    const repozytorium = new RepozytoriumElementowZadan()
    for (let indeks = 0; indeks < 5; indeks += 1) await repozytorium.utworz({ typ: 'zadanie', tytul: `Otwarte ${indeks}`, data: '2026-10-01', priorytet: indeks === 4 ? 'asap' : 'normalny' })
    await repozytorium.utworz({ typ: 'zadanie', tytul: 'Wykonane', data: '2026-10-01', status: 'wykonany' })
    await repozytorium.utworz({ typ: 'zadanie', tytul: 'Pominięte', data: '2026-10-01', status: 'pominiety' })
    await repozytorium.utworz({ typ: 'zadanie', tytul: 'Przyszłe', data: '2026-10-30' })
    const starsze = await repozytorium.utworz({ typ: 'zadanie', tytul: 'Starsze bez terminu legacy', data: '2026-10-01' })
    await baza.tabela('zadania').update(starsze.id, { termin: undefined })
    const prywatne = await repozytorium.utworz({ typ: 'zadanie', tytul: 'Prywatne', data: '2026-10-01' })
    await baza.tabela('zadania').update(prywatne.id, { sesjaTerapiiId: 'sesja' })
    const wynik = await repozytorium.zalegle('2026-10-24')
    expect(wynik.liczba).toBe(6)
    expect(wynik.elementy).toHaveLength(3)
    expect(wynik.elementy[0].priorytet).toBe('asap')
  })

  it('cofnięcie dodania odrzuca zmieniony rekord w transakcji i nie dopisuje usunięcia', async () => {
    const repozytorium = pobierzRepozytorium('zadania')
    const elementy = new RepozytoriumElementowZadan(repozytorium)
    const element = await elementy.utworz({ typ: 'zadanie', tytul: 'Nowe' })
    const oczekiwany = (await repozytorium.pobierz(element.id))!
    await baza.tabela('zadania').update(element.id, { opis: 'Zmieniono', updatedAt: oczekiwany.updatedAt })
    await expect(repozytorium.usun(element.id, oczekiwany)).rejects.toThrow('Nie można bezpiecznie')
    expect(await repozytorium.pobierz(element.id)).toMatchObject({ opis: 'Zmieniono' })
    const aktualny = (await repozytorium.pobierz(element.id))!
    await repozytorium.usun(element.id, aktualny)
    expect(await repozytorium.pobierz(element.id)).toBeUndefined()
  })
})
