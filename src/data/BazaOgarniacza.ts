import Dexie, { type Table } from 'dexie'
import { utworzMetadane } from '../domain/fabryki'
import { DOMYSLNE_USTAWIENIA } from '../domain/ustawienia'
import type { MapaTabel, NazwaTabeli } from '../domain/typy'

export const WERSJA_SCHEMATU_BAZY = 15

const POSTAC_Z_HISTORYCZNEJ_WARTOSCI: Record<string, string> = {
  tabletka: 'tabletka',
  'tabletka powlekana': 'tabletka_powlekana',
  kapsulka: 'kapsulka',
  kapsułka: 'kapsulka',
  syrop: 'syrop',
  zawiesina: 'zawiesina',
  krople: 'krople',
  aerozol: 'aerozol',
  inhalacja: 'inhalacja',
  saszetka: 'saszetka',
  proszek: 'proszek',
  roztwor: 'roztwor',
  roztwór: 'roztwor',
  masc: 'masc',
  maść: 'masc',
  krem: 'krem',
  zel: 'zel',
  żel: 'zel',
  czopek: 'czopek',
  plaster: 'plaster',
  ampułka: 'ampulka',
  ampulka: 'ampulka',
  fiolka: 'fiolka',
}

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
  'kontaFinansowe',
  'miejsca',
  'pojazdy',
  'terminyWaznosci',
  'pamiecEcho',
  'uprawnienia',
  'edytorzy',
  'dziennikEcho',
  'definicjeWlasnychPolRejestru',
  'widokiRejestru',
  'ustawienia',
  'historiaZmian',
  'stanSynchronizacji',
  'konfliktySynchronizacji',
  'kolejkaSynchronizacji',
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
  kontaFinansowe: 'id, typ, aktywne, updatedAt, usunietoAt',
  miejsca: 'id, typ, nazwa, updatedAt, usunietoAt',
  pojazdy: 'id, ocDo, przegladDo, wymianaOlejuDo, planowanySerwisData, updatedAt, usunietoAt',
  terminyWaznosci: 'id, dataWaznosci, status, updatedAt, usunietoAt',
  pamiecEcho: 'id, typ, wrazliwosc, updatedAt, usunietoAt',
  uprawnienia: 'id, editorId, modul, status, updatedAt, usunietoAt',
  edytorzy: 'id, aktywny, updatedAt, usunietoAt',
  dziennikEcho: 'id, ryzyko, wynik, createdAt, updatedAt, usunietoAt',
  definicjeWlasnychPolRejestru: 'id, rejestrId, aktywne, updatedAt, usunietoAt',
  widokiRejestru: 'id, rejestrId, updatedAt, usunietoAt',
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

    this.version(13).stores({
      ...schematPelny,
      urlopy: 'id, dataOd, dataDo, typ, status, updatedAt, usunietoAt',
      historiaZmian: 'id, znacznikCzasu, modul, typEncji, encjaId, operacja, updatedAt, usunietoAt',
      stanSynchronizacji: 'id, stan, ostatniSync, updatedAt',
      konfliktySynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, wykrytoAt, updatedAt',
      kolejkaSynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, operacja, createdAt, updatedAt',
    }).upgrade(async (transakcja) => {
      await transakcja.table('leki').toCollection().modify((lek) => {
        if (Array.isArray(lek.dawki) && lek.dawki.length > 0) {
          lek.dawki.forEach((dawka: { ilosc?: number }) => {
            if (dawka.ilosc === 0) delete dawka.ilosc
          })
          return
        }
        lek.dawki = (Array.isArray(lek.godziny) ? lek.godziny : [])
          .filter((godzina: unknown) => typeof godzina === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(godzina))
          .map((godzina: string) => ({ id: `starsza-dawka:${lek.id}:${godzina}`, godzina, ilosc: typeof lek.zuzycieNaDawke === 'number' && lek.zuzycieNaDawke > 0 ? lek.zuzycieNaDawke : undefined, instrukcja: lek.dawkaInstrukcja || undefined }))
        lek.trybDawkowania ??= 'konkretne_godziny'
      })
    })

    this.version(14).stores({
      ...schematPelny,
      urlopy: 'id, dataOd, dataDo, typ, status, updatedAt, usunietoAt',
      historiaZmian: 'id, znacznikCzasu, modul, typEncji, encjaId, operacja, updatedAt, usunietoAt',
      stanSynchronizacji: 'id, stan, ostatniSync, updatedAt',
      konfliktySynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, wykrytoAt, updatedAt',
      kolejkaSynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, operacja, createdAt, updatedAt',
    }).upgrade(async (transakcja) => {
      await transakcja.table('leki').toCollection().modify((lek) => {
        if (!lek.postac && typeof lek.jednostkaLubPostac === 'string') lek.postac = POSTAC_Z_HISTORYCZNEJ_WARTOSCI[lek.jednostkaLubPostac.trim().toLocaleLowerCase('pl')] ?? 'inna'
        if (!Array.isArray(lek.ruchyApteczki) && typeof lek.zapasJednostek === 'number') {
          lek.ruchyApteczki = [{ id: `stan-poczatkowy:${lek.id}`, typ: 'dodanie', ilosc: lek.zapasJednostek, data: lek.dataOtwarcia ?? lek.createdAt.slice(0, 10), createdAt: lek.createdAt }]
        }
      })
    })

    this.version(15).stores({
      ...schematPelny,
      urlopy: 'id, dataOd, dataDo, typ, status, updatedAt, usunietoAt',
      historiaZmian: 'id, znacznikCzasu, modul, typEncji, encjaId, operacja, updatedAt, usunietoAt',
      stanSynchronizacji: 'id, stan, ostatniSync, updatedAt',
      konfliktySynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, wykrytoAt, updatedAt',
      kolejkaSynchronizacji: 'id, [tabela+rekordId], tabela, rekordId, operacja, createdAt, updatedAt',
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
      liczbaOczekujacych: 0,
      kolejkaZmigrowana: false,
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
