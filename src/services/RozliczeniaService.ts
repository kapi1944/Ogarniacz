import { z } from 'zod'
import { baza } from '../data/BazaOgarniacza'
import type { Rozliczenie, WydatekGrupowy, ZwrotRozliczenia } from '../domain/modeleFinansowWspolnych'
import { obliczWydatekWspolny } from './ObliczeniaFinansowWspolnych'
import { sprawdzKompletnoscFinansow } from './SyncEngine'
import { daneBiznesowe, wymagajRekordu, wTransakcjiFinansowej, zapiszRekordFinansowy, powiadomOZapisieFinansowym, schematDanychRozliczenia, schematDanychWydatku, schematDanychZwrotu, type PolecenieZapisuFinansowego } from './ZapisFinansowWspolnych'

export type DaneRozliczenia = z.infer<typeof schematDanychRozliczenia>
const schematNowegoWydatku = schematDanychWydatku.omit({ metodaPodzialu: true, podzialKosztu: true })
export type DaneWydatkuGrupowego = z.infer<typeof schematNowegoWydatku>
export type DaneZwrotuRozliczenia = z.infer<typeof schematDanychZwrotu>
const schematUczestnika = z.object({ id: z.string().trim().min(1), nazwa: z.string().trim().min(1), nieaktywny: z.boolean().optional() }).strict()

export { walidujRozliczenie, walidujZapisanyWydatek, obliczBilansZRekordow } from '../../server/wspolne/WalidacjaFinansowa.ts'
import { walidujRozliczenie, obliczBilansZRekordow } from '../../server/wspolne/WalidacjaFinansowa.ts'

function wymagajAktywnegoRozliczenia(rozliczenie: Rozliczenie | undefined): Rozliczenie {
  const istniejace = wymagajRekordu(rozliczenie)
  if (istniejace.zarchiwizowanoAt) throw new Error('Rozliczenie jest zarchiwizowane.')
  return istniejace
}

async function rekordyRozliczenia(id: string) {
  return { wydatki: await baza.tabela('wydatkiGrupowe').where('rozliczenieId').equals(id).toArray(), zwroty: await baza.tabela('zwrotyRozliczen').where('rozliczenieId').equals(id).toArray() }
}

export async function utworzRozliczenie(id: string, dane: DaneRozliczenia, polecenie: PolecenieZapisuFinansowego): Promise<Rozliczenie> {
  const poprawne = schematDanychRozliczenia.parse(dane)
  const wynik = await wTransakcjiFinansowej('edycja', () => zapiszRekordFinansowy('rozliczenia', id, polecenie, 'utworzenie', poprawne, async () => {
    walidujRozliczenie(poprawne)
    if (poprawne.zarchiwizowanoAt) throw new Error('Nowe rozliczenie musi być aktywne.')
    return { ...poprawne, id, createdAt: '', updatedAt: '' }
  }))
  powiadomOZapisieFinansowym('rozliczenia')
  return wynik
}

async function zmienUczestnika(id: string, polecenie: PolecenieZapisuFinansowego, tresc: unknown, zmien: (rozliczenie: Rozliczenie) => Rozliczenie): Promise<Rozliczenie> {
  const wynik = await wTransakcjiFinansowej('edycja', () => zapiszRekordFinansowy('rozliczenia', id, polecenie, 'aktualizacja', tresc, async (przed) => {
    const po = zmien(wymagajAktywnegoRozliczenia(przed))
    walidujRozliczenie(po)
    return po
  }))
  powiadomOZapisieFinansowym('rozliczenia')
  return wynik
}

export function dodajUczestnika(id: string, uczestnik: z.infer<typeof schematUczestnika>, polecenie: PolecenieZapisuFinansowego): Promise<Rozliczenie> {
  const poprawny = schematUczestnika.parse(uczestnik)
  return zmienUczestnika(id, polecenie, { dodaj: poprawny }, (rozliczenie) => ({ ...rozliczenie, uczestnicy: [...rozliczenie.uczestnicy, poprawny] }))
}
export function edytujNazweUczestnika(id: string, uczestnikId: string, nazwa: string, polecenie: PolecenieZapisuFinansowego): Promise<Rozliczenie> {
  z.string().trim().min(1).parse(nazwa)
  return zmienUczestnika(id, polecenie, { uczestnikId, nazwa }, (rozliczenie) => {
    if (!rozliczenie.uczestnicy.some(({ id }) => id === uczestnikId)) throw new Error('Uczestnik nie istnieje.')
    return { ...rozliczenie, uczestnicy: rozliczenie.uczestnicy.map((uczestnik) => uczestnik.id === uczestnikId ? { ...uczestnik, nazwa } : uczestnik) }
  })
}
export function wylaczUczestnika(id: string, uczestnikId: string, polecenie: PolecenieZapisuFinansowego): Promise<Rozliczenie> {
  return zmienUczestnika(id, polecenie, { uczestnikId, nieaktywny: true }, (rozliczenie) => {
    if (!rozliczenie.uczestnicy.some(({ id }) => id === uczestnikId)) throw new Error('Uczestnik nie istnieje.')
    return { ...rozliczenie, uczestnicy: rozliczenie.uczestnicy.map((uczestnik) => uczestnik.id === uczestnikId ? { ...uczestnik, nieaktywny: true } : uczestnik) }
  })
}

async function zapiszWydatek(id: string, dane: DaneWydatkuGrupowego | undefined, polecenie: PolecenieZapisuFinansowego, rodzaj: 'utworzenie' | 'aktualizacja' | 'usuniecie' | 'przywrocenie'): Promise<WydatekGrupowy> {
  const poprawne = dane ? schematNowegoWydatku.parse(dane) : undefined
  const wynik = await wTransakcjiFinansowej('edycja', () => zapiszRekordFinansowy('wydatkiGrupowe', id, polecenie, rodzaj, poprawne ?? null, async (przed) => {
    if (rodzaj === 'aktualizacja') wymagajRekordu(przed)
    const daneWydatku = poprawne ?? daneBiznesowe('wydatkiGrupowe', przed!) as z.infer<typeof schematDanychWydatku>
    if (przed && daneWydatku.rozliczenieId !== przed.rozliczenieId) throw new Error('Nie można przenieść wydatku do innego rozliczenia.')
    const rozliczenie = wymagajAktywnegoRozliczenia(await baza.tabela('rozliczenia').get(daneWydatku.rozliczenieId))
    const obliczony = obliczWydatekWspolny(rozliczenie.uczestnicy.map(({ id }) => id), { ...daneWydatku, id, podzial: daneWydatku.parametryPodzialu })
    const poprzednieOsoby = new Set([...(przed?.finansujacy ?? []), ...(przed?.podzialKosztu ?? [])].map(({ uczestnikId }) => uczestnikId))
    if (rodzaj !== 'usuniecie' && [...obliczony.finansujacy, ...obliczony.podzialKosztu].some(({ uczestnikId }) => rozliczenie.uczestnicy.some((uczestnik) => uczestnik.id === uczestnikId && uczestnik.nieaktywny) && !poprzednieOsoby.has(uczestnikId))) throw new Error('Nieaktywny uczestnik nie może brać udziału w nowych wydatkach.')
    const po: WydatekGrupowy = { ...przed, ...daneWydatku, ...obliczony, metodaPodzialu: daneWydatku.parametryPodzialu.metoda, id, createdAt: przed?.createdAt ?? '', updatedAt: '' }
    if (rodzaj === 'usuniecie') po.usunietoAt = przed?.usunietoAt ?? new Date().toISOString()
    if (rodzaj === 'przywrocenie') delete po.usunietoAt
    const rekordy = await rekordyRozliczenia(rozliczenie.id)
    obliczBilansZRekordow(rozliczenie, [...rekordy.wydatki.filter((wydatek) => wydatek.id !== id), po], rekordy.zwroty)
    return po
  }))
  powiadomOZapisieFinansowym('wydatkiGrupowe')
  return wynik
}
export const dodajWydatekGrupowy = (id: string, dane: DaneWydatkuGrupowego, polecenie: PolecenieZapisuFinansowego) => zapiszWydatek(id, dane, polecenie, 'utworzenie')
export const edytujWydatekGrupowy = (id: string, dane: DaneWydatkuGrupowego, polecenie: PolecenieZapisuFinansowego) => zapiszWydatek(id, dane, polecenie, 'aktualizacja')
export const usunWydatekGrupowy = (id: string, polecenie: PolecenieZapisuFinansowego) => zapiszWydatek(id, undefined, polecenie, 'usuniecie')
export const przywrocWydatekGrupowy = (id: string, polecenie: PolecenieZapisuFinansowego) => zapiszWydatek(id, undefined, polecenie, 'przywrocenie')

async function zapiszZwrot(id: string, dane: DaneZwrotuRozliczenia | undefined, polecenie: PolecenieZapisuFinansowego, rodzaj: 'utworzenie' | 'aktualizacja' | 'usuniecie' | 'przywrocenie'): Promise<ZwrotRozliczenia> {
  const poprawne = dane ? schematDanychZwrotu.parse(dane) : undefined
  const wynik = await wTransakcjiFinansowej('edycja', () => zapiszRekordFinansowy('zwrotyRozliczen', id, polecenie, rodzaj, poprawne ?? null, async (przed) => {
    if (rodzaj === 'aktualizacja') wymagajRekordu(przed)
    const daneZwrotu = poprawne ?? daneBiznesowe('zwrotyRozliczen', przed!) as DaneZwrotuRozliczenia
    if (przed && daneZwrotu.rozliczenieId !== przed.rozliczenieId) throw new Error('Nie można przenieść zwrotu do innego rozliczenia.')
    const rozliczenie = wymagajAktywnegoRozliczenia(await baza.tabela('rozliczenia').get(daneZwrotu.rozliczenieId))
    const po: ZwrotRozliczenia = { ...przed, ...daneZwrotu, id, createdAt: przed?.createdAt ?? '', updatedAt: '' }
    if (rodzaj === 'usuniecie') po.usunietoAt = przed?.usunietoAt ?? new Date().toISOString()
    if (rodzaj === 'przywrocenie') delete po.usunietoAt
    const rekordy = await rekordyRozliczenia(rozliczenie.id)
    obliczBilansZRekordow(rozliczenie, rekordy.wydatki, [...rekordy.zwroty.filter((zwrot) => zwrot.id !== id), po])
    return po
  }))
  powiadomOZapisieFinansowym('zwrotyRozliczen')
  return wynik
}
export const dodajZwrot = (id: string, dane: DaneZwrotuRozliczenia, polecenie: PolecenieZapisuFinansowego) => zapiszZwrot(id, dane, polecenie, 'utworzenie')
export const edytujZwrot = (id: string, dane: DaneZwrotuRozliczenia, polecenie: PolecenieZapisuFinansowego) => zapiszZwrot(id, dane, polecenie, 'aktualizacja')
export const usunZwrot = (id: string, polecenie: PolecenieZapisuFinansowego) => zapiszZwrot(id, undefined, polecenie, 'usuniecie')
export const przywrocZwrot = (id: string, polecenie: PolecenieZapisuFinansowego) => zapiszZwrot(id, undefined, polecenie, 'przywrocenie')

export async function pobierzRozliczenie(id: string): Promise<Rozliczenie | undefined> {
  return wTransakcjiFinansowej('odczyt', () => baza.tabela('rozliczenia').get(id))
}
export async function listaRozliczen(): Promise<Rozliczenie[]> {
  return wTransakcjiFinansowej('odczyt', () => baza.tabela('rozliczenia').toArray())
}
export async function pobierzOperacjeRozliczenia(id: string, zUsunietymi = false) {
  return wTransakcjiFinansowej('odczyt', async () => {
    wymagajRekordu(await baza.tabela('rozliczenia').get(id))
    const rekordy = await rekordyRozliczenia(id)
    return { wydatki: rekordy.wydatki.filter((wydatek) => zUsunietymi || !wydatek.usunietoAt), zwroty: rekordy.zwroty.filter((zwrot) => zUsunietymi || !zwrot.usunietoAt) }
  })
}
export async function pobierzBilansRozliczenia(id: string) {
  return wTransakcjiFinansowej('odczyt', async () => {
    await sprawdzKompletnoscFinansow()
    const rozliczenie = wymagajRekordu(await baza.tabela('rozliczenia').get(id))
    const rekordy = await rekordyRozliczenia(id)
    return obliczBilansZRekordow(rozliczenie, rekordy.wydatki, rekordy.zwroty)
  })
}

/** Spójny odczyt ekranu; brak kompletności nie ukrywa historii, ale blokuje bilans. */
export async function pobierzWidokRozliczenia(id: string) {
  return wTransakcjiFinansowej('odczyt', async () => {
    const rozliczenie = wymagajRekordu(await baza.tabela('rozliczenia').get(id))
    const rekordy = await rekordyRozliczenia(id)
    try {
      await sprawdzKompletnoscFinansow()
      return { rozliczenie, ...rekordy, bilans: obliczBilansZRekordow(rozliczenie, rekordy.wydatki, rekordy.zwroty), ograniczenie: '' }
    } catch (blad) {
      return { rozliczenie, ...rekordy, bilans: undefined, ograniczenie: (blad as Error).message }
    }
  })
}
