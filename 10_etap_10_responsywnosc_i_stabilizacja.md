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
