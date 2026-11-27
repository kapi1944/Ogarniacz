# Ogarniacz — Instrukcja projektu

## Zasada nadrzędna
Dobieraj najlepsze rozwiązanie techniczne. Minimalizuj zakres zmian, ale nie kosztem jakości, poprawności i utrzymywalności.

## Skrót zasad
1. Zewnętrzne API, SDK i usługi chmurowe są dozwolone, jeśli dają istotną przewagę funkcjonalną, jakościową lub kosztową. Szczegóły: `API.md`.
2. Biblioteki są dozwolone, jeśli są aktywnie utrzymywane i rozwiązują problem lepiej niż własny kod.
3. Architekturę można refaktoryzować, jeśli realnie utrudnia rozwój. Szczegóły: `ARCHITECTURE.md`.
4. Model danych można zmieniać — zawsze z migracją. Szczegóły: `DATA.md`.
5. Zmieniaj wszystkie moduły niezbędne do kompletnego rozwiązania, nie tylko „wskazany”.
6. Testy proporcjonalne do ryzyka. Szczegóły: `TESTING.md`.
7. Sekrety nigdy nie trafiają do repo ani frontendu. Szczegóły: `SECURITY.md`.
8. Local-first dla danych osobistych; cloud/API dla funkcji, które tego naturalnie wymagają.
9. Preferuj darmowe i lokalne, ale przedstaw płatną opcję, jeśli daje istotną przewagę. Bez zgody użytkownika — żadnych kosztów.
10. Najpierw rozpoznaj zakres zadania; plan i uzasadnienie dostosuj do jego złożoności. Dla prostych zmian nie twórz osobnej fazy planowania.

## Proporcjonalność pracy agenta

- Nazwy nowego kodu i komentarze zapisuj po polsku, z zachowaniem istniejących kontraktów bibliotek i transportu.
- Przed dodaniem mechanizmu znajdź jego istniejący odpowiednik; mapa wejścia to `ARCHITECTURE.md`, a dla Echo `ECHO.md`.
- Czytaj tylko dokumenty i kod potrzebne dla bieżącego zadania.
- Pełny audyt repo wykonuj tylko wtedy, gdy zadanie tego wymaga.
- Testuj najpierw zmieniony obszar. Pełną regresję uruchamiaj tylko przy zmianach przekrojowych, release albo gdy wąskie testy ujawnią problem.
- Nie dodawaj testów, które tylko odtwarzają implementację.
- Przy jednoznacznym i odwracalnym zadaniu działaj autonomicznie do kompletnego wyniku zamiast zatrzymywać się po planie.
- Nowe API, integracje, automatyzacje i AI wdrażaj wyłącznie w zakresie jawnego zlecenia. Dopuszczalność techniczna z `API.md` nie jest zgodą na integrację, koszt, publikację ani deploy.
- Zachowaj zastane zmiany użytkownika i prywatne kopie danych; nie zmieniaj historii Git ani nie publikuj bez odpowiedniego zlecenia.

## Git i GitHub

- `main` jest stabilną bazą projektu, a `rpi-stable` jest kanałem wdrożeń Raspberry Pi. `codex/*` służą zadaniom Codexa, `feat/*` nowym funkcjom, `fix/*` poprawkom, a `chore/*` utrzymaniu. Tagi oficjalnych wydań `v*` są niezmienne.
- Przed edycją w nowym, niezależnym zadaniu sprawdź stan worktree i aktualność `origin/main`. Domyślnie użyj `origin/main`. Inną bazę stosuj na polecenie użytkownika, przy kontynuacji istniejącego PR, zależności od niescalonej pracy lub wymaganiu projektu. Gdy sieć jest niedostępna, sprawdź zapisane referencje i oznacz ich aktualność jako niepotwierdzoną.
- Jedno zadanie prowadź na jednej właściwej gałęzi. Przed jej utworzeniem poszukaj istniejącej gałęzi, PR lub już zintegrowanego rozwiązania. Jeżeli przełączenie grozi naruszeniem cudzej pracy, użyj osobnego worktree. Stosuj kroki z [istniejącego skilla Git](../.agents/skills/ogarniacz-github-workflow/SKILL.md).
- Commituj powiązane zmiany z czytelnym opisem. Pomijaj dane użytkownika, artefakty kompilacji i pliki spoza zadania. Kieruj PR do jawnie wskazanej bazy, zwykle `main`. Zmiany do `rpi-stable` przechodzą wyłącznie zatwierdzonym procesem publikacji.
- Preferuj PR dla zmian w `main`. Po zatwierdzonym scaleniu sprawdź CI i obecność kodu w gałęzi docelowej. Przed usunięciem gałęzi sprawdź historię PR, zależności i użycie przez worktree. Squash oceniaj po treści. Zachowaj gałąź, jeśli występują nierozstrzygnięte różnice lub nadal jej używasz.

Kontrola lokalna `node scripts/check-git-workflow.mjs` pokazuje bieżącą gałąź, worktree, stan plików i rozbieżności. Użyj `--nowe-zadanie` dla niezależnej pracy. Ostrzeżenia pozostawiają kod wyjścia `0`. Kod `1` sygnalizuje błąd wywołania lub odczytu Gita.

### GitHub Desktop

1. Potwierdź katalog repozytorium przez **Repository → Show in Explorer**. Codex może pracować w innym worktree. Gdy lokalne zmiany są zabezpieczone, wybierz **Fetch origin** i przejdź na `main`.
2. **Ahead** oznacza lokalne commity bez odpowiedników SHA w upstreamie. **Behind** oznacza commity dostępne w upstreamie. Na czystej gałęzi możesz użyć **Pull origin**, gdy gałąź jest wyłącznie `behind` i ma podążać za upstreamem. Jeżeli oba liczniki są dodatnie, najpierw sprawdź, które zmiany są unikalne.
3. Po squashu porównaj wynik PR z `main`. Nie wykonuj **Merge** starego `codex/*` tylko z powodu liczników. Gdy PR jest scalony, CI zielone i potwierdzono obecność zmian w bazie, sprawdź worktree oraz zależności, zapisz SHA i usuń wyłącznie nieużywaną gałąź.

## Nienegocjowalne
- Brak sekretów w repo i froncie.
- Brak regresji danych użytkownika.
- Brak obniżania `versionCode`.
- Brak publikacji release z niewyjaśnioną regresją.
- Brak destrukcyjnych operacji bez backupu.
- Brak ukrytych kosztów i ukrytego wysyłania danych.
