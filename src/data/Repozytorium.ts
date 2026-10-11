import { schematWaznejInformacjiZdrowotnej } from '../domain/historiaZdrowia'
import { schematWynikuBadania } from '../domain/badania'
import type { EncjaBazowa, MapaTabel, NazwaModulu, NazwaTabeli, Przypomnienie } from '../domain/typy'
import { terazIso } from '../domain/fabryki'
import { baza } from './BazaOgarniacza'
import type { Table } from 'dexie'
import { czyHistoriaWlaczona, zbudujWpisHistorii } from '../services/HistoriaZmianService'
import { powiadomOZmianieDanych } from './ZdarzeniaDanych'
import { dodajDoKolejkiSynchronizacji, tabelaKolejki } from './KolejkaSynchronizacji'
import { czyPrywatnaPsychoterapia, schematSzczegolowPsychoterapii } from '../domain/psychoterapia'

const modulyZrodelPrzypomnien: Partial<Record<NazwaTabeli, NazwaModulu>> = {
  wizyty: 'wizyty',
  terminyWaznosci: 'terminy',
  pojazdy: 'samochod',
}

const AKTYWNE_STANY_PRZYPOMNIEN = new Set<Przypomnienie['stan']>(['nowe', 'dostarczone', 'odroczone', 'eskalowane'])

function czasZrodlaPrzypomnienia(nazwa: NazwaTabeli, encja: EncjaBazowa | undefined): string | undefined {
  if (!encja) return undefined
  if (nazwa === 'wizyty') {
    const wizyta = encja as MapaTabel['wizyty']
    if (wizyta.data) return `${wizyta.data}T${wizyta.godzina ?? '09:00'}:00`
    return wizyta.terminGraniczny ? `${wizyta.terminGraniczny}T09:00:00` : undefined
  }
  if (nazwa === 'terminyWaznosci') {
    const termin = encja as MapaTabel['terminyWaznosci']
    return `${termin.dataWaznosci}T09:00:00`
  }
  if (nazwa === 'pojazdy') {
    const pojazd = encja as MapaTabel['pojazdy']
    return [pojazd.ocDo, pojazd.przegladDo, pojazd.planowanySerwisData, pojazd.wymianaOlejuDo]
      .filter((data): data is string => Boolean(data))
      .sort()[0] && `${[pojazd.ocDo, pojazd.przegladDo, pojazd.planowanySerwisData, pojazd.wymianaOlejuDo].filter((data): data is string => Boolean(data)).sort()[0]}T09:00:00`
  }
  return undefined
}

function czyZrodloZakonczone(nazwa: NazwaTabeli, encja: EncjaBazowa): boolean {
  if (nazwa === 'wizyty') return ['odbyta', 'anulowana'].includes((encja as MapaTabel['wizyty']).status)
  if (nazwa === 'terminyWaznosci') return (encja as MapaTabel['terminyWaznosci']).status === 'odnowione'
  return false
}

export interface Repozytorium<T extends EncjaBazowa> {
  lista(): Promise<T[]>
  pobierz(id: string): Promise<T | undefined>
  zapisz(encja: T): Promise<string>
  zapiszWiele(encje: T[]): Promise<void>
  usun(id: string): Promise<void>
  przywroc(id: string): Promise<void>
}

class RepozytoriumDexie<T extends EncjaBazowa> implements Repozytorium<T> {
  constructor(private readonly nazwa: NazwaTabeli, private readonly dostepDoDanychPrywatnych?: (operacja: 'odczyt' | 'edycja') => boolean) {}

  private sprawdzDostep(encja?: T): void {
    if ((this.nazwa === 'wynikiBadan' || this.nazwa === 'wazneInformacjeZdrowotne') && (!this.dostepDoDanychPrywatnych?.('odczyt') || !this.dostepDoDanychPrywatnych?.('edycja'))) throw new Error('Brak uprawnienia do prywatnych danych zdrowotnych.')
    if (czyPrywatnaPsychoterapia(this.nazwa, encja) && !this.dostepDoDanychPrywatnych?.('edycja')) throw new Error('Brak uprawnienia do prywatnych danych psychoterapii.')
  }

  private sprawdzZmiane(przed: T | undefined, po: T): void {
    this.sprawdzDostep(przed)
    this.sprawdzDostep(po)
    if (this.nazwa === 'wynikiBadan') schematWynikuBadania.parse(po)
    if (this.nazwa === 'wazneInformacjeZdrowotne') schematWaznejInformacjiZdrowotnej.parse(po)
    if (czyPrywatnaPsychoterapia(this.nazwa, przed) && !czyPrywatnaPsychoterapia(this.nazwa, po)) throw new Error('Nie można usunąć ochrony danych psychoterapii.')
    if (czyPrywatnaPsychoterapia(this.nazwa, po)) {
      if (this.nazwa === 'wpisyTerapii') schematSzczegolowPsychoterapii.parse('psychoterapia' in po ? po.psychoterapia : undefined)
      if (this.nazwa === 'zadania' && (!('sesjaTerapiiId' in po) || typeof po.sesjaTerapiiId !== 'string' || !po.sesjaTerapiiId.trim())) throw new Error('Nie można usunąć ochrony danych psychoterapii.')
    }
    // Dwie szybkie edycje prywatnego rekordu muszą mieć różne znaczniki aktualności.
    if ((this.nazwa === 'wynikiBadan' || this.nazwa === 'wazneInformacjeZdrowotne' || czyPrywatnaPsychoterapia(this.nazwa, po)) && przed && Date.parse(po.updatedAt) <= Date.parse(przed.updatedAt)) po.updatedAt = new Date(Date.parse(przed.updatedAt) + 1).toISOString()
  }

  private tabela(): Table<T, string> {
    return baza.table(this.nazwa) as Table<T, string>
  }

  private async oznaczPowiazanePrzypomnieniaJakoUsuniete(id: string): Promise<void> {
    const modul = modulyZrodelPrzypomnien[this.nazwa]
    if (!modul) return
    const tabelaPrzypomnien = baza.tabela('przypomnienia')
    const powiazane = (await tabelaPrzypomnien.toArray())
      .filter((przypomnienie) => !przypomnienie.usunietoAt && przypomnienie.zrodlo?.typ === modul && przypomnienie.zrodlo.id === id)
    if (powiazane.length === 0) return
    const teraz = terazIso()
    const usuniete = powiazane.map((przypomnienie) => ({
      ...przypomnienie,
      usunietoAt: teraz,
      updatedAt: teraz,
    }) satisfies Przypomnienie)
    await baza.transaction('rw', [tabelaPrzypomnien, tabelaKolejki()], async () => {
      await tabelaPrzypomnien.bulkPut(usuniete)
      for (const przypomnienie of usuniete) {
        await dodajDoKolejkiSynchronizacji('przypomnienia', przypomnienie, powiazane.find(({ id }) => id === przypomnienie.id))
      }
    })
    powiadomOZmianieDanych('przypomnienia')
  }

  private async zaktualizujTerminyPowiazanychPrzypomnien(zmiany: { przed?: T; po: T }[]): Promise<void> {
    const modul = modulyZrodelPrzypomnien[this.nazwa]
    if (!modul) return
    const zmienioneCzasy = new Map(zmiany
      .filter(({ przed, po }) => czasZrodlaPrzypomnienia(this.nazwa, przed) !== czasZrodlaPrzypomnienia(this.nazwa, po))
      .map(({ po }) => [po.id, czasZrodlaPrzypomnienia(this.nazwa, po)]))
    const zakonczoneZrodla = new Set(zmiany.filter(({ po }) => czyZrodloZakonczone(this.nazwa, po)).map(({ po }) => po.id))
    if (zmienioneCzasy.size === 0 && zakonczoneZrodla.size === 0) return
    const tabelaPrzypomnien = baza.tabela('przypomnienia')
    const powiazane = (await tabelaPrzypomnien.toArray()).filter((przypomnienie) =>
      !przypomnienie.usunietoAt
      && przypomnienie.zrodlo?.typ === modul
      && (zmienioneCzasy.has(przypomnienie.zrodlo.id) || zakonczoneZrodla.has(przypomnienie.zrodlo.id))
      && AKTYWNE_STANY_PRZYPOMNIEN.has(przypomnienie.stan),
    )
    if (powiazane.length === 0) return
    const teraz = terazIso()
    const zaktualizowane = powiazane.map((przypomnienie) => ({
      ...przypomnienie,
      ...(zakonczoneZrodla.has(przypomnienie.zrodlo!.id)
        ? { usunietoAt: teraz }
        : { czas: zmienioneCzasy.get(przypomnienie.zrodlo!.id), stan: 'nowe' as const, odroczoneDo: undefined }),
      updatedAt: teraz,
    } satisfies Przypomnienie))
    await baza.transaction('rw', [tabelaPrzypomnien, tabelaKolejki()], async () => {
      await tabelaPrzypomnien.bulkPut(zaktualizowane)
      for (const przypomnienie of zaktualizowane) {
        await dodajDoKolejkiSynchronizacji('przypomnienia', przypomnienie, powiazane.find(({ id }) => id === przypomnienie.id))
      }
    })
    powiadomOZmianieDanych('przypomnienia')
  }

  async lista(): Promise<T[]> {
    const wszystkie = await this.tabela().toArray()
    return wszystkie
      .filter((encja) => !encja.usunietoAt && (this.nazwa !== 'wynikiBadan' && this.nazwa !== 'wazneInformacjeZdrowotne' && !czyPrywatnaPsychoterapia(this.nazwa, encja) || this.dostepDoDanychPrywatnych?.('odczyt')))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async pobierz(id: string): Promise<T | undefined> {
    const encja = (await this.tabela().get(id)) as T | undefined
    return encja?.usunietoAt || (this.nazwa === 'wynikiBadan' || this.nazwa === 'wazneInformacjeZdrowotne') && !this.dostepDoDanychPrywatnych?.('odczyt') || czyPrywatnaPsychoterapia(this.nazwa, encja) && !this.dostepDoDanychPrywatnych?.('odczyt') ? undefined : encja
  }

  async zapisz(encja: T): Promise<string> {
    const tabela = this.tabela()
    const teraz = terazIso()
    const zapisana = { ...encja, updatedAt: teraz }
    if (!czyHistoriaWlaczona(this.nazwa)) {
      let przed: T | undefined
      let id = encja.id
      await baza.transaction('rw', [tabela, tabelaKolejki()], async () => {
        przed = await tabela.get(encja.id)
        this.sprawdzZmiane(przed, zapisana)
        id = await tabela.put(zapisana)
        await dodajDoKolejkiSynchronizacji(this.nazwa, zapisana, przed)
      })
      await this.zaktualizujTerminyPowiazanychPrzypomnien([{ przed, po: zapisana }])
      powiadomOZmianieDanych(this.nazwa)
      return id
    }
    const historia = baza.tabela('historiaZmian')
    let przed: T | undefined
    const id = await baza.transaction('rw', [tabela, historia, tabelaKolejki()], async () => {
      przed = await tabela.get(encja.id)
      this.sprawdzZmiane(przed, zapisana)
      const id = await tabela.put(zapisana)
      const wpis = zbudujWpisHistorii(this.nazwa, przed, zapisana, przed ? 'aktualizacja' : 'utworzenie', teraz)
      if (wpis) await historia.put(wpis)
      await dodajDoKolejkiSynchronizacji(this.nazwa, zapisana, przed)
      return id
    })
    await this.zaktualizujTerminyPowiazanychPrzypomnien([{ przed, po: zapisana }])
    powiadomOZmianieDanych(this.nazwa)
    return id
  }

  async zapiszWiele(encje: T[]): Promise<void> {
    const tabela = this.tabela()
    const teraz = terazIso()
    const zapisane = encje.map((encja) => ({ ...encja, updatedAt: teraz }))
    if (!czyHistoriaWlaczona(this.nazwa)) {
      let poprzednie: (T | undefined)[] = []
      await baza.transaction('rw', [tabela, tabelaKolejki()], async () => {
        poprzednie = await tabela.bulkGet(encje.map((encja) => encja.id))
        zapisane.forEach((encja, indeks) => this.sprawdzZmiane(poprzednie[indeks], encja))
        await tabela.bulkPut(zapisane)
        for (let indeks = 0; indeks < zapisane.length; indeks += 1) {
          await dodajDoKolejkiSynchronizacji(this.nazwa, zapisane[indeks], poprzednie[indeks])
        }
      })
      await this.zaktualizujTerminyPowiazanychPrzypomnien(zapisane.map((po, indeks) => ({ przed: poprzednie[indeks], po })))
      powiadomOZmianieDanych(this.nazwa)
      return
    }
    const historia = baza.tabela('historiaZmian')
    let poprzednie: (T | undefined)[] = []
    await baza.transaction('rw', [tabela, historia, tabelaKolejki()], async () => {
      poprzednie = await tabela.bulkGet(encje.map((encja) => encja.id))
      zapisane.forEach((encja, indeks) => this.sprawdzZmiane(poprzednie[indeks], encja))
      await tabela.bulkPut(zapisane)
      const wpisy = zapisane
        .map((encja, indeks) => zbudujWpisHistorii(this.nazwa, poprzednie[indeks], encja, poprzednie[indeks] ? 'aktualizacja' : 'utworzenie', teraz))
        .filter((wpis) => wpis !== undefined)
      if (wpisy.length > 0) await historia.bulkPut(wpisy)
      for (let indeks = 0; indeks < zapisane.length; indeks += 1) {
        await dodajDoKolejkiSynchronizacji(this.nazwa, zapisane[indeks], poprzednie[indeks])
      }
    })
    await this.zaktualizujTerminyPowiazanychPrzypomnien(zapisane.map((po, indeks) => ({ przed: poprzednie[indeks], po })))
    powiadomOZmianieDanych(this.nazwa)
  }

  async usun(id: string): Promise<void> {
    const tabela = this.tabela()
    if (!czyHistoriaWlaczona(this.nazwa)) {
      await baza.transaction('rw', [tabela, tabelaKolejki()], async () => {
        const encja = await tabela.get(id)
        this.sprawdzDostep(encja)
        if (!encja) return
        const teraz = terazIso()
        const usunieta = { ...encja, usunietoAt: teraz, updatedAt: teraz }
        await tabela.put(usunieta)
        await dodajDoKolejkiSynchronizacji(this.nazwa, usunieta, encja)
      })
      await this.oznaczPowiazanePrzypomnieniaJakoUsuniete(id)
      powiadomOZmianieDanych(this.nazwa)
      return
    }
    const historia = baza.tabela('historiaZmian')
    await baza.transaction('rw', [tabela, historia, tabelaKolejki()], async () => {
      const encja = await tabela.get(id)
      this.sprawdzDostep(encja)
      if (!encja) return
      const teraz = terazIso()
      const usunieta = { ...encja, usunietoAt: teraz, updatedAt: teraz }
      await tabela.put(usunieta)
      const wpis = zbudujWpisHistorii(this.nazwa, encja, usunieta, 'usuniecie', teraz)
      if (wpis) await historia.put(wpis)
      await dodajDoKolejkiSynchronizacji(this.nazwa, usunieta, encja)
    })
    await this.oznaczPowiazanePrzypomnieniaJakoUsuniete(id)
    powiadomOZmianieDanych(this.nazwa)
  }

  async przywroc(id: string): Promise<void> {
    const tabela = this.tabela()
    if (!czyHistoriaWlaczona(this.nazwa)) {
      await baza.transaction('rw', [tabela, tabelaKolejki()], async () => {
        const encja = await tabela.get(id)
        this.sprawdzDostep(encja)
        if (!encja) return
        const teraz = terazIso()
        const kopia = { ...encja, updatedAt: teraz }
        delete kopia.usunietoAt
        await tabela.put(kopia)
        await dodajDoKolejkiSynchronizacji(this.nazwa, kopia, encja)
      })
      powiadomOZmianieDanych(this.nazwa)
      return
    }
    const historia = baza.tabela('historiaZmian')
    await baza.transaction('rw', [tabela, historia, tabelaKolejki()], async () => {
      const encja = await tabela.get(id)
      this.sprawdzDostep(encja)
      if (!encja) return
      const teraz = terazIso()
      const kopia = { ...encja, updatedAt: teraz }
      delete kopia.usunietoAt
      await tabela.put(kopia)
      const wpis = zbudujWpisHistorii(this.nazwa, encja, kopia, 'aktualizacja', teraz)
      if (wpis) await historia.put(wpis)
      await dodajDoKolejkiSynchronizacji(this.nazwa, kopia, encja)
    })
    powiadomOZmianieDanych(this.nazwa)
  }
}

export function pobierzRepozytorium<K extends NazwaTabeli>(nazwa: K, dostepDoDanychPrywatnych?: (operacja: 'odczyt' | 'edycja') => boolean): Repozytorium<MapaTabel[K]> {
  return new RepozytoriumDexie<MapaTabel[K]>(nazwa, dostepDoDanychPrywatnych)
}
