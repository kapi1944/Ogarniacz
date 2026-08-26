import { elementNaZadanieLegacy, zadanieLegacyNaElement } from '../domain/adapterZadania'
import { noweId, terazIso } from '../domain/fabryki'
import type {
  DaneNowegoElementu,
  ElementZadania,
  RepozytoriumElementow,
  ZakresDat,
  ZmianyElementu,
} from '../domain/elementyOgarniacza'
import type { Zadanie } from '../domain/typy'
import { pobierzRepozytorium, type Repozytorium } from './Repozytorium'

export class RepozytoriumElementowZadan implements RepozytoriumElementow<'zadanie'> {
  constructor(private readonly repozytorium: Repozytorium<Zadanie> = pobierzRepozytorium('zadania')) {}

  async lista(zakres?: ZakresDat): Promise<ElementZadania[]> {
    const elementy = (await this.repozytorium.lista()).map(zadanieLegacyNaElement)
    return elementy
      .filter((element) => !zakres || Boolean(element.data && element.data >= zakres.od && element.data <= zakres.do))
      .sort((a, b) => `${a.data ?? '9999-12-31'}T${a.godzina ?? '23:59'}`.localeCompare(`${b.data ?? '9999-12-31'}T${b.godzina ?? '23:59'}`))
  }

  async pobierz(id: string): Promise<ElementZadania | undefined> {
    const zadanie = await this.repozytorium.pobierz(id)
    return zadanie ? zadanieLegacyNaElement(zadanie) : undefined
  }

  async utworz(dane: DaneNowegoElementu<'zadanie'>): Promise<ElementZadania> {
    const tytul = dane.tytul.trim()
    if (!tytul) throw new Error('Tytuł elementu jest wymagany.')
    const teraz = terazIso()
    const id = noweId()
    const element: ElementZadania = {
      ...dane,
      id,
      typ: 'zadanie',
      tytul,
      referencjaZrodla: { modul: 'zadania', encjaId: id },
      createdAt: teraz,
      updatedAt: teraz,
    }
    await this.repozytorium.zapisz(elementNaZadanieLegacy(element))
    return (await this.pobierz(id))!
  }

  async aktualizuj(id: string, zmiany: ZmianyElementu<'zadanie'>): Promise<ElementZadania> {
    const istniejacy = await this.repozytorium.pobierz(id)
    if (!istniejacy) throw new Error(`Nie znaleziono elementu: ${id}`)
    const obecnyElement = zadanieLegacyNaElement(istniejacy)
    const tytul = (zmiany.tytul ?? obecnyElement.tytul).trim()
    if (!tytul) throw new Error('Tytuł elementu jest wymagany.')
    const element: ElementZadania = {
      ...obecnyElement,
      ...zmiany,
      ...(zmiany.dane ? { dane: { ...obecnyElement.dane, ...zmiany.dane } } : {}),
      id,
      typ: 'zadanie',
      tytul,
      referencjaZrodla: obecnyElement.referencjaZrodla,
      createdAt: obecnyElement.createdAt,
      updatedAt: terazIso(),
    }
    await this.repozytorium.zapisz(elementNaZadanieLegacy(element, istniejacy))
    return (await this.pobierz(id))!
  }

  async usun(id: string): Promise<void> {
    await this.repozytorium.usun(id)
  }
}

export const repozytoriumElementowZadan = new RepozytoriumElementowZadan()
