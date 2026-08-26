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
