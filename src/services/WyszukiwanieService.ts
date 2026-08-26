import { pobierzRepozytorium } from '../data/Repozytorium'
import type { NazwaModulu, NazwaTabeli } from '../domain/typy'

export interface WynikWyszukiwania {
  id: string
  modul: NazwaModulu
  etykieta: string
  opis: string
  url: string
}

const zrodla: { tabela: NazwaTabeli; modul: NazwaModulu; url: string; pola: string[] }[] = [
  { tabela: 'zadania', modul: 'zadania', url: '/zadania', pola: ['tytul', 'opis', 'kontekst'] },
  { tabela: 'projekty', modul: 'projekty', url: '/projekty', pola: ['nazwa', 'opis', 'blokady'] },
  { tabela: 'notatki', modul: 'notatki', url: '/notatki', pola: ['tytul', 'tresc'] },
  { tabela: 'kontakty', modul: 'kontakty', url: '/kontakty', pola: ['nazwa', 'rola', 'telefon', 'email'] },
  { tabela: 'dokumenty', modul: 'dokumenty', url: '/dokumenty', pola: ['nazwa', 'nazwaPliku', 'typ'] },
  { tabela: 'wizyty', modul: 'wizyty', url: '/wizyty', pola: ['nazwa', 'miejsce', 'lekarzPlacowka', 'notatka'] },
  { tabela: 'pomysly', modul: 'pomysly', url: '/pomysly', pola: ['tytul', 'opis'] },
]

export async function szukajGlobalnie(fraza: string): Promise<WynikWyszukiwania[]> {
  const szukana = fraza.trim().toLocaleLowerCase('pl')
  if (szukana.length < 2) return []
  const wyniki: WynikWyszukiwania[] = []
  for (const zrodlo of zrodla) {
    const rekordy = await pobierzRepozytorium(zrodlo.tabela).lista()
    for (const rekord of rekordy) {
      const dane = rekord as unknown as Record<string, unknown>
      const tekst = zrodlo.pola.map((pole) => String(dane[pole] ?? '')).join(' ').toLocaleLowerCase('pl')
      if (!tekst.includes(szukana)) continue
      const etykieta = String(dane.tytul ?? dane.nazwa ?? dane.nazwaPliku ?? 'Element')
      wyniki.push({ id: rekord.id, modul: zrodlo.modul, etykieta, opis: zrodlo.modul.replace('_', ' '), url: `${zrodlo.url}?element=${rekord.id}` })
    }
  }
  return wyniki.slice(0, 30)
}
