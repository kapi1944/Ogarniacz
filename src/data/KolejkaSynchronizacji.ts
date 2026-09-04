import type { Table } from 'dexie'
import { noweId } from '../domain/fabryki'
import type { EncjaBazowa, NazwaTabeli, ZmianaKolejkiSynchronizacji } from '../domain/typy'
import { baza } from './BazaOgarniacza'

const TABELE_LOKALNE = new Set<NazwaTabeli>([
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
  const teraz = new Date().toISOString()
  await kolejka.add({
    id: noweId(),
    createdAt: teraz,
    updatedAt: teraz,
    tabela,
    rekordId: rekord.id,
    operacja: rekord.usunietoAt ? 'usuniecie' : poprzedni ? 'aktualizacja' : 'utworzenie',
    rekord: structuredClone(rekord),
    bazowyUpdatedAt: poprzedniaZmiana?.bazowyUpdatedAt ?? poprzedni?.updatedAt,
    liczbaProb: 0,
  })
}

export async function pobierzKolejkeSynchronizacji(): Promise<ZmianaKolejkiSynchronizacji[]> {
  return tabelaKolejki().orderBy('createdAt').toArray()
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
