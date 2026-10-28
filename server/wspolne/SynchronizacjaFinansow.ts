import { TABELE_FINANSOW_WSPOLNYCH, schematyFinansowe, daneBiznesowe, kanonicznyZapis, type TabelaFinansowa, type MapaTabel } from './ZapisFinansowy.ts'
import { walidujHistorieFinansowa, walidujSekcjeFinansowe } from './WalidacjaKopiiFinansowWspolnych.ts'
import { obliczSaldoZOperacji, obliczBilansZRekordow } from './WalidacjaFinansowa.ts'

export { TABELE_FINANSOW_WSPOLNYCH }
export class BladDanychFinansowych extends Error {}
export interface ZmianaFinansowa { tabela: string; rekord: { id: string; createdAt: string; updatedAt: string; usunietoAt?: string } }
export function czyTabelaFinansowa(tabela: string): tabela is TabelaFinansowa {
  return (TABELE_FINANSOW_WSPOLNYCH as readonly string[]).includes(tabela)
}

/** Walidacja całego obrazu przed zapisem: kolejność rodziców i dzieci nie ma znaczenia. */
export function walidujObrazFinansowy(zmiany: readonly ZmianaFinansowa[]): void {
  const dane = Object.fromEntries(TABELE_FINANSOW_WSPOLNYCH.map((tabela) => [tabela, []])) as unknown as { [K in TabelaFinansowa]: MapaTabel[K][] }
  const klucze = new Set<string>()
  for (const zmiana of zmiany) {
    if (!czyTabelaFinansowa(zmiana.tabela)) continue
    const klucz = `${zmiana.tabela}:${zmiana.rekord.id}`
    if (klucze.has(klucz)) throw new Error('Powtórzony rekord finansowy w paczce.')
    klucze.add(klucz)
    const rekord = schematyFinansowe[zmiana.tabela].parse(zmiana.rekord)
    ;(dane[zmiana.tabela] as typeof rekord[]).push(rekord)
  }
  walidujSekcjeFinansowe({ wspolneKasy: dane, rozliczenia: dane })
  // Sprawdzamy też kwoty i powiązania historycznych stanów, a nie sam kształt JSON.
  for (const tabela of TABELE_FINANSOW_WSPOLNYCH) {
    const warianty: MapaTabel[TabelaFinansowa][] = [...dane[tabela]]
    for (const rekord of warianty) {
      sprawdzRekord(tabela, rekord)
      for (const wersja of rekord.historiaWersji ?? []) for (const wariant of wersja.wariantyKonfliktu ? [wersja.wariantyKonfliktu.lokalny, wersja.wariantyKonfliktu.zdalny] : []) {
        const odtworzony = schematyFinansowe[tabela].parse(wariant)
        if (odtworzony.id !== rekord.id) throw new Error('Konflikt dotyczy innego rekordu.')
        warianty.push(odtworzony)
      }
      const stany = [daneBiznesowe(tabela, rekord), ...(rekord.historiaWersji ?? []).flatMap((wersja) => [wersja.przed, wersja.po])]
      for (const stan of stany) {
        if (!stan) continue
        const historyczny = { ...stan, id: rekord.id, createdAt: rekord.createdAt, updatedAt: rekord.updatedAt }
        if (tabela === 'wspolneKasy') obliczSaldoZOperacji(schematyFinansowe.wspolneKasy.parse(historyczny), [])
        if (tabela === 'operacjeKas') {
          const operacja = schematyFinansowe.operacjeKas.parse(historyczny)
          const kasa = dane.wspolneKasy.find(({ id }) => id === operacja.kasaId)
          if (!kasa) throw new Error('Niepełna paczka finansowa: brak kasy.')
          obliczSaldoZOperacji(kasa, [operacja])
        }
        if (tabela === 'rozliczenia') obliczBilansZRekordow(schematyFinansowe.rozliczenia.parse(historyczny), [], [])
        if (tabela === 'wydatkiGrupowe' || tabela === 'zwrotyRozliczen') {
          const operacja = schematyFinansowe[tabela].parse(historyczny)
          const grupa = dane.rozliczenia.find(({ id }) => id === operacja.rozliczenieId)
          if (!grupa) throw new Error('Niepełna paczka finansowa: brak rozliczenia.')
          obliczBilansZRekordow(grupa, tabela === 'wydatkiGrupowe' ? [schematyFinansowe.wydatkiGrupowe.parse(operacja)] : [], tabela === 'zwrotyRozliczen' ? [schematyFinansowe.zwrotyRozliczen.parse(operacja)] : [])
        }
      }
    }
  }
}

function sprawdzRekord(tabela: TabelaFinansowa, rekord: MapaTabel[TabelaFinansowa]): void {
  const sprawdzId = (id: string) => { if (!id.trim() || id.length > 200 || [...id].some((znak) => znak.charCodeAt(0) < 32)) throw new Error('Niepoprawny identyfikator finansowy.') }
  sprawdzId(rekord.id)
  for (const pole of ['kasaId', 'rozliczenieId', 'odUczestnikaId', 'doUczestnikaId'] as const) if (typeof rekord[pole] === 'string') sprawdzId(rekord[pole])
  for (const data of [rekord.createdAt, rekord.updatedAt, rekord.usunietoAt].filter((wartosc) => wartosc !== undefined)) {
    if (!Number.isFinite(Date.parse(data))) throw new Error('Niepoprawny czas rekordu finansowego.')
  }
  if (Date.parse(rekord.updatedAt) < Date.parse(rekord.createdAt)) throw new Error('Niepoprawna kolejność dat finansowych.')
  walidujHistorieFinansowa(tabela, rekord)
  for (const [indeks, wersja] of (rekord.historiaWersji ?? []).entries()) {
    if (!Number.isFinite(Date.parse(wersja.znacznikCzasu)) || indeks > 0 && wersja.znacznikCzasu <= rekord.historiaWersji![indeks - 1].znacznikCzasu) throw new Error('Niepoprawne czasy historii finansowej.')
    if (wersja.operacja === 'utworzenie' ? indeks !== 0 || wersja.przed !== undefined : !wersja.przed) throw new Error('Niepoprawny początek lub ciąg historii.')
    if (wersja.operacja === 'usuniecie' && !wersja.po.usunietoAt) throw new Error('Brak znacznika usunięcia w historii.')
    if (wersja.operacja === 'przywrocenie' && wersja.po.usunietoAt) throw new Error('Przywrócona wersja jest usunięta.')
    if ((wersja.operacja === 'rozstrzygniecie') !== Boolean(wersja.wariantyKonfliktu)) throw new Error('Rozstrzygnięcie wymaga zachowania obu wariantów.')
    if (wersja.wariantyKonfliktu) {
      const wybrany = schematyFinansowe[tabela].parse(wersja.wariantyKonfliktu[wersja.wariantyKonfliktu.wybrano])
      const stanWybrany = { ...daneBiznesowe(tabela, wybrany), ...(wybrany.usunietoAt ? { usunietoAt: wybrany.usunietoAt } : {}) }
      if (kanonicznyZapis(wersja.po) !== kanonicznyZapis(stanWybrany)) throw new Error('Rozstrzygnięcie miesza wartości różnych wariantów.')
    }
  }
  if (rekord.historiaWersji?.length && rekord.historiaWersji.at(-1)!.znacznikCzasu !== rekord.updatedAt) throw new Error('Czas rekordu nie odpowiada historii.')
}

/** Historia zatwierdzona na serwerze jest niezmienna; przy pierwszym wysłaniu przyjmujemy cały ciąg. */
export function sprawdzKontynuacjeHistorii(tabela: TabelaFinansowa, przed: ZmianaFinansowa['rekord'], po: ZmianaFinansowa['rekord']): void {
  const poprzedni = schematyFinansowe[tabela].parse(przed)
  const nastepny = schematyFinansowe[tabela].parse(po)
  if (kanonicznyZapis(poprzedni) === kanonicznyZapis(nastepny)) return
  if (poprzedni.createdAt !== nastepny.createdAt || nastepny.updatedAt <= poprzedni.updatedAt) throw new Error('Niepoprawna kontynuacja rekordu finansowego.')
  const historia = poprzedni.historiaWersji ?? []
  if (!nastepny.historiaWersji || nastepny.historiaWersji.length <= historia.length || kanonicznyZapis(nastepny.historiaWersji.slice(0, historia.length)) !== kanonicznyZapis(historia)) throw new Error('Nie można zastąpić zatwierdzonej historii finansowej.')
  const stanPrzed = { ...daneBiznesowe(tabela, poprzedni), ...(poprzedni.usunietoAt ? { usunietoAt: poprzedni.usunietoAt } : {}) }
  if (kanonicznyZapis(nastepny.historiaWersji[historia.length].przed) !== kanonicznyZapis(stanPrzed)) throw new Error('Historia nie kontynuuje zatwierdzonych wartości.')
  if ('kasaId' in poprzedni && poprzedni.kasaId !== nastepny.kasaId || 'rozliczenieId' in poprzedni && poprzedni.rozliczenieId !== nastepny.rozliczenieId) throw new Error('Nie można przenieść operacji finansowej.')
}
