import { repozytoriumElementowZadan } from '../data/RepozytoriumElementowZadan'
import type { DostawcaElementowPulpitu, RepozytoriumElementow, ZakresDat } from '../domain/elementyOgarniacza'

export class DostawcaZadanPulpitu implements DostawcaElementowPulpitu {
  readonly id = 'zadania-manualne'

  constructor(private readonly repozytorium: RepozytoriumElementow<'zadanie'> = repozytoriumElementowZadan) {}

  async pobierzElementy(zakres: ZakresDat) {
    return (await this.repozytorium.lista(zakres)).filter((element) => element.pokazNaPulpicie !== false)
  }
}

// OGARNIACZ_FINAL_AUDIT_VOICE_2026_08_27_V1 — wspólna polityka ekspozycji Pulpitu: ważne/pilne wyżej, luźne niżej.
export {
  czyZalegle,
  dniOpoznienia,
  sekcjaDlaElementuPulpitu,
  sortujElementyPulpitu,
  wynikRankinguPulpitu,
} from '../domain/ustaleniaGlosowe'
