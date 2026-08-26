import { repozytoriumElementowZadan } from '../data/RepozytoriumElementowZadan'
import type { DostawcaElementowPulpitu, RepozytoriumElementow, ZakresDat } from '../domain/elementyOgarniacza'

export class DostawcaZadanPulpitu implements DostawcaElementowPulpitu {
  readonly id = 'zadania-manualne'

  constructor(private readonly repozytorium: RepozytoriumElementow<'zadanie'> = repozytoriumElementowZadan) {}

  async pobierzElementy(zakres: ZakresDat) {
    return (await this.repozytorium.lista(zakres)).filter((element) => element.pokazNaPulpicie !== false)
  }
}
