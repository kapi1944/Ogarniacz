import { z } from 'zod'
import Dexie from 'dexie'
import { dodajDoKolejkiSynchronizacji } from '../data/KolejkaSynchronizacji'
import { baza } from '../data/BazaOgarniacza'
import { pobierzAktywnyProfil, pobierzSygnalProfilu } from '../data/ProfileLokalne'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'
import { type schematWersjiFinansowej } from '../domain/modeleFinansowWspolnych'
import type { MapaTabel } from '../domain/typy'
import { zbudujWpisHistorii } from './HistoriaZmianService'
import { TABELE_FINANSOW_WSPOLNYCH, sprawdzDostepFinansowWspolnych } from './UprawnieniaService'

// Wyłącznie lokalny zapis pięciu tabel F7; nie jest zamiennikiem repozytoriów aplikacji.
import { daneBiznesowe, kanonicznyZapis, schematyFinansowe, type TabelaFinansowa } from '../../server/wspolne/ZapisFinansowy.ts'
export { daneBiznesowe, kanonicznyZapis, schematyFinansowe, schematDanychKasy, schematDanychOperacji, schematDanychRozliczenia, schematDanychWydatku, schematDanychZwrotu, type TabelaFinansowa } from '../../server/wspolne/ZapisFinansowy.ts'
type WersjaFinansowa = z.infer<typeof schematWersjiFinansowej>
type WartoscFinansowa = z.infer<ReturnType<typeof z.json>>
export interface PolecenieZapisuFinansowego { idZapisu: string; oczekiwanaRewizja: number }
export class KonfliktZapisuFinansowego extends Error {}

function stanBiznesowy<K extends TabelaFinansowa>(tabela: K, rekord: MapaTabel[K]): Record<string, WartoscFinansowa> {
  return { ...daneBiznesowe(tabela, rekord), ...(rekord.usunietoAt ? { usunietoAt: rekord.usunietoAt } : {}) }
}

/** Każde wywołanie przechwytuje aktualną bazę i sesję, również podczas oczekiwania na blokadę IndexedDB. */
export async function wTransakcjiFinansowej<T>(operacja: 'odczyt' | 'edycja', wykonaj: () => Promise<T>): Promise<T> {
  sprawdzDostepFinansowWspolnych(operacja)
  const biezacaBaza = baza
  const profilId = pobierzAktywnyProfil()?.id
  const sygnal = pobierzSygnalProfilu()
  const sprawdz = () => {
    if (sygnal.aborted || biezacaBaza !== baza || profilId !== pobierzAktywnyProfil()?.id) throw new Error('Profil zmienił się podczas operacji finansowej.')
    sprawdzDostepFinansowWspolnych(operacja)
  }
  const wynik = await biezacaBaza.transaction(operacja === 'odczyt' ? 'r' : 'rw', [...TABELE_FINANSOW_WSPOLNYCH, 'historiaZmian', 'kolejkaSynchronizacji', 'stanSynchronizacji', 'konfliktySynchronizacji'].map((nazwa) => biezacaBaza.table(nazwa)), async () => {
    sprawdz()
    const wynik = await wykonaj()
    sprawdz()
    return wynik
  })
  sprawdz()
  return wynik
}

/** Wywoływane wewnątrz transakcji serwisu, po walidacji powiązań i wyniku całej grupy. */
export async function zapiszRekordFinansowy<K extends TabelaFinansowa>(
  tabela: K, id: string, polecenie: PolecenieZapisuFinansowego,
  operacja: Exclude<WersjaFinansowa['operacja'], 'rozstrzygniecie'>, tresc: unknown,
  przygotuj: (przed: MapaTabel[K] | undefined) => Promise<MapaTabel[K]>,
): Promise<MapaTabel[K]> {
  sprawdzDostepFinansowWspolnych('edycja')
  if (Dexie.currentTransaction?.db !== baza || Dexie.currentTransaction.mode !== 'readwrite' || !Dexie.currentTransaction.storeNames.includes('historiaZmian')) throw new Error('Zapis finansowy wymaga transakcji rekordu i historii.')
  z.string().trim().min(1).parse(id)
  z.object({ idZapisu: z.string().uuid(), oczekiwanaRewizja: z.number().int().safe().nonnegative() }).strict().parse(polecenie)
  const repozytorium = baza.tabela(tabela)
  const przed = await repozytorium.get(id)
  const podpisPolecenia = kanonicznyZapis({ operacja, tresc, oczekiwanaRewizja: polecenie.oczekiwanaRewizja })
  const wykonane = przed?.historiaWersji?.find((wersja) => wersja.idZapisu === polecenie.idZapisu)
  if (wykonane) {
    if (wykonane.podpisPolecenia !== podpisPolecenia) throw new KonfliktZapisuFinansowego('Ten identyfikator zapisu został użyty z innymi danymi.')
    return przed!
  }
  if ((przed?.rewizja ?? 0) !== polecenie.oczekiwanaRewizja || operacja === 'utworzenie' && przed || operacja !== 'utworzenie' && !przed) throw new KonfliktZapisuFinansowego('Nieaktualna rewizja lub zajęty identyfikator rekordu. Odczytaj dane ponownie.')
  const po = await przygotuj(przed)
  const stanPrzed = przed ? stanBiznesowy(tabela, przed) : undefined
  const stanPo = stanBiznesowy(tabela, po)
  if (przed && kanonicznyZapis(stanPrzed) === kanonicznyZapis(stanPo)) return przed
  const rewizja = (przed?.rewizja ?? 0) + 1
  z.number().int().safe().positive().parse(rewizja)
  const teraz = new Date(Math.max(Date.now(), przed ? Date.parse(przed.updatedAt) + 1 : 0)).toISOString()
  const wersja: WersjaFinansowa = { rewizja, ...polecenie, operacja, znacznikCzasu: teraz, podpisPolecenia, ...(stanPrzed ? { przed: stanPrzed } : {}), po: stanPo }
  const zapisany = { ...po, id, createdAt: przed?.createdAt ?? teraz, updatedAt: teraz, rewizja, historiaWersji: [...przed?.historiaWersji ?? [], wersja] } as MapaTabel[K]
  schematyFinansowe[tabela].parse(zapisany)
  await repozytorium.put(zapisany)
  await dodajDoKolejkiSynchronizacji(tabela, zapisany, przed)
  const wpis = zbudujWpisHistorii(tabela, przed, zapisany, operacja === 'przywrocenie' ? 'aktualizacja' : operacja, teraz)
  if (wpis) await baza.tabela('historiaZmian').add(wpis)
  return zapisany
}

export function powiadomOZapisieFinansowym(tabela: TabelaFinansowa): void {
  powiadomOZmianieDanych(tabela)
  powiadomOZmianieDanych('historiaZmian')
}

export function wymagajRekordu<T extends { usunietoAt?: string }>(rekord: T | undefined): T {
  if (!rekord || rekord.usunietoAt) throw new Error('Powiązany rekord nie istnieje lub został usunięty.')
  return rekord
}
