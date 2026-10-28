import { z } from 'zod'
import Dexie from 'dexie'
import { baza } from '../data/BazaOgarniacza'
import { pobierzAktywnyProfil, pobierzSygnalProfilu } from '../data/ProfileLokalne'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'
import { schematWspolnejKasy, schematOperacjiKasy, schematRozliczenia, schematWydatkuGrupowego, schematZwrotuRozliczenia, type schematWersjiFinansowej } from '../domain/modeleFinansowWspolnych'
import type { MapaTabel } from '../domain/typy'
import { zbudujWpisHistorii } from './HistoriaZmianService'
import { TABELE_FINANSOW_WSPOLNYCH, sprawdzDostepFinansowWspolnych } from './UprawnieniaService'

// Wyłącznie lokalny zapis pięciu tabel F7; nie jest zamiennikiem repozytoriów aplikacji.
export const schematyFinansowe = {
  wspolneKasy: schematWspolnejKasy, operacjeKas: schematOperacjiKasy, rozliczenia: schematRozliczenia,
  wydatkiGrupowe: schematWydatkuGrupowego, zwrotyRozliczen: schematZwrotuRozliczenia,
}
const metadane = { id: true, createdAt: true, updatedAt: true, usunietoAt: true, rewizja: true, historiaWersji: true } as const
export const schematDanychKasy = schematWspolnejKasy.omit(metadane).strict()
export const schematDanychOperacji = schematOperacjiKasy.omit(metadane).strict()
export const schematDanychRozliczenia = schematRozliczenia.omit(metadane).strict()
export const schematDanychWydatku = schematWydatkuGrupowego.omit(metadane).strict()
export const schematDanychZwrotu = schematZwrotuRozliczenia.omit(metadane).strict()
const schematyDanych = { wspolneKasy: schematDanychKasy, operacjeKas: schematDanychOperacji, rozliczenia: schematDanychRozliczenia, wydatkiGrupowe: schematDanychWydatku, zwrotyRozliczen: schematDanychZwrotu }
export type TabelaFinansowa = typeof TABELE_FINANSOW_WSPOLNYCH[number]
type WersjaFinansowa = z.infer<typeof schematWersjiFinansowej>
type WartoscFinansowa = z.infer<ReturnType<typeof z.json>>
export interface PolecenieZapisuFinansowego { idZapisu: string; oczekiwanaRewizja: number }
export class KonfliktZapisuFinansowego extends Error {}

export function kanonicznyZapis(wartosc: unknown): string {
  if (Array.isArray(wartosc)) return `[${wartosc.map(kanonicznyZapis).join(',')}]`
  if (wartosc && typeof wartosc === 'object') return `{${Object.entries(wartosc).filter(([, element]) => element !== undefined).sort(([pierwszy], [drugi]) => pierwszy < drugi ? -1 : pierwszy > drugi ? 1 : 0).map(([klucz, element]) => `${JSON.stringify(klucz)}:${kanonicznyZapis(element)}`).join(',')}}`
  return JSON.stringify(wartosc) ?? 'null'
}

export function daneBiznesowe<K extends TabelaFinansowa>(tabela: K, rekord: MapaTabel[K]): Record<string, WartoscFinansowa> {
  const dane = Object.fromEntries(Object.entries(rekord).filter(([klucz]) => !(klucz in metadane)))
  return JSON.parse(kanonicznyZapis(schematyDanych[tabela].parse(dane))) as Record<string, WartoscFinansowa>
}

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
  const wynik = await biezacaBaza.transaction(operacja === 'odczyt' ? 'r' : 'rw', [...TABELE_FINANSOW_WSPOLNYCH, 'historiaZmian'].map((nazwa) => biezacaBaza.table(nazwa)), async () => {
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
  operacja: WersjaFinansowa['operacja'], tresc: unknown,
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
