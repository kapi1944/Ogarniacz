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
