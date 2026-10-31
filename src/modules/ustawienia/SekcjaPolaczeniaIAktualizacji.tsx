import type { ReactNode } from 'react'
import { KategoriaUstawien } from './NawigacjaUstawien'
import { PanelAktualizacji } from './PanelAktualizacji'
import { PanelAktualizacjiRaspberry } from './PanelAktualizacjiRaspberry'
import { PanelAktualizacjiTestowych } from './PanelAktualizacjiTestowych'
import { PodsumowaniePolaczeniaIAktualizacji } from './PodsumowaniePolaczeniaIAktualizacji'
import { platforma } from '../../platform/platforma'
import type { DaneDiagnostykiSynchronizacji } from '../../services/DiagnostykaSynchronizacji'
import { UstawieniaPowiadomienSynchronizacji } from './UstawieniaPowiadomienSynchronizacji'
import { Karta } from '../../components/Interfejs'

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
    {!platforma.natywna && <Karta><h2>Web/PWA — wersja frontendu</h2><div className="lista-kompaktowa"><div><span>Uruchomiona wersja interfejsu</span><strong>{__WERSJA_APLIKACJI__}</strong></div><div><span>Kanał aktualizacji</span><strong>Serwer / Service Worker</strong></div></div><p className="tekst-pomocniczy">Nowy interfejs zastosujesz po komunikacie PWA i potwierdzeniu odświeżenia. Numer oczekującej wersji nie jest udostępniany przez Service Workera. W Windows wersję EXE sprawdzisz osobno w menu „Sprawdź nową wersję instalatora”. Bez połączenia nie potwierdzono najnowszej wersji serwera.</p></Karta>}
    {platforma.natywna ? <PanelAktualizacji /> : <PanelAktualizacjiRaspberry />}
    <PanelAktualizacjiTestowych />
    </KategoriaUstawien>
  </section>
}
