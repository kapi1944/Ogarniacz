---
name: ogarniacz-test-selector
description: Dobieraj i wykonuj testy zmian Ogarniacza według ryzyka oraz zależności. Używaj przy ustalaniu zakresu weryfikacji lub sprawdzaniu poprawki; samo użycie skilla nie oznacza pełnej regresji ani release.
---

# Dobór testów Ogarniacza

## Aktywacja

Użyj, gdy zadanie wymaga wyboru testów, weryfikacji zmiany albo ustalenia bramki przed zatwierdzeniem. Przy błędzie wymagającym diagnozy dobierz także `ogarniacz-debugger`.

## Wykonanie

1. Ustal zakres z zadania i diffu. Rozróżnij dokumentację, lokalną zmianę zachowania, zmianę przekrojową i release.
2. Odczytaj [strategię testów](../../../docs/TESTING.md). W [package.json](../../../package.json) sprawdź dostępne skrypty i sposób przekazywania filtrów. Znajdź najbliższe testy zmienianego obszaru, zamiast czytać wszystkie zestawy. Przykłady: [testy pól](../../../src/components/PoleLiczbowe.test.tsx), [repozytorium](../../../src/data/Repozytorium.test.ts), [konfiguracja środowiska](../../../src/testy/konfiguracja.ts).
3. Zacznij od testu zachowania i jego bezpośrednich zależności. Dodaj lint, kontrolę typów, build lub smoke PWA, gdy zmiana dotyka ich kontraktów. Dla samych instrukcji skilli sprawdź metadane, odwołania i format; nie uruchamiaj testów aplikacji bez przyczyny.
4. Zmiana modelu danych wymaga testu migracji na reprezentatywnym stanie sprzed zmiany. Dla bezpieczeństwa, synchronizacji oraz pozostałych modułów wrażliwych z `TESTING.md` uwzględnij wymagane regresje, także na granicach modułów. Szczegóły dobieraj z dokumentów zasad wskazanych w [AGENTS.md](../../../AGENTS.md).
5. Przy zmianie przekrojowej lub release zastosuj właściwą bramkę regresji z `TESTING.md`. Poszerz weryfikację również wtedy, gdy wąskie testy ujawnią szerszy problem. Zapisz polecenia, wyniki i ograniczenia środowiska.

## Granice

Nie wyłączaj testów ani nie zawężaj zakresu kosztem wymaganych kontroli bezpieczeństwa, migracji lub synchronizacji. Nie dodawaj testów odtwarzających samą implementację. Weryfikacja nie upoważnia do publikacji ani wdrożenia. Wynik automatyczny nie potwierdza testu fizycznego urządzenia lub produkcji.

## Zakończenie

Zakres weryfikacji ma krótkie uzasadnienie ryzykiem; wymagane kontrole zakończyły się powodzeniem albo mają jawnie opisany problem. Raport rozdziela wyniki lokalne, CI i ręczne oraz wymienia niewykonane kontrole. Nie ogłaszaj pełnej akceptacji przy brakującym wymaganym teście.
