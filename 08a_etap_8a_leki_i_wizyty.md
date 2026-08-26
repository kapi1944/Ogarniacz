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
