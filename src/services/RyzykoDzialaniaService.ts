import type { RyzykoDzialania } from '../domain/typy'

export function czyWymagaPotwierdzenia(ryzyko: RyzykoDzialania): boolean {
  return ryzyko === 'umiarkowane' || ryzyko === 'wysokie'
}
