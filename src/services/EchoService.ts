import { pobierzRepozytorium } from '../data/Repozytorium'
import { dzisiajIso, utworzMetadane } from '../domain/fabryki'
import type { DziennikEcho, Notatka, Pomysl, RyzykoDzialania } from '../domain/typy'
import { czyZadanieZalegle, utworzZadanie } from './ZadaniaService'
import { addDays, format } from 'date-fns'
import { czyWymagaPotwierdzenia, ocenRyzykoPolecenia } from './RyzykoDzialaniaService'

export interface OdpowiedzEcho {
  tekst: string
  wykonano?: string
  ryzyko: RyzykoDzialania
  wymagaPotwierdzenia?: boolean
  polecenieDoPotwierdzenia?: string
}

export interface ProviderEcho {
  odpowiedz(polecenie: string): Promise<OdpowiedzEcho>
}

async function zapiszDziennik(opis: string, dzialanie: string, ryzyko: RyzykoDzialania, wynik: DziennikEcho['wynik']): Promise<void> {
  await pobierzRepozytorium('dziennikEcho').zapisz({
    ...utworzMetadane(),
    opis,
    dzialanie,
    ryzyko,
    wymagaloPotwierdzenia: ryzyko !== 'niskie',
    wynik,
  })
}

export class LokalnyProviderEcho implements ProviderEcho {
  async odpowiedz(polecenie: string): Promise<OdpowiedzEcho> {
    const tekst = polecenie.trim()
    const male = tekst.toLocaleLowerCase('pl')

    if (male.startsWith('dodaj zadanie ') || male.startsWith('zadanie ')) {
      const tytul = tekst.replace(/^(dodaj zadanie|zadanie)\s+/i, '').trim()
      const zadanie = utworzZadanie({ tytul, opis: '', priorytet: 'normalny' })
      await pobierzRepozytorium('zadania').zapisz(zadanie)
      await zapiszDziennik(`Utworzono zadanie: ${tytul}`, 'utworzenie_zadania', 'niskie', 'wykonane')
      return { tekst: `Dodałem zadanie „${tytul}”.`, wykonano: zadanie.id, ryzyko: 'niskie' }
    }

    if (male.startsWith('notatka ')) {
      const tresc = tekst.replace(/^notatka\s+/i, '').trim()
      const notatka: Notatka = { ...utworzMetadane(), tytul: tresc.slice(0, 60), tresc, tagi: [], powiazania: [] }
      await pobierzRepozytorium('notatki').zapisz(notatka)
      await zapiszDziennik(`Zapisano notatkę: ${notatka.tytul}`, 'utworzenie_notatki', 'niskie', 'wykonane')
      return { tekst: 'Notatka została zapisana.', wykonano: notatka.id, ryzyko: 'niskie' }
    }

    if (male.startsWith('pomysł ') || male.startsWith('pomysl ')) {
      const tytul = tekst.replace(/^pomys[lł]\s+/i, '').trim()
      const pomysl: Pomysl = { ...utworzMetadane(), tytul, opis: '', status: 'nowy' }
      await pobierzRepozytorium('pomysly').zapisz(pomysl)
      await zapiszDziennik(`Zapisano pomysł: ${tytul}`, 'utworzenie_pomyslu', 'niskie', 'wykonane')
      return { tekst: 'Pomysł trafił do modułu Pomysły.', wykonano: pomysl.id, ryzyko: 'niskie' }
    }

    const zadania = await pobierzRepozytorium('zadania').lista()
    if (male.includes('zaleg')) {
      const zalegle = zadania.filter((zadanie) => czyZadanieZalegle(zadanie))
      return { tekst: zalegle.length ? `Masz ${zalegle.length} zaległych zadań. Najpilniejsze: ${zalegle.slice(0, 3).map((x) => x.tytul).join(', ')}.` : 'Nie masz zaległych zadań.', ryzyko: 'niskie' }
    }
    if (male.includes('dzis') || male.includes('jeszcze')) {
      const dzisiaj = dzisiajIso()
      const dzisiejsze = zadania.filter((zadanie) => zadanie.status !== 'wykonane' && zadanie.termin === dzisiaj)
      return { tekst: dzisiejsze.length ? `Na dziś zostało ${dzisiejsze.length} zadań: ${dzisiejsze.slice(0, 4).map((x) => x.tytul).join(', ')}.` : 'Na dziś nie ma już otwartych zadań.', ryzyko: 'niskie' }
    }
    if (male.includes('najpilniejsze')) {
      const otwarte = zadania.filter((zadanie) => zadanie.status !== 'wykonane').sort((a, b) => (a.termin ?? '9999').localeCompare(b.termin ?? '9999'))
      return { tekst: otwarte[0] ? `Najpilniejsze wygląda teraz: „${otwarte[0].tytul}”.` : 'Nie ma otwartych zadań.', ryzyko: 'niskie' }
    }
    if (male.includes('wolnego czasu')) {
      const bloki = await pobierzRepozytorium('blokiCzasu').lista()
      const zajeteMinuty = bloki.filter((blok) => blok.poczatek.startsWith(dzisiajIso()) && blok.typ !== 'wolne' && blok.status !== 'odrzucony').reduce((suma, blok) => suma + Math.max(0, (Date.parse(blok.koniec) - Date.parse(blok.poczatek)) / 60000), 0)
      return { tekst: `W zapisanym planie masz dziś około ${Math.max(0, Math.round((15 * 60 - zajeteMinuty) / 60))} godzin bez zajętych bloków między 7:00 a 22:00.`, ryzyko: 'niskie' }
    }
    return { tekst: 'Mogę sprawdzić dzisiejsze i zaległe zadania albo szybko zapisać polecenie „zadanie …”, „notatka …” lub „pomysł …”.', ryzyko: 'niskie' }
  }
}

export class EchoService {
  constructor(private readonly provider: ProviderEcho = new LokalnyProviderEcho()) {}

  async obsluz(polecenie: string, potwierdzone = false): Promise<OdpowiedzEcho> {
    const ryzyko = ocenRyzykoPolecenia(polecenie)
    if (czyWymagaPotwierdzenia(ryzyko) && !potwierdzone) {
      return { tekst: ryzyko === 'wysokie' ? 'To działanie jest wrażliwe lub trudne do odwrócenia. Echo nie wykona go bez jawnego potwierdzenia.' : 'Ta zmiana wpływa na harmonogram. Potwierdź, jeśli mam ją wykonać.', ryzyko, wymagaPotwierdzenia: true, polecenieDoPotwierdzenia: polecenie }
    }
    if (ryzyko === 'wysokie') {
      await zapiszDziennik(`Odrzucono wrażliwe polecenie tekstowe: ${polecenie}`, 'blokada_wysokiego_ryzyka', 'wysokie', 'odrzucone')
      return { tekst: 'Dla bezpieczeństwa Echo nie wykonuje tej operacji tekstowo. Użyj właściwego ekranu i jego bramki potwierdzenia.', ryzyko: 'wysokie' }
    }
    if (ryzyko === 'umiarkowane') {
      const dopasowanie = polecenie.match(/prze[lł][oó][zż]\s+(.+?)\s+na\s+jutro/i)
      if (!dopasowanie?.[1]) return { tekst: 'Potwierdzenie przyjęte, ale nie rozpoznałem zadania. Użyj formy „przełóż NAZWA na jutro”.', ryzyko: 'umiarkowane' }
      const repozytorium = pobierzRepozytorium('zadania')
      const zadania = await repozytorium.lista()
      const szukana = dopasowanie[1].trim().toLocaleLowerCase('pl')
      const zadanie = zadania.find((element) => element.status !== 'wykonane' && element.tytul.toLocaleLowerCase('pl').includes(szukana))
      if (!zadanie) return { tekst: `Nie znalazłem otwartego zadania pasującego do „${dopasowanie[1]}”.`, ryzyko: 'umiarkowane' }
      const jutro = format(addDays(new Date(), 1), 'yyyy-MM-dd')
      await repozytorium.zapisz({ ...zadanie, termin: jutro })
      await zapiszDziennik(`Przełożono zadanie „${zadanie.tytul}” na ${jutro}`, 'przelozenie_zadania', 'umiarkowane', 'wykonane')
      return { tekst: `Przełożyłem „${zadanie.tytul}” na jutro.`, wykonano: zadanie.id, ryzyko: 'umiarkowane' }
    }
    return this.provider.odpowiedz(polecenie)
  }
}
