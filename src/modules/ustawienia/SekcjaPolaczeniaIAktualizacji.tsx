import type { ReactNode } from 'react'
import { PanelAktualizacji } from './PanelAktualizacji'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'

export function SekcjaPolaczeniaIAktualizacji({ synchronizacjaSkonfigurowana, dzieci }: { synchronizacjaSkonfigurowana: boolean; dzieci: ReactNode }) {
  return <>
    <PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana={synchronizacjaSkonfigurowana} />
    {dzieci}
    <PanelAktualizacji />
  </>
}
