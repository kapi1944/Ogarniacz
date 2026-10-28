import type { z } from 'zod'
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
    return obliczSaldoZOperacji(wymagajRekordu(await baza.tabela('wspolneKasy').get(id)), await operacjeKasy(id))
  })
}
