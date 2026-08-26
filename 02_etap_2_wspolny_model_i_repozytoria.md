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
