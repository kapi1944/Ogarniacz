import { pobierzRepozytorium } from '../data/Repozytorium'
import type { NazwaModulu, NazwaTabeli } from '../domain/typy'

export interface WynikWyszukiwania {
  id: string
  modul: NazwaModulu
  etykieta: string
  typ: string
  opis: string
  url: string
}

interface ZrodloWyszukiwania { tabela: NazwaTabeli; modul: NazwaModulu; typ: string; url: string; pola: string[]; kontekst: string[] }

const zrodla: ZrodloWyszukiwania[] = [
  { tabela: 'zadania', modul: 'zadania', typ: 'Zadanie', url: '/zadania', pola: ['tytul', 'opis', 'kontekst', 'tagi'], kontekst: ['status', 'termin', 'kontekst'] },
  { tabela: 'projekty', modul: 'projekty', typ: 'Projekt', url: '/projekty', pola: ['nazwa', 'opis', 'blokady', 'nastepneDzialanie'], kontekst: ['status', 'termin', 'nastepneDzialanie'] },
  { tabela: 'notatki', modul: 'notatki', typ: 'Notatka', url: '/notatki', pola: ['tytul', 'tresc', 'tagi'], kontekst: ['data', 'tagi'] },
  { tabela: 'kontakty', modul: 'kontakty', typ: 'Kontakt', url: '/kontakty', pola: ['nazwa', 'rola', 'telefon', 'email'], kontekst: ['rola', 'email', 'telefon'] },
  { tabela: 'dokumenty', modul: 'dokumenty', typ: 'Dokument', url: '/dokumenty', pola: ['nazwa', 'nazwaPliku', 'typ'], kontekst: ['typ', 'nazwaPliku', 'terminWaznosci'] },
  { tabela: 'wizyty', modul: 'wizyty', typ: 'Wizyta', url: '/zdrowie/wizyty', pola: ['nazwa', 'miejsce', 'lekarzPlacowka', 'notatka'], kontekst: ['data', 'godzina', 'lekarzPlacowka', 'miejsce'] },
  { tabela: 'leki', modul: 'leki', typ: 'Lek', url: '/zdrowie/leki', pola: ['nazwa', 'dawkaInstrukcja', 'notatka'], kontekst: ['dawkaInstrukcja', 'godziny'] },
  { tabela: 'skierowania', modul: 'skierowania', typ: 'Skierowanie', url: '/zdrowie/skierowania', pola: ['nazwa', 'cel', 'notatka'], kontekst: ['status', 'cel', 'terminWaznosci'] },
  { tabela: 'rachunki', modul: 'rachunki', typ: 'Rachunek', url: '/rachunki', pola: ['nazwa', 'kategoria', 'opis'], kontekst: ['status', 'termin', 'kategoria'] },
  { tabela: 'wydatki', modul: 'finanse', typ: 'Wydatek', url: '/finanse', pola: ['opis', 'kategoria'], kontekst: ['data', 'kwota', 'kategoria'] },
  { tabela: 'pojazdy', modul: 'samochod', typ: 'Pojazd', url: '/samochod', pola: ['nazwa', 'marka', 'model', 'numerRejestracyjny', 'vin'], kontekst: ['marka', 'model', 'numerRejestracyjny'] },
  { tabela: 'pomysly', modul: 'pomysly', typ: 'Pomysł', url: '/pomysly', pola: ['tytul', 'opis', 'tagi', 'wartosc', 'wysilek'], kontekst: ['status', 'tagi'] },
  { tabela: 'skrzynka', modul: 'skrzynka', typ: 'Inbox', url: '/skrzynka', pola: ['tresc', 'sugerowanyTyp'], kontekst: ['status', 'sugerowanyTyp'] },
  { tabela: 'naPozniej', modul: 'na_pozniej', typ: 'Na później', url: '/na-pozniej', pola: ['tytul', 'opis', 'adres', 'tagi'], kontekst: ['typ', 'status', 'adres'] },
  { tabela: 'listyZakupow', modul: 'zakupy', typ: 'Lista zakupów', url: '/zakupy', pola: ['nazwa', 'sklep', 'tagi'], kontekst: ['sklep', 'planowanaData'] },
  { tabela: 'cele', modul: 'cele', typ: 'Cel', url: '/cele', pola: ['nazwa', 'opis'], kontekst: ['status', 'horyzont'] },
  { tabela: 'przypomnienia', modul: 'przypomnienia', typ: 'Przypomnienie', url: '/przypomnienia', pola: ['tytul'], kontekst: ['stan', 'czas', 'priorytet'] },
  { tabela: 'miejsca', modul: 'miasto', typ: 'Miejsce', url: '/miasto', pola: ['nazwa', 'adres', 'typ', 'notatka'], kontekst: ['typ', 'adres'] },
  { tabela: 'kontaFinansowe', modul: 'finanse', typ: 'Konto', url: '/finanse', pola: ['nazwa', 'typ'], kontekst: ['typ', 'aktywne'] },
]

function normalizuj(tekst: string): string {
  return tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
}

function pasuje(tekst: string, fraza: string): boolean {
  const znormalizowany = normalizuj(tekst)
  return normalizuj(fraza).split(/\s+/).filter(Boolean).every((slowo) => znormalizowany.includes(slowo))
}

const etykietyKontekstu: Record<string, string> = {
  status: 'Status', termin: 'Termin', data: 'Data', godzina: 'Godzina', czas: 'Termin', priorytet: 'Priorytet',
  kontekst: 'Kontekst', nastepneDzialanie: 'Następne', rola: 'Rola', email: 'E-mail', telefon: 'Telefon', typ: 'Rodzaj',
  nazwaPliku: 'Plik', terminWaznosci: 'Ważne do', lekarzPlacowka: 'Lekarz / placówka', miejsce: 'Miejsce',
  dawkaInstrukcja: 'Dawkowanie', godziny: 'Godziny', stan: 'Stan', cel: 'Cel', kategoria: 'Kategoria', kwota: 'Kwota',
  marka: 'Marka', model: 'Model', numerRejestracyjny: 'Rejestracja', tagi: 'Tagi', sugerowanyTyp: 'Sugerowany typ',
  adres: 'Adres', sklep: 'Sklep', planowanaData: 'Planowana data', horyzont: 'Horyzont', aktywne: 'Stan',
}

function wartoscKontekstu(pole: string, wartosc: unknown): string | undefined {
  const etykieta = etykietyKontekstu[pole]
  if (Array.isArray(wartosc)) return wartosc.length > 0 ? `${etykieta}: ${wartosc.join(', ')}` : undefined
  if (typeof wartosc === 'boolean') return `${etykieta}: ${wartosc ? 'aktywne' : 'nieaktywne'}`
  if (typeof wartosc === 'number') return `${etykieta}: ${wartosc}${pole === 'kwota' ? ' zł' : ''}`
  if (typeof wartosc !== 'string' || !wartosc.trim()) return undefined
  return `${etykieta}: ${wartosc.replaceAll('_', ' ')}`
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
    const projektId = typeof dane.projektId === 'string' ? dane.projektId : powiazania.find((x) => x.typ === 'projekty')?.id
    const samochodId = powiazania.find((x) => x.typ === 'samochod')?.id
    const powiazanyKontekst = projektId && nazwaProjektu.get(projektId)
      ? `Projekt: ${nazwaProjektu.get(projektId)}`
      : samochodId && nazwaPojazdu.get(samochodId) ? `Samochód: ${nazwaPojazdu.get(samochodId)}` : undefined
    const szczegoly = zrodlo.kontekst.map((pole) => wartoscKontekstu(pole, dane[pole])).filter((wartosc): wartosc is string => Boolean(wartosc)).slice(0, 2)
    const opis = [powiazanyKontekst, ...szczegoly].filter(Boolean).join(' · ') || 'Bez dodatkowych szczegółów'
    return [{ id: rekord.id, modul: zrodlo.modul, etykieta, typ: zrodlo.typ, opis, url: `${zrodlo.url}?element=${encodeURIComponent(rekord.id)}` }]
  })))).flat().sort((a, b) => a.etykieta.localeCompare(b.etykieta, 'pl') || a.id.localeCompare(b.id))
  return wyniki.slice(0, 30)
}
