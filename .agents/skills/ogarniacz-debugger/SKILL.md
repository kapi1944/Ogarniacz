---
name: ogarniacz-debugger
description: Diagnozuj i naprawiaj konkretne błędy oraz regresje Ogarniacza na podstawie odtworzenia, logów i testów. Używaj przy awarii lub nieprawidłowym zachowaniu; nie uruchamiaj pełnego audytu repozytorium ani rozwoju nowych funkcji.
---

# Diagnoza błędu Ogarniacza

## Aktywacja

Użyj dla zgłoszonego błędu, nieudanego testu lub regresji w konkretnym przepływie. Przy zleceniu samej diagnozy zakończ na ustaleniach, bez wdrażania poprawki.

## Wykonanie

1. Ustal objaw, oczekiwany wynik, kroki i środowisko: przeglądarka/PWA, Android albo backend. Wykorzystaj dostępne logi i wyniki; pytaj tylko o brakujące dane konieczne do dalszej diagnozy.
2. Odtwórz problem na danych syntetycznych lub przygotuj minimalny test. Ogranicz odczyt do punktu awarii, jego wywołań i najbliższych testów. W [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) sprawdź właściwą granicę UI, serwisu i repozytorium.
3. Śledź rzeczywisty przepływ od dotkniętego pliku w [src/modules](../../../src/modules/) lub [src/components](../../../src/components/) przez [src/hooks](../../../src/hooks/), [src/services](../../../src/services/) do [src/data](../../../src/data/), tylko gdy prowadzą tam dowody. Dla pól zacznij od [POLA_FORMULARZY.md](../../../docs/POLA_FORMULARZY.md). Szczegóły platformy i dokumenty zasad dobierz z [AGENTS.md](../../../AGENTS.md) przy przekroczeniu tej granicy.
4. Oddziel potwierdzoną przyczynę od hipotezy. Jeśli naprawa jest zlecona, usuń przyczynę w istniejącym mechanizmie. Gdy test daje istotną ochronę, pokaż odtworzenie błędu przed poprawką i sukces po niej; nie zmieniaj oczekiwań wyłącznie po to, by test przeszedł.
5. Dobierz kontrole według [TESTING.md](../../../docs/TESTING.md) i `ogarniacz-test-selector`. Przy danych, kontach, backupie lub synchronizacji uwzględnij wymagane testy ich kontraktów. Poszerz diagnozę, gdy konkretne wyniki wskazują zależny obszar.

## Granice

Nie kasuj danych użytkownika dla uzyskania czystej reprodukcji ani nie ukrywaj błędu wyłączeniem kontroli. Nie ujawniaj sekretów i prywatnych danych w logach. Nie rozszerzaj lokalnej diagnozy do audytu lub refaktoru niezwiązanych części. Test lokalny nie dowodzi poprawności fizycznego urządzenia, sesji backendowej ani produkcji; naprawa nie upoważnia do wdrożenia.

## Zakończenie

Raport opisuje objaw, dowody przyczyny, zakres poprawki i wyniki weryfikacji. Jeśli problemu nie odtworzono lub przyczyna pozostaje niepewna, podaj ustalenia, ograniczenie i najmniejszy kolejny krok; nie oznaczaj błędu jako naprawionego.
