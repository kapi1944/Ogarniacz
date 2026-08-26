import type { EncjaBazowa, NazwaTabeli } from '../domain/typy'

export interface ZmianaSynchronizacji {
  tabela: NazwaTabeli
  rekord: EncjaBazowa
}

export interface WynikSynchronizacji {
  wyslane: number
  pobrane: number
  konflikty: number
}

export interface RepozytoriumZdalne {
  pobierzZmiany(od: string): Promise<ZmianaSynchronizacji[]>
  wyslijZmiany(zmiany: ZmianaSynchronizacji[]): Promise<void>
}

export interface DostawcaSynchronizacji {
  synchronizuj(repozytoriumZdalne: RepozytoriumZdalne): Promise<WynikSynchronizacji>
}
