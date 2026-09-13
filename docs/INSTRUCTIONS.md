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
10. Najpierw diagnoza i plan, potem zmiana. Uzasadniaj wybór rozwiązania.

## Nienegocjowalne
- Brak sekretów w repo i froncie.
- Brak regresji danych użytkownika.
- Brak obniżania `versionCode`.
- Brak publikacji release z niewyjaśnioną regresją.
- Brak destrukcyjnych operacji bez backupu.
- Brak ukrytych kosztów i ukrytego wysyłania danych.
