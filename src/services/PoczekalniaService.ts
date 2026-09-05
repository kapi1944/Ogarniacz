import type { NazwaModulu } from '../domain/typy'

export interface PropozycjaPoczekalni {
  tresc: string
  typ: NazwaModulu
}

function sugerujTyp(tresc: string): NazwaModulu {
  const mala = tresc.toLocaleLowerCase('pl-PL')
  if (/(kupi[cć]|zakup|mleko|apteka)/.test(mala)) return 'zakupy'
  if (/(dentyst|lekarz|wizyta|um[oó]wi[cć])/.test(mala)) return 'wizyty'
  if (/(przeczyta[cć]|obejrze[cć]|sprawdzi[cć]|p[oó][zź]niej)/.test(mala)) return 'na_pozniej'
  if (/(pomys[lł]|koncepcj)/.test(mala)) return 'pomysly'
  return 'zadania'
}

export function zaproponujPodzialPoczekalni(tresc: string): PropozycjaPoczekalni[] {
  const czesci = tresc.split(/(?:,|;|\s+i\s+)/i).map((element) => element.trim()).filter(Boolean)
  return (czesci.length > 1 ? czesci : [tresc.trim()])
    .filter(Boolean)
    .map((element) => ({ tresc: element, typ: sugerujTyp(element) }))
}
