# OGARNIACZ - ETAP 3 - Pulpit, oś czasu, praca, dojazdy i wyjątki dnia

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

Zbuduj pierwszy właściwy **Pulpit** i oś czasu. Pulpit ma być ekranem mieszanym, ale w tym etapie nie implementuj jeszcze pełnych kafelków modułowych ani zaawansowanego systemu zadań.

## Układ bazowy Pulpitu

Wprowadź komponentowy szkielet:
- nagłówek z datą i nawigacją,
- placeholder/obszar alertów,
- placeholder/obszar kafelków,
- oś czasu,
- sekcję elementów bez godziny,
- opcjonalną sekcję wykonanych.

Nie twórz jednego monolitycznego komponentu. Rozdziel co najmniej na PulpitView, DayNavigator, Timeline i osobne warstwy/pasy osi zgodnie z konwencją repo.

## Nawigacja datą

Obsłuż:
- poprzedni dzień,
- „Dzisiaj”,
- następny dzień,
- wybór daty.

„Dzisiaj” to akcja/skrót do bieżącej daty, nie nazwa całego ekranu.

## Oś czasu

Wymagania:
- pełne 00:00-23:59,
- godziny nocne/poza aktywną częścią dnia mogą być skompresowane,
- aktywna część dnia bardziej czytelna,
- wskaźnik aktualnego czasu dla dzisiejszej daty,
- funkcje mapowania czasu do pozycji odseparowane od JSX.

## Praca i dojazdy

Z ustawień pobierz:
- pon.-pt. praca 07:45-16:00,
- dojazd do pracy 40 min,
- powrót 40 min.

Dla domyślnego dnia roboczego oznacza to orientacyjnie:
- dojazd: 07:05-07:45,
- praca: 07:45-16:00,
- powrót: 16:00-16:40.

Nie hardcoduj tych trzech przedziałów w rendererze. Wylicz je z settings.

Pokaż na osi osobne pasy/tła:
- praca,
- dojazd do pracy,
- powrót.

Nie udawaj, że są zwykłymi zadaniami.

## Dostępność planistyczna

Dojazd ma domyślnie **częściową dostępność**. To NIE może blokować aplikacji.
Znaczenie: przyszły planer nie powinien proponować tam zwykłych aktywności wymagających patrzenia w ekran/manualnej obsługi.

Dodaj możliwość ręcznego przełączenia przedziału na pełną dostępność.

## Wyjątki dnia

Gdy użytkownik zmienia godziny pracy/dojazd/dostępność, UX ma rozróżnić:
1. „Tylko ten dzień” - wyjątek daty,
2. „Zapisz jako nową regułę” - zmiana domyślnego harmonogramu.

Jeżeli pełny modal jest niezgodny z obecną architekturą, zbuduj prosty dialog zgodny z design systemem.
Day-specific override traktuj jako dane, nie przypadkową flagę komponentu.

Obsłuż przynajmniej:
- pozostanie dłużej w pracy,
- wcześniejsze wyjście,
- brak dojazdu samochodem / pełna dostępność,
- dzień bez domyślnej pracy.

## Dane na osi

Na tym etapie można użyć wspólnego providera elementów z Etapu 2. Renderuj prosty marker dla elementu z konkretną godziną, bez jeszcze pełnej logiki priorytetów i miniatur.

## Testy wysokiej wartości

- mapowanie 00:00, 07:05, 07:45, 16:00, 16:40, 23:59,
- przedziały pracy/dojazdu z settings,
- weekend bez domyślnego bloku pracy,
- wyjątek jednego dnia nie zmienia reguły globalnej.

## Kryteria akceptacji

- Pulpit działa jako ekran główny,
- oś obejmuje 24h i kompresuje mniej istotne godziny,
- praca/dojazdy są osobnymi pasami,
- częściowa dostępność nie blokuje aplikacji,
- ręczny override i wybór zakresu zmiany działają,
- kod mapowania czasu jest testowalny i poza dużym komponentem UI.

## Commit etapu
`feat(pulpit): add timeline work commute and day overrides`
