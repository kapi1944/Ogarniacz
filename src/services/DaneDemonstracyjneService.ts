import { addDays, format } from 'date-fns'
import { baza } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { dzisiajIso, utworzMetadane } from '../domain/fabryki'
import type { BlokCzasu, Budzet, Cel, Dokument, ElementSkrzynki, Kontakt, Lek, ListaZakupow, NaPozniej, Nawyk, Notatka, Pomysl, PozycjaZakupow, Projekt, Przypomnienie, Rachunek, TerminWaznosci, Wizyta, Wydatek } from '../domain/typy'
import { utworzZadanie } from './ZadaniaService'

const tabeleUzytkownika = ['zadania', 'projekty', 'skrzynka', 'blokiCzasu', 'nawyki', 'leki', 'wizyty', 'przypomnienia', 'listyZakupow', 'rachunki', 'notatki', 'pomysly', 'naPozniej', 'cele', 'kontakty', 'dokumenty', 'wydatki', 'budzety', 'terminyWaznosci'] as const

export async function czyMoznaWczytacDemo(): Promise<boolean> {
  const liczby = await Promise.all(tabeleUzytkownika.map((nazwa) => baza.table(nazwa).count()))
  return liczby.every((liczba) => liczba === 0)
}

export async function wczytajDaneDemonstracyjne(): Promise<void> {
  if (!(await czyMoznaWczytacDemo())) throw new Error('Dane demonstracyjne można wczytać tylko do pustej bazy.')
  const dzisiaj = dzisiajIso()
  const jutro = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const zaTydzien = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const projekt: Projekt = { ...utworzMetadane(), nazwa: 'Uporządkować domowe biuro', opis: 'Stworzyć wygodne miejsce do pracy.', status: 'aktywne', nastepneDzialanie: 'Zmierzyć blat', blokady: '' }
  await pobierzRepozytorium('projekty').zapisz(projekt)
  await pobierzRepozytorium('zadania').zapiszWiele([
    { ...utworzZadanie({ tytul: 'Zmierzyć blat biurka', opis: '', priorytet: 'wysoki', termin: dzisiaj, szacowanyCzasMin: 20, projektId: projekt.id }), kontekst: 'dom' },
    utworzZadanie({ tytul: 'Odebrać paczkę', opis: '', priorytet: 'normalny', termin: jutro, szacowanyCzasMin: 30, kontekst: 'paczkomat' }),
    utworzZadanie({ tytul: 'Zadzwonić do serwisu', opis: '', priorytet: 'krytyczny', termin: format(addDays(new Date(), -1), 'yyyy-MM-dd'), kontekst: 'telefon' }),
  ])
  const inbox: ElementSkrzynki = { ...utworzMetadane(), tresc: 'Sprawdzić pomysł na kurs fotografii', zrodlo: 'tekst', sugerowanyTyp: 'pomysly', status: 'nowe' }
  await pobierzRepozytorium('skrzynka').zapisz(inbox)
  const lek: Lek = { ...utworzMetadane(), nazwa: 'Przykładowy lek', dawkaInstrukcja: 'Instrukcja wpisana przez użytkownika', godziny: ['08:00', '20:00'], aktywny: true }
  await pobierzRepozytorium('leki').zapisz(lek)
  const nawyk: Nawyk = { ...utworzMetadane(), nazwa: 'Krótki spacer', czestotliwosc: 'codziennie', dniTygodnia: [], oknoOd: '17:00', oknoDo: '21:00', minimalnaWersja: '5 minut przed domem', aktywny: true }
  await pobierzRepozytorium('nawyki').zapisz(nawyk)
  const kontakt: Kontakt = { ...utworzMetadane(), nazwa: 'Przychodnia Zdrowie', rola: 'przychodnia', telefon: '123 456 789', email: 'rejestracja@example.test' }
  await pobierzRepozytorium('kontakty').zapisz(kontakt)
  const wizyta: Wizyta = { ...utworzMetadane(), nazwa: 'Kontrola profilaktyczna', status: 'umowiona', data: zaTydzien, godzina: '10:30', miejsce: 'Przychodnia', kontaktId: kontakt.id, notatka: 'Zabrać wyniki badań.', pytania: ['Czy potrzebne są dalsze badania?'], dokumentyIds: [], checklista: ['Dowód', 'Wyniki'] }
  await pobierzRepozytorium('wizyty').zapisz(wizyta)
  const przypomnienie: Przypomnienie = { ...utworzMetadane(), tytul: 'Sprawdź ważne zadania', typ: 'absolutne', czas: new Date(Date.now() - 60000).toISOString(), priorytet: 'wysoki', stan: 'nowe', eskalacja: false }
  await pobierzRepozytorium('przypomnienia').zapisz(przypomnienie)
  const lista: ListaZakupow = { ...utworzMetadane(), nazwa: 'Spożywcze', sklep: 'Dowolny sklep', budzet: 150, aktywna: true }
  await pobierzRepozytorium('listyZakupow').zapisz(lista)
  const pozycje: PozycjaZakupow[] = [{ ...utworzMetadane(), listaId: lista.id, nazwa: 'Kawa', ilosc: '1 op.', kategoria: 'Spiżarnia', kupione: false }, { ...utworzMetadane(), listaId: lista.id, nazwa: 'Jabłka', ilosc: '1 kg', kategoria: 'Warzywa i owoce', kupione: false }]
  await pobierzRepozytorium('pozycjeZakupow').zapiszWiele(pozycje)
  const rachunek: Rachunek = { ...utworzMetadane(), nazwa: 'Internet', kwota: 69.99, termin: jutro, status: 'niezaplacony', powtarzanie: { typ: 'miesiecznie', coIle: 1, dataStartu: jutro } }
  await pobierzRepozytorium('rachunki').zapisz(rachunek)
  const notatka: Notatka = { ...utworzMetadane(), tytul: 'Pomysły na spokojniejszy poranek', tresc: 'Przygotować rzeczy wieczorem i zostawić 15 minut bufora.', tagi: ['rutyna'], powiazania: [] }
  await pobierzRepozytorium('notatki').zapisz(notatka)
  const pomysl: Pomysl = { ...utworzMetadane(), tytul: 'Weekend bez telefonu', opis: 'Sprawdzić miejsca poza miastem.', status: 'nowy' }
  await pobierzRepozytorium('pomysly').zapisz(pomysl)
  const pozniej: NaPozniej = { ...utworzMetadane(), tytul: 'Przeczytać o ergonomii biurka', typ: 'przeczytac', status: 'oczekuje' }
  await pobierzRepozytorium('naPozniej').zapisz(pozniej)
  const cel: Cel = { ...utworzMetadane(), nazwa: 'Więcej regularnego ruchu', opis: 'Budować regularność bez presji perfekcji.', status: 'aktywne', horyzont: '3 miesiące', projektyIds: [], nawykiIds: [nawyk.id], postep: 15 }
  await pobierzRepozytorium('cele').zapisz(cel)
  const dokument: Dokument = { ...utworzMetadane(), nazwa: 'Polisa — rekord demonstracyjny', typ: 'ubezpieczenie', terminWaznosci: zaTydzien, powiazania: [] }
  await pobierzRepozytorium('dokumenty').zapisz(dokument)
  const wydatek: Wydatek = { ...utworzMetadane(), kwota: 42.5, data: dzisiaj, kategoria: 'Dom', opis: 'Akcesoria biurowe', powiazanie: { typ: 'projekty', id: projekt.id } }
  await pobierzRepozytorium('wydatki').zapisz(wydatek)
  const budzet: Budzet = { ...utworzMetadane(), nazwa: 'Miesięczny limit', okres: dzisiaj.slice(0, 7), limit: 1200 }
  await pobierzRepozytorium('budzety').zapisz(budzet)
  const termin: TerminWaznosci = { ...utworzMetadane(), nazwa: 'Polisa', typ: 'ubezpieczenie', dataWaznosci: zaTydzien, status: 'do_odnowienia', dokumentId: dokument.id, regulaOdnowienia: { typ: 'rocznie', coIle: 1, dataStartu: zaTydzien } }
  await pobierzRepozytorium('terminyWaznosci').zapisz(termin)
  const blok: BlokCzasu = { ...utworzMetadane(), tytul: 'Czas wolny', poczatek: `${dzisiaj}T19:00:00`, koniec: `${dzisiaj}T20:00:00`, typ: 'wolne', elastycznosc: 'elastyczny', status: 'zaakceptowany' }
  await pobierzRepozytorium('blokiCzasu').zapisz(blok)
}
