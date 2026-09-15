import type { EncjaBazowa } from './typy'

export type TypPolaRejestru =
  | 'tekst'
  | 'textarea'
  | 'liczba'
  | 'kwota'
  | 'data'
  | 'czas'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'url'

export type WartoscPolaWlasnego = string | number | boolean | string[] | null
export type WartoscPolaRejestru = WartoscPolaWlasnego
export type IdPolaSystemowego = `system:${string}`
export type IdPolaWlasnego = `custom:${string}`
export type IdPolaRejestru = IdPolaSystemowego | IdPolaWlasnego
export type PolaWlasne = Partial<Record<IdPolaWlasnego, WartoscPolaWlasnego>>
export type TrybObslugiPolaSystemowego = 'bezposrednie' | 'tylko_odczyt' | 'akcja_domenowa'
export type IdResolveraPolaRejestru = `resolver:${string}`
export type IdAkcjiDomenowejPolaRejestru = `action:${string}`

export interface RolaSemantycznaRejestru<Typ extends TypPolaRejestru = TypPolaRejestru> {
  id: string
  etykieta: string
  opis: string
  dozwoloneTypy: readonly Typ[]
}

export const ROLE_SEMANTYCZNE_REJESTRU = [
  {
    id: 'semantyka:kwota',
    etykieta: 'Kwota',
    opis: 'Wskazuje wartość pieniężną bez wykonywania dodatkowej logiki.',
    dozwoloneTypy: ['kwota'],
  },
  {
    id: 'semantyka:data',
    etykieta: 'Data',
    opis: 'Wskazuje datę bez uruchamiania przypomnień ani automatyzacji.',
    dozwoloneTypy: ['data'],
  },
  {
    id: 'semantyka:adres_url',
    etykieta: 'Adres URL',
    opis: 'Wskazuje adres internetowy bez pobierania lub interpretowania jego treści.',
    dozwoloneTypy: ['url'],
  },
] as const satisfies readonly RolaSemantycznaRejestru[]

export type IdRoliSemantycznej = (typeof ROLE_SEMANTYCZNE_REJESTRU)[number]['id']
type RolaSemantycznaDlaTypu<Typ extends TypPolaRejestru> =
  (typeof ROLE_SEMANTYCZNE_REJESTRU)[number] extends infer Rola
    ? Rola extends { id: infer Id; dozwoloneTypy: readonly (infer DozwolonyTyp)[] }
      ? Typ extends DozwolonyTyp ? Id : never
      : never
    : never

interface WspolnaDefinicjaPolaRejestru<Typ extends TypPolaRejestru> {
  id: IdPolaRejestru
  etykieta: string
  typ: Typ
  opcje?: { wartosc: string; etykieta: string }[]
  rolaSemantyczna?: RolaSemantycznaDlaTypu<Typ>
}

export type DefinicjaPolaRejestru<Typ extends TypPolaRejestru = TypPolaRejestru> = WspolnaDefinicjaPolaRejestru<Typ> & (
  | { zrodlo: 'systemowe'; id: IdPolaSystemowego; trybObslugi: 'bezposrednie'; kluczWlasciwosci: string }
  | { zrodlo: 'systemowe'; id: IdPolaSystemowego; trybObslugi: 'tylko_odczyt'; resolverId: IdResolveraPolaRejestru }
  | { zrodlo: 'systemowe'; id: IdPolaSystemowego; trybObslugi: 'akcja_domenowa'; actionId: IdAkcjiDomenowejPolaRejestru }
  | { zrodlo: 'wlasne'; id: IdPolaWlasnego }
)

export interface DefinicjaRejestru {
  id: string
  nazwa: string
  pola: DefinicjaPolaRejestru[]
}

export interface DefinicjaWidokuRejestru extends EncjaBazowa {
  id: string
  rejestrId: DefinicjaRejestru['id']
  nazwa: string
  widocznePolaIds: IdPolaRejestru[]
}

export interface DefinicjaWlasnegoPolaRejestru<Typ extends TypPolaRejestru = TypPolaRejestru> extends EncjaBazowa {
  id: IdPolaWlasnego
  rejestrId: DefinicjaRejestru['id']
  etykieta: string
  typ: Typ
  opcje?: { wartosc: string; etykieta: string }[]
  rolaSemantyczna?: RolaSemantycznaDlaTypu<Typ>
  aktywne: boolean
  revision: number
}

export function zapiszWartoscPolaWlasnego(polaWlasne: PolaWlasne | undefined, idPola: IdPolaWlasnego, wartosc: WartoscPolaWlasnego): PolaWlasne {
  return { ...polaWlasne, [idPola]: wartosc }
}

export function utworzDefinicjePolaRejestru<Pole extends DefinicjaPolaRejestru>(pole: Pole): Pole {
  if (pole.zrodlo === 'wlasne' && !pole.id.startsWith('custom:')) {
    throw new Error('Id własnego pola musi zaczynać się od „custom:”.')
  }

  if (pole.zrodlo === 'systemowe' && !pole.id.startsWith('system:')) {
    throw new Error('Id systemowego pola musi zaczynać się od „system:”.')
  }

  if (pole.zrodlo === 'systemowe' && pole.trybObslugi === 'bezposrednie' && !pole.kluczWlasciwosci) {
    throw new Error('Bezpośrednie pole systemowe wymaga klucza właściwości.')
  }

  if (pole.zrodlo === 'systemowe' && pole.trybObslugi === 'tylko_odczyt' && !pole.resolverId) {
    throw new Error('Pole tylko do odczytu wymaga resolverId.')
  }

  if (pole.zrodlo === 'systemowe' && pole.trybObslugi === 'akcja_domenowa' && !pole.actionId) {
    throw new Error('Pole z akcją domenową wymaga actionId.')
  }

  walidujRoleSemantycznaPolaRejestru(pole.typ, pole.rolaSemantyczna)

  return pole
}

export function walidujRoleSemantycznaPolaRejestru(typ: TypPolaRejestru, rolaSemantyczna?: string): void {
  if (!rolaSemantyczna) return
  const rola = ROLE_SEMANTYCZNE_REJESTRU.find((kandydat) => kandydat.id === rolaSemantyczna)
  if (!rola || !rola.dozwoloneTypy.includes(typ as never)) {
    throw new Error('Rola semantyczna nie istnieje lub nie jest zgodna z typem pola.')
  }
}
