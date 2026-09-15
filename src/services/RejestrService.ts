import { pobierzRepozytorium, type Repozytorium } from '../data/Repozytorium'
import { noweId, utworzMetadane } from '../domain/fabryki'
import {
  walidujRoleSemantycznaPolaRejestru,
  type DefinicjaRejestru,
  type DefinicjaWidokuRejestru,
  type DefinicjaWlasnegoPolaRejestru,
  type IdPolaWlasnego,
  type TypPolaRejestru,
} from '../domain/rejestr'

type DaneNowegoPola<Typ extends TypPolaRejestru> = Omit<DefinicjaWlasnegoPolaRejestru<Typ>, 'id' | 'createdAt' | 'updatedAt' | 'usunietoAt' | 'aktywne' | 'revision'>
type ZmianyDefinicjiPola<Typ extends TypPolaRejestru> = Pick<DefinicjaWlasnegoPolaRejestru<Typ>, 'etykieta' | 'opcje' | 'rolaSemantyczna'>
type DaneWidokuRejestru = Omit<DefinicjaWidokuRejestru, 'createdAt' | 'updatedAt' | 'usunietoAt'>

function sprawdzDefinicje(definicja: DefinicjaWlasnegoPolaRejestru): void {
  if (!definicja.id.startsWith('custom:')) throw new Error('Id własnego pola musi zaczynać się od „custom:”.')
  walidujRoleSemantycznaPolaRejestru(definicja.typ, definicja.rolaSemantyczna)
}

export async function pobierzAktywneDefinicjePolRejestru(
  rejestrId: DefinicjaRejestru['id'],
  repozytorium: Repozytorium<DefinicjaWlasnegoPolaRejestru> = pobierzRepozytorium('definicjeWlasnychPolRejestru'),
): Promise<DefinicjaWlasnegoPolaRejestru[]> {
  return (await repozytorium.lista()).filter((definicja) => definicja.rejestrId === rejestrId && definicja.aktywne)
}

export async function utworzWlasnePoleRejestru<Typ extends TypPolaRejestru>(
  dane: DaneNowegoPola<Typ>,
  repozytorium: Repozytorium<DefinicjaWlasnegoPolaRejestru> = pobierzRepozytorium('definicjeWlasnychPolRejestru'),
): Promise<DefinicjaWlasnegoPolaRejestru<Typ>> {
  const id = `custom:${noweId()}` as IdPolaWlasnego
  const definicja: DefinicjaWlasnegoPolaRejestru<Typ> = {
    ...utworzMetadane(id),
    ...dane,
    id,
    aktywne: true,
    revision: 1,
  }
  sprawdzDefinicje(definicja)
  await repozytorium.zapisz(definicja)
  return definicja
}

export async function zmienDefinicjeWlasnegoPolaRejestru<Typ extends TypPolaRejestru>(
  id: IdPolaWlasnego,
  zmiany: ZmianyDefinicjiPola<Typ>,
  repozytorium: Repozytorium<DefinicjaWlasnegoPolaRejestru> = pobierzRepozytorium('definicjeWlasnychPolRejestru'),
): Promise<DefinicjaWlasnegoPolaRejestru<Typ>> {
  const istniejaca = await repozytorium.pobierz(id)
  if (!istniejaca) throw new Error('Nie znaleziono definicji własnego pola rejestru.')
  const definicja = { ...istniejaca, ...zmiany, revision: (istniejaca.revision ?? 1) + 1 } as DefinicjaWlasnegoPolaRejestru<Typ>
  sprawdzDefinicje(definicja)
  await repozytorium.zapisz(definicja)
  return definicja
}

export async function archiwizujWlasnePoleRejestru(
  id: IdPolaWlasnego,
  repozytorium: Repozytorium<DefinicjaWlasnegoPolaRejestru> = pobierzRepozytorium('definicjeWlasnychPolRejestru'),
): Promise<void> {
  const definicja = await repozytorium.pobierz(id)
  if (!definicja) throw new Error('Nie znaleziono definicji własnego pola rejestru.')
  await repozytorium.zapisz({ ...definicja, aktywne: false, revision: (definicja.revision ?? 1) + 1 })
}

export async function pobierzWidokiRejestru(
  rejestrId: DefinicjaRejestru['id'],
  repozytorium: Repozytorium<DefinicjaWidokuRejestru> = pobierzRepozytorium('widokiRejestru'),
): Promise<DefinicjaWidokuRejestru[]> {
  return (await repozytorium.lista()).filter((widok) => widok.rejestrId === rejestrId)
}

export async function zapiszWidokRejestru(
  dane: DaneWidokuRejestru,
  repozytorium: Repozytorium<DefinicjaWidokuRejestru> = pobierzRepozytorium('widokiRejestru'),
): Promise<DefinicjaWidokuRejestru> {
  const istniejacy = await repozytorium.pobierz(dane.id)
  const widok = { ...(istniejacy ?? utworzMetadane(dane.id)), ...dane }
  await repozytorium.zapisz(widok)
  return widok
}
