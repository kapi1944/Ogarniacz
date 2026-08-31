import type { EncjaBazowa, MapaTabel, NazwaTabeli } from '../domain/typy'
import { terazIso } from '../domain/fabryki'
import { baza } from './BazaOgarniacza'
import type { Table } from 'dexie'
import { czyHistoriaWlaczona, zbudujWpisHistorii } from '../services/HistoriaZmianService'
import { powiadomOZmianieDanych } from './ZdarzeniaDanych'

export interface Repozytorium<T extends EncjaBazowa> {
  lista(): Promise<T[]>
  pobierz(id: string): Promise<T | undefined>
  zapisz(encja: T): Promise<string>
  zapiszWiele(encje: T[]): Promise<void>
  usun(id: string): Promise<void>
  przywroc(id: string): Promise<void>
}

class RepozytoriumDexie<T extends EncjaBazowa> implements Repozytorium<T> {
  constructor(private readonly nazwa: NazwaTabeli) {}

  private tabela(): Table<T, string> {
    return baza.table(this.nazwa) as Table<T, string>
  }

  async lista(): Promise<T[]> {
    const wszystkie = await this.tabela().toArray()
    return wszystkie
      .filter((encja) => !encja.usunietoAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async pobierz(id: string): Promise<T | undefined> {
    const encja = (await this.tabela().get(id)) as T | undefined
    return encja?.usunietoAt ? undefined : encja
  }

  async zapisz(encja: T): Promise<string> {
    const tabela = this.tabela()
    const teraz = terazIso()
    const zapisana = { ...encja, updatedAt: teraz }
    if (!czyHistoriaWlaczona(this.nazwa)) {
      const id = await tabela.put(zapisana)
      powiadomOZmianieDanych(this.nazwa)
      return id
    }
    const historia = baza.tabela('historiaZmian')
    const id = await baza.transaction('rw', [tabela, historia], async () => {
      const przed = await tabela.get(encja.id)
      const id = await tabela.put(zapisana)
      const wpis = zbudujWpisHistorii(this.nazwa, przed, zapisana, przed ? 'aktualizacja' : 'utworzenie', teraz)
      if (wpis) await historia.put(wpis)
      return id
    })
    powiadomOZmianieDanych(this.nazwa)
    return id
  }

  async zapiszWiele(encje: T[]): Promise<void> {
    const tabela = this.tabela()
    const teraz = terazIso()
    const zapisane = encje.map((encja) => ({ ...encja, updatedAt: teraz }))
    if (!czyHistoriaWlaczona(this.nazwa)) {
      await tabela.bulkPut(zapisane)
      powiadomOZmianieDanych(this.nazwa)
      return
    }
    const historia = baza.tabela('historiaZmian')
    await baza.transaction('rw', [tabela, historia], async () => {
      const poprzednie = await tabela.bulkGet(encje.map((encja) => encja.id))
      await tabela.bulkPut(zapisane)
      const wpisy = zapisane
        .map((encja, indeks) => zbudujWpisHistorii(this.nazwa, poprzednie[indeks], encja, poprzednie[indeks] ? 'aktualizacja' : 'utworzenie', teraz))
        .filter((wpis) => wpis !== undefined)
      if (wpisy.length > 0) await historia.bulkPut(wpisy)
    })
    powiadomOZmianieDanych(this.nazwa)
  }

  async usun(id: string): Promise<void> {
    const tabela = this.tabela()
    if (!czyHistoriaWlaczona(this.nazwa)) {
      const encja = await tabela.get(id)
      if (!encja) return
      const teraz = terazIso()
      await tabela.put({ ...encja, usunietoAt: teraz, updatedAt: teraz })
      powiadomOZmianieDanych(this.nazwa)
      return
    }
    const historia = baza.tabela('historiaZmian')
    await baza.transaction('rw', [tabela, historia], async () => {
      const encja = await tabela.get(id)
      if (!encja) return
      const teraz = terazIso()
      const usunieta = { ...encja, usunietoAt: teraz, updatedAt: teraz }
      await tabela.put(usunieta)
      const wpis = zbudujWpisHistorii(this.nazwa, encja, usunieta, 'usuniecie', teraz)
      if (wpis) await historia.put(wpis)
    })
    powiadomOZmianieDanych(this.nazwa)
  }

  async przywroc(id: string): Promise<void> {
    const tabela = this.tabela()
    if (!czyHistoriaWlaczona(this.nazwa)) {
      const encja = await tabela.get(id)
      if (!encja) return
      const teraz = terazIso()
      const kopia = { ...encja, updatedAt: teraz }
      delete kopia.usunietoAt
      await tabela.put(kopia)
      powiadomOZmianieDanych(this.nazwa)
      return
    }
    const historia = baza.tabela('historiaZmian')
    await baza.transaction('rw', [tabela, historia], async () => {
      const encja = await tabela.get(id)
      if (!encja) return
      const teraz = terazIso()
      const kopia = { ...encja, updatedAt: teraz }
      delete kopia.usunietoAt
      await tabela.put(kopia)
      const wpis = zbudujWpisHistorii(this.nazwa, encja, kopia, 'aktualizacja', teraz)
      if (wpis) await historia.put(wpis)
    })
    powiadomOZmianieDanych(this.nazwa)
  }
}

export function pobierzRepozytorium<K extends NazwaTabeli>(nazwa: K): Repozytorium<MapaTabel[K]> {
  return new RepozytoriumDexie<MapaTabel[K]>(nazwa)
}
