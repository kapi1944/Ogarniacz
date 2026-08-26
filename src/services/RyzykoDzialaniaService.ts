import type { RyzykoDzialania } from '../domain/typy'

export function czyWymagaPotwierdzenia(ryzyko: RyzykoDzialania): boolean {
  return ryzyko === 'umiarkowane' || ryzyko === 'wysokie'
}

export function ocenRyzykoPolecenia(polecenie: string): RyzykoDzialania {
  const tekst = polecenie.toLocaleLowerCase('pl')
  if (/usu[nń]|wyczy[sś][cć]|zap[lł]a[cć]|wy[sś]lij/.test(tekst)) return 'wysokie'
  if (/prze[lł][oó][zż]|przebuduj plan|zmie[nń] termin/.test(tekst)) return 'umiarkowane'
  return 'niskie'
}
