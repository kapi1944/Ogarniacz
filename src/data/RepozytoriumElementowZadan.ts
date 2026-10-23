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
import { baza } from './BazaOgarniacza'
import { czyBiezacyDostep } from '../services/UprawnieniaService'

export interface ZmianaZadaniaDnia {
  przed: Zadanie
  po: Zadanie
}

export class KonfliktZmianyZadania extends Error {}

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

  async zalegle(data: string): Promise<{ elementy: ElementZadania[]; liczba: number }> {
    if (!czyBiezacyDostep('zadania', 'odczyt')) return { elementy: [], liczba: 0 }
    const elementy: ElementZadania[] = []
    let liczba = 0
    // Indeks ogranicza odczyt do przeszłości; zachowujemy tylko trzy najważniejsze.
    await baza.tabela('zadania').where('termin').below(data).each((zadanie) => {
      if (zadanie.usunietoAt || 'sesjaTerapiiId' in zadanie) return
      const element = zadanieLegacyNaElement(zadanie)
      if (element.pokazNaPulpicie === false || element.status !== 'otwarty' || !element.data || element.data >= data) return
      liczba += 1
      elementy.push(element)
      const waga = (pozycja: ElementZadania) => pozycja.priorytet === 'asap' ? 2 : pozycja.priorytet === 'pilny' ? 1 : 0
      elementy.sort((a, b) => waga(b) - waga(a) || a.data!.localeCompare(b.data!) || a.id.localeCompare(b.id))
      if (elementy.length > 3) elementy.pop()
    })
    return { elementy, liczba }
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

  // Odczyt warunku, zapis, historia i istniejący outbox należą do jednej transakcji.
  async zmienZDnia(oczekiwany: ElementZadania, zmiany: Pick<ZmianyElementu<'zadanie'>, 'status' | 'data' | 'godzina' | 'trybTerminu'>): Promise<ZmianaZadaniaDnia> {
    return baza.transaction('rw', [baza.tabela('zadania'), baza.tabela('historiaZmian'), baza.tabela('kolejkaSynchronizacji')], async () => {
      if (!czyBiezacyDostep('zadania', 'edycja')) throw new Error('Brak uprawnień do edycji zadań.')
      const przed = await this.repozytorium.pobierz(oczekiwany.id)
      if (!przed || JSON.stringify(zadanieLegacyNaElement(przed)) !== JSON.stringify(oczekiwany)
        || zadanieLegacyNaElement(przed).status !== 'otwarty') throw new KonfliktZmianyZadania()
      await this.aktualizuj(przed.id, zmiany)
      const po = (await this.repozytorium.pobierz(przed.id))!
      return { przed, po }
    })
  }

  async cofnijZmianeDnia(zmiana: ZmianaZadaniaDnia): Promise<void> {
    await baza.transaction('rw', [baza.tabela('zadania'), baza.tabela('historiaZmian'), baza.tabela('kolejkaSynchronizacji')], async () => {
      if (!czyBiezacyDostep('zadania', 'edycja')) throw new Error('Brak uprawnień do edycji zadań.')
      const aktualny = await this.repozytorium.pobierz(zmiana.po.id)
      if (!aktualny || JSON.stringify(aktualny) !== JSON.stringify(zmiana.po)) throw new KonfliktZmianyZadania()
      await this.repozytorium.zapisz(zmiana.przed)
    })
  }
}

export const repozytoriumElementowZadan = new RepozytoriumElementowZadan()
