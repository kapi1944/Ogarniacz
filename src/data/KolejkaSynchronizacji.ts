import type { Table } from 'dexie'
import { noweId } from '../domain/fabryki'
import type { Dokument, EncjaBazowa, NazwaTabeli, ZmianaKolejkiSynchronizacji } from '../domain/typy'
import { baza, nazwyTabel } from './BazaOgarniacza'
import { czyPrywatnaPsychoterapia } from '../domain/psychoterapia'
import { czyTabelaFinansowWspolnych, czyDostepFinansowWspolnych } from '../services/UprawnieniaService'

const TABELE_LOKALNE = new Set<NazwaTabeli>([
  'wpisyTerapii',
  'wazneInformacjeZdrowotne',
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
  if (tabela === 'dokumenty') {
    const sekcje = [...new Set([...(lokalny as Dokument | undefined)?.sekcjePrywatnosci ?? [], ...(rekord as Dokument).sekcjePrywatnosci ?? []])].sort()
    if (sekcje.length) (kopia as Dokument).sekcjePrywatnosci = sekcje
  }
  if (tabela === 'ustawienia' && lokalny && 'samopoczucie' in lokalny) Object.assign(kopia, { samopoczucie: structuredClone(lokalny.samopoczucie) })
  return kopia
}

/** Idempotentna migracja klasyfikacji dawnych relacji, także przed pierwszym wysłaniem. */
export async function uzgodnijPrywatnoscDokumentow(ids?: string[], sekcje: NonNullable<Dokument['sekcjePrywatnosci']> = []): Promise<void> {
  await baza.transaction('rw', [baza.tabela('dokumenty'), baza.tabela('wpisyTerapii'), baza.tabela('wynikiBadan'), baza.tabela('wizyty'), tabelaKolejki()], async () => {
    const [dokumenty, sesje, wyniki] = await Promise.all([
      ids ? baza.tabela('dokumenty').bulkGet(ids) : baza.tabela('dokumenty').toArray(),
      baza.tabela('wpisyTerapii').toArray(), baza.tabela('wynikiBadan').toArray(),
    ])
    for (const dokument of dokumenty) {
      if (!dokument) continue
      const wymagane = new Set(dokument.sekcjePrywatnosci ?? [])
      for (const sekcja of sekcje) wymagane.add(sekcja)
      if (wyniki.some((wynik) => wynik.dokumentId === dokument.id)) wymagane.add('dokumentacja')
      if (sesje.some((sesja) => sesja.psychoterapia?.dokumentyIds?.includes(dokument.id))) { wymagane.add('dokumentacja'); wymagane.add('psychoterapia') }
      const klasyfikacja = [...wymagane].sort()
      if (JSON.stringify(klasyfikacja) === JSON.stringify(dokument.sekcjePrywatnosci ?? [])) continue
      const zmieniony = { ...dokument, sekcjePrywatnosci: klasyfikacja, updatedAt: new Date(Math.max(Date.now(), Date.parse(dokument.updatedAt) + 1)).toISOString() }
      await baza.tabela('dokumenty').put(zmieniony)
      await dodajDoKolejkiSynchronizacji('dokumenty', zmieniony, dokument)
    }
  })
}

export function tabelaKolejki(): Table<ZmianaKolejkiSynchronizacji, string> {
  return baza.tabela('kolejkaSynchronizacji')
}

export async function dodajDoKolejkiSynchronizacji(
  tabela: NazwaTabeli,
  rekord: EncjaBazowa,
  poprzedni?: EncjaBazowa,
): Promise<void> {
  if (!czyTabelaSynchronizowana(tabela) || czyPrywatnaPsychoterapia(tabela, rekord)) return
  if (czyTabelaFinansowWspolnych(tabela) && !czyDostepFinansowWspolnych('edycja')) throw new Error('Brak dostępu właściciela do kolejki finansowej.')
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
    rekord: rekordDoSynchronizacji(tabela, rekord),
    bazowyUpdatedAt: czyTabelaFinansowWspolnych(tabela) && poprzedniaZmiana ? poprzedniaZmiana.bazowyUpdatedAt : poprzedniaZmiana?.bazowyUpdatedAt ?? poprzedni?.updatedAt,
    liczbaProb: 0,
  })
}

export async function pobierzKolejkeSynchronizacji(): Promise<ZmianaKolejkiSynchronizacji[]> {
  await uzgodnijPrywatnoscDokumentow()
  return pobierzDozwoloneZmianyKolejki()
}

/** Licznik stosuje filtry wysyłki, ale nie migruje rekordów ani nie zmienia kolejki. */
export async function policzZmianyDoSynchronizacji(): Promise<number> {
  return (await pobierzDozwoloneZmianyKolejki()).length
}

async function pobierzDozwoloneZmianyKolejki(): Promise<ZmianaKolejkiSynchronizacji[]> {
  const zmiany = await tabelaKolejki().orderBy('createdAt').toArray()
  const bezpieczne: ZmianaKolejkiSynchronizacji[] = []
  for (const zmiana of zmiany) {
    const tabela = zmiana.tabela as NazwaTabeli
    if (!nazwyTabel.includes(tabela) || !czyTabelaSynchronizowana(tabela)) continue
    if (czyTabelaFinansowWspolnych(tabela) && !czyDostepFinansowWspolnych('odczyt')) continue
    if (czyPrywatnaPsychoterapia(tabela, zmiana.rekord) || czyPrywatnaPsychoterapia(tabela, await baza.tabela(tabela).get(zmiana.rekordId))) continue
    bezpieczne.push({ ...zmiana, rekord: zachowajLokalneSamopoczucie(tabela, zmiana.rekord, await baza.tabela(tabela).get(zmiana.rekordId)) })
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
