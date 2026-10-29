---
name: ogarniacz-module-builder
description: Dodawaj i rozwijaj moduły funkcjonalne Ogarniacza w istniejących warstwach UI, hooków, serwisów, modeli i repozytoriów. Używaj dla nowej funkcji lub przepływu obejmującego te warstwy, nie dla samej kosmetyki albo diagnozy błędu.
---

# Rozwój modułu Ogarniacza

## Aktywacja

Użyj przy nowym module lub rozbudowie funkcji wymagającej połączenia widoku, logiki i danych. Samą diagnozę prowadzi `ogarniacz-debugger`, a lokalne zmiany wyglądu — `ogarniacz-ui-design-system`.

## Wykonanie

1. Ustal zachowanie i kryteria zadania. Odczytaj [INSTRUCTIONS.md](../../../docs/INSTRUCTIONS.md), właściwe części [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) i dokumenty zasad potrzebne dla dotkniętych kontraktów, wskazane w [AGENTS.md](../../../AGENTS.md).
2. Znajdź najbliższy istniejący przepływ w [src/modules](../../../src/modules/). Prześledź tylko jego połączenia do [hooków](../../../src/hooks/useRepozytorium.ts), [serwisów](../../../src/services/), [modeli](../../../src/domain/) i [Repozytorium](../../../src/data/Repozytorium.ts). Potwierdź bieżącą implementację; nie traktuj historycznych wersji schematu z dokumentacji jako aktualnego stanu bazy.
3. Rozszerz istniejące modele, publiczne serwisy i repozytoria. Zachowaj przepływ zapisu i odczytu opisany w architekturze. Użyj istniejących formularzy i wzorców UI; odpowiednie skille dobieraj wyłącznie dla wykonywanej części zadania.
4. Jeśli funkcja zmienia model, uprawnienia, backup lub synchronizację, sprawdź odpowiednie dokumenty zasad i bezpośrednie zależności przed edycją. Zapewnij wymaganą migrację i regresję. Migracja modułu do Rejestru wymaga osobnego GO opisanego w `ARCHITECTURE.md`; samo dodanie funkcji nie jest takim GO.
5. Zaimplementuj najmniejszy kompletny przepływ i dobierz weryfikację według [TESTING.md](../../../docs/TESTING.md). Dokumentację aktualizuj tylko tam, gdzie zmienia się rzeczywisty kontrakt lub obsługa funkcji.

## Granice

Nie twórz równoległego magazynu danych, drugiego źródła prawdy ani abstrakcji bez realnego zastosowania. Refaktor może obejmować zależne moduły, jeśli jest konieczny dla kompletnego rozwiązania; nie wykonuj porządków poza zadaniem. Nowe integracje i działania zewnętrzne wymagają odpowiedniego zakresu zlecenia. Implementacja nie upoważnia do publikacji ani wdrożenia.

## Zakończenie

Funkcja działa przez istniejące warstwy, zachowuje dotychczasowe dane i ma potwierdzone kryteria zadania. Raport podaje użyte mechanizmy, wykonane testy oraz ograniczenia; brakujące wymagane kontrole nie są przedstawiane jako ukończona akceptacja.
