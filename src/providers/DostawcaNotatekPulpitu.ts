import { pobierzRepozytorium, type Repozytorium } from '../data/Repozytorium'
import type { DostawcaElementowPulpitu, ElementOgarniacza, ZakresDat } from '../domain/elementyOgarniacza'
import type { Notatka } from '../domain/typy'

type ZrodloListy = Pick<Repozytorium<Notatka>, 'lista'>

export class DostawcaNotatekPulpitu implements DostawcaElementowPulpitu {
  readonly id = 'notatki'

  constructor(private readonly repozytoriumNotatek: ZrodloListy = pobierzRepozytorium('notatki')) {}

  async pobierzElementy(zakres: ZakresDat): Promise<ElementOgarniacza<'notatka'>[]> {
    const notatki = await this.repozytoriumNotatek.lista()
    return notatki
      .filter((notatka) => !notatka.data || (notatka.data >= zakres.od && notatka.data <= zakres.do))
      .map((notatka) => ({
        id: `notatka:${notatka.id}`,
        typ: 'notatka' as const,
        tytul: notatka.tytul,
        opis: notatka.tresc,
        referencjaZrodla: { modul: 'notatki' as const, encjaId: notatka.id },
        data: notatka.data,
        godzina: notatka.data ? notatka.godzina : undefined,
        trybTerminu: notatka.data && notatka.godzina ? 'o_godzinie' as const : notatka.data ? 'bez_godziny' as const : undefined,
        status: 'otwarty' as const,
        przypomnienia: notatka.przypomnienieAt ? [{ id: `notatka:${notatka.id}:przypomnienie`, czas: notatka.przypomnienieAt, aktywne: true }] : [],
        dane: { tresc: notatka.tresc, przypieta: notatka.przypieta, przypomnienieAt: notatka.przypomnienieAt },
        tagi: notatka.tagi,
        createdAt: notatka.createdAt,
        updatedAt: notatka.updatedAt,
      }))
      .sort((a, b) => Number(b.dane?.przypieta) - Number(a.dane?.przypieta)
        || (b.updatedAt.localeCompare(a.updatedAt)) || a.id.localeCompare(b.id))
  }
}
