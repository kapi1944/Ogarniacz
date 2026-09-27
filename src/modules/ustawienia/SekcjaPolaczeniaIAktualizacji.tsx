import type { ReactNode } from 'react'
import { PanelAktualizacji } from './PanelAktualizacji'
import { PanelAktualizacjiRaspberry } from './PanelAktualizacjiRaspberry'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'
import { platforma } from '../../platform/platforma'

export function SekcjaPolaczeniaIAktualizacji({ synchronizacjaSkonfigurowana, dzieci }: { synchronizacjaSkonfigurowana: boolean; dzieci: ReactNode }) {
  return <>
    <PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana={synchronizacjaSkonfigurowana} />
    {dzieci}
    {platforma.natywna ? <PanelAktualizacji /> : <PanelAktualizacjiRaspberry />}
  </>
}
