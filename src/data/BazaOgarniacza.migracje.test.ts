import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { baza, WERSJA_SCHEMATU_BAZY } from './BazaOgarniacza'

const schematWersji4 = {
  zadania: 'id, status, termin, priorytet, projektId, updatedAt, usunietoAt',
  projekty: 'id, status, termin, updatedAt, usunietoAt',
  skrzynka: 'id, status, createdAt, updatedAt, usunietoAt',
  blokiCzasu: 'id, poczatek, koniec, typ, status, updatedAt, usunietoAt',
  grafikPracy: 'id, dzienTygodnia, updatedAt, usunietoAt',
  wyjatkiGrafiku: 'id, data, updatedAt, usunietoAt',
  urlopy: 'id, dataOd, dataDo, typ, status, updatedAt, usunietoAt',
  nawyki: 'id, aktywny, updatedAt, usunietoAt',
  dziennikNawykow: 'id, [nawykId+data], nawykId, data, updatedAt, usunietoAt',
  leki: 'id, aktywny, updatedAt, usunietoAt',
  dziennikLekow: 'id, [lekId+data+planowanaGodzina], lekId, data, status, updatedAt, usunietoAt',
  wizyty: 'id, status, data, terminGraniczny, updatedAt, usunietoAt',
  przypomnienia: 'id, stan, czas, priorytet, updatedAt, usunietoAt',
  listyZakupow: 'id, aktywna, updatedAt, usunietoAt',
  pozycjeZakupow: 'id, listaId, kupione, updatedAt, usunietoAt',
  rachunki: 'id, status, termin, updatedAt, usunietoAt',
  platnosciRachunkow: 'id, rachunekId, zaplaconoAt, updatedAt, usunietoAt',
  notatki: 'id, updatedAt, usunietoAt',
  pomysly: 'id, status, updatedAt, usunietoAt',
  naPozniej: 'id, typ, status, updatedAt, usunietoAt',
  cele: 'id, status, updatedAt, usunietoAt',
  kontakty: 'id, updatedAt, usunietoAt',
  dokumenty: 'id, terminWaznosci, updatedAt, usunietoAt',
  wydatki: 'id, data, kategoria, updatedAt, usunietoAt',
  budzety: 'id, okres, kategoria, updatedAt, usunietoAt',
  pojazdy: 'id, ocDo, przegladDo, wymianaOlejuDo, planowanySerwisData, updatedAt, usunietoAt',
  terminyWaznosci: 'id, dataWaznosci, status, updatedAt, usunietoAt',
  pamiecEcho: 'id, typ, wrazliwosc, updatedAt, usunietoAt',
  uprawnienia: 'id, editorId, modul, status, updatedAt, usunietoAt',
  edytorzy: 'id, aktywny, updatedAt, usunietoAt',
  dziennikEcho: 'id, ryzyko, wynik, createdAt, updatedAt, usunietoAt',
  ustawienia: 'id, updatedAt, usunietoAt',
}

const schematWersji5 = {
  ...schematWersji4,
  historiaZmian: 'id, znacznikCzasu, modul, typEncji, encjaId, operacja',
}

const schematWersji6 = {
  ...schematWersji5,
  historiaZmian: 'id, znacznikCzasu, modul, typEncji, encjaId, operacja, updatedAt, usunietoAt',
  stanSynchronizacji: 'id, stan, ostatniSync, updatedAt',
  konfliktySynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, wykrytoAt, updatedAt',
}

const schematWersji7 = {
  ...schematWersji6,
  platnosciStale: 'id, aktywna, dataStartu, updatedAt, usunietoAt',
  planyRat: 'id, status, updatedAt, usunietoAt',
  raty: 'id, planRatId, data, status, updatedAt, usunietoAt',
}

const schematWersji9 = {
  ...schematWersji7,
  skierowania: 'id, status, terminWaznosci, wizytaId, updatedAt, usunietoAt',
  recepty: 'id, status, dataWystawienia, terminRealizacji, wizytaId, updatedAt, usunietoAt',
  terapie: 'id, status, dataRozpoczecia, updatedAt, usunietoAt',
  wpisyTerapii: 'id, terapiaId, dataCzas, wizytaId, updatedAt, usunietoAt',
}

const schematWersji10 = {
  ...schematWersji9,
  kolejkaSynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, operacja, createdAt, updatedAt',
}

const schematWersji11 = {
  ...schematWersji10,
  kontaFinansowe: 'id, typ, aktywne, updatedAt, usunietoAt',
  miejsca: 'id, typ, nazwa, updatedAt, usunietoAt',
}

const wersjeHistoryczne = [
  { numer: 4, schemat: schematWersji4 },
  { numer: 5, schemat: schematWersji5 },
  { numer: 6, schemat: schematWersji6 },
  { numer: 7, schemat: schematWersji7 },
  { numer: 9, schemat: schematWersji9 },
  { numer: 10, schemat: schematWersji10 },
  { numer: 11, schemat: schematWersji11 },
  { numer: 12, schemat: schematWersji11 },
] as const

const metadane = {
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T11:00:00.000Z',
  usunietoAt: '2026-08-30T12:00:00.000Z',
}

async function utworzBazeHistoryczna(wersja: typeof wersjeHistoryczne[number]): Promise<void> {
  baza.close()
  await Dexie.delete('ogarniacz-v1')

  const historycznaBaza = new Dexie('ogarniacz-v1')
  historycznaBaza.version(wersja.numer).stores(wersja.schemat)
  await historycznaBaza.open()

  await historycznaBaza.table('zadania').put({
    id: `zadanie-v${wersja.numer}`,
    tytul: 'Zachowane zadanie',
    status: 'do_zrobienia',
    termin: '2026-09-01',
    priorytet: 'wysoki',
    ...metadane,
  })
  await historycznaBaza.table('leki').put({
    id: `lek-v${wersja.numer}`,
    nazwa: 'Zachowany lek',
    aktywny: true,
    godziny: ['08:00', 'nie-godzina'],
    zuzycieNaDawke: 2,
    dawkaInstrukcja: 'Po sniadaniu',
    ...metadane,
  })
  await historycznaBaza.table('ustawienia').put({ id: 'glowne', motyw: 'ciemny', ...metadane })

  if (wersja.numer >= 6) {
    await historycznaBaza.table('stanSynchronizacji').put({ id: 'glowny', stan: 'offline', ostatniSync: '2026-08-30T09:00:00.000Z', ...metadane })
    await historycznaBaza.table('konfliktySynchronizacji').put({ id: `konflikt-v${wersja.numer}`, tabela: 'zadania', rekordId: `zadanie-v${wersja.numer}`, wykrytoAt: '2026-08-30T10:30:00.000Z', ...metadane })
  }
  if (wersja.numer >= 9) {
    await historycznaBaza.table('skierowania').put({ id: `skierowanie-v${wersja.numer}`, status: 'aktywne', terminWaznosci: '2026-12-31', ...metadane })
  }
  if (wersja.numer >= 10) {
    await historycznaBaza.table('kolejkaSynchronizacji').put({ id: `kolejka-v${wersja.numer}`, tabela: 'zadania', rekordId: `zadanie-v${wersja.numer}`, operacja: 'zapisz', ...metadane })
  }
  if (wersja.numer === 12) {
    await historycznaBaza.table('leki').update(`lek-v${wersja.numer}`, {
      dawki: [{ id: 'dawka-v12', godzina: '08:00', ilosc: 0, instrukcja: 'Po sniadaniu' }],
      trybDawkowania: 'konkretne_godziny',
    })
  }
  await historycznaBaza.close()
}

describe.sequential('migracja historycznych baz Dexie do v15', () => {
  afterEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
  })

  it.each(wersjeHistoryczne)('otwiera rzeczywisty schemat v$numer bez utraty danych', async (wersja) => {
    await utworzBazeHistoryczna(wersja)

    await baza.open()

    expect(baza.verno).toBe(WERSJA_SCHEMATU_BAZY)
    await expect(baza.tabela('zadania').get(`zadanie-v${wersja.numer}`)).resolves.toMatchObject({
      id: `zadanie-v${wersja.numer}`,
      tytul: 'Zachowane zadanie',
      ...metadane,
    })
    await expect(baza.tabela('ustawienia').get('glowne')).resolves.toMatchObject({ id: 'glowne', motyw: 'ciemny', ...metadane })

    const lek = await baza.tabela('leki').get(`lek-v${wersja.numer}`)
    expect(lek).toMatchObject({ id: `lek-v${wersja.numer}`, nazwa: 'Zachowany lek', godziny: ['08:00', 'nie-godzina'], ...metadane, trybDawkowania: 'konkretne_godziny' })
    expect(lek?.dawki).toEqual(wersja.numer === 12
      ? [{ id: 'dawka-v12', godzina: '08:00', instrukcja: 'Po sniadaniu' }]
      : [{ id: `starsza-dawka:lek-v${wersja.numer}:08:00`, godzina: '08:00', ilosc: 2, instrukcja: 'Po sniadaniu' }])

    if (wersja.numer >= 6) {
      await expect(baza.tabela('stanSynchronizacji').get('glowny')).resolves.toMatchObject({ id: 'glowny', stan: 'offline', ...metadane })
      await expect(baza.tabela('konfliktySynchronizacji').get(`konflikt-v${wersja.numer}`)).resolves.toMatchObject({ id: `konflikt-v${wersja.numer}`, tabela: 'zadania', rekordId: `zadanie-v${wersja.numer}`, ...metadane })
    }
    if (wersja.numer >= 9) {
      await expect(baza.tabela('skierowania').get(`skierowanie-v${wersja.numer}`)).resolves.toMatchObject({ id: `skierowanie-v${wersja.numer}`, status: 'aktywne', ...metadane })
    }
    if (wersja.numer >= 10) {
      await expect(baza.tabela('kolejkaSynchronizacji').get(`kolejka-v${wersja.numer}`)).resolves.toMatchObject({ id: `kolejka-v${wersja.numer}`, tabela: 'zadania', rekordId: `zadanie-v${wersja.numer}`, ...metadane })
    }
  })

  it('projektuje jednostkaLubPostac i zapas do nowych pól apteczki', async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    const bazaV13 = new Dexie('ogarniacz-v1')
    bazaV13.version(13).stores({ leki: 'id, aktywny, updatedAt, usunietoAt' })
    await bazaV13.open()
    await bazaV13.table('leki').put({
      id: 'lek-z-projekcja', nazwa: 'Starszy syrop', aktywny: true, godziny: ['08:00'], dawkaInstrukcja: '', jednostkaLubPostac: 'syrop', zapasJednostek: 120, ...metadane,
    })
    await bazaV13.close()

    await baza.open()

    await expect(baza.tabela('leki').get('lek-z-projekcja')).resolves.toMatchObject({
      postac: 'syrop',
      ruchyApteczki: [{ id: 'stan-poczatkowy:lek-z-projekcja', typ: 'dodanie', ilosc: 120 }],
      jednostkaLubPostac: 'syrop',
    })
  })

  it('dodaje tabele Rejestru 2.0 do bazy v14 bez przepisywania istniejących rekordów', async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    const bazaV14 = new Dexie('ogarniacz-v1')
    bazaV14.version(14).stores({
      zadania: 'id, status, termin, priorytet, projektId, updatedAt, usunietoAt',
    })
    await bazaV14.open()
    await bazaV14.table('zadania').put({
      id: 'zadanie-z-wlasna-wartoscia', tytul: 'Stare dane', status: 'otwarte', priorytet: 'normalny',
      polaWlasne: { 'custom:producent': 'Zachowana wartość' }, ...metadane,
    })
    await bazaV14.close()

    await baza.open()

    expect(await baza.tabela('zadania').get('zadanie-z-wlasna-wartoscia')).toEqual(expect.objectContaining({
      polaWlasne: { 'custom:producent': 'Zachowana wartość' },
    }))
    expect(await baza.tabela('definicjeWlasnychPolRejestru').count()).toBe(0)
    expect(await baza.tabela('widokiRejestru').count()).toBe(0)
  })

  it('nadaje revision istniejącej definicji własnego pola Rejestru', async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    const bazaV15 = new Dexie('ogarniacz-v1')
    bazaV15.version(15).stores({
      definicjeWlasnychPolRejestru: 'id, rejestrId, aktywne, updatedAt, usunietoAt',
    })
    await bazaV15.open()
    await bazaV15.table('definicjeWlasnychPolRejestru').put({
      id: 'custom:starsze', rejestrId: 'subskrypcje', etykieta: 'Starsze pole', typ: 'tekst', aktywne: true, ...metadane,
    })
    await bazaV15.close()

    await baza.open()

    expect(await baza.tabela('definicjeWlasnychPolRejestru').get('custom:starsze')).toMatchObject({ revision: 1 })
  })
})
