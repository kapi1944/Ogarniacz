---
name: ogarniacz-ui-design-system
description: Dopasowuj interfejs Ogarniacza do istniejących komponentów, stylów, motywów i responsywności. Używaj przy zmianach wyglądu, układu, stanów kontrolek i dostępności; logikę wartości formularzy prowadź przez skill formularzy.
---

# Spójny interfejs Ogarniacza

## Aktywacja

Użyj przy tworzeniu lub poprawie widoku, stylów komponentu, motywu, responsywności albo dostępności. Dla parserów i zapisu wartości wybierz `ogarniacz-smart-forms`; oba skille stosuj, gdy zadanie obejmuje obie warstwy.

## Wykonanie

1. Odczytaj wymagania zadania, właściwy widok i jego style. Z [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) wykorzystaj podział UI; nie analizuj niezwiązanych modułów.
2. Sprawdź używane tokeny i klasy w [glowny.css](../../../src/styles/glowny.css), istniejące komponenty w [src/components](../../../src/components/) i najbliższy podobny widok w [src/modules](../../../src/modules/). Przy zmianie układu aplikacji punktem odniesienia jest [UkladAplikacji.tsx](../../../src/app/UkladAplikacji.tsx).
3. Wykorzystaj istniejący wzorzec i tokeny. Umieść zmianę lokalnie, chyba że przyczyna dotyczy współdzielonego elementu. Dla kontrolek zachowaj kontrakty opisane w [POLA_FORMULARZY.md](../../../docs/POLA_FORMULARZY.md). Nie twórz nowego systemu stylów do pojedynczego widoku.
4. Sprawdź wynik w działającym UI: istotne stany, jasny i ciemny motyw, odpowiednie szerokości z [TESTING.md](../../../docs/TESTING.md), długie polskie etykiety i brak przepełnienia. Dla interakcji sprawdź klawiaturę, widoczny fokus, etykiety i czytelność kontrastu. Dobierz kontrole do zmienianego elementu.
5. Uruchom odpowiednie kontrole lokalne; regresję poszerz przy zmianie współdzielonych tokenów lub komponentów. Przy braku działającego podglądu zgłoś ograniczenie, zamiast przedstawiać analizę CSS jako potwierdzenie wyglądu.

## Granice

Nie zmieniaj logiki domenowej ani danych w zadaniu dotyczącym wyglądu. Zachowaj istniejące ustawienia personalizacji i używaj polskich etykiet. Refaktoryzację uzasadniaj przyczyną zgodnie z `ARCHITECTURE.md`; skill nie wprowadza globalnego zakazu refaktoru. Stosuj hierarchię z [AGENTS.md](../../../AGENTS.md).

## Zakończenie

Widok korzysta z istniejących komponentów i stylów oraz ma zweryfikowane istotne stany i rozmiary. Raport wskazuje obejrzane warianty, wykonane kontrole i ewentualne ograniczenia podglądu lub urządzenia.
