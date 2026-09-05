import { pobierzRepozytorium } from '../data/Repozytorium'
import type { NazwaModulu, NazwaTabeli } from '../domain/typy'

export interface WynikWyszukiwania {
  id: string
  modul: NazwaModulu
  etykieta: string
  opis: string
  url: string
}

interface ZrodloWyszukiwania { tabela: NazwaTabeli; modul: NazwaModulu; etykieta: string; url: string; pola: string[] }

const zrodla: ZrodloWyszukiwania[] = [
  { tabela: 'zadania', modul: 'zadania', etykieta: 'Zadanie', url: '/zadania', pola: ['tytul', 'opis', 'kontekst', 'tagi'] },
  { tabela: 'projekty', modul: 'projekty', etykieta: 'Projekt', url: '/projekty', pola: ['nazwa', 'opis', 'blokady', 'nastepneDzialanie'] },
  { tabela: 'notatki', modul: 'notatki', etykieta: 'Notatka', url: '/notatki', pola: ['tytul', 'tresc', 'tagi'] },
  { tabela: 'kontakty', modul: 'kontakty', etykieta: 'Kontakt', url: '/kontakty', pola: ['nazwa', 'rola', 'telefon', 'email'] },
  { tabela: 'dokumenty', modul: 'dokumenty', etykieta: 'Dokument', url: '/dokumenty', pola: ['nazwa', 'nazwaPliku', 'typ'] },
  { tabela: 'wizyty', modul: 'wizyty', etykieta: 'Zdrowie', url: '/zdrowie/wizyty', pola: ['nazwa', 'miejsce', 'lekarzPlacowka', 'notatka'] },
  { tabela: 'leki', modul: 'leki', etykieta: 'Zdrowie', url: '/zdrowie/leki', pola: ['nazwa', 'dawkaInstrukcja', 'notatka'] },
  { tabela: 'skierowania', modul: 'skierowania', etykieta: 'Zdrowie', url: '/zdrowie/skierowania', pola: ['nazwa', 'cel', 'notatka'] },
  { tabela: 'rachunki', modul: 'rachunki', etykieta: 'Finanse', url: '/rachunki', pola: ['nazwa', 'kategoria', 'opis'] },
  { tabela: 'wydatki', modul: 'finanse', etykieta: 'Finanse', url: '/finanse', pola: ['opis', 'kategoria'] },
  { tabela: 'pojazdy', modul: 'samochod', etykieta: 'Samochód', url: '/samochod', pola: ['marka', 'model', 'rejestracja', 'vin'] },
  { tabela: 'pomysly', modul: 'pomysly', etykieta: 'Pomysł', url: '/pomysly', pola: ['tytul', 'opis', 'tagi', 'wartosc', 'wysilek'] },
  { tabela: 'skrzynka', modul: 'skrzynka', etykieta: 'Poczekalnia', url: '/skrzynka', pola: ['tresc', 'sugerowanyTyp'] },
  { tabela: 'naPozniej', modul: 'na_pozniej', etykieta: 'Na później', url: '/na-pozniej', pola: ['tytul', 'opis', 'adres', 'tagi'] },
  { tabela: 'listyZakupow', modul: 'zakupy', etykieta: 'Zakupy', url: '/zakupy', pola: ['nazwa', 'sklep', 'tagi'] },
  { tabela: 'cele', modul: 'cele', etykieta: 'Cel', url: '/cele', pola: ['nazwa', 'opis'] },
  { tabela: 'przypomnienia', modul: 'przypomnienia', etykieta: 'Przypomnienie', url: '/przypomnienia', pola: ['tytul', 'opis'] },
  { tabela: 'miejsca', modul: 'miasto', etykieta: 'Miejsce', url: '/miasto', pola: ['nazwa', 'adres', 'typ', 'notatka'] },
  { tabela: 'kontaFinansowe', modul: 'finanse', etykieta: 'Konto', url: '/finanse', pola: ['nazwa', 'typ'] },
]

function normalizuj(tekst: string): string {
  return tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
}

function pasuje(tekst: string, fraza: string): boolean {
  const znormalizowany = normalizuj(tekst)
  return normalizuj(fraza).split(/\s+/).filter(Boolean).every((slowo) => znormalizowany.includes(slowo))
}

export async function szukajGlobalnie(fraza: string): Promise<WynikWyszukiwania[]> {
  const szukana = fraza.trim()
  if (normalizuj(szukana).length < 2) return []
  const [projekty, pojazdy] = await Promise.all([pobierzRepozytorium('projekty').lista(), pobierzRepozytorium('pojazdy').lista()])
  const nazwaProjektu = new Map(projekty.map((x) => [x.id, x.nazwa]))
  const nazwaPojazdu = new Map(pojazdy.map((x) => [x.id, x.nazwa]))
  const wyniki = (await Promise.all(zrodla.map(async (zrodlo) => (await pobierzRepozytorium(zrodlo.tabela).lista()).flatMap((rekord) => {
    const dane = rekord as unknown as Record<string, unknown>
    const tekst = zrodlo.pola.map((pole) => Array.isArray(dane[pole]) ? dane[pole].join(' ') : String(dane[pole] ?? '')).join(' ')
    if (!pasuje(tekst, szukana)) return []
    const etykieta = String(dane.tytul ?? dane.nazwa ?? dane.opis ?? dane.nazwaPliku ?? 'Element')
    const powiazania = Array.isArray(dane.powiazania) ? dane.powiazania as { typ?: string; id?: string }[] : []
    const projektId = powiazania.find((x) => x.typ === 'projekt')?.id
    const samochodId = powiazania.find((x) => x.typ === 'samochod')?.id
    const kontekst = projektId && nazwaProjektu.get(projektId)
      ? `${nazwaProjektu.get(projektId)} > ${zrodlo.etykieta}`
      : samochodId && nazwaPojazdu.get(samochodId) ? `${nazwaPojazdu.get(samochodId)} > ${zrodlo.etykieta}` : zrodlo.etykieta
    return [{ id: rekord.id, modul: zrodlo.modul, etykieta, opis: kontekst, url: `${zrodlo.url}?element=${rekord.id}` }]
  })))).flat().sort((a, b) => a.etykieta.localeCompare(b.etykieta, 'pl') || a.id.localeCompare(b.id))
  return wyniki.slice(0, 30)
}
