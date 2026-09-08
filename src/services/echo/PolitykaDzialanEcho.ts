import type { RyzykoDzialania } from '../../domain/typy'
import { czyWymagaPotwierdzenia } from '../RyzykoDzialaniaService'

export type DecyzjaPolitykiEcho =
  | { dozwolone: true }
  | { dozwolone: false; powod: 'wymaga_potwierdzenia' }

export class PolitykaDzialanEcho {
  ocen(ryzyko: RyzykoDzialania, potwierdzone: boolean, _rodzaj: 'odczyt' | 'zapis' = 'odczyt'): DecyzjaPolitykiEcho {
    if (potwierdzone || !czyWymagaPotwierdzenia(ryzyko)) return { dozwolone: true }
    return { dozwolone: false, powod: 'wymaga_potwierdzenia' }
  }
}

export class PolitykaPamieciEcho {
  czyMoznaZapisac(zrodlo: 'jawna_prosba' | 'propozycja_echo' | 'reczne', zaakceptowane: boolean): boolean {
    return zrodlo === 'reczne' || zrodlo === 'jawna_prosba' || (zrodlo === 'propozycja_echo' && zaakceptowane)
  }
}
