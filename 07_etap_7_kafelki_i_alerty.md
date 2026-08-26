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
