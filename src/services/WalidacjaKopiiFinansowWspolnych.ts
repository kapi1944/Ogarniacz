import type { MapaTabel } from '../domain/typy'
import { TABELE_FINANSOW_WSPOLNYCH } from './UprawnieniaService'
import { daneBiznesowe, kanonicznyZapis, schematyFinansowe, type TabelaFinansowa } from './ZapisFinansowWspolnych'
import { obliczSaldoZOperacji } from './WspolneKasyService'
import { obliczBilansZRekordow } from './RozliczeniaService'

export function walidujHistorieFinansowa<K extends TabelaFinansowa>(tabela: K, rekord: MapaTabel[K]): void {
  const dane = daneBiznesowe(tabela, rekord)
  const historia = rekord.historiaWersji
  if (rekord.rewizja === undefined && historia === undefined) return // zgodność z modelem F7.2A
  if (!historia?.length || rekord.rewizja !== historia.length) throw new Error('Niepełna historia rewizji finansowych.')
  const identyfikatory = new Set<string>()
  const sprawdzStan = (stan: typeof historia[number]['po']) => {
    const { usunietoAt, ...wartosci } = stan
    const odtworzony = { ...wartosci, id: rekord.id, createdAt: rekord.createdAt, updatedAt: rekord.updatedAt, ...(usunietoAt !== undefined ? { usunietoAt } : {}) }
    schematyFinansowe[tabela].parse(odtworzony)
    if (kanonicznyZapis(daneBiznesowe(tabela, odtworzony as MapaTabel[K])) !== kanonicznyZapis(wartosci)) throw new Error('Historia zawiera pola spoza modelu finansowego.')
  }
  for (const [indeks, wersja] of historia.entries()) {
    if (wersja.rewizja !== indeks + 1 || wersja.oczekiwanaRewizja !== indeks || identyfikatory.has(wersja.idZapisu)) throw new Error('Niepoprawna kolejność lub identyfikatory historii finansowej.')
    identyfikatory.add(wersja.idZapisu)
    sprawdzStan(wersja.po)
    if (wersja.przed) sprawdzStan(wersja.przed)
    if (indeks && kanonicznyZapis(historia[indeks - 1].po) !== kanonicznyZapis(wersja.przed)) throw new Error('Przerwana historia finansowa.')
    const podpis = JSON.parse(wersja.podpisPolecenia) as { operacja?: string; oczekiwanaRewizja?: number }
    if (podpis.operacja !== wersja.operacja || podpis.oczekiwanaRewizja !== wersja.oczekiwanaRewizja) throw new Error('Niepoprawne potwierdzenie polecenia finansowego.')
  }
  const stan = { ...dane, ...(rekord.usunietoAt ? { usunietoAt: rekord.usunietoAt } : {}) }
  if (kanonicznyZapis(historia.at(-1)!.po) !== kanonicznyZapis(stan)) throw new Error('Historia nie odpowiada bieżącym wartościom finansowym.')
}

/** Sekcje kopii są zamknięte relacyjnie; sprawdzamy też rekordy oznaczone jako usunięte. */
export function walidujSekcjeFinansowe(sekcjeKopii: Record<string, unknown>): void {
  const kasy = (sekcjeKopii.wspolneKasy ?? {}) as Record<string, unknown>
  const grupy = (sekcjeKopii.rozliczenia ?? {}) as Record<string, unknown>
  const dane = Object.fromEntries(TABELE_FINANSOW_WSPOLNYCH.map((tabela) => [tabela, ((kasy[tabela] ?? grupy[tabela] ?? []) as unknown[]).map((rekord) => schematyFinansowe[tabela].parse(rekord))])) as { [K in TabelaFinansowa]: MapaTabel[K][] }
  for (const tabela of TABELE_FINANSOW_WSPOLNYCH) for (const rekord of dane[tabela]) walidujHistorieFinansowa(tabela, rekord)
  for (const operacja of dane.operacjeKas) if (!dane.wspolneKasy.some((kasa) => kasa.id === operacja.kasaId)) throw new Error('Kopia zawiera operację bez kasy.')
  for (const operacja of [...dane.wydatkiGrupowe, ...dane.zwrotyRozliczen]) if (!dane.rozliczenia.some((grupa) => grupa.id === operacja.rozliczenieId)) throw new Error('Kopia zawiera operację bez rozliczenia.')
  for (const kasa of dane.wspolneKasy) obliczSaldoZOperacji(kasa, dane.operacjeKas.filter((operacja) => operacja.kasaId === kasa.id))
  for (const grupa of dane.rozliczenia) obliczBilansZRekordow(grupa, dane.wydatkiGrupowe.filter((wydatek) => wydatek.rozliczenieId === grupa.id), dane.zwrotyRozliczen.filter((zwrot) => zwrot.rozliczenieId === grupa.id))
}
