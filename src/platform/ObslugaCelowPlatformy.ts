import type { PowiazanieEncji } from '../domain/typy'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { daneSzybkiegoDodawaniaZeSciezki } from './trasy'

type Nawiguj = (sciezka: string) => void

interface ZaleznosciObslugiCelow {
  nawiguj: Nawiguj
  otworzSzybkieDodawanie: (dane: NonNullable<ReturnType<typeof daneSzybkiegoDodawaniaZeSciezki>>) => void
  pokazKomunikat: (tekst: string) => void
  pobierzEncje?: (powiazanie: PowiazanieEncji) => Promise<unknown | undefined>
}

function sciezkaNadrzedna(sciezka: string) {
  return new URL(sciezka, 'https://ogarniacz.local').pathname
}

async function domyslniePobierzEncje(powiazanie: PowiazanieEncji) {
  switch (powiazanie.typ) {
    case 'zadania': return pobierzRepozytorium('zadania').pobierz(powiazanie.id)
    case 'projekty': return pobierzRepozytorium('projekty').pobierz(powiazanie.id)
    case 'skrzynka': return pobierzRepozytorium('skrzynka').pobierz(powiazanie.id)
    case 'planer': return pobierzRepozytorium('blokiCzasu').pobierz(powiazanie.id)
    case 'grafik': return pobierzRepozytorium('grafikPracy').pobierz(powiazanie.id)
    case 'nawyki': return pobierzRepozytorium('nawyki').pobierz(powiazanie.id)
    case 'leki': return pobierzRepozytorium('leki').pobierz(powiazanie.id)
    case 'wizyty': return pobierzRepozytorium('wizyty').pobierz(powiazanie.id)
    case 'przypomnienia': return pobierzRepozytorium('przypomnienia').pobierz(powiazanie.id)
    case 'zakupy': return pobierzRepozytorium('listyZakupow').pobierz(powiazanie.id)
    case 'rachunki': return pobierzRepozytorium('rachunki').pobierz(powiazanie.id)
    case 'miasto': return pobierzRepozytorium('zadania').pobierz(powiazanie.id)
    case 'cele': return pobierzRepozytorium('cele').pobierz(powiazanie.id)
    case 'notatki': return pobierzRepozytorium('notatki').pobierz(powiazanie.id)
    case 'pomysly': return pobierzRepozytorium('pomysly').pobierz(powiazanie.id)
    case 'na_pozniej': return pobierzRepozytorium('naPozniej').pobierz(powiazanie.id)
    case 'kontakty': return pobierzRepozytorium('kontakty').pobierz(powiazanie.id)
    case 'dokumenty': return pobierzRepozytorium('dokumenty').pobierz(powiazanie.id)
    case 'finanse': return pobierzRepozytorium('wydatki').pobierz(powiazanie.id)
    case 'samochod': return pobierzRepozytorium('pojazdy').pobierz(powiazanie.id)
    case 'terminy': return pobierzRepozytorium('terminyWaznosci').pobierz(powiazanie.id)
    case 'echo': return pobierzRepozytorium('pamiecEcho').pobierz(powiazanie.id)
    case 'ustawienia': return pobierzRepozytorium('ustawienia').pobierz(powiazanie.id)
    default: return undefined
  }
}

export function utworzObslugeCelowPlatformy(zaleznosci: ZaleznosciObslugiCelow) {
  let ostatniCel: string | undefined
  let wyczyscOstatniCel: ReturnType<typeof setTimeout> | undefined

  const oznaczCel = (sciezka: string) => {
    if (sciezka === ostatniCel) return false
    ostatniCel = sciezka
    if (wyczyscOstatniCel) clearTimeout(wyczyscOstatniCel)
    wyczyscOstatniCel = setTimeout(() => { ostatniCel = undefined }, 2_000)
    return true
  }

  return {
    async obsluz(sciezka: string, sourceRef?: PowiazanieEncji) {
      const szybkieDodawanie = daneSzybkiegoDodawaniaZeSciezki(sciezka)
      if (szybkieDodawanie) {
        if (oznaczCel(sciezka)) zaleznosci.otworzSzybkieDodawanie(szybkieDodawanie)
        return
      }

      if (sourceRef) {
        const pobierzEncje = zaleznosci.pobierzEncje ?? domyslniePobierzEncje
        const encja = await pobierzEncje(sourceRef)
        if (!encja) {
          const fallback = sciezkaNadrzedna(sciezka)
          if (oznaczCel(fallback)) {
            zaleznosci.nawiguj(fallback)
            zaleznosci.pokazKomunikat('Ten element nie jest już dostępny.')
          }
          return
        }
      }

      if (oznaczCel(sciezka)) zaleznosci.nawiguj(sciezka)
    },
    zakoncz() {
      if (wyczyscOstatniCel) clearTimeout(wyczyscOstatniCel)
    },
  }
}
