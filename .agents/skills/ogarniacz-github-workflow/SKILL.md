---
name: ogarniacz-github-workflow
description: Sprawdź bazę nowego zadania Ogarniacza, chroń istniejące worktree i obsługuj commit, push, PR, CI oraz porządkowanie gałęzi. Publikacja i wdrożenie wymagają osobnego zlecenia.
---

# Git i GitHub Ogarniacza

Stosuj [zasady pracy z Git](../../../docs/INSTRUCTIONS.md#git-i-github) przy rozpoczynaniu edycji oraz przy zadaniach dotyczących commita, pushu, PR, CI lub porządkowania gałęzi.

## Start

1. Sprawdź repozytorium i remote. Jeśli zadanie wymaga aktualnej bazy i masz dostęp do origin, wykonaj `git fetch origin`. Następnie sprawdź `git status --porcelain=v1 -b`, `git branch -vv` i `git worktree list`. `node scripts/check-git-workflow.mjs --nowe-zadanie` porównuje zapisane referencje bez sieci. Offline oznacz świeżość bazy jako niepotwierdzoną.
2. Dla nowego zadania użyj zweryfikowanego `origin/main` lub uzasadnionej bazy z instrukcji. Sprawdź istniejące gałęzie, PR i zakres już wykonanej pracy. Przy nowej gałęzi wskaż bazę jawnie, np. ``git switch --no-track -c <gałąź> origin/main``. Ustaw upstream na odpowiadającą jej gałąź przy pierwszym pushu.
3. Przy detached HEAD, rozbieżności ahead/behind, starej bazie lub niezacommitowanych zmianach sprawdź, co jest unikalne i czy trwa merge lub rebase. Jeśli zadanie zaczęło się na starej gałęzi, zachowaj wykonaną pracę i użyj osobnego worktree z właściwej bazy przed przeniesieniem wyłącznie zmian zadania. Przy konflikcie lub nieudanym merge zachowaj dane i ustal stan rozpoczętej operacji. Nie resetuj, nie używaj domyślnie stashu i nie przerywaj operacji rozpoczętych przez użytkownika.

## Commit, PR i zakończenie

1. Dobierz weryfikację według [TESTING.md](../../../docs/TESTING.md) i skilla `ogarniacz-test-selector`. Przy zleconym commicie sprawdź pełny diff oraz `git diff --cached --check`. Dodaj tylko pliki zadania i zapisz SHA.
2. Wykonuj push, utworzenie i scalenie PR w granicach zlecenia. Przy odrzuceniu pushu sprawdź przyczynę. Przed PR potwierdź jawną bazę, diff, testy i brak duplikatu. Przy scalaniu zachowaj strategię repozytorium.
3. Sprawdź istniejące CI dla dokładnego SHA i zdarzenia. Raportuj sukces, błąd, oczekiwanie lub brak uruchomienia. Po scaleniu potwierdź kod w gałęzi docelowej. W przypadku squasha porównaj treść z PR i kolejnymi zmianami w bazie. Przed usunięciem zbędnej gałęzi zapisz SHA i sprawdź PR, CI, upstreamy, worktree oraz wykorzystanie w workflow. Zachowaj gałąź przy nierozstrzygniętych zmianach.
4. Raportuj wynik pushu, PR i CI oraz końcowy stan katalogu. Operacje Git i kontrole CI nie upoważniają do publikacji, tagowania, aktualizacji `rpi-stable` ani wdrożenia.
