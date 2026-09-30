import type { ReactNode } from 'react'
import { PanelAktualizacji } from './PanelAktualizacji'
import { PanelAktualizacjiRaspberry } from './PanelAktualizacjiRaspberry'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'
import { platforma } from '../../platform/platforma'
import type { DaneDiagnostykiSynchronizacji } from '../../services/DiagnostykaSynchronizacji'

export function SekcjaPolaczeniaIAktualizacji({ synchronizacjaSkonfigurowana, diagnostyka, dzieci }: { synchronizacjaSkonfigurowana: boolean; diagnostyka?: DaneDiagnostykiSynchronizacji; dzieci: ReactNode }) {
  return <>
    <PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana={synchronizacjaSkonfigurowana} diagnostyka={diagnostyka} />
    {dzieci}
    {platforma.natywna ? <PanelAktualizacji /> : <PanelAktualizacjiRaspberry />}
  </>
}
