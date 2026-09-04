import type { EncjaBazowa, NazwaTabeli } from '../domain/typy'

export type NazwaTabeliSynchronizowanej = Exclude<NazwaTabeli,
  | 'stanSynchronizacji'
  | 'konfliktySynchronizacji'
  | 'kolejkaSynchronizacji'
  | 'pamiecEcho'
  | 'dziennikEcho'
  | 'historiaZmian'
>

export interface ZmianaSynchronizacji {
  zmianaId?: string
  bazowyUpdatedAt?: string
  tabela: NazwaTabeliSynchronizowanej
  rekord: EncjaBazowa
  installationId: string
}

export interface WynikSynchronizacji {
  wyslane: number
  pobrane: number
  konflikty: number
  stan: 'zsynchronizowano' | 'offline' | 'konflikt'
}

export interface RepozytoriumZdalne {
  trwale?: boolean
  pobierzZmiany(od: string): Promise<ZmianaSynchronizacji[]>
  pobierzKursor?(): string | undefined
  wyslijZmiany(zmiany: ZmianaSynchronizacji[], od?: string): Promise<void>
}

export interface DostawcaSynchronizacji {
  synchronizuj(repozytoriumZdalne: RepozytoriumZdalne): Promise<WynikSynchronizacji>
}
