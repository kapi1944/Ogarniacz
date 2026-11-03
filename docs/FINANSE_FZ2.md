# FZ-2 — fundament lokalny

Kontrakt funkcjonalny: [Pule i Zobowiązania](FINANSE_PULE_ZOBOWIAZANIA.md).

## Dane i zapis

Dexie **21** dodaje `zakupyPul`, `sprzedazePul`, `osobyFinansowe`, `zobowiazania` i `operacjeZobowiazan`. Migracja nie przepisuje istniejących tabel. Partie, pozycje, koszty i korekty pozostają osadzone. Stare kasy nie są aktywowane automatycznie.

Schematy w `server/wspolne/modelePulZobowiazan.ts` i walidator obrazu w `WalidacjaPulZobowiazan.ts` są wspólne dla klienta i backendu; nie korzystają z Dexie ani przeglądarki. Sprawdzają kwoty, waluty, ceny ułamkowe, role, relacje, ciągłość rewizji i pełny skład grupy.

`zapiszGrupeFinansowa` rozszerza `ZapisFinansowWspolnych`. Jedna transakcja obejmuje źródła, oczekiwane rewizje zapisów i rodziców, historię, outbox oraz stan i konflikty synchronizacji. Każdy członek otrzymuje historię istniejącym `zapiszRekordFinansowy`. Nie ma osobnej tabeli pokwitowań. Identyczne ponowienie sprawdza historyczne podpisy całego polecenia i nie cofa późniejszych zmian. Inna treść tego samego ID lub nieaktualna rewizja przerywa zapis. Walidacja końcowego grafu odbywa się przed zatwierdzeniem transakcji.

Nowy zapis FZ wymaga Właściciela lub dotychczasowego lokalnego kontekstu bez konta. Sprawdzane są aktywna baza, konto i sygnał profilu przed i po wykonaniu. Ogólny CRUD nowych tabel jest zablokowany. Trwająca synchronizacja blokuje polecenie FZ, aby aktywacja Puli nie wyprzedziła wysyłanej starszej wersji kasy. Komendy zakupów, sprzedaży i spłat oraz ich formularze nie są udostępnione użytkownikowi w tym etapie.

## Obliczenia

`ObliczeniaPul.ts`, `MagazynPul.ts` i `ProjekcjePul.ts` obliczają pieniądze przez `BigInt`, z kontrolą zakresu przy powrocie do JSON. Alokacja dodatkowych kosztów używa największych reszt z remisem po ID. Koszt zakresu sztuk wynosi `floor(K*(n+q)/N)-floor(K*n/N)`; zwrot odwraca ostatnie niezwrócone zakresy oryginalnego wydania. Ponowna sprzedaż zachowuje ich koszt. Zapas nie jest zapisywany osobno.

Projekcja rozróżnia koszt nabycia, koszt sprzedaży, straty, zapas, należny przychód, gotówkę, umorzenia i koszt nieodzyskany. Spłata sprzedażowego zobowiązania jest jednym wirtualnym przepływem, bez kopii w operacjach kasy. Nadpłata odwraca kierunek pozostałej kwoty. Podsumowanie osoby zachowuje odrębne długi i waluty. Publiczna projekcja Puli zwraca `kompletne: false` z przyczyną zamiast zastępczego zera przy błędzie danych.

## Backup i transport

Globalny format backupu pozostaje **3**. Sekcja `puleZobowiazania` v1 zawiera cały graf FZ, historię lokalną, chronione dokumenty z Blobami i fragment reguł ustawień. Sekcje `wspolneKasy`, `dokumenty` i `ustawienia` v2 pomijają te dane; importer nadal przyjmuje ich v1. Finansowe przypomnienia są pomijane jako odtwarzalna projekcja. Sekcje zdrowotne zależne od finansowego pliku wymagają dołączenia sekcji FZ.

Starsza kopia bez sekcji FZ zachowuje istniejące dane FZ i oczekujące zmiany. Kolizja starszego rekordu z aktywowaną Pulą lub chronionym dokumentem blokuje restore. Restore obejmuje pełną sekcję i walidację grafu oraz korzysta z dotychczasowego checksum, szyfrowania, kontroli profilu i `before-restore`. Brak wymaganego pliku lub członka operacji blokuje pełną kopię. Ochrona finansowa i medyczna dokumentów pozostaje zachowana.

Nowe rekordy pozostają w istniejącym outboxie z komunikatem o wstrzymaniu do FZ-7 i są nadal liczone jako oczekujące. Filtr transportu obejmuje też rozszerzenia kas, dokumentów i ustawień, finansowe przypomnienia oraz wszystkie stare operacje aktywowanej Puli. Transport nie nadpisuje lokalnych rozszerzeń pobraną starszą wersją. Protokół F7, endpointy i wdrożenia pozostają na dotychczasowym etapie.

## Weryfikacja

`src/services/FundamentFz.test.ts` używa wyłącznie syntetycznych baz. Obejmuje migrację i ponowne otwarcie, zachowanie F7/tombstone/historii/outboxu, idempotencję, konflikty, rollback historii i kolejki, profile i Edytora, grosze, magazyn, spłaty i nadpłaty, przykład finansowy z kontraktu, backup/restore, Bloby oraz wstrzymanie transportu aktywowanej kasy. Wyniki uruchomień i CI są podawane w raporcie wykonania.

Próby fizycznego Androida i Raspberry Pi nie są częścią odbioru tego fundamentu bez ekranów. Nie wykonuje on produkcyjnych migracji, aktualizacji urządzeń ani publikacji. FZ-3 wymaga osobnego polecenia.
