import { TABELE_FZ, schematyFz } from '../../server/wspolne/modelePulZobowiazan.ts'
import { TABELE_OBRAZU_FZ, czyRekordFz, stanFinansowy, walidujObrazFz, type ObrazFz, type TabelaFz } from '../../server/wspolne/WalidacjaPulZobowiazan.ts'
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

// Wspólny lokalny zapis F7 i grup FZ, bez osobnego rejestru pokwitowań.
import { daneBiznesowe, kanonicznyZapis, schematyFinansowe, type TabelaFinansowa } from '../../server/wspolne/ZapisFinansowy.ts'
export { daneBiznesowe, kanonicznyZapis, schematyFinansowe, schematDanychKasy, schematDanychOperacji, schematDanychRozliczenia, schematDanychWydatku, schematDanychZwrotu, type TabelaFinansowa } from '../../server/wspolne/ZapisFinansowy.ts'
type TabelaZapisu = TabelaFinansowa | TabelaFz
const schematyZapisu = { ...schematyFinansowe, ...schematyFz }
type WersjaFinansowa = z.infer<typeof schematWersjiFinansowej>
type WartoscFinansowa = z.infer<ReturnType<typeof z.json>>
export interface PolecenieZapisuFinansowego { idZapisu: string; oczekiwanaRewizja: number }
export class KonfliktZapisuFinansowego extends Error {}

function stanBiznesowy<K extends TabelaZapisu>(tabela: K, rekord: MapaTabel[K]): Record<string, WartoscFinansowa> {
  return { ...(czyRekordFz(tabela, rekord) ? stanFinansowy(rekord) as Record<string, WartoscFinansowa> : daneBiznesowe(tabela as TabelaFinansowa, rekord as MapaTabel[TabelaFinansowa])), ...(rekord.usunietoAt ? { usunietoAt: rekord.usunietoAt } : {}) }
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
  const wynik = await biezacaBaza.transaction(operacja === 'odczyt' ? 'r' : 'rw', [...TABELE_FINANSOW_WSPOLNYCH, ...TABELE_FZ, 'dokumenty', 'ustawienia', 'historiaZmian', 'kolejkaSynchronizacji', 'stanSynchronizacji', 'konfliktySynchronizacji'].map((nazwa) => biezacaBaza.table(nazwa)), async () => {
    sprawdz()
    const wynik = await wykonaj()
    sprawdz()
    return wynik
  })
  sprawdz()
  return wynik
}

/** Wywoływane wewnątrz transakcji serwisu, po walidacji powiązań i wyniku całej grupy. */
export async function zapiszRekordFinansowy<K extends TabelaZapisu>(
  tabela: K, id: string, polecenie: PolecenieZapisuFinansowego,
  operacja: Exclude<WersjaFinansowa['operacja'], 'rozstrzygniecie'>, tresc: unknown,
  przygotuj: (przed: MapaTabel[K] | undefined) => Promise<MapaTabel[K]>,
  grupa?: { idOperacjiZrodlowej: string; skladOperacji: { tabela: string; id: string }[] },
): Promise<MapaTabel[K]> {
  sprawdzDostepFinansowWspolnych('edycja')
  if (Dexie.currentTransaction?.db !== baza || Dexie.currentTransaction.mode !== 'readwrite' || !Dexie.currentTransaction.storeNames.includes('historiaZmian')) throw new Error('Zapis finansowy wymaga transakcji rekordu i historii.')
  z.string().trim().min(1).parse(id)
  z.object({ idZapisu: z.string().uuid(), oczekiwanaRewizja: z.number().int().safe().nonnegative() }).strict().parse(polecenie)
  const repozytorium = baza.tabela(tabela)
  const przed = await repozytorium.get(id)
  if (!grupa && (czyRekordFz(tabela, przed) || tabela === 'operacjeKas' && (await baza.tabela('wspolneKasy').get((przed as MapaTabel['operacjeKas'] | undefined)?.kasaId ?? ''))?.pula)) throw new Error('Dane FZ wymagają atomowego polecenia grupowego.')
  const podpisPolecenia = kanonicznyZapis({ operacja, tresc, oczekiwanaRewizja: polecenie.oczekiwanaRewizja })
  const wykonane = przed?.historiaWersji?.find((wersja) => wersja.idZapisu === polecenie.idZapisu)
  if (wykonane) {
    if (wykonane.podpisPolecenia !== podpisPolecenia) throw new KonfliktZapisuFinansowego('Ten identyfikator zapisu został użyty z innymi danymi.')
    return przed!
  }
  if ((przed?.rewizja ?? 0) !== polecenie.oczekiwanaRewizja || operacja === 'utworzenie' && przed || operacja !== 'utworzenie' && !przed) throw new KonfliktZapisuFinansowego('Nieaktualna rewizja lub zajęty identyfikator rekordu. Odczytaj dane ponownie.')
  const po = await przygotuj(przed)
  if (!grupa && (czyRekordFz(tabela, po) || tabela === 'operacjeKas' && (await baza.tabela('wspolneKasy').get((po as MapaTabel['operacjeKas']).kasaId))?.pula)) throw new Error('Dane FZ wymagają atomowego polecenia grupowego.')
  const stanPrzed = przed ? stanBiznesowy(tabela, przed) : undefined
  const stanPo = stanBiznesowy(tabela, po)
  if (!grupa && przed && kanonicznyZapis(stanPrzed) === kanonicznyZapis(stanPo)) return przed
  const rewizja = (przed?.rewizja ?? 0) + 1
  z.number().int().safe().positive().parse(rewizja)
  const teraz = new Date(Math.max(Date.now(), przed ? Date.parse(przed.updatedAt) + 1 : 0)).toISOString()
  const wersja: WersjaFinansowa = { rewizja, ...polecenie, ...grupa, operacja, znacznikCzasu: teraz, podpisPolecenia, ...(stanPrzed ? { przed: stanPrzed } : {}), po: stanPo }
  const zapisany = { ...po, id, createdAt: przed?.createdAt ?? teraz, updatedAt: teraz, rewizja, historiaWersji: [...przed?.historiaWersji ?? [], wersja] } as MapaTabel[K]
  schematyZapisu[tabela].parse(zapisany)
  await repozytorium.put(zapisany)
  await dodajDoKolejkiSynchronizacji(tabela, zapisany, przed)
  const wpis = zbudujWpisHistorii(tabela, przed, zapisany, operacja === 'przywrocenie' ? 'aktualizacja' : operacja, teraz)
  if (wpis) await baza.tabela('historiaZmian').add(wpis)
  return zapisany
}

export function powiadomOZapisieFinansowym(tabela: TabelaZapisu): void {
  powiadomOZmianieDanych(tabela)
  powiadomOZmianieDanych('historiaZmian')
}

export function wymagajRekordu<T extends { usunietoAt?: string }>(rekord: T | undefined): T {
  if (!rekord || rekord.usunietoAt) throw new Error('Powiązany rekord nie istnieje lub został usunięty.')
  return rekord
}

export interface PolecenieGrupyFinansowej {
  idZapisu: string
  idOperacjiZrodlowej: string
  oczekiwaneRewizje: { tabela: TabelaFz; id: string; rewizja: number }[]
  zapisy: { tabela: TabelaFz; id: string; operacja: 'utworzenie' | 'aktualizacja' | 'usuniecie' | 'przywrocenie'; dane: Record<string, unknown> }[]
}

/** Fundament bez formularzy i komend sprzedaży; cała grupa używa tego samego zapisu rewizji F7. */
export async function zapiszGrupeFinansowa(polecenie: PolecenieGrupyFinansowej): Promise<void> {
  const kopia = structuredClone(polecenie)
  z.uuid().parse(kopia.idZapisu); z.uuid().parse(kopia.idOperacjiZrodlowej)
  if (!kopia.zapisy.length) throw new Error('Puste polecenie finansowe.')
  const klucz = (element: { tabela: string; id: string }) => `${element.tabela}:${element.id}`
  for (const element of [...kopia.zapisy, ...kopia.oczekiwaneRewizje]) {
    z.enum(TABELE_OBRAZU_FZ).parse(element.tabela); z.uuid().parse(element.id)
  }
  for (const element of kopia.oczekiwaneRewizje) z.number().int().safe().nonnegative().parse(element.rewizja)
  if (new Set(kopia.zapisy.map(klucz)).size !== kopia.zapisy.length || new Set(kopia.oczekiwaneRewizje.map(klucz)).size !== kopia.oczekiwaneRewizje.length) throw new Error('Powtórzony członek polecenia.')
  kopia.zapisy.sort((pierwszy, drugi) => klucz(pierwszy) < klucz(drugi) ? -1 : 1)
  kopia.oczekiwaneRewizje.sort((pierwszy, drugi) => klucz(pierwszy) < klucz(drugi) ? -1 : 1)
  const skladOperacji = kopia.zapisy.map(({ tabela, id }) => ({ tabela, id }))
  await wTransakcjiFinansowej('edycja', async () => {
    const stan = await baza.tabela('stanSynchronizacji').get('glowny')
    if (stan?.stan === 'synchronizacja') throw new Error('Zapis FZ wymaga zakończenia bieżącej synchronizacji, aby nie wysłać starszej wersji aktywowanej Puli.')
    if (stan?.finanseWspolneNiekompletne || (await baza.tabela('konfliktySynchronizacji').toArray()).some((konflikt) => (TABELE_OBRAZU_FZ as readonly string[]).includes(konflikt.tabela))) throw new Error('Niekompletne lub skonfliktowane finanse blokują zapis FZ.')
    const obraz = Object.fromEntries(await Promise.all(TABELE_OBRAZU_FZ.map(async (tabela) => [tabela, await baza.tabela(tabela).toArray()]))) as unknown as ObrazFz
    const wykonane = TABELE_OBRAZU_FZ.flatMap((tabela) => obraz[tabela].flatMap((rekord) => (rekord.historiaWersji ?? []).filter((wersja) => wersja.idZapisu === kopia.idZapisu).map((wersja) => ({ tabela, id: rekord.id, wersja }))))
    if (wykonane.length) {
      if (wykonane.length !== kopia.zapisy.length || wykonane.some((slad) => {
        const zapis = kopia.zapisy.find((element) => klucz(element) === klucz(slad))
        const oczekiwana = kopia.oczekiwaneRewizje.find((element) => klucz(element) === klucz(slad))
        return !zapis || !oczekiwana || slad.wersja.podpisPolecenia !== kanonicznyZapis({ operacja: zapis.operacja, tresc: kopia, oczekiwanaRewizja: oczekiwana.rewizja })
      })) throw new KonfliktZapisuFinansowego('Ten identyfikator polecenia ma inną lub niepełną treść.')
      walidujObrazFz(obraz)
      return
    }
    for (const warunek of kopia.oczekiwaneRewizje) {
      const rekord = obraz[warunek.tabela].find((element) => element.id === warunek.id)
      if ((rekord?.rewizja ?? 0) !== warunek.rewizja) throw new KonfliktZapisuFinansowego('Nieaktualna rewizja członka lub zależności operacji.')
    }
    for (const zapis of kopia.zapisy) {
      const warunek = kopia.oczekiwaneRewizje.find((element) => klucz(element) === klucz(zapis))
      if (!warunek) throw new Error('Brak oczekiwanej rewizji członka operacji.')
      const stary = obraz[zapis.tabela].find((element) => element.id === zapis.id)
      const powiazanie = zapis.tabela === 'operacjeKas' ? zapis.dane.powiazaniePuli as Record<string, unknown> | undefined : zapis.dane
      if (zapis.operacja === 'utworzenie' && zapis.tabela !== 'wspolneKasy' && powiazanie?.idOperacjiZrodlowej !== kopia.idOperacjiZrodlowej) throw new Error('Nowy członek musi wskazywać operację źródłową całej grupy.')
      const zaleznosci: { tabela: TabelaFz; id: string }[] = []
      const wskaz = (tabela: TabelaFz, id: unknown) => { if (typeof id === 'string') zaleznosci.push({ tabela, id }) }
      wskaz('wspolneKasy', zapis.dane.pulaId ?? zapis.dane.kasaId)
      wskaz('osobyFinansowe', zapis.dane.osobaId ?? zapis.dane.kupujacyId)
      wskaz('zobowiazania', zapis.dane.zobowiazanieId)
      if (zapis.tabela === 'sprzedazePul' && Array.isArray(zapis.dane.pozycje)) for (const pozycja of zapis.dane.pozycje) wskaz('zakupyPul', pozycja.zakupId)
      for (const zaleznosc of zaleznosci) if (!kopia.oczekiwaneRewizje.some((warunek) => klucz(warunek) === klucz(zaleznosc))) throw new Error('Brak oczekiwanej rewizji rodzica operacji.')
      if (zapis.operacja === 'utworzenie') for (const zaleznosc of zaleznosci) {
        const rodzic = obraz[zaleznosc.tabela].find((element) => element.id === zaleznosc.id)
        if (rodzic && ('status' in rodzic && rodzic.status === 'zarchiwizowana' || 'zarchiwizowanoAt' in rodzic && rodzic.zarchiwizowanoAt)) throw new Error('Nowy zapis wymaga przywrócenia zarchiwizowanego rodzica.')
      }
      if (zapis.tabela === 'wspolneKasy') {
        const staraKasa = stary as MapaTabel['wspolneKasy'] | undefined
        const nowaPula = zapis.dane.pula as MapaTabel['wspolneKasy']['pula']
        if (!nowaPula || !stary && zapis.dane.saldoPoczatkoweGrosze !== 0 || staraKasa && zapis.dane.saldoPoczatkoweGrosze !== staraKasa.saldoPoczatkoweGrosze) throw new Error('Nowa Pula wymaga zerowego otwarcia, a aktywacja zachowuje stare saldo.')
        const maFakty = obraz.operacjeKas.some((operacja) => operacja.kasaId === zapis.id) || obraz.zakupyPul.some((zakup) => zakup.pulaId === zapis.id) || obraz.sprzedazePul.some((sprzedaz) => sprzedaz.pulaId === zapis.id)
        if (staraKasa && maFakty && (staraKasa?.waluta !== zapis.dane.waluta || staraKasa?.pula && staraKasa.pula.rodzaj !== nowaPula.rodzaj)) throw new Error('Nie można zmienić waluty lub rodzaju Puli po pierwszym fakcie.')
      }
      for (const pole of ['pulaId', 'kasaId', 'zobowiazanieId', 'osobaId', 'waluta', 'idOperacjiZrodlowej', 'rolaZapisu', 'zrodlo']) {
        if (pole === 'waluta' && zapis.tabela === 'wspolneKasy') continue
        if (stary && pole in stary && kanonicznyZapis(stary[pole as keyof typeof stary]) !== kanonicznyZapis(zapis.dane[pole])) throw new Error('Nie można przenieść źródła lub rodzica zapisanego faktu.')
      }
      if (stary) {
        const niezmienne = zapis.tabela === 'zakupyPul' ? ['partie', 'kosztyDodatkowe', 'dataZakupu'] : zapis.tabela === 'sprzedazePul' ? ['pozycje', 'dataSprzedazy', 'kupujacyId', 'operacjaPierwszejZaplatyId'] : zapis.tabela === 'zobowiazania' ? ['kwotaPoczatkowaGrosze', 'kierunek', 'dataPowstania'] : []
        for (const pole of niezmienne) if (kanonicznyZapis((stary as Record<string, unknown>)[pole]) !== kanonicznyZapis(zapis.dane[pole])) throw new Error('Zapisany fakt wymaga jawnej korekty, a nie zastąpienia danych początkowych.')
        if ('korekty' in stary && Array.isArray(stary.korekty)) for (const korekta of stary.korekty) {
          const nowa = Array.isArray(zapis.dane.korekty) ? zapis.dane.korekty.find((element) => element.id === korekta.id) as Record<string, unknown> | undefined : undefined
          const tresc = (element: Record<string, unknown>) => Object.fromEntries(Object.entries(element).filter(([pole]) => !['updatedAt', 'usunietoAt'].includes(pole)))
          if (!nowa || kanonicznyZapis(tresc(korekta)) !== kanonicznyZapis(tresc(nowa))) throw new Error('Nie można usunąć ani zastąpić zapisanej korekty. Jej ID pozostaje zarezerwowane.')
        }
      }
      const rekord = await zapiszRekordFinansowy(zapis.tabela, zapis.id, { idZapisu: kopia.idZapisu, oczekiwanaRewizja: warunek.rewizja }, zapis.operacja, kopia, async () => {
        const dane = { ...zapis.dane, id: zapis.id, createdAt: stary?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), rewizja: (stary?.rewizja ?? 0) + 1, historiaWersji: stary?.historiaWersji ?? [] }
        return dane as MapaTabel[typeof zapis.tabela]
      }, { idOperacjiZrodlowej: kopia.idOperacjiZrodlowej, skladOperacji })
      const rekordy = obraz[zapis.tabela] as MapaTabel[TabelaFz][]
      const indeks = rekordy.findIndex((element) => element.id === zapis.id)
      if (indeks < 0) rekordy.push(rekord); else rekordy[indeks] = rekord
    }
    walidujObrazFz(obraz)
    for (const zakup of obraz.zakupyPul) for (const dokumentId of [...zakup.dokumentyIds, ...zakup.partie.flatMap((partia) => partia.dokumentyIds ?? [])]) {
      const dokument = await baza.tabela('dokumenty').get(dokumentId)
      if (!dokument?.finansowe || !zakup.usunietoAt && dokument.usunietoAt) throw new Error('Zakup wymaga dokumentu z trwałą ochroną finansową.')
    }
  })
  for (const zapis of kopia.zapisy) powiadomOZapisieFinansowym(zapis.tabela)
}
