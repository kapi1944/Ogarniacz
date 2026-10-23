import { useLiveQuery } from 'dexie-react-hooks'
import type { DostawcaElementowPulpitu, ElementOgarniacza, ZakresDat } from '../../domain/elementyOgarniacza'
import { DostawcaZadanPulpitu } from '../../providers/DostawcaZadanPulpitu'
import { DostawcaLekowPulpitu } from '../../providers/DostawcaLekowPulpitu'
import { DostawcaWizytPulpitu } from '../../providers/DostawcaWizytPulpitu'
import { DostawcaFinansowPulpitu } from '../../providers/DostawcaFinansowPulpitu'
import { DostawcaSamochoduPulpitu } from '../../providers/DostawcaSamochoduPulpitu'
import { DostawcaZakupowPulpitu } from '../../providers/DostawcaZakupowPulpitu'
import { DostawcaNotatekPulpitu } from '../../providers/DostawcaNotatekPulpitu'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { czyBiezacyDostep } from '../../services/UprawnieniaService'
import { utworzWydarzeniaPlanera } from '../../services/PlanerService'
import { datyZakresu } from '../dzisiaj/logikaHoryzontu'

const dostawcy: DostawcaElementowPulpitu[] = [
  new DostawcaZadanPulpitu(), new DostawcaLekowPulpitu(), new DostawcaWizytPulpitu(),
  new DostawcaFinansowPulpitu(), new DostawcaSamochoduPulpitu(),
  new DostawcaZakupowPulpitu(), new DostawcaNotatekPulpitu(),
]

export function useElementyPlanuDnia(zakres: ZakresDat) {
  return useLiveQuery(async () => {
    const blokiPlanera = async (): Promise<ElementOgarniacza[]> => {
      if (!czyBiezacyDostep('planer', 'odczyt')) return []
      const bloki = await pobierzRepozytorium('blokiCzasu').lista()
      return datyZakresu(zakres).flatMap((data) => utworzWydarzeniaPlanera(data, bloki, [])).map((element) => ({
        ...element, referencjaZrodla: { modul: 'planer', encjaId: element.id.slice('blok:'.length) },
      }))
    }
    const wyniki = await Promise.allSettled([...dostawcy.map((dostawca) => dostawca.pobierzElementy(zakres)), blokiPlanera()])
    const elementy: ElementOgarniacza[] = wyniki.flatMap((wynik) => wynik.status === 'fulfilled' ? wynik.value : [])
      .filter((element) => element.typ !== 'wydatek' && element.data && element.data >= zakres.od && element.data <= zakres.do)
    return { elementy, blad: wyniki.some((wynik) => wynik.status === 'rejected') }
  }, [zakres.od, zakres.do])
}
