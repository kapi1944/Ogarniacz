# Testowanie

## Pełna bramka jakości

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Zakres testów jednostkowych

- zadania: tworzenie, wykonanie, termin dzisiejszy, zaległość, recurrence;
- leki: generowanie dawek, status i jeden bieżący wpis na wystąpienie;
- reminder engine: absolutne, względne, cykliczne i snooze;
- planer: praca, twarde bloki, limit 75%, priorytet, brak estymacji;
- nawyki: częstotliwości, minimalna wersja i historia;
- backup: eksport, import oraz odrzucenie błędnej wersji;
- permission engine: Właściciel, Edytor, read, edit i brak uprawnień.

Testy działają w Vitest + jsdom. `fake-indexeddb` zapewnia prawdziwe zachowanie API IndexedDB bez przeglądarki.

## Ręczny smoke test

1. Uruchom `npm run dev`.
2. Dodaj element globalnym „+” i odśwież stronę.
3. Sprawdź routing, back/forward i odświeżenie podstrony.
4. W Ustawieniach wczytaj dane demonstracyjne do pustej bazy.
5. Przetwórz element Skrzynki.
6. Wykonaj zadanie cykliczne i sprawdź nowe wystąpienie.
7. Zmień status dawki, odśwież i zmień go ponownie.
8. Wygeneruj plan, przesuń jeden blok i zaakceptuj.
9. Wykonaj backup, import przez scalanie i import przez nadpisanie.
10. Utwórz Edytora, nadaj read/edit i uruchom lokalny podgląd.
11. Sprawdź jasny i ciemny motyw oraz szerokości 1920, 1366, wąski desktop i mobile.
