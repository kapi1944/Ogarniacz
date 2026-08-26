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
