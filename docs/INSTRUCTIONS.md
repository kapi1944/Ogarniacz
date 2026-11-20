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

## Nienegocjowalne
- Brak sekretów w repo i froncie.
- Brak regresji danych użytkownika.
- Brak obniżania `versionCode`.
- Brak publikacji release z niewyjaśnioną regresją.
- Brak destrukcyjnych operacji bez backupu.
- Brak ukrytych kosztów i ukrytego wysyłania danych.
