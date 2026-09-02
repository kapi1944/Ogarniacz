import { nasluchujZmianDanych } from '../data/ZdarzeniaDanych'
import { RepozytoriumZdalneHttp } from '../data/RepozytoriumZdalneHttp'
import type { RepozytoriumZdalne } from '../data/DostawcaSynchronizacji'
import { platforma } from '../platform/platforma'
import { nazwyTabelSynchronizowanych, oznaczOczekujacaSynchronizacje, SyncEngine } from './SyncEngine'

const syncEngine = new SyncEngine()
const INTERWAL_SYNCHRONIZACJI_MS = 5 * 60 * 1000
const OPOZNIENIE_PO_ZMIANIE_MS = 3_000
let repozytoriumZdalne: RepozytoriumZdalne | undefined
let inicjalizacja: Promise<() => void> | undefined

function utworzRepozytoriumZdalne(): RepozytoriumZdalne | undefined {
  const adresApi = import.meta.env.VITE_SYNC_API_URL?.trim()
  const kluczDostepu = import.meta.env.VITE_SYNC_ACCESS_KEY?.trim()
  return adresApi && kluczDostepu ? new RepozytoriumZdalneHttp(adresApi, kluczDostepu) : undefined
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
  return Boolean(import.meta.env.VITE_SYNC_API_URL?.trim() && import.meta.env.VITE_SYNC_ACCESS_KEY?.trim())
}

export function inicjalizujSynchronizacjeAplikacji(): Promise<() => void> {
  inicjalizacja ??= (async () => {
    repozytoriumZdalne = utworzRepozytoriumZdalne()
    if (!repozytoriumZdalne) return () => undefined

    let opoznienie: ReturnType<typeof setTimeout> | undefined
    const uruchomBezBlokowania = () => { void synchronizujTeraz().catch(() => undefined) }
    const poZmianie = nasluchujZmianDanych((tabela) => {
      if (!nazwyTabelSynchronizowanych.includes(tabela as typeof nazwyTabelSynchronizowanych[number])) return
      void oznaczOczekujacaSynchronizacje()
      if (opoznienie) clearTimeout(opoznienie)
      opoznienie = setTimeout(uruchomBezBlokowania, OPOZNIENIE_PO_ZMIANIE_MS)
    })
    const poOdzyskaniuSieci = () => uruchomBezBlokowania()
    window.addEventListener('online', poOdzyskaniuSieci)
    const zatrzymajCyklZycia = await platforma.cyklZycia.nasluchuj((stan) => {
      if (stan === 'aktywny') uruchomBezBlokowania()
    })
    const interwal = setInterval(uruchomBezBlokowania, INTERWAL_SYNCHRONIZACJI_MS)
    uruchomBezBlokowania()

    return () => {
      poZmianie()
      zatrzymajCyklZycia()
      window.removeEventListener('online', poOdzyskaniuSieci)
      clearInterval(interwal)
      if (opoznienie) clearTimeout(opoznienie)
    }
  })()
  return inicjalizacja
}
