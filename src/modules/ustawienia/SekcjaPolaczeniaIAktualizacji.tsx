import type { ReactNode } from 'react'
import { PanelAktualizacji } from './PanelAktualizacji'
import { PanelAktualizacjiRaspberry } from './PanelAktualizacjiRaspberry'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'
import { platforma } from '../../platform/platforma'
import type { DaneDiagnostykiSynchronizacji } from '../../services/DiagnostykaSynchronizacji'
import { UstawieniaPowiadomienSynchronizacji } from './UstawieniaPowiadomienSynchronizacji'

export function SekcjaPolaczeniaIAktualizacji({ synchronizacjaSkonfigurowana, diagnostyka, dzieci }: { synchronizacjaSkonfigurowana: boolean; diagnostyka?: DaneDiagnostykiSynchronizacji; dzieci: ReactNode }) {
  return <section id="synchronizacja" className="sekcja-synchronizacji">
    <PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana={synchronizacjaSkonfigurowana} diagnostyka={diagnostyka} />
    {dzieci}
    <UstawieniaPowiadomienSynchronizacji />
    {platforma.natywna ? <PanelAktualizacji /> : <PanelAktualizacjiRaspberry />}
  </section>
}
