import type { ReactNode } from 'react'
import { KategoriaUstawien } from './NawigacjaUstawien'
import { PanelAktualizacji } from './PanelAktualizacji'
import { PanelAktualizacjiRaspberry } from './PanelAktualizacjiRaspberry'
import { PanelAktualizacjiTestowych } from './PanelAktualizacjiTestowych'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'
import { platforma } from '../../platform/platforma'
import type { DaneDiagnostykiSynchronizacji } from '../../services/DiagnostykaSynchronizacji'
import { UstawieniaPowiadomienSynchronizacji } from './UstawieniaPowiadomienSynchronizacji'

export function SekcjaPolaczeniaIAktualizacji({ synchronizacjaSkonfigurowana, diagnostyka, dzieci }: { synchronizacjaSkonfigurowana: boolean; diagnostyka?: DaneDiagnostykiSynchronizacji; dzieci: ReactNode }) {
  return <section className="sekcja-synchronizacji">
    <KategoriaUstawien kategorie={['system']}>
    <PodsumowaniePolaczeniaIAktualizacji synchronizacjaSkonfigurowana={synchronizacjaSkonfigurowana} diagnostyka={diagnostyka} />
    </KategoriaUstawien>
    <KategoriaUstawien kategorie={['synchronizacja']}><div id="synchronizacja">{dzieci}</div></KategoriaUstawien>
    <KategoriaUstawien kategorie={['powiadomienia']}>
    <UstawieniaPowiadomienSynchronizacji />
    </KategoriaUstawien>
    <KategoriaUstawien kategorie={['system']}>
    {platforma.natywna ? <PanelAktualizacji /> : <PanelAktualizacjiRaspberry />}
    <PanelAktualizacjiTestowych />
    </KategoriaUstawien>
  </section>
}
