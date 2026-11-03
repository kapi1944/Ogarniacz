import { z } from 'zod'
import { TABELE_OBRAZU_FZ, stanFinansowy, type ObrazFz } from '../../server/wspolne/WalidacjaPulZobowiazan.ts'
import { obliczProjekcjePuli } from '../../server/wspolne/ProjekcjePul.ts'
import { sumaGroszy } from '../../server/wspolne/ObliczeniaPul.ts'
import { zapiszGrupeFinansowa, type PolecenieGrupyFinansowej } from './ZapisFinansowWspolnych'
import { baza } from '../data/BazaOgarniacza'
import type { OperacjaKasy, WspolnaKasa } from '../domain/modeleFinansowWspolnych'
import { groszeNaKwote } from './ObliczeniaFinansowWspolnych'
import { sprawdzKompletnoscFinansow } from './SyncEngine'
import { daneBiznesowe, wymagajRekordu, wTransakcjiFinansowej, zapiszRekordFinansowy, powiadomOZapisieFinansowym, schematDanychKasy, schematDanychOperacji, type PolecenieZapisuFinansowego } from './ZapisFinansowWspolnych'

export type DaneWspolnejKasy = z.infer<typeof schematDanychKasy>
export type DaneOperacjiKasy = z.infer<typeof schematDanychOperacji>

export { obliczSaldoZOperacji, walidujOperacjeKasy } from '../../server/wspolne/WalidacjaFinansowa.ts'
import { obliczSaldoZOperacji } from '../../server/wspolne/WalidacjaFinansowa.ts'

async function operacjeKasy(id: string): Promise<OperacjaKasy[]> {
  return baza.tabela('operacjeKas').where('kasaId').equals(id).toArray()
}

function wymagajAktywnejKasy(kasa: WspolnaKasa | undefined): WspolnaKasa {
  const istniejaca = wymagajRekordu(kasa)
  if (istniejaca.status !== 'aktywna') throw new Error('Kasa jest zarchiwizowana. Najpierw ją przywróć.')
  return istniejaca
}

export async function utworzKase(id: string, dane: DaneWspolnejKasy, polecenie: PolecenieZapisuFinansowego): Promise<WspolnaKasa> {
  const poprawne = schematDanychKasy.parse(dane)
  const wynik = await wTransakcjiFinansowej('edycja', () => zapiszRekordFinansowy('wspolneKasy', id, polecenie, 'utworzenie', poprawne, async () => {
    groszeNaKwote(poprawne.saldoPoczatkoweGrosze, poprawne.waluta)
    if (poprawne.status !== 'aktywna') throw new Error('Nowa kasa musi być aktywna.')
    return { ...poprawne, id, createdAt: '', updatedAt: '' }
  }))
  powiadomOZapisieFinansowym('wspolneKasy')
  return wynik
}

export async function edytujKase(id: string, dane: DaneWspolnejKasy, polecenie: PolecenieZapisuFinansowego): Promise<WspolnaKasa> {
  const poprawne = schematDanychKasy.parse(dane)
  const wynik = await wTransakcjiFinansowej('edycja', () => zapiszRekordFinansowy('wspolneKasy', id, polecenie, 'aktualizacja', poprawne, async (przed) => {
    const kasa = wymagajAktywnejKasy(przed)
    if (poprawne.status !== kasa.status) throw new Error('Użyj archiwizacji kasy.')
    const operacje = await operacjeKasy(id)
    if (operacje.length && kasa.waluta !== poprawne.waluta) throw new Error('Nie można zmienić waluty po zapisaniu pierwszej operacji.')
    const po = { ...kasa, ...poprawne }
    obliczSaldoZOperacji(po, operacje)
    return po
  }))
  powiadomOZapisieFinansowym('wspolneKasy')
  return wynik
}

async function zmienArchiwizacjeKasy(id: string, status: WspolnaKasa['status'], polecenie: PolecenieZapisuFinansowego): Promise<WspolnaKasa> {
  const wynik = await wTransakcjiFinansowej('edycja', () => zapiszRekordFinansowy('wspolneKasy', id, polecenie, status === 'aktywna' ? 'przywrocenie' : 'aktualizacja', { status }, async (przed) => ({ ...wymagajRekordu(przed), status })))
  powiadomOZapisieFinansowym('wspolneKasy')
  return wynik
}
export const archiwizujKase = (id: string, polecenie: PolecenieZapisuFinansowego) => zmienArchiwizacjeKasy(id, 'zarchiwizowana', polecenie)
export const przywrocKase = (id: string, polecenie: PolecenieZapisuFinansowego) => zmienArchiwizacjeKasy(id, 'aktywna', polecenie)

async function zapiszOperacje(id: string, dane: DaneOperacjiKasy | undefined, polecenie: PolecenieZapisuFinansowego, rodzaj: 'utworzenie' | 'aktualizacja' | 'usuniecie' | 'przywrocenie'): Promise<OperacjaKasy> {
  const poprawne = dane ? schematDanychOperacji.parse(dane) : undefined
  const wynik = await wTransakcjiFinansowej('edycja', () => zapiszRekordFinansowy('operacjeKas', id, polecenie, rodzaj, poprawne ?? null, async (przed) => {
    if (rodzaj === 'aktualizacja') wymagajRekordu(przed)
    const daneOperacji = poprawne ?? daneBiznesowe('operacjeKas', przed!) as DaneOperacjiKasy
    if (przed && daneOperacji.kasaId !== przed.kasaId) throw new Error('Nie można przenieść operacji do innej kasy.')
    const kasa = wymagajAktywnejKasy(await baza.tabela('wspolneKasy').get(daneOperacji.kasaId))
    const po: OperacjaKasy = { ...przed, ...daneOperacji, id, createdAt: przed?.createdAt ?? '', updatedAt: '' }
    if (rodzaj === 'usuniecie') po.usunietoAt = przed?.usunietoAt ?? new Date().toISOString()
    if (rodzaj === 'przywrocenie') delete po.usunietoAt
    const operacje = await operacjeKasy(kasa.id)
    obliczSaldoZOperacji(kasa, [...operacje.filter((operacja) => operacja.id !== id), po])
    return po
  }))
  powiadomOZapisieFinansowym('operacjeKas')
  return wynik
}

export const dodajOperacjeKasy = (id: string, dane: DaneOperacjiKasy, polecenie: PolecenieZapisuFinansowego) => zapiszOperacje(id, dane, polecenie, 'utworzenie')
export const edytujOperacjeKasy = (id: string, dane: DaneOperacjiKasy, polecenie: PolecenieZapisuFinansowego) => zapiszOperacje(id, dane, polecenie, 'aktualizacja')
export const usunOperacjeKasy = (id: string, polecenie: PolecenieZapisuFinansowego) => zapiszOperacje(id, undefined, polecenie, 'usuniecie')
export const przywrocOperacjeKasy = (id: string, polecenie: PolecenieZapisuFinansowego) => zapiszOperacje(id, undefined, polecenie, 'przywrocenie')

export async function pobierzKase(id: string): Promise<WspolnaKasa | undefined> {
  return wTransakcjiFinansowej('odczyt', () => baza.tabela('wspolneKasy').get(id))
}
export async function listaKas(): Promise<WspolnaKasa[]> {
  return wTransakcjiFinansowej('odczyt', () => baza.tabela('wspolneKasy').toArray())
}
export async function listaOperacjiKasy(id: string, zUsunietymi = false): Promise<OperacjaKasy[]> {
  return wTransakcjiFinansowej('odczyt', async () => {
    wymagajRekordu(await baza.tabela('wspolneKasy').get(id))
    return (await operacjeKasy(id)).filter((operacja) => zUsunietymi || !operacja.usunietoAt)
  })
}
export async function pobierzSaldoKasy(id: string): Promise<number> {
  return wTransakcjiFinansowej('odczyt', async () => {
    await sprawdzKompletnoscFinansow()
    const kasa = wymagajRekordu(await baza.tabela('wspolneKasy').get(id))
    if (kasa.pula) throw new Error('Pula wymaga kompletnej projekcji FZ uwzględniającej zobowiązania.')
    return obliczSaldoZOperacji(kasa, await operacjeKasy(id))
  })
}

const schematDanychPuli = z.object({
  nazwa: z.string().trim().min(1, 'Wpisz nazwę Puli.'), opis: z.string().trim(),
  waluta: z.string().default('PLN'), rodzaj: z.enum(['finansowa', 'zakupowa']).optional(), celGrosze: z.number().int().safe().positive('Cel musi być dodatni.').optional(),
}).strict()
export type DanePuliFinansowej = z.input<typeof schematDanychPuli>
export type DaneOperacjiPuli = Pick<DaneOperacjiKasy, 'typ' | 'kwotaGrosze' | 'dataOperacji' | 'opis' | 'kategoria' | 'zrodlo'>

function wymagajPuliFinansowej(kasa: WspolnaKasa | undefined): WspolnaKasa {
  const pula = wymagajRekordu(kasa)
  if (pula.pula?.wersja !== 1) throw new Error('Nie znaleziono Puli.')
  return pula
}

async function zapiszZmianePuli(tabela: 'wspolneKasy' | 'operacjeKas', id: string, dane: Record<string, unknown>, operacja: PolecenieGrupyFinansowej['zapisy'][number]['operacja'], polecenie: PolecenieZapisuFinansowego, rodzic?: WspolnaKasa) {
  await wTransakcjiFinansowej('edycja', async () => {
    await zapiszGrupeFinansowa({
      idZapisu: polecenie.idZapisu, idOperacjiZrodlowej: polecenie.idZapisu,
      oczekiwaneRewizje: [{ tabela, id, rewizja: polecenie.oczekiwanaRewizja }, ...(rodzic ? [{ tabela: 'wspolneKasy' as const, id: rodzic.id, rewizja: rodzic.rewizja ?? 0 }] : [])],
      zapisy: [{ tabela, id, operacja, dane }],
    })
    const obraz = await obrazPul()
    const pula = wymagajPuliFinansowej(obraz.wspolneKasy.find((kasa) => kasa.id === (rodzic?.id ?? id)))
    const wynik = podsumujPule(pula, obraz, '')
    if (!wynik.podsumowanie) throw new Error(wynik.ograniczenie || 'Nie można wiarygodnie obliczyć wyniku Puli.')
  })
}

export async function utworzPuleFinansowa(id: string, dane: DanePuliFinansowej, polecenie: PolecenieZapisuFinansowego): Promise<void> {
  const poprawne = schematDanychPuli.parse(dane)
  await zapiszZmianePuli('wspolneKasy', id, {
    nazwa: poprawne.nazwa, opis: poprawne.opis, waluta: poprawne.waluta, ikona: '', kolor: '', status: 'aktywna', saldoPoczatkoweGrosze: 0,
    pula: { wersja: 1, rodzaj: poprawne.rodzaj ?? 'finansowa', ...(poprawne.celGrosze === undefined ? {} : { celGrosze: poprawne.celGrosze }) },
  }, 'utworzenie', polecenie)
}

export async function edytujPuleFinansowa(id: string, dane: DanePuliFinansowej, polecenie: PolecenieZapisuFinansowego): Promise<void> {
  const poprawne = schematDanychPuli.parse(dane)
  await wTransakcjiFinansowej('edycja', async () => {
    const pula = wymagajPuliFinansowej(await baza.tabela('wspolneKasy').get(id))
    const poprzedniaProba = pula.historiaWersji?.find((wersja) => wersja.idZapisu === polecenie.idZapisu)
    if (!poprzedniaProba) wymagajAktywnejKasy(pula)
    const rodzajPrzed = (poprzedniaProba?.przed?.pula as WspolnaKasa['pula'])?.rodzaj ?? pula.pula!.rodzaj
    await zapiszZmianePuli('wspolneKasy', id, {
      ...(poprzedniaProba?.przed ?? stanFinansowy(pula)), nazwa: poprawne.nazwa, opis: poprawne.opis, waluta: poprawne.waluta,
      pula: { wersja: 1, rodzaj: poprawne.rodzaj ?? rodzajPrzed, ...(poprawne.celGrosze === undefined ? {} : { celGrosze: poprawne.celGrosze }) },
    }, 'aktualizacja', polecenie)
  })
}

export async function zmienArchiwizacjePuli(id: string, archiwum: boolean, polecenie: PolecenieZapisuFinansowego): Promise<void> {
  await wTransakcjiFinansowej('edycja', async () => {
    const pula = wymagajPuliFinansowej(await baza.tabela('wspolneKasy').get(id))
    const poprzedniaProba = pula.historiaWersji?.find((wersja) => wersja.idZapisu === polecenie.idZapisu)
    await zapiszZmianePuli('wspolneKasy', id, { ...(poprzedniaProba?.przed ?? stanFinansowy(pula)), status: archiwum ? 'zarchiwizowana' : 'aktywna' }, archiwum ? 'aktualizacja' : 'przywrocenie', polecenie)
  })
}

export async function zapiszOperacjePuli(pulaId: string, id: string, dane: DaneOperacjiPuli | undefined, rodzaj: PolecenieGrupyFinansowej['zapisy'][number]['operacja'], polecenie: PolecenieZapisuFinansowego, rewizjaPuli: number): Promise<void> {
  await wTransakcjiFinansowej('edycja', async () => {
    const pula = wymagajPuliFinansowej(await baza.tabela('wspolneKasy').get(pulaId))
    const przed = await baza.tabela('operacjeKas').get(id)
    const poprzedniaProba = przed?.historiaWersji?.find((wersja) => wersja.idZapisu === polecenie.idZapisu)
    if (!poprzedniaProba) wymagajAktywnejKasy(pula)
    if (rodzaj !== 'utworzenie' && (!przed || przed.kasaId !== pulaId)) throw new Error('Nie znaleziono operacji tej Puli.')
    if (przed && (przed.kasaId !== pulaId || !przed.powiazaniePuli || !['wplata', 'koszt'].includes(przed.powiazaniePuli.rodzaj))) throw new Error('Ta operacja wymaga korekty w swoim module źródłowym.')
    if (rodzaj === 'aktualizacja' && przed?.usunietoAt && !poprzedniaProba) throw new Error('Najpierw przywróć operację.')
    const stanPrzed = przed ? daneBiznesowe('operacjeKas', { ...przed, ...poprzedniaProba?.przed }) : undefined
    const tresc = dane ?? (stanPrzed as DaneOperacjiKasy | undefined)
    if (!tresc || !['wplyw', 'wydatek'].includes(tresc.typ)) throw new Error('Wybierz wpłatę albo wydatek.')
    if (przed && tresc.typ !== przed.typ) throw new Error('Nie można zmienić kierunku zapisanej operacji.')
    const poprawne = schematDanychOperacji.parse({
      ...stanPrzed, ...tresc, kasaId: pulaId, waluta: pula.waluta,
      powiazaniePuli: przed?.powiazaniePuli ?? { wersja: 1, idOperacjiZrodlowej: polecenie.idZapisu, rolaZapisu: 'gotowka', rodzaj: tresc.typ === 'wplyw' ? 'wplata' : 'koszt' },
    })
    if (poprawne.typ === 'wydatek' && !poprawne.opis.trim()) throw new Error('Wpisz nazwę lub opis wydatku.')
    const zapis: Record<string, unknown> = { ...poprawne }
    if (rodzaj === 'usuniecie') zapis.usunietoAt = poprzedniaProba?.po.usunietoAt ?? przed?.usunietoAt ?? new Date().toISOString()
    if (rodzaj === 'przywrocenie') delete zapis.usunietoAt
    await zapiszZmianePuli('operacjeKas', id, zapis, rodzaj, polecenie, { ...pula, rewizja: rewizjaPuli })
  })
}

export async function obrazPul(): Promise<ObrazFz> {
  return wTransakcjiFinansowej('odczyt', async () => Object.fromEntries(await Promise.all(TABELE_OBRAZU_FZ.map(async (tabela) => [tabela, await baza.tabela(tabela).toArray()]))) as unknown as ObrazFz)
}

function podsumujPule(pula: WspolnaKasa, obraz: ObrazFz, ograniczenie: string) {
  const operacje = obraz.operacjeKas.filter((operacja) => operacja.kasaId === pula.id).sort((pierwsza, druga) => druga.dataOperacji.localeCompare(pierwsza.dataOperacji) || druga.updatedAt.localeCompare(pierwsza.updatedAt) || pierwsza.id.localeCompare(druga.id))
  const projekcja = obliczProjekcjePuli(obraz, pula.id, '9999-12-31')
  let podsumowanie: { saldoGrosze: number; wplatyGrosze: number; wydatkiGrosze: number; postep?: number } | undefined
  try {
    if (!ograniczenie && projekcja.kompletne) {
      const aktywne = operacje.filter((operacja) => !operacja.usunietoAt)
      const wplatyGrosze = sumaGroszy(aktywne.filter((operacja) => operacja.powiazaniePuli?.rodzaj === 'wplata').map((operacja) => operacja.kwotaGrosze))
      podsumowanie = { saldoGrosze: projekcja.wynik.bilansGotowkowyGrosze, wplatyGrosze, wydatkiGrosze: sumaGroszy(aktywne.filter((operacja) => operacja.typ === 'wydatek').map((operacja) => operacja.kwotaGrosze)), ...(pula.pula?.celGrosze ? { postep: Number(BigInt(wplatyGrosze) * 10000n / BigInt(pula.pula.celGrosze)) / 100 } : {}) }
    }
  } catch (blad) { ograniczenie = (blad as Error).message }
  const zakupy = obraz.zakupyPul.filter((zakup) => zakup.pulaId === pula.id)
  const sprzedaze = obraz.sprzedazePul.filter((sprzedaz) => sprzedaz.pulaId === pula.id)
  return { pula, operacje, podsumowanie, maFakty: operacje.length > 0 || zakupy.length > 0 || sprzedaze.length > 0, ograniczenie: ograniczenie || (!projekcja.kompletne ? projekcja.przyczyna : ''), ostatniaOperacja: operacje.find((operacja) => !operacja.usunietoAt)?.dataOperacji, ostatniaAktywnosc: [pula.updatedAt, ...operacje.map((operacja) => operacja.updatedAt), ...zakupy.map((zakup) => zakup.updatedAt), ...sprzedaze.map((sprzedaz) => sprzedaz.updatedAt)].sort().at(-1)! }
}

export async function listaPodsumowanPul() {
  return wTransakcjiFinansowej('odczyt', async () => {
    let ograniczenie = ''
    try { await sprawdzKompletnoscFinansow() } catch (blad) { ograniczenie = (blad as Error).message }
    const obraz = await obrazPul()
    return obraz.wspolneKasy.filter((kasa) => !kasa.usunietoAt && kasa.pula?.wersja === 1).map((pula) => podsumujPule(pula, obraz, ograniczenie)).sort((pierwsza, druga) => druga.ostatniaAktywnosc.localeCompare(pierwsza.ostatniaAktywnosc) || pierwsza.pula.id.localeCompare(druga.pula.id))
  })
}

export async function pobierzWidokPuli(id: string) {
  return wTransakcjiFinansowej('odczyt', async () => {
    const pula = wymagajPuliFinansowej(await baza.tabela('wspolneKasy').get(id))
    let ograniczenie = ''
    try { await sprawdzKompletnoscFinansow() } catch (blad) { ograniczenie = (blad as Error).message }
    return podsumujPule(pula, await obrazPul(), ograniczenie)
  })
}
