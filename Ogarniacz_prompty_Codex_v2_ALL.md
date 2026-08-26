# OGARNIACZ - KOMPLET PROMPTÓW CODEX v2


---

# OGARNIACZ - ETAP 1 - Ustawienia, harmonogram i migracja nazwy Pulpit

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

Zbuduj stabilny fundament Ustawień i wprowadź oficjalną semantykę **Pulpitu**. Nie buduj jeszcze właściwej osi czasu ani systemu zadań.

## Najpierw zinwentaryzuj

Sprawdź:
- routing i ekran startowy,
- obecne wystąpienia „Dzisiaj”,
- istniejące Settings/Theme/Context/store,
- storage ustawień,
- design tokens/CSS variables,
- sposób obsługi menu bocznego,
- istniejące modele harmonogramu, jeśli są.

Nie zmieniaj publicznych identyfikatorów storage/route tylko dla estetyki, jeśli grozi to utratą kompatybilności. UI ma mówić „Pulpit”; legacy klucze można migrować osobno.

## Wdrożenie

### 1. Wersjonowany model AppSettings

Wprowadź jedno źródło defaults i centralny normalizator. Model wersja 1 powinien mieć co najmniej sekcje odpowiadające:
- `appearance`,
- `navigation`,
- `pulpit`,
- `schedule`,
- `tasks`,
- `quickAdd`,
- `accessibility`.

Nazwy dopasuj do konwencji repo.

### 2. Domyślne ustawienia harmonogramu

Ustaw domyślne reguły:
- dni pracy: poniedziałek-piątek,
- praca: 07:45-16:00,
- średni dojazd do pracy: 40 min,
- średni powrót: 40 min,
- domyślna dostępność podczas dojazdu: częściowa,
- możliwość ręcznego przełączenia na pełną dostępność,
- przyszłe wyjątki dnia muszą dać się zapisać jako „tylko ten dzień” albo „nowa reguła”.

Na tym etapie wystarczy model/settings. Nie musisz jeszcze budować pełnego edytora wyjątków dnia.

### 3. SettingsRepository

UI nie może wykonywać bezpośredniego `localStorage.getItem/setItem`.
- jeśli repo ma warstwę storage - użyj jej,
- jeśli nie - stwórz mały `SettingsRepository` i bezpieczną implementację dla ustawień,
- load zawsze przechodzi przez normalizację.

### 4. Normalizacja

Obsłuż:
- null/undefined,
- brakujące sekcje,
- stare rekordy,
- złe enumy,
- NaN i liczby poza zakresem,
- zły format czasu,
- start >= end.

Nie mutuj inputu. Zachowuj poprawne istniejące wartości i dopełniaj defaults.

### 5. Ekran Ustawienia

Na start wystarczą sekcje:
- Wygląd,
- Nawigacja,
- Pulpit,
- Harmonogram,
- Zadania,
- Szybkie dodawanie,
- Dostępność.

Zachowanie:
- `savedSettings -> draftSettings`,
- live preview dla ustawień wizualnych,
- świadomy Zapisz,
- reset bieżącej sekcji,
- reset wszystkich ustawień.

### 6. Centralne CSS variables/design tokens

Podepnij co najmniej:
- promień kart,
- promień pól,
- gęstość,
- czas animacji,
- szerokość menu.

Nie twórz drugiego design systemu, jeśli istnieje obecny.

### 7. Migracja nazwy

W miejscach użytkowych zmień nazwę głównego ekranu z „Dzisiaj” na „Pulpit”.
Nie rób ślepego globalnego search/replace. Zachowaj kompatybilność route/storage/test IDs, jeśli wymaga tego istniejący kod.

## Minimalne testy

Dodaj tylko testy:
1. normalizacja pustych/niepełnych settings,
2. zły enum -> default,
3. clamp wartości,
4. błędne godziny -> bezpieczny harmonogram,
5. repository save -> load.

## Kryteria akceptacji

- aplikacja pokazuje „Pulpit” jako nazwę ekranu głównego,
- AppSettings ma wersję i jedno źródło defaults,
- ustawienia uszkodzone nie crashują aplikacji,
- SettingsRepository odcina UI od storage,
- live preview + zapis + reset działają,
- harmonogram 07:45-16:00 i 40/40 min jest zapisany jako konfiguracja, nie magiczne wartości UI.

## Commit etapu
`feat(settings): add pulpit settings and schedule foundation`


---

# OGARNIACZ - ETAP 2 - Wspólny model elementu i repozytoria

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

Zaprojektuj i zaimplementuj wspólny kontrakt elementu Ogarniacza używany przez Pulpit i planer. Nie zmuszaj wszystkich modułów do jednej tabeli i nie integruj jeszcze wszystkich modułów.

## Najważniejsza decyzja

Użytkownik wybrał **wspólny model elementu z typem określającym zachowanie**. Preferuj:
- mały wspólny rdzeń,
- typ/discriminated union albo typowany payload,
- adaptery modułów,
- `sourceRef` do rekordu źródłowego.

Nie twórz gigantycznego interfejsu, w którym wszystkie pola każdego modułu są obowiązkowe.

## Wspólny rdzeń powinien obsłużyć

Co najmniej:
- id,
- type,
- title,
- optional description,
- date,
- time,
- duration,
- deadline,
- deadlineMode,
- priority,
- status,
- recurrence,
- reminders,
- planning availability/context,
- tags,
- showOnPulpit,
- asset references,
- createdAt/updatedAt,
- `sourceRef: { module, entityId }` dla danych pochodzących z modułów.

Pola nie muszą być wszystkie wymagane. Minimalne szybkie tworzenie docelowo potrzebuje tylko tytułu i typu, przy czym typ może zostać zasugerowany później przez parser.

## Typy

Przygotuj rozszerzalny typ dla co najmniej:
- TASK,
- NOTE,
- APPOINTMENT,
- MEDICATION,
- EXPENSE/PAYMENT,
- CAR,
- SHOPPING,
- PLANNER/GENERIC_EVENT.

Nie implementuj logiki wszystkich typów. Chodzi o kontrakt.

## Repository abstraction

Wprowadź repozytorium dla manualnych elementów/zadań, np. operacje:
- list/query by date/range,
- get,
- create,
- update,
- delete.

Jeśli obecny projekt ma repository/database abstraction, rozszerz ją. Nie twórz konkurencyjnego storage.

Jeśli aktualne rekordy istnieją w starszym formacie:
- nie kasuj ich,
- dodaj normalizację/adapter legacy,
- nie migruj całej aplikacji bez potrzeby.

## Provider/adapter dla Pulpitu

Zdefiniuj mały kontrakt, przez który moduł będzie później wystawiał elementy do Pulpitu w zadanym zakresie dat.
Nie implementuj jeszcze Leki/Wizyty/Finanse - tylko interfejs i ewentualny provider dla manualnych zadań.

## Testy krytyczne

- normalizacja elementu legacy,
- create -> read -> update -> delete w repository,
- `sourceRef` zachowuje referencję,
- query zakresu dat zwraca poprawne rekordy.

## Kryteria akceptacji

- istnieje wspólny model/kontrakt,
- model nie wymusza jednej tabeli dla wszystkich domen,
- istnieje repository abstraction,
- istnieje kontrakt provider/adapter Pulpitu,
- UI nie zależy od fizycznego storage,
- nie zaimplementowano jeszcze pełnego Pulpitu ani integracji modułów.

## Commit etapu
`feat(core): add shared organizer item model and repositories`


---

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


---

# OGARNIACZ - ETAP 4 - Zadania, terminy, przypomnienia i szybkie akcje

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

Doprowadź system zadań do użytecznej postaci i zintegruj go z Pulpitem, korzystając ze wspólnego modelu/repository z Etapu 2.

## Model zadania

Obsłuż:
- status OPEN/DONE,
- priorytet NORMAL/URGENT/ASAP,
- deadlineMode: AT_TIME / END_OF_DAY / NO_TIME,
- optional description,
- date/time,
- duration,
- recurrence,
- wiele reminders,
- sourceRef,
- created/updated/completed timestamps.

Nie dodawaj stanów tylko „na przyszłość”, jeśli nie są potrzebne.

## Zachowanie Pulpitu

- AT_TIME -> marker na osi,
- END_OF_DAY -> zadanie w sekcji bez godziny + logiczny deadline końca dnia,
- NO_TIME -> lista poza osią,
- ASAP -> najwyższa ekspozycja,
- overdue -> wyraźny stan niezależnie od wybranej daty,
- completed -> szybkie przeniesienie/zwinięcie zgodnie z settings.

## Sortowanie

Wydziel czystą logikę sortowania. Preferencja:
1. ASAP,
2. overdue / urgent,
3. najbliższy deadline/godzina,
4. pozostałe.

## CRUD i szczegóły

Dodaj:
- tworzenie,
- edycję,
- oznaczenie jako wykonane,
- usunięcie z potwierdzeniem zgodnym z aktualnym UX,
- panel/drawer szczegółów bez opuszczania Pulpitu.

Formularz ma obsługiwać podstawy bez przeładowania UI.

## Szybkie akcje

Co najmniej:
- wykonaj,
- jutro,
- wybierz datę,
- odłóż 15 min,
- odłóż 1 h,
- wieczór - zdefiniuj przez ustawienie lub bezpieczny domyślny czas, nie magiczny rozsiany po kodzie.

## Reminders

Wiele reminders per task. Logika momentu przypomnienia poza komponentami UI.
Nie implementuj pełnej platformowej infrastruktury push, jeśli jej jeszcze nie ma. Zbuduj model i lokalne obliczenia/obsługę zgodną z bieżącą aplikacją.

## Markery

Wprowadź wizualny język możliwy do późniejszego rozszerzenia:
- typ/moduł = obramowanie/ikona,
- priorytet/status = rdzeń/dot,
- urgency = glow,
- ASAP = opcjonalny efekt ognia.

Nie opieraj znaczenia wyłącznie na kolorze.

## Minimalne testy

- deadline dla trzech deadlineMode,
- overdue,
- reminder moment,
- sortowanie priorytetów,
- CRUD repository dla zadania.

## Kryteria akceptacji

- można utworzyć, edytować, wykonać, odłożyć i usunąć zadanie,
- trzy tryby terminu zachowują się poprawnie,
- zadania pojawiają się na osi lub poza nią zgodnie z trybem,
- drawer działa bez opuszczania Pulpitu,
- reminders i sortowanie są poza monolitycznym JSX.

## Commit etapu
`feat(tasks): add task workflow on pulpit`


---

# OGARNIACZ - ETAP 5 - Miniatury, crop i asset store

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

Przenieś najlepsze UX miniatur z Ultimate Pomagiera, ale NIE kopiuj przechowywania dużych Data URL w localStorage.

## AssetRepository

Jeśli aplikacja ma już magazyn plików/blobów, użyj go.
Jeśli nie, wprowadź mały `AssetRepository` możliwy do oparcia o IndexedDB/SQLite.

Rekord zadania przechowuje tylko `thumbnailAssetId`/`assetRef` i ewentualne metadane kadru, nie ciężki obraz inline.

## Wejście desktop

Obsłuż:
- wybór pliku,
- drag & drop,
- wklejenie obrazu ze schowka.

Formaty: JPEG, PNG, WEBP.
Dodaj rozsądny limit wejścia i wymiaru bazując na sprawdzonych wartościach z Pomagiera, ale dopasuj do istniejących utili.

## Źródło i podgląd

Zachowaj zoptymalizowaną wersję roboczą, aby użytkownik mógł później zmienić crop bez ponownego wybierania pliku.
Wygeneruj lekki preview do Pulpitu.

## Edytor

Obsłuż:
- 16:9,
- 4:3,
- 1:1,
- zoom,
- przesunięcie X,
- przesunięcie Y,
- reset,
- anuluj,
- zastosuj.

Ogranicz wartości crop/zoom do bezpiecznych zakresów.

## Pulpit

Miniatura pojawia się nad markerem tego samego zadania i otwiera jego szczegóły.
Ustawienie `show thumbnails on timeline` ma działać bez kasowania assetu.

## Bezpieczeństwo storage

- waliduj MIME/typ,
- nie ufaj Data URL z legacy bez sprawdzenia,
- nie zapisuj obrazów w Settings/localStorage,
- usunięcie zadania powinno mieć przemyślaną politykę cleanup assetu, bez kasowania współdzielonego assetu.

## Testy

Tylko:
- clamp crop/zoom,
- zapis i odczyt asset metadata,
- odrzucenie nieobsługiwanego typu,
- task -> asset reference zachowuje się po reloadzie.

## Kryteria akceptacji

- plik/drop/paste działa,
- crop jest ponownie edytowalny,
- preview jest lekkie,
- Pulpit renderuje miniaturę przy markerze,
- żaden ciężki obraz nie trafia do localStorage.

## Commit etapu
`feat(assets): add task thumbnails and asset repository`


---

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


---

# OGARNIACZ - ETAP 7 - Kafelki Pulpitu i inteligentny miks alertów

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

Rozszerz Pulpit tak, aby nie był ograniczony do wybranej daty osi. Kafelki mogą prezentować dane nadchodzące lub zaległe z różnych modułów.

## Widget config

Wprowadź wersjonowaną konfigurację kafelków, np. odpowiednik:
- id,
- type,
- visible,
- order,
- size: small/medium/large,
- timeRange: today/3d/7d/30d/custom,
- limit,
- module/options.

Dopasuj model do obecnych settings. Nie wdrażaj drag & drop, jeśli nie jest potrzebny. Na start wystarczy w Ustawienia -> Pulpit:
- włącz/wyłącz,
- kolejność,
- zakres czasu,
- limit,
- wielkość, jeśli layout jest na to gotowy.

## Kafelki bazowe

Przygotuj co najmniej technicznie:
- Zadania,
- Pilne/Zaległe,
- Wizyty,
- Leki,
- Finanse,
- Samochód,
- Zakupy,
- Poczekalnia,
- Notatki.

Jeśli moduł nie ma jeszcze providera, pokaż neutralny empty state, ale nie twórz fikcyjnych danych.

## Inteligentny miks alertów

Pierwsza wersja ma używać jawnego rankingu, NIE AI.

Priorytet przykładowy:
1. overdue,
2. ASAP/krytyczne,
3. bliskie czasowo i wymagające działania,
4. modułowe warningi,
5. inne ważne.

Domyślnie pokaż 3-5 alertów; reszta w rozwinięciu lub widoku źródłowym.

Ranking powinien być funkcją/serwisem, a nie if-ami rozrzuconymi po JSX.
Każdy alert ma `sourceRef` i akcję otwierającą rekord źródłowy.

## Zakresy czasu

Kafelki nie dziedziczą automatycznie daty osi. Np. oś może być „dzisiaj”, a kafelek samochodu może pokazywać termin za 42 dni.

## Testy

- kolejność widgetów,
- timeRange query,
- ranking kilku reprezentatywnych alertów,
- limit 3-5,
- brak provider -> empty state bez crasha.

## Kryteria akceptacji

- kafelki mają niezależne zakresy,
- ustawienia widoczności/kolejności działają,
- smart alerts są ograniczone i przewidywalne,
- nie ma AI ani losowego rankingu,
- kliknięcie prowadzi do źródła.

## Commit etapu
`feat(pulpit): add configurable widgets and smart alerts`


---

# OGARNIACZ - ETAP 8A - Integracja modułów Leki i Wizyty z Pulpitem

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

Podłącz istniejące moduły **Leki** i **Wizyty** do wspólnego kontraktu Pulpitu. Jeśli któregoś modułu jeszcze nie ma, zbuduj tylko minimalną domenę potrzebną do integracji, bez rozbudowywania całego produktu poza specyfikację.

## Zasada

Moduły pozostają źródłem prawdy. Pulpit otrzymuje reprezentację przez adapter/provider i `sourceRef`.
Nie kopiuj rekordów modułu do tabeli Pulpitu.

## Leki

Pulpit powinien móc otrzymać:
- dawkę z konkretną datą/godziną jako marker osi,
- status przyjęcia/oczekuje,
- następne przypomnienie,
- kafelek „następna dawka” / „dzisiejsze dawki”,
- alert tylko dla rzeczy wymagających uwagi zgodnie z obecną logiką modułu.

Kliknięcie otwiera dane źródłowe leku/dawki.

## Wizyty

Pulpit powinien otrzymać:
- termin wizyty,
- czas trwania, jeśli istnieje,
- przypomnienia,
- ewentualny czas przygotowania/dojazdu jako metadane, jeśli model to już obsługuje,
- kafelek „najbliższa wizyta” / zakres 30 dni.

Kliknięcie otwiera źródłową wizytę.

## Nie robić

- nie twórz drugiego CRUD leków w Pulpicie,
- nie twórz kopii wizyty tylko po to, by ją pokazać,
- nie rozszerzaj teraz Finanse/Samochód.

## Testy

- provider zwraca elementy z właściwą datą/godziną,
- `sourceRef` prowadzi do właściwego rekordu,
- zmiana rekordu źródłowego zmienia reprezentację po ponownym query,
- brak duplikatu w storage Pulpitu.

## Kryteria akceptacji

- Leki i Wizyty pojawiają się na osi/kafelkach zgodnie z datą,
- źródłem prawdy pozostają moduły,
- szczegóły są otwierane przez sourceRef,
- istniejący CRUD modułów nie został zepsuty.

## Commit etapu
`feat(pulpit): integrate medications and appointments`


---

# OGARNIACZ - ETAP 8B - Integracja Finanse, Samochód i Zakupy

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

Podłącz kolejne moduły do Pulpitu przez adaptery/provider. Nie duplikuj danych.

## Finanse

Do Pulpitu wystawiaj tylko rzeczy użyteczne czasowo lub alertowo:
- płatności cykliczne,
- subskrypcje,
- terminy płatności,
- zaległe płatności,
- alert budżetu 90-95%, jeśli mechanizm budżetu już istnieje.

Nie pokazuj każdego wydatku jako marker na osi tylko dlatego, że ma timestamp.

Kafelki: np. płatności 7/30 dni, najbliższe obciążenie, stan budżetu.

## Samochód

Wspieraj na Pulpicie:
- koniec polisy,
- przegląd,
- wymiana oleju,
- zaplanowany serwis,
- przypomnienia przebiegowe, jeśli model potrafi je przeliczać.

Terminy samochodu mogą pojawiać się z większym wyprzedzeniem niż typowy tydzień.
Kafelek powinien umieć pokazać najbliższy istotny termin.

## Zakupy

Nie wrzucaj każdej pozycji listy na oś.
Pulpit pokazuje:
- aktywną listę/listy,
- liczbę pozycji,
- ewentualny termin, jeśli konkretna lista/zakup ma datę/godzinę.

## Alert ranking

Dostarcz modułowe severity/urgency w sposób, który może wykorzystać SmartAlerts, zamiast hardcodować ich priorytet w UI.

## Testy

- provider finansów wybiera terminy, nie każdy wydatek,
- samochód zwraca najbliższy termin,
- zakupy bez daty nie trafiają na oś,
- sourceRef dla każdego modułu.

## Kryteria akceptacji

- trzy moduły dostarczają kafelki/alerty/zdarzenia przez wspólny kontrakt,
- nie powstały duplikaty rekordów,
- Pulpit obsługuje przyszłe horyzonty > 7 dni.

## Commit etapu
`feat(pulpit): integrate finance car and shopping modules`


---

# OGARNIACZ - ETAP 8C - Integracja Notatki, Poczekalnia i Planer

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

Dokończ pierwszą falę integracji Pulpitu dla Notatek, Poczekalni i Planera dnia.

## Notatki

Domyślnie notatka nie jest wydarzeniem osi czasu.
Pulpit może pokazywać:
- ostatnie notatki,
- dzisiejszą notatkę,
- przypięte notatki.

Na oś trafia tylko notatka, która ma jawnie przypisaną datę/godzinę lub została powiązana z elementem czasowym.

## Poczekalnia

Pulpit pokazuje:
- licznik nieprzetworzonych elementów,
- opcjonalnie kilka najstarszych/najważniejszych,
- alert, jeśli elementy przekroczą zdefiniowany próg wieku lub priorytetu.

Nie wrzucaj całej Poczekalni na oś.

## Planer dnia

Planer musi wykorzystywać dostępność planistyczną z Etapu 3:
- praca jako osobny kontekst,
- dojazd samochodem domyślnie częściowa dostępność,
- pełny override na dany dzień,
- day-specific exceptions.

Planer proponuje bloki, ale nie zapisuje ich bez zatwierdzenia użytkownika.
Po zatwierdzeniu blok może stać się elementem planu/zadaniem zgodnie z aktualnym modelem.

Nie wdrażaj teraz „magicznej AI optymalizacji”. Zacznij od deterministycznych reguł i istniejących priorytetów/czasu trwania.

## Testy

- notatka bez czasu nie pojawia się na osi,
- Poczekalnia daje licznik bez duplikacji,
- planer nie planuje zwykłego zadania w częściowo dostępnym dojeździe,
- override pełnej dostępności zmienia możliwość planowania,
- plan zapisuje się dopiero po zatwierdzeniu.

## Kryteria akceptacji

- Notatki/Poczekalnia są użyteczne na Pulpicie bez zaśmiecania osi,
- Planer respektuje pracę/dojazdy/dostępność,
- użytkownik zatwierdza propozycje przed zapisem.

## Commit etapu
`feat(pulpit): integrate notes inbox and planner`


---

# OGARNIACZ - ETAP 9 - Backup, migracje, import/eksport i historia

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

Po ustabilizowaniu lokalnej warstwy danych dodaj mechanizmy ochrony danych inspirowane Ultimate Pomagierem, ale działające nad rzeczywistymi repozytoriami Ogarniacza.

## Backup kategorii

Zaprojektuj format backupu z manifestem zawierającym co najmniej:
- formatVersion,
- createdAt,
- appVersion,
- sections,
- recordCounts,
- schemaVersions,
- checksum.

Kategorie zależnie od istniejących modułów:
- settings,
- tasks/core items,
- notes/inbox,
- medications/appointments,
- finance,
- car,
- shopping,
- asset metadata/assets, jeśli rozsądne.

Nie umieszczaj sekretów sesyjnych ani tokenów logowania.

## Przywracanie

Przed restore:
1. waliduj JSON/format/checksum,
2. sprawdź kompatybilność wersji,
3. utwórz automatyczny backup „before restore”,
4. dopiero potem przywracaj.

Jeżeli restore jest częściowy, nie niszcz sekcji nieobjętych operacją.

## Import/eksport ustawień

Dodaj osobny lekki JSON settings z wersją i normalizacją.
Błędny plik nie może uszkodzić zapisanych settings.

## Migracje

Wprowadź prosty mechanizm migracji schematów tylko tam, gdzie rzeczywiście istnieją co najmniej dwie wersje danych.
Nie buduj frameworka migracyjnego na wyrost.

## Historia zmian

Dla obszarów, gdzie jest to potrzebne, zapisuj przede wszystkim:
- entityId,
- czas,
- zmienione pola przed/po,
- typ operacji.

Nie zapisuj pełnych snapshotów dużych obiektów przy każdej drobnej zmianie bez potrzeby.
Ważne dane finansowe i zdrowotne nie powinny być automatycznie kasowane przez ogólny cleanup historii.

## Testy krytyczne

- checksum/manifest validation,
- corrupted backup rejected,
- pre-restore backup powstaje,
- restore selected category,
- import settings wrong version/data -> bez utraty obecnych ustawień.

## Kryteria akceptacji

- backup i restore działają nad repozytoriami, nie listą kluczy localStorage,
- jest manifest i checksum,
- restore jest poprzedzony kopią,
- ustawienia mają bezpieczny import/export,
- migracje są jawne i minimalne.

## Commit etapu
`feat(data): add versioned backup migration and history support`


---

# OGARNIACZ - ETAP 10 - Responsywność, dostępność i końcowa stabilizacja pierwszej fali

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

Doprowadź pierwszą falę Pulpitu do stabilnego stanu desktop/PWA i przygotuj architekturę pod późniejszy Android, bez budowania od nowa aplikacji mobilnej.

## Responsywność

Sprawdź praktycznie:
- szeroki desktop,
- zwykły laptop,
- wąskie okno,
- szerokość telefonu/PWA.

Na małym ekranie:
- menu może się chować,
- Pulpit nie może wymagać poziomego przewijania całej strony,
- oś czasu może przejść w uproszczony wariant, ale zachowuje dane,
- drawer/formularze muszą być obsługiwalne dotykiem,
- globalny „+” pozostaje łatwo dostępny.

## Dostępność

Dopilnuj:
- `prefers-reduced-motion` + ustawienie użytkownika,
- fokus klawiatury,
- czytelne etykiety i aria tam, gdzie potrzebne,
- statusy nie są kodowane tylko kolorem,
- tooltip nie jest jedynym sposobem poznania informacji.

## Stabilizacja architektury

Sprawdź tylko krytyczne miejsca:
- czy Pulpit nie stał się monolitem,
- czy moduły nie duplikują rekordów,
- czy UI nie omija repository,
- czy żadne ciężkie obrazy nie trafiają do localStorage,
- czy legacy „Dzisiaj” nie wróciło do widocznego UI jako nazwa ekranu.

Nie wykonuj pełnego wielodniowego audytu. Jeśli znajdziesz problem spoza zakresu, odnotuj go zamiast refaktoryzować cały projekt.

## Smoke/E2E - tylko główne ścieżki

Jeśli repo ma E2E, dodaj/utrzymaj maksymalnie kilka scenariuszy:
1. otwarcie Pulpitu i zmiana daty,
2. utworzenie zadania -> marker/lista -> wykonanie,
3. QuickAdd parser -> ręczna korekta -> zapis,
4. zmiana harmonogramu tylko na dziś,
5. widget/alert otwiera rekord źródłowy,
6. miniatura przeżywa reload.

Jeśli repo nie ma E2E, nie wdrażaj ciężkiego frameworka tylko dla tego etapu. Wykonaj ręczny smoke + testy istniejącej infrastruktury.

## Dokumentacja

Zaktualizuj krótką dokumentację architektury/README tylko w miejscach, które pomogą kolejnym etapom:
- Pulpit jako ekran główny,
- provider/module adapter,
- repository,
- asset store,
- settings/schedule,
- QuickAdd parser extension point.

## Kryteria akceptacji

- pierwsza fala jest używalna na desktopie i w wąskim widoku,
- kluczowe ścieżki przechodzą smoke,
- nie ma krytycznych regresji danych,
- architektura pozostaje gotowa pod dalsze moduły, sync i Android.

## Commit etapu
`chore(app): stabilize pulpit first-wave implementation`
