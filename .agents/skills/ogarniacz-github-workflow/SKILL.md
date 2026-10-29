---
name: ogarniacz-github-workflow
description: Obsługuj Git i GitHub Ogarniacza przy sprawdzaniu gałęzi, przygotowaniu commita, autoryzowanym pushu lub PR oraz odczycie CI dla SHA. Nie traktuj tego procesu jako zgody na publikację APK, aktualizację Raspberry Pi ani deploy.
---

# Git i GitHub Ogarniacza

## Aktywacja

Użyj przy zadaniu dotyczącym historii Git, gałęzi, commita, pushu, PR lub statusu CI. Sama lokalna edycja pliku nie wymaga tego skilla.

## Wykonanie

1. Sprawdź repozytorium, gałąź, remote, status i indeks. Zachowaj zastane zmiany; nie dołączaj ich do własnego commita. Gdy zadanie wymaga aktualnego `main`, pobierz referencję i sprawdź relację historii przed integracją. Nie rozwiązuj rozbieżności przez nadpisanie pracy użytkownika.
2. Ustal dozwolone działania z bieżącego polecenia: commit, push, PR i release są osobnymi operacjami. Istniejąca wyraźna zgoda nie wymaga ponownego potwierdzenia. Dobierz weryfikację według [TESTING.md](../../../docs/TESTING.md) i `ogarniacz-test-selector`.
3. Przy zleconym commicie przejrzyj diff, dodaj do indeksu wyłącznie pliki zadania i sprawdź diff indeksu oraz błędy białych znaków. Wykonaj commit z żądaną wiadomością i zapisz SHA.
4. Jeśli push jest zlecony, wyślij commit na wskazaną gałąź bez wymuszania historii. Przy odrzuceniu sprawdź aktualny stan; nie wykonuj ślepych ponowień ani automatycznego rozwiązywania konfliktów. PR twórz tylko w zakresie zlecenia, z opisem końcowej zmiany i jej weryfikacji.
5. Po pushu lub przy zleconej kontroli CI odczytaj istniejące uruchomienia dla dokładnego SHA. Użyj dostępnego narzędzia GitHub; jeśli nie obsługuje zdarzeń `push`, użyj `gh run list --commit <SHA>`. Konfiguracja jest w [.github/workflows](../../../.github/workflows/); sprawdzaj tylko workflow związany z zadaniem. Nie uruchamiaj ręcznie publikacji w celu uzyskania wyniku CI.

## Odwołania i granice

[INSTRUCTIONS.md](../../../docs/INSTRUCTIONS.md) i [AGENTS.md](../../../AGENTS.md) zachowują nadrzędność. Jeśli zadanie obejmuje release lub signing, wczytaj wskazane tam dokumenty bezpieczeństwa i właściwej platformy przed działaniem. Zwykły commit lub push nie upoważnia do publikacji APK, aktualizacji Raspberry Pi, tagowania wydania ani wdrożenia. Nie zmieniaj konfiguracji workflow przy samym odczycie CI.

## Zakończenie

Raport opisuje wykonane operacje: dla commita podaj zakres i SHA, dla pushu wynik, dla kontroli CI status z odnośnikiem do danego SHA. Rozróżnij sukces, błąd, oczekiwanie oraz brak uruchomienia; brak workflow nie oznacza zielonego CI. Potwierdź końcowy status i zachowanie zastanych zmian.
