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
