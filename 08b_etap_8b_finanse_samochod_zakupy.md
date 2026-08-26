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
