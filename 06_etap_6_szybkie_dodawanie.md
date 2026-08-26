# OGARNIACZ - ETAP 6 - Globalne szybkie dodawanie i parser regułowy

Projekt lokalny:
`C:\GitHub\Projects\Ogarniacz\Ogarniacz_v1`

Dokument nadrzędny tej serii zmian:
`Ogarniacz_specyfikacja_aktualna_v2.pdf`

Jeżeli PDF jest dostępny w zadaniu lub repozytorium, przeczytaj odpowiednie sekcje przed implementacją. Ten prompt jest jednak samowystarczalny dla bieżącego etapu.

## Zasady obowiązkowe

1. W interfejsie główny ekran nazywa się **Pulpit**. Nie wprowadzaj nazw „Kokpit”, „Start” ani „Dashboard”. Starsze „Dzisiaj” może pozostać tylko jako akcja wyboru bieżącej daty lub jako wewnętrzny legacy identifier, jeśli bezpieczna migracja wymaga zachowania kompatybilności.
2. Ultimate Pomagier 3.5 jest projektem REFERENCYJNYM. Kopiuj zachowania i sprawdzoną logikę, nie firmową semantykę ani monolityczne komponenty.
3. Nie duplikuj źródeł prawdy. Pulpit agreguje dane modułów, ale nie tworzy ich drugiej kopii.
4. UI nie powinno znać fizycznego storage. Używaj istniejących repozytoriów albo małych interfejsów repository.
5. Nie przechowuj ciężkich danych/obrazów w localStorage. Dla nowych danych użytkownika preferuj istniejący magazyn offline; jeśli go nie ma, przygotuj warstwę możliwą do podmiany na IndexedDB/SQLite.
6. Nie wykonuj dużego refaktoru „przy okazji”. Zmieniaj tylko to, co jest potrzebne w bieżącym etapie.
7. Nie rób pełnego audytu repo w każdym etapie. Przeczytaj `package.json`, konfigurację i tylko pliki bezpośrednio związane z zadaniem.
8. Nie pushuj do remote.

## Preflight Git - wykonaj przed modyfikacją

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log -5 --oneline
```

Jeżeli repo ma remote, możesz wykonać `git fetch --all --prune`, ale brak dostępu do sieci nie blokuje etapu.

Jeżeli worktree zawiera niezacommitowane zmiany, których nie utworzyłeś w tym zadaniu:
- NIE resetuj,
- NIE stashuj,
- NIE usuwaj,
- NIE commituj ich razem ze swoimi zmianami.

Zatrzymaj się i zwróć `WORKTREE NOT CLEAN` z listą plików.

Jeżeli worktree jest czysty, kontynuuj na aktualnej sensownej gałęzi roboczej. Nie twórz nowej gałęzi, jeśli seria wdrożeniowa już ma własną gałąź.

## Weryfikacja po zmianach

Ustal prawidłowe skrypty z `package.json`. Uruchom dostępne:
- typecheck,
- build,
- lint,
- istniejące testy istotne dla zmienianego obszaru.

Dodawaj tylko kilka testów o wysokiej wartości. Nie twórz dziesiątek snapshotów, testów regexowych wyglądu ani osobnego „audytu jakości” całej aplikacji.

Jeżeli etap się powiedzie i worktree przed startem był czysty, utwórz jeden lokalny commit o podanej niżej treści. Bez push.

## Raport końcowy

Zakończ odpowiedź dokładnie w strukturze:

### WYNIK ETAPU
Status: `DONE` / `FIX REQUIRED` / `BLOCKED`

### Git
- branch przed/po
- HEAD przed/po
- commit

### Zrealizowano
- krótka lista faktycznie ukończonych punktów

### Pliki
- nowe
- zmienione
- jedno zdanie o roli ważniejszych plików

### Weryfikacja
- komendy
- wyniki

### Świadomie odłożone
- tylko rzeczy należące do kolejnych etapów

### Ryzyka / uwagi
- tylko realne, konkretne problemy

Na końcu napisz:
`READY FOR NEXT STAGE`
albo
`FIX REQUIRED BEFORE NEXT STAGE`

Po zakończeniu tego etapu ZATRZYMAJ SIĘ. Nie rozpoczynaj kolejnego etapu samodzielnie.

---

## Cel

Zaimplementuj globalne szybkie dodawanie dostępne z każdego ekranu. Ma łączyć ręczny wybór typu z wpisaniem naturalnego tekstu bez wcześniejszego wybierania kategorii.

## Panel globalnego „+”

Po otwarciu:
1. u góry przyciski typów,
2. poniżej pole tekstowe,
3. niżej rozpoznane/proponowane pola,
4. użytkownik może wszystko poprawić,
5. dopiero potem zatwierdza zapis.

Brak cichego automatycznego zapisu.

## Domyślny zestaw typów

Startowo:
1. Zadanie,
2. Notatka,
3. Wizyta,
4. Lek,
5. Wydatek,
6. Samochód.

Zestaw jest konfigurowalny w Ustawieniach. Rzadziej używane typy dostępne przez „Więcej”.

## Uczenie kolejności

Dodaj prosty lokalny licznik użycia typów.
- jeśli opcja jest włączona, częściej używane mogą przesuwać się wyżej,
- jeśli wyłączona, zachowaj ręczną kolejność,
- użytkownik nie może stracić dostępu do żadnego typu,
- nie używaj ciężkiego ML/AI.

## Parser - wersja początkowa

Zaimplementuj lokalne reguły i słownik dla języka polskiego, które proponują:
- typ,
- datę,
- godzinę.

Przykłady do obsłużenia:
- „dentysta jutro 15:30” -> Wizyta + jutro + 15:30,
- „kup olej do auta w sobotę” -> propozycja Samochód albo Zadanie + sobota; użytkownik może zmienić,
- „zapłać internet do 10 września” -> Wydatek/Płatność + data,
- „weź lek o 20” -> Lek + 20:00.

Obsłuż co najmniej:
- dziś,
- jutro,
- pojutrze,
- nazwy dni tygodnia,
- `DD.MM`, `DD.MM.YYYY`,
- godziny `15`, `15:30`, `o 15`.

Jeżeli wynik jest niepewny, nie wymyślaj twardo - pokaż propozycję i pozwól wybrać.

## Architektura parsera

Parser ma mieć czysty interfejs, aby później można było podmienić/dodać inteligentniejszy provider bez przepisywania QuickAdd UI.
Nie implementuj jeszcze zewnętrznego modelu AI.

## Typ-specific forms

Po wyborze/zaproponowaniu typu wykorzystaj istniejący formularz/adapter danego typu, jeśli istnieje. Nie duplikuj formularza Zadania w QuickAdd.

## Testy

Kilka testów tabelarycznych dla reprezentatywnych zdań i dat.
Test, że parser nie zapisuje elementu samodzielnie.
Test wyłączenia „uczenia kolejności”.

## Kryteria akceptacji

- „+” działa globalnie,
- można wybrać typ ręcznie albo od razu pisać,
- parser proponuje typ/datę/godzinę,
- wynik jest edytowalny przed zapisem,
- kolejność typów może się uczyć i można to wyłączyć,
- kod parsera jest wymienialnym modułem.

## Commit etapu
`feat(quick-add): add configurable quick add and local parser`
