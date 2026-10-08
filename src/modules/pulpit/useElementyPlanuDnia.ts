import { useLiveQuery } from 'dexie-react-hooks'
import type { DostawcaElementowPulpitu, ElementOgarniacza, ZakresDat } from '../../domain/elementyOgarniacza'
import { DostawcaZadanPulpitu } from '../../providers/DostawcaZadanPulpitu'
import { DostawcaLekowPulpitu } from '../../providers/DostawcaLekowPulpitu'
import { DostawcaWizytPulpitu } from '../../providers/DostawcaWizytPulpitu'
import { DostawcaFinansowPulpitu } from '../../providers/DostawcaFinansowPulpitu'
import { DostawcaSamochoduPulpitu } from '../../providers/DostawcaSamochoduPulpitu'
import { DostawcaZakupowPulpitu } from '../../providers/DostawcaZakupowPulpitu'
import { DostawcaNotatekPulpitu } from '../../providers/DostawcaNotatekPulpitu'

const dostawcy: DostawcaElementowPulpitu[] = [
  new DostawcaZadanPulpitu(), new DostawcaLekowPulpitu(), new DostawcaWizytPulpitu(),
  new DostawcaFinansowPulpitu(), new DostawcaSamochoduPulpitu(),
  new DostawcaZakupowPulpitu(), new DostawcaNotatekPulpitu(),
]

export function useElementyPlanuDnia(zakres: ZakresDat) {
  return useLiveQuery(async () => {
    const wyniki = await Promise.allSettled(dostawcy.map((dostawca) => dostawca.pobierzElementy(zakres)))
    const elementy: ElementOgarniacza[] = wyniki.flatMap((wynik) => wynik.status === 'fulfilled' ? wynik.value : [])
      .filter((element) => element.typ !== 'wydatek' && element.data && element.data >= zakres.od && element.data <= zakres.do)
    return { elementy, blad: wyniki.some((wynik) => wynik.status === 'rejected') }
  }, [zakres.od, zakres.do])
}
