import type { EncjaBazowa, NazwaTabeli } from '../domain/typy'

export type NazwaTabeliSynchronizowanej = Exclude<NazwaTabeli,
  | 'wazneInformacjeZdrowotne'
  | 'wynikiBadan'
  | 'wpisySamopoczucia'
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

export class BladKonfliktuSynchronizacji extends Error {
  constructor(komunikat = 'Serwer wykrył równoległą zmianę rekordu.') {
    super(komunikat)
    this.name = 'BladKonfliktuSynchronizacji'
  }
}

export interface WynikSynchronizacji {
  wyslane: number
  pobrane: number
  konflikty: number
  stan: 'zsynchronizowano' | 'oczekuje' | 'offline' | 'konflikt'
}

export interface RepozytoriumZdalne {
  trwale?: boolean
  pobierzObslugiwaneTabeleFinansowe?(): readonly string[]
  pobierzZmiany(od: string): Promise<ZmianaSynchronizacji[]>
  pobierzKursor?(): string | undefined
  /** Może zwrócić zmiany odrzucone przez serwer; pozostałe wysłane zmiany zostały zapisane. */
  wyslijZmiany(zmiany: ZmianaSynchronizacji[], od?: string): Promise<void | WynikWysylaniaZmian>
}

/** Odrzucenie pojedynczej zmiany przez serwer — wyłącznie identyfikatory i kontrolowany powód. */
export interface OdrzuconaZmianaSynchronizacji {
  tabela?: string
  rekordId?: string
  zmianaId?: string
  powod: string
}

export interface WynikWysylaniaZmian {
  odrzucone?: OdrzuconaZmianaSynchronizacji[]
}

export interface DostawcaSynchronizacji {
  synchronizuj(repozytoriumZdalne: RepozytoriumZdalne): Promise<WynikSynchronizacji>
}
