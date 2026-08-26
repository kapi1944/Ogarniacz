# Model danych Ogarniacza v1

## Pola wspólne

Każda trwała encja posiada:

- `id` — UUID, a dla wystąpień harmonogramu stabilne ID domenowe;
- `createdAt` — data utworzenia ISO;
- `updatedAt` — data ostatniej zmiany ISO;
- `usunietoAt` — opcjonalny tombstone po soft-delete.

## Encje

| Encja domenowa | Tabela | Najważniejsze pola i relacje |
|---|---|---|
| Zadanie | `zadania` | tytuł, opis, status, priorytet, terminy, opcjonalna estymacja, projekt, kontekst, tagi, podzadania, recurrence, powiązania |
| Projekt | `projekty` | nazwa, cel, status, następne działanie, blokady, daty; postęp liczony z zadań |
| ElementSkrzynki | `skrzynka` | surowa treść, źródło, sugerowany typ, status i cel konwersji |
| BlokCzasu | `blokiCzasu` | początek, koniec, typ, powiązana encja, elastyczność, status |
| GrafikPracy | `grafikPracy` | dzień tygodnia, aktywność, godziny od/do |
| WyjatekGrafiku | `wyjatkiGrafiku` | konkretna data, praca/dzień wolny, zmienione godziny |
| Nawyk | `nawyki` | częstotliwość, dni, interwał, okno, preferowany czas, minimum, aktywność |
| DziennikNawyku | `dziennikNawykow` | nawyk, data, pełna/minimalna/pominięta realizacja |
| Lek | `leki` | nazwa, instrukcja użytkownika, wiele godzin, aktywność |
| DziennikLeku | `dziennikLekow` | lek, data, planowana godzina, bieżący status i czas reakcji |
| Wizyta | `wizyty` | do umówienia/umówiona, daty, miejsce, placówka, kontakt, pytania, dokumenty, checklista |
| Przypomnienie | `przypomnienia` | źródło, typ, czas/reguła, priorytet, stan, snooze, eskalacja |
| ListaZakupow | `listyZakupow` | nazwa, sklep, lokalizacja, budżet, aktywność |
| PozycjaZakupow | `pozycjeZakupow` | lista, nazwa, ilość, kategoria, kupione |
| Rachunek | `rachunki` | nazwa, kwota, termin, status, recurrence |
| PlatnoscRachunku | `platnosciRachunkow` | rachunek, kwota, czas płatności |
| Notatka | `notatki` | tytuł, treść, tagi, powiązania |
| Pomysl | `pomysly` | tytuł, opis, status i konwersje |
| NaPozniej | `naPozniej` | typ, tytuł, URL, opis, status |
| Cel | `cele` | nazwa, opis, horyzont, projekty, nawyki, postęp |
| Kontakt | `kontakty` | rola, telefon, e-mail, adres, strona, notatki |
| Dokument | `dokumenty` | Blob, nazwa pliku, MIME, metadane, ważność, powiązania |
| Wydatek | `wydatki` | kwota, data, kategoria, opis, źródło/powiązanie |
| Budzet | `budzety` | nazwa, kategoria, okres, limit |
| TerminWaznosci | `terminyWaznosci` | nazwa, typ, data, status, odnowienie, dokument |
| PamiecEcho | `pamiecEcho` | fakt/preferencja/reguła, źródło, wrażliwość, sposób zapisu |
| Uprawnienie | `uprawnienia` | owner, editor, moduł/sekcja, read, edit, status |
| ProfilEdytora | `edytorzy` | nazwa i aktywność lokalnego profilu |
| DziennikEcho | `dziennikEcho` | działanie, encja, ryzyko, potwierdzenie, wynik |
| Ustawienia | `ustawienia` | motyw, powiadomienia, Echo, tryb Właściciel/Edytor |

## Powiązania

Relacje przechowują identyfikatory, nie kopie encji. Przykłady:

- Zadanie → Projekt;
- Notatka → Zadanie/Projekt/Wizyta/Kontakt/Cel;
- Wizyta → Kontakt/Dokument;
- Cel → Projekt/Nawyk;
- Termin ważności → Dokument;
- Przypomnienie → dowolny obsługiwany moduł;
- Blok czasu → Zadanie/Nawyk/Wizyta;
- Wydatek → opcjonalne źródło.

## Recurrence

Wspólny `RegulaPowtarzania` obsługuje: brak, codziennie, co X dni, tygodniowo, wybrane dni tygodnia, miesięcznie i rocznie. Ten sam serwis jest używany przez zadania, rachunki i przypomnienia; nawyki mają własną semantykę częstotliwości, ale wspólne obliczenia dat.
