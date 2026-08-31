import { RepozytoriumZdalneInMemory } from '../data/RepozytoriumZdalneInMemory'
import { SyncEngine } from './SyncEngine'

const testoweRepozytoriumZdalne = new RepozytoriumZdalneInMemory()
const syncEngine = new SyncEngine()

export function synchronizujTeraz() {
  return syncEngine.synchronizuj(testoweRepozytoriumZdalne)
}

export function rozstrzygnijKonfliktSynchronizacji(id: string, wybor: 'lokalny' | 'zdalny') {
  return syncEngine.rozstrzygnijKonflikt(id, wybor)
}
