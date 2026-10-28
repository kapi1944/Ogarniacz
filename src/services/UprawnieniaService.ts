import { czyKontoZgodneZDanymiLokalnymi, pobierzKontoOffline } from './KontaService'
import type { EncjaBazowa, NazwaModulu, NazwaTabeli, Uprawnienie } from '../domain/typy'
import { baza } from '../data/BazaOgarniacza'
import { pobierzAktywnyProfil } from '../data/ProfileLokalne'

export const TABELE_FINANSOW_WSPOLNYCH = ['wspolneKasy', 'operacjeKas', 'rozliczenia', 'wydatkiGrupowe', 'zwrotyRozliczen'] as const

export function czyDostepFinansowWspolnych(operacja: 'odczyt' | 'edycja'): boolean {
  if (!czyKontoZgodneZDanymiLokalnymi()) return false
  const profil = pobierzAktywnyProfil()
  const konto = pobierzKontoOffline()
  if (konto && (!profil || konto.rola !== 'wlasciciel' || konto.uzytkownikId !== konto.wlascicielId || konto.statusKonta && konto.statusKonta !== 'aktywne' || konto.wymaganaZmianaHasla)) return false
  if (profil ? baza.name !== profil.nazwaBazy : baza.name.startsWith('ogarniacz-profil-')) return false
  return czyBiezacyDostep('finanse', operacja) && czyBiezacyDostep('ustawienia', operacja)
}

export function sprawdzDostepFinansowWspolnych(operacja: 'odczyt' | 'edycja'): void {
  if (!czyDostepFinansowWspolnych(operacja)) throw new Error('Brak dostępu właściciela do wspólnych finansów aktywnego profilu.')
}

export function czyTabelaFinansowWspolnych(tabela: string): boolean {
  return (TABELE_FINANSOW_WSPOLNYCH as readonly string[]).includes(tabela)
}

export const PRYWATNE_SEKCJE_ZDROWIA = { samopoczucie: 'Dziennik psychiatryczny i samopoczucie', psychoterapia: 'Notatki i sesje psychoterapii', dokumentacja: 'Dokumentacja medyczna', badania: 'Wyniki badań', wazne_informacje: 'Ważne informacje zdrowotne', nagrania: 'Nagrania i transkrypcje (jeszcze niedostępne)' } as const

export function czyPasujeSekcja(modul: string, sekcjaGrantu?: string, sekcja?: string): boolean {
  if (modul === 'zdrowie' && sekcja && sekcja in PRYWATNE_SEKCJE_ZDROWIA) return sekcjaGrantu === sekcja
  return !sekcjaGrantu || sekcjaGrantu === sekcja
}

type SprawdzenieDostepu = (modul: NazwaModulu, operacja: 'odczyt' | 'edycja', sekcja?: string) => boolean
let biezacyDostep: SprawdzenieDostepu | undefined

/** Istniejąca sesja aplikacji; nie przechowuje treści ani nie tworzy kont. */
export function ustawBiezacyDostep(sprawdzenie?: SprawdzenieDostepu): void { biezacyDostep = sprawdzenie }
export function czyBiezacyDostep(modul: NazwaModulu, operacja: 'odczyt' | 'edycja', sekcja?: string): boolean {
  if (['zdrowie', 'leki', 'wizyty', 'skierowania', 'dokumenty', 'ustawienia'].includes(modul) && !czyKontoZgodneZDanymiLokalnymi()) return false
  const konto = pobierzKontoOffline()
  if (konto?.rola === 'edytor' && (modul === 'ustawienia' || modul === 'echo' || !konto.granty?.some((grant) => grant.status === 'aktywne' && grant.modul === modul && czyPasujeSekcja(modul, grant.sekcja, sekcja) && (operacja === 'odczyt' ? grant.odczyt : grant.edycja)))) return false
  return biezacyDostep?.(modul, operacja, sekcja) ?? (konto?.rola === 'wlasciciel')
}

export function sprawdzBiezacyDostep(modul: NazwaModulu, operacja: 'odczyt' | 'edycja', sekcja?: string): void {
  if (!czyBiezacyDostep(modul, operacja, sekcja)) throw new Error('Brak uprawnienia do danych zdrowotnych lub eksportu.')
}

export function zakresDanychZdrowotnych(tabela: NazwaTabeli, rekord?: EncjaBazowa): { modul: NazwaModulu; sekcja?: string } | undefined {
  if (tabela === 'dokumenty' && rekord && 'sekcjePrywatnosci' in rekord && Array.isArray(rekord.sekcjePrywatnosci) && rekord.sekcjePrywatnosci.length) return { modul: 'zdrowie', sekcja: 'dokumentacja' }
  if (tabela === 'wpisySamopoczucia') return { modul: 'zdrowie', sekcja: 'samopoczucie' }
  if (tabela === 'wpisyTerapii' || tabela === 'zadania' && rekord && 'sesjaTerapiiId' in rekord) return { modul: 'zdrowie', sekcja: 'psychoterapia' }
  if (tabela === 'wynikiBadan') return { modul: 'zdrowie', sekcja: 'badania' }
  if (tabela === 'wazneInformacjeZdrowotne') return { modul: 'zdrowie', sekcja: 'wazne_informacje' }
  if (tabela === 'dokumenty' && rekord && ('medyczne' in rekord && rekord.medyczne !== undefined || 'powiazania' in rekord && Array.isArray(rekord.powiazania) && rekord.powiazania.some((relacja) => ['zdrowie', 'wizyty', 'skierowania', 'leki'].includes(relacja.typ)))) return { modul: 'zdrowie', sekcja: 'dokumentacja' }
  if (tabela === 'leki' || tabela === 'dziennikLekow') return { modul: 'leki' }
  if (tabela === 'wizyty' || tabela === 'skierowania') return { modul: tabela }
  if (tabela === 'recepty' || tabela === 'terapie') return { modul: 'zdrowie' }
  if (tabela === 'przypomnienia' && rekord && 'zrodlo' in rekord) {
    const zrodlo = rekord.zrodlo as { typ?: string } | undefined
    if (zrodlo?.typ && ['zdrowie', 'leki', 'wizyty', 'skierowania'].includes(zrodlo.typ)) return { modul: zrodlo.typ as NazwaModulu }
  }
  return undefined
}

export function czyDozwolone(
  rola: 'wlasciciel' | 'edytor',
  uprawnienia: Uprawnienie[],
  modul: NazwaModulu,
  operacja: 'odczyt' | 'edycja',
  editorId?: string,
  sekcja?: string,
): boolean {
  if (rola === 'wlasciciel') return true
  if (modul === 'ustawienia' || modul === 'echo') return false
  if (!editorId) return false
  return uprawnienia.some((uprawnienie) =>
    uprawnienie.status === 'aktywne'
      && uprawnienie.editorId === editorId
      && uprawnienie.modul === modul
      && czyPasujeSekcja(modul, uprawnienie.sekcja, sekcja)
      && (operacja === 'odczyt' ? uprawnienie.odczyt : uprawnienie.edycja),
  )
}
