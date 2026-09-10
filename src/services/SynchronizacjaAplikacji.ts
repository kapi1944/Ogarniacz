import { nasluchujZmianDanych } from '../data/ZdarzeniaDanych'
import { RepozytoriumZdalneHttp } from '../data/RepozytoriumZdalneHttp'
import type { RepozytoriumZdalne } from '../data/DostawcaSynchronizacji'
import { platforma } from '../platform/platforma'
import { pobierzKonfiguracjeSynchronizacji } from './KonfiguracjaSynchronizacji'
import { nazwyTabelSynchronizowanych, oznaczOczekujacaSynchronizacje, oznaczSynchronizacjeOffline, odtworzOczekujacaSynchronizacje, SyncEngine } from './SyncEngine'

const syncEngine = new SyncEngine()
const OPOZNIENIE_PO_ZMIANIE_MS = 3_000
let repozytoriumZdalne: RepozytoriumZdalne | undefined
let inicjalizacja: Promise<() => void> | undefined

function utworzRepozytoriumZdalne(): RepozytoriumZdalne | undefined {
  const { adresApi, kluczDostepu } = pobierzKonfiguracjeSynchronizacji()
  return adresApi ? new RepozytoriumZdalneHttp(adresApi, kluczDostepu) : undefined
}

export function synchronizujTeraz() {
  repozytoriumZdalne ??= utworzRepozytoriumZdalne()
  if (!repozytoriumZdalne) throw new Error('Synchronizacja zdalna nie jest skonfigurowana na tym urządzeniu.')
  return syncEngine.synchronizuj(repozytoriumZdalne)
}

export function rozstrzygnijKonfliktSynchronizacji(id: string, wybor: 'lokalny' | 'zdalny') {
  return syncEngine.rozstrzygnijKonflikt(id, wybor)
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
    const poUtracieSieci = () => { void oznaczSynchronizacjeOffline() }
    window.addEventListener('online', poOdzyskaniuSieci)
    window.addEventListener('offline', poUtracieSieci)
    window.addEventListener('ogarniacz:konto', poOdzyskaniuSieci)
    const zatrzymajCyklZycia = await platforma.cyklZycia.nasluchuj((stan) => {
      if (stan === 'aktywny') uruchomBezBlokowania()
    })
    uruchomBezBlokowania()

    return () => {
      poZmianie()
      zatrzymajCyklZycia()
      window.removeEventListener('online', poOdzyskaniuSieci)
      window.removeEventListener('offline', poUtracieSieci)
      window.removeEventListener('ogarniacz:konto', poOdzyskaniuSieci)
      if (opoznienie) clearTimeout(opoznienie)
    }
  })()
  return inicjalizacja
}
