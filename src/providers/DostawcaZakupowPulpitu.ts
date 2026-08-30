import { pobierzRepozytorium, type Repozytorium } from '../data/Repozytorium'
import type { ElementOgarniacza, ZakresDat } from '../domain/elementyOgarniacza'
import type { ListaZakupow, PozycjaZakupow } from '../domain/typy'

type ZrodloListy<Encja extends { id: string; createdAt: string; updatedAt: string }> = Pick<Repozytorium<Encja>, 'lista'>

export class DostawcaZakupowPulpitu {
  readonly id = 'zakupy'

  constructor(
    private readonly repozytoriumList: ZrodloListy<ListaZakupow> = pobierzRepozytorium('listyZakupow'),
    private readonly repozytoriumPozycji: ZrodloListy<PozycjaZakupow> = pobierzRepozytorium('pozycjeZakupow'),
  ) {}

  async pobierzElementy(zakres: ZakresDat): Promise<ElementOgarniacza<'zakupy'>[]> {
    const [listy, pozycje] = await Promise.all([this.repozytoriumList.lista(), this.repozytoriumPozycji.lista()])
    return listy
      .filter((lista) => lista.aktywna)
      .filter((lista) => !lista.planowanaData || (lista.planowanaData >= zakres.od && lista.planowanaData <= zakres.do))
      .map((lista) => {
        const elementy = pozycje.filter((pozycja) => pozycja.listaId === lista.id)
        const kupione = elementy.filter((pozycja) => pozycja.kupione).length
        return {
          id: `zakupy:${lista.id}`,
          typ: 'zakupy' as const,
          tytul: lista.nazwa,
          opis: [lista.sklep, `${kupione}/${elementy.length} kupionych`].filter(Boolean).join(' · '),
          referencjaZrodla: { modul: 'zakupy' as const, encjaId: lista.id },
          data: lista.planowanaData,
          godzina: lista.planowanaData ? lista.planowanaGodzina : undefined,
          trybTerminu: lista.planowanaData && lista.planowanaGodzina ? 'o_godzinie' as const : lista.planowanaData ? 'bez_godziny' as const : undefined,
          priorytet: lista.priorytet,
          status: 'otwarty' as const,
          dane: { listaId: lista.id, liczbaPozycji: elementy.length, kupione, pozostalo: elementy.length - kupione },
          createdAt: lista.createdAt,
          updatedAt: [lista.updatedAt, ...elementy.map((pozycja) => pozycja.updatedAt)].sort().at(-1) ?? lista.updatedAt,
        }
      })
      .sort((a, b) => `${a.data ?? '9999'}T${a.godzina ?? '99:99'}`.localeCompare(`${b.data ?? '9999'}T${b.godzina ?? '99:99'}`) || a.id.localeCompare(b.id))
  }
}
