import { nasluchujZmianDanych } from '../data/ZdarzeniaDanych'
import { RepozytoriumZdalneHttp } from '../data/RepozytoriumZdalneHttp'
import type { RepozytoriumZdalne } from '../data/DostawcaSynchronizacji'
import { platforma } from '../platform/platforma'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'
import { pobierzDiagnostykeRuntime } from './RuntimeConfigService'
import { nazwyTabelSynchronizowanych, oznaczOczekujacaSynchronizacje, oznaczSynchronizacjeOffline, odtworzOczekujacaSynchronizacje, SyncEngine } from './SyncEngine'
import type { RozstrzygniecieKonfliktu } from './SyncEngine'
import { powiadomOBladzieSynchronizacji, powiadomOEtapieSynchronizacji, powiadomOSynchronizacjiOffline, powiadomOWynikuSynchronizacji } from './PowiadomieniaSynchronizacji'
import { sklasyfikujBladSynchronizacji } from './DiagnostykaSynchronizacji'
import type { WynikSynchronizacji } from '../data/DostawcaSynchronizacji'

const syncEngine = new SyncEngine({ obslugaEtapu: powiadomOEtapieSynchronizacji })
const OPOZNIENIE_PO_ZMIANIE_MS = 3_000
const OKRES_PONOWIENIA_POLACZENIA_MS = 60_000
const powiadomioneOperacje = new WeakSet<Promise<WynikSynchronizacji>>()
let ponowPoBrakuPolaczenia = false
let repozytoriumZdalne: RepozytoriumZdalne | undefined
let inicjalizacja: Promise<() => void> | undefined

function utworzRepozytoriumZdalne(): RepozytoriumZdalne | undefined {
  const { adresApi } = pobierzKonfiguracjeSynchronizacji()
  return adresApi ? new RepozytoriumZdalneHttp(adresApi) : undefined
}

export function synchronizujTeraz() {
  repozytoriumZdalne ??= utworzRepozytoriumZdalne()
  if (!repozytoriumZdalne) throw new Error(pobierzDiagnostykeRuntime() || 'Synchronizacja zdalna nie jest skonfigurowana na tym urządzeniu.')
  const operacja = syncEngine.synchronizuj(repozytoriumZdalne)
  if (!powiadomioneOperacje.has(operacja)) {
    powiadomioneOperacje.add(operacja)
    void operacja.then((wynik) => {
      ponowPoBrakuPolaczenia = wynik.stan === 'offline'
      powiadomOWynikuSynchronizacji(wynik)
    }, (blad: unknown) => {
      ponowPoBrakuPolaczenia = sklasyfikujBladSynchronizacji(blad) === 'brak_polaczenia'
      powiadomOBladzieSynchronizacji(blad)
    }).catch(() => undefined)
  }
  return operacja
}

export function rozstrzygnijKonfliktSynchronizacji(id: string, rozstrzygniecie: RozstrzygniecieKonfliktu) {
  return syncEngine.rozstrzygnijKonflikt(id, rozstrzygniecie)
}

export function czySynchronizacjaSkonfigurowana(): boolean {
  return Boolean(pobierzKonfiguracjeSynchronizacji().adresApi)
}

export function inicjalizujSynchronizacjeAplikacji(): Promise<() => void> {
  inicjalizacja ??= (async () => {
    repozytoriumZdalne = utworzRepozytoriumZdalne()
    if (!repozytoriumZdalne) return () => undefined

    await odtworzOczekujacaSynchronizacje()
    let opoznienie: ReturnType<typeof setTimeout> | undefined
    const uruchomBezBlokowania = () => { void synchronizujTeraz().catch(() => undefined) }
    const poZmianie = nasluchujZmianDanych((tabela) => {
      if (!nazwyTabelSynchronizowanych.includes(tabela as typeof nazwyTabelSynchronizowanych[number])) return
      void oznaczOczekujacaSynchronizacje()
      if (opoznienie) clearTimeout(opoznienie)
      opoznienie = setTimeout(uruchomBezBlokowania, OPOZNIENIE_PO_ZMIANIE_MS)
    })
    const poOdzyskaniuSieci = () => uruchomBezBlokowania()
    const poUtracieSieci = () => { void oznaczSynchronizacjeOffline().then(powiadomOSynchronizacjiOffline).catch(() => undefined) }
    window.addEventListener('online', poOdzyskaniuSieci)
    window.addEventListener('offline', poUtracieSieci)
    window.addEventListener('ogarniacz:konto', poOdzyskaniuSieci)
    const zatrzymajCyklZycia = await platforma.cyklZycia.nasluchuj((stan) => {
      if (stan === 'aktywny') uruchomBezBlokowania()
    })
    uruchomBezBlokowania()
    const ponowienie = window.setInterval(() => {
      if (ponowPoBrakuPolaczenia && navigator.onLine) uruchomBezBlokowania()
    }, OKRES_PONOWIENIA_POLACZENIA_MS)

    return () => {
      poZmianie()
      zatrzymajCyklZycia()
      window.removeEventListener('online', poOdzyskaniuSieci)
      window.removeEventListener('offline', poUtracieSieci)
      window.removeEventListener('ogarniacz:konto', poOdzyskaniuSieci)
      if (opoznienie) clearTimeout(opoznienie)
      window.clearInterval(ponowienie)
    }
  })()
  return inicjalizacja
}
