import { pobierzRepozytorium } from '../data/Repozytorium'
import { terazIso, utworzMetadane } from '../domain/fabryki'
import type { ElementSkrzynki, ListaZakupow, NaPozniej, NazwaModulu, Notatka, PozycjaZakupow, Pomysl, Projekt, Przypomnienie, Wizyta } from '../domain/typy'
import { utworzZadanie } from './ZadaniaService'

export interface PropozycjaPoczekalni {
  tresc: string
  typ: NazwaModulu
}

function sugerujTyp(tresc: string): NazwaModulu {
  const mala = tresc.toLocaleLowerCase('pl-PL')
  if (/(kupi[cć]|zakup|mleko|apteka)/.test(mala)) return 'zakupy'
  if (/(dentyst|lekarz|wizyta|um[oó]wi[cć])/.test(mala)) return 'wizyty'
  if (/(przeczyta[cć]|obejrze[cć]|sprawdzi[cć]|p[oó][zź]niej)/.test(mala)) return 'na_pozniej'
  if (/(pomys[lł]|koncepcj)/.test(mala)) return 'pomysly'
  return 'zadania'
}

export type TypKonwersjiInbox = 'zadanie' | 'notatka' | 'przypomnienie' | 'zakup' | 'projekt' | 'pomysl' | 'na_pozniej' | 'wizyta'

export function czyElementInboxDoKlasyfikacji(element: Pick<ElementSkrzynki, 'status'>): boolean {
  return element.status === 'do_sklasyfikowania' || element.status === 'nowe'
}

export function sugerujPewnyTypInbox(tresc: string): NazwaModulu | undefined {
  return /^\s*(?:kup|kupić|dokup|weź z zakupów)\b/i.test(tresc) ? 'zakupy' : undefined
}

export async function zapiszDoInbox(tresc: string, zrodlo: ElementSkrzynki['zrodlo'] = 'tekst'): Promise<ElementSkrzynki> {
  const element: ElementSkrzynki = {
    ...utworzMetadane(), tresc: tresc.trim(), zrodlo, status: 'do_sklasyfikowania', sugerowanyTyp: sugerujPewnyTypInbox(tresc),
  }
  await pobierzRepozytorium('skrzynka').zapisz(element)
  return element
}

export async function przeksztalcElementInbox(element: ElementSkrzynki, typ: TypKonwersjiInbox, oznaczZrodlo = true): Promise<{ typ: NazwaModulu; id: string }> {
  let wynik: { typ: NazwaModulu; id: string }
  if (typ === 'zadanie') {
    const cel = utworzZadanie({ tytul: element.tresc, opis: '', priorytet: 'normalny' })
    await pobierzRepozytorium('zadania').zapisz(cel)
    wynik = { typ: 'zadania', id: cel.id }
  } else if (typ === 'notatka') {
    const cel: Notatka = { ...utworzMetadane(), tytul: element.tresc.slice(0, 70), tresc: element.tresc, tagi: [], powiazania: [] }
    await pobierzRepozytorium('notatki').zapisz(cel)
    wynik = { typ: 'notatki', id: cel.id }
  } else if (typ === 'przypomnienie') {
    const cel: Przypomnienie = { ...utworzMetadane(), tytul: element.tresc, typ: 'absolutne', priorytet: 'normalny', stan: 'nowe', eskalacja: false }
    await pobierzRepozytorium('przypomnienia').zapisz(cel)
    wynik = { typ: 'przypomnienia', id: cel.id }
  } else if (typ === 'projekt') {
    const cel: Projekt = { ...utworzMetadane(), nazwa: element.tresc, opis: '', status: 'aktywne', blokady: '' }
    await pobierzRepozytorium('projekty').zapisz(cel)
    wynik = { typ: 'projekty', id: cel.id }
  } else if (typ === 'pomysl') {
    const cel: Pomysl = { ...utworzMetadane(), tytul: element.tresc, opis: '', status: 'nowy' }
    await pobierzRepozytorium('pomysly').zapisz(cel)
    wynik = { typ: 'pomysly', id: cel.id }
  } else if (typ === 'na_pozniej') {
    const cel: NaPozniej = { ...utworzMetadane(), tytul: element.tresc, typ: 'sprawdzic', status: 'oczekuje' }
    await pobierzRepozytorium('naPozniej').zapisz(cel)
    wynik = { typ: 'na_pozniej', id: cel.id }
  } else if (typ === 'wizyta') {
    const cel: Wizyta = { ...utworzMetadane(), nazwa: element.tresc, status: 'do_umowienia', notatka: '', pytania: [], dokumentyIds: [], checklista: [] }
    await pobierzRepozytorium('wizyty').zapisz(cel)
    wynik = { typ: 'wizyty', id: cel.id }
  } else {
    const repoList = pobierzRepozytorium('listyZakupow')
    let lista = (await repoList.lista()).find((elementListy) => elementListy.aktywna)
    if (!lista) {
      lista = { ...utworzMetadane(), nazwa: 'Szybka lista', aktywna: true } satisfies ListaZakupow
      await repoList.zapisz(lista)
    }
    const nazwa = element.tresc.replace(/^\s*(?:kup|kupić|dokup)\s+/i, '').trim() || element.tresc
    const cel: PozycjaZakupow = { ...utworzMetadane(), listaId: lista.id, nazwa, ilosc: '1', kupione: false }
    await pobierzRepozytorium('pozycjeZakupow').zapisz(cel)
    wynik = { typ: 'zakupy', id: cel.id }
  }
  if (oznaczZrodlo) await pobierzRepozytorium('skrzynka').zapisz({
      ...element, status: 'przetworzone', sugerowanyTyp: wynik.typ, przeksztalconoNa: wynik, updatedAt: terazIso(),
    })
  return wynik
}

export async function zapiszSzybkiZrzut(tresc: string, zrodlo: ElementSkrzynki['zrodlo'] = 'tekst'): Promise<{ element: ElementSkrzynki; wynik?: { typ: NazwaModulu; id: string } }> {
  const element = await zapiszDoInbox(tresc, zrodlo)
  const pewnyTyp = sugerujPewnyTypInbox(tresc)
  return pewnyTyp === 'zakupy' ? { element, wynik: await przeksztalcElementInbox(element, 'zakup') } : { element }
}

export function zaproponujPodzialPoczekalni(tresc: string): PropozycjaPoczekalni[] {
  const czesci = tresc.split(/(?:,|;|\s+i\s+)/i).map((element) => element.trim()).filter(Boolean)
  return (czesci.length > 1 ? czesci : [tresc.trim()])
    .filter(Boolean)
    .map((element) => ({ tresc: element, typ: sugerujTyp(element) }))
}
