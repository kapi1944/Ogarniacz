import { pobierzRepozytorium, type Repozytorium } from '../data/Repozytorium'
import type { DostawcaElementowPulpitu, ElementOgarniacza, ZakresDat } from '../domain/elementyOgarniacza'
import type { ElementSkrzynki } from '../domain/typy'

type ZrodloListy = Pick<Repozytorium<ElementSkrzynki>, 'lista'>

export const PROG_STARZENIA_POCZEKALNI_DNI = 7

export class DostawcaPoczekalniPulpitu implements DostawcaElementowPulpitu {
  readonly id = 'poczekalnia'

  constructor(private readonly repozytoriumSkrzynki: ZrodloListy = pobierzRepozytorium('skrzynka')) {}

  async pobierzElementy(_zakres: ZakresDat): Promise<ElementOgarniacza<'poczekalnia'>[]> {
    const nieprzetworzone = (await this.repozytoriumSkrzynki.lista())
      .filter((element) => element.status === 'nowe')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    return nieprzetworzone.map((element) => ({
      id: `poczekalnia:${element.id}`,
      typ: 'poczekalnia',
      tytul: element.tresc,
      referencjaZrodla: { modul: 'skrzynka', encjaId: element.id },
      status: 'otwarty',
      dane: { liczbaNieprzetworzonych: nieprzetworzone.length, zrodlo: element.zrodlo },
      createdAt: element.createdAt,
      updatedAt: element.updatedAt,
    }))
  }
}
