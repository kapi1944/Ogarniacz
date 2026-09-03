import Dexie, { type Table } from 'dexie'
import { utworzMetadane } from '../domain/fabryki'
import { DOMYSLNE_USTAWIENIA } from '../domain/ustawienia'
import type { MapaTabel, NazwaTabeli } from '../domain/typy'

export const WERSJA_SCHEMATU_BAZY = 9

export const nazwyTabel: NazwaTabeli[] = [
  'zadania',
  'projekty',
  'skrzynka',
  'blokiCzasu',
  'grafikPracy',
  'wyjatkiGrafiku',
  'urlopy',
  'nawyki',
  'dziennikNawykow',
  'leki',
  'dziennikLekow',
  'wizyty',
  'skierowania',
  'recepty',
  'terapie',
  'wpisyTerapii',
  'przypomnienia',
  'listyZakupow',
  'pozycjeZakupow',
  'rachunki',
  'platnosciRachunkow',
  'notatki',
  'pomysly',
  'naPozniej',
  'cele',
  'kontakty',
  'dokumenty',
  'wydatki',
  'platnosciStale',
  'planyRat',
  'raty',
  'budzety',
  'pojazdy',
  'terminyWaznosci',
  'pamiecEcho',
  'uprawnienia',
  'edytorzy',
  'dziennikEcho',
  'ustawienia',
  'historiaZmian',
  'stanSynchronizacji',
  'konfliktySynchronizacji',
]

const schematPelny = {
  zadania: 'id, status, termin, priorytet, projektId, updatedAt, usunietoAt',
  projekty: 'id, status, termin, updatedAt, usunietoAt',
  skrzynka: 'id, status, createdAt, updatedAt, usunietoAt',
  blokiCzasu: 'id, poczatek, koniec, typ, status, updatedAt, usunietoAt',
  grafikPracy: 'id, dzienTygodnia, updatedAt, usunietoAt',
  wyjatkiGrafiku: 'id, data, updatedAt, usunietoAt',
  nawyki: 'id, aktywny, updatedAt, usunietoAt',
  dziennikNawykow: 'id, [nawykId+data], nawykId, data, updatedAt, usunietoAt',
  leki: 'id, aktywny, updatedAt, usunietoAt',
  dziennikLekow: 'id, [lekId+data+planowanaGodzina], lekId, data, status, updatedAt, usunietoAt',
  wizyty: 'id, status, data, terminGraniczny, updatedAt, usunietoAt',
  skierowania: 'id, status, terminWaznosci, wizytaId, updatedAt, usunietoAt',
  recepty: 'id, status, dataWystawienia, terminRealizacji, wizytaId, updatedAt, usunietoAt',
  terapie: 'id, status, dataRozpoczecia, updatedAt, usunietoAt',
  wpisyTerapii: 'id, terapiaId, dataCzas, wizytaId, updatedAt, usunietoAt',
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
  platnosciStale: 'id, aktywna, dataStartu, updatedAt, usunietoAt',
  planyRat: 'id, status, updatedAt, usunietoAt',
  raty: 'id, planRatId, data, status, updatedAt, usunietoAt',
  budzety: 'id, okres, kategoria, updatedAt, usunietoAt',
  pojazdy: 'id, ocDo, przegladDo, wymianaOlejuDo, planowanySerwisData, updatedAt, usunietoAt',
  terminyWaznosci: 'id, dataWaznosci, status, updatedAt, usunietoAt',
  pamiecEcho: 'id, typ, wrazliwosc, updatedAt, usunietoAt',
  uprawnienia: 'id, editorId, modul, status, updatedAt, usunietoAt',
  edytorzy: 'id, aktywny, updatedAt, usunietoAt',
  dziennikEcho: 'id, ryzyko, wynik, createdAt, updatedAt, usunietoAt',
  ustawienia: 'id, updatedAt, usunietoAt',
}

class BazaOgarniacza extends Dexie {
  constructor() {
    super('ogarniacz-v1')

    this.version(1).stores({
      zadania: 'id, status, termin, priorytet, updatedAt',
      leki: 'id, aktywny, updatedAt',
      dziennikLekow: 'id, [lekId+data+planowanaGodzina], lekId, data, status, updatedAt',
      ustawienia: 'id, updatedAt',
    })

    this.version(2)
      .stores(schematPelny)
      .upgrade(async (transakcja) => {
        await transakcja.table('zadania').toCollection().modify((zadanie) => {
          zadanie.opis ??= ''
          zadanie.tagi ??= []
          zadanie.podzadania ??= []
          zadanie.powiazania ??= []
        })
      })

    this.version(3).stores({
      ...schematPelny,
      urlopy: 'id, dataOd, dataDo, typ, status, updatedAt, usunietoAt',
    })

    this.version(WERSJA_SCHEMATU_BAZY).stores({
      ...schematPelny,
      urlopy: 'id, dataOd, dataDo, typ, status, updatedAt, usunietoAt',
      historiaZmian: 'id, znacznikCzasu, modul, typEncji, encjaId, operacja, updatedAt, usunietoAt',
      stanSynchronizacji: 'id, stan, ostatniSync, updatedAt',
      konfliktySynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, wykrytoAt, updatedAt',
    })
  }

  tabela<K extends NazwaTabeli>(nazwa: K): Table<MapaTabel[K], string> {
    return this.table(nazwa) as Table<MapaTabel[K], string>
  }
}

export const baza = new BazaOgarniacza()

export async function inicjalizujBaze(): Promise<void> {
  await baza.open()
  const ustawienia = baza.tabela('ustawienia')
  if (!(await ustawienia.get('glowne'))) {
    await ustawienia.put(DOMYSLNE_USTAWIENIA)
  }

  const stanSynchronizacji = baza.tabela('stanSynchronizacji')
  if (!(await stanSynchronizacji.get('glowny'))) {
    await stanSynchronizacji.put({
      ...utworzMetadane('glowny'),
      stan: 'zsynchronizowano',
      liczbaKonfliktow: 0,
    })
  }

  const grafik = baza.tabela('grafikPracy')
  if ((await grafik.count()) === 0) {
    await grafik.bulkPut(
      Array.from({ length: 7 }, (_, dzienTygodnia) => ({
        ...utworzMetadane(`grafik-${dzienTygodnia}`),
        dzienTygodnia,
        aktywny: dzienTygodnia >= 1 && dzienTygodnia <= 5,
        od: DOMYSLNE_USTAWIENIA.harmonogram.godzinaRozpoczecia,
        do: DOMYSLNE_USTAWIENIA.harmonogram.godzinaZakonczenia,
      })),
    )
  }
}
