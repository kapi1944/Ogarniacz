import type { Table } from 'dexie'
import { noweId } from '../domain/fabryki'
import type { EncjaBazowa, NazwaTabeli, ZmianaKolejkiSynchronizacji } from '../domain/typy'
import { baza, nazwyTabel } from './BazaOgarniacza'
import { czyPrywatnaPsychoterapia } from '../domain/psychoterapia'

const TABELE_LOKALNE = new Set<NazwaTabeli>([
  'wynikiBadan',
  'wpisySamopoczucia',
  'stanSynchronizacji',
  'konfliktySynchronizacji',
  'kolejkaSynchronizacji',
  'pamiecEcho',
  'dziennikEcho',
  'historiaZmian',
])

export function czyTabelaSynchronizowana(tabela: NazwaTabeli): boolean {
  return !TABELE_LOKALNE.has(tabela)
}

/** Prywatne definicje i preferencje dziennika nigdy nie opuszczają ustawień lokalnych. */
export function rekordDoSynchronizacji(tabela: NazwaTabeli, rekord: EncjaBazowa): EncjaBazowa {
  const kopia = structuredClone(rekord) as EncjaBazowa & { samopoczucie?: unknown }
  if (tabela === 'ustawienia') delete kopia.samopoczucie
  return kopia
}

export function zachowajLokalneSamopoczucie(tabela: NazwaTabeli, rekord: EncjaBazowa, lokalny?: EncjaBazowa): EncjaBazowa {
  const kopia = rekordDoSynchronizacji(tabela, rekord)
  if (tabela === 'ustawienia' && lokalny && 'samopoczucie' in lokalny) Object.assign(kopia, { samopoczucie: structuredClone(lokalny.samopoczucie) })
  return kopia
}

export function tabelaKolejki(): Table<ZmianaKolejkiSynchronizacji, string> {
  return baza.tabela('kolejkaSynchronizacji')
}

export async function dodajDoKolejkiSynchronizacji(
  tabela: NazwaTabeli,
  rekord: EncjaBazowa,
  poprzedni?: EncjaBazowa,
): Promise<void> {
  if (!czyTabelaSynchronizowana(tabela)) return
  const kolejka = tabelaKolejki()
  const poprzedniaZmiana = await kolejka.where('[tabela+rekordId]').equals([tabela, rekord.id]).first()
  if (poprzedniaZmiana) await kolejka.delete(poprzedniaZmiana.id)
  if (czyPrywatnaPsychoterapia(tabela, rekord)) return
  const teraz = new Date().toISOString()
  await kolejka.add({
    id: noweId(),
    createdAt: teraz,
    updatedAt: teraz,
    tabela,
    rekordId: rekord.id,
    operacja: rekord.usunietoAt ? 'usuniecie' : poprzedni ? 'aktualizacja' : 'utworzenie',
    rekord: rekordDoSynchronizacji(tabela, rekord),
    bazowyUpdatedAt: poprzedniaZmiana?.bazowyUpdatedAt ?? poprzedni?.updatedAt,
    liczbaProb: 0,
  })
}

export async function pobierzKolejkeSynchronizacji(): Promise<ZmianaKolejkiSynchronizacji[]> {
  const zmiany = await tabelaKolejki().orderBy('createdAt').toArray()
  const bezpieczne: ZmianaKolejkiSynchronizacji[] = []
  for (const zmiana of zmiany) {
    const tabela = zmiana.tabela as NazwaTabeli
    if (!nazwyTabel.includes(tabela) || !czyTabelaSynchronizowana(tabela)) continue
    if (czyPrywatnaPsychoterapia(tabela, zmiana.rekord) || czyPrywatnaPsychoterapia(tabela, await baza.tabela(tabela).get(zmiana.rekordId))) continue
    bezpieczne.push(zmiana)
  }
  return bezpieczne
    .map((zmiana) => ({ ...zmiana, rekord: rekordDoSynchronizacji(zmiana.tabela as NazwaTabeli, zmiana.rekord) }))
}

export async function usunWyslaneZmiany(ids: string[]): Promise<void> {
  if (ids.length > 0) await tabelaKolejki().bulkDelete(ids)
}

export async function zapiszBladKolejki(ids: string[], blad: string): Promise<void> {
  const teraz = new Date().toISOString()
  await tabelaKolejki().where('id').anyOf(ids).modify((zmiana) => {
    zmiana.liczbaProb += 1
    zmiana.ostatniBlad = blad
    zmiana.updatedAt = teraz
  })
}
