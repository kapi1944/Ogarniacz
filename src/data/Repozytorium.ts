import type { EncjaBazowa, MapaTabel, NazwaTabeli } from '../domain/typy'
import { terazIso } from '../domain/fabryki'
import { baza } from './BazaOgarniacza'
import type { Table } from 'dexie'

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
    return this.tabela().put({ ...encja, updatedAt: terazIso() })
  }

  async zapiszWiele(encje: T[]): Promise<void> {
    await this.tabela().bulkPut(encje.map((encja) => ({ ...encja, updatedAt: terazIso() })))
  }

  async usun(id: string): Promise<void> {
    const encja = (await this.tabela().get(id)) as T | undefined
    if (encja) {
      const teraz = terazIso()
      await this.tabela().put({ ...encja, usunietoAt: teraz, updatedAt: teraz })
    }
  }

  async przywroc(id: string): Promise<void> {
    const encja = (await this.tabela().get(id)) as T | undefined
    if (encja) {
      const kopia = { ...encja, updatedAt: terazIso() }
      delete kopia.usunietoAt
      await this.tabela().put(kopia)
    }
  }
}

export function pobierzRepozytorium<K extends NazwaTabeli>(nazwa: K): Repozytorium<MapaTabel[K]> {
  return new RepozytoriumDexie<MapaTabel[K]>(nazwa)
}
