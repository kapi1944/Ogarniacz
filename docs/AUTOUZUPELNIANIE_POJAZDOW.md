# F5 — autouzupełnianie pojazdów offline

`PoleAutouzupelniania` jest wspólną kontrolką tekstową. Lista mieści się pod polem, ma przewijanie i cele dotykowe co najmniej 44 px. Używa tokenów aktualnego motywu, także Luxury. Obsługuje combobox/listbox ARIA, strzałki, Enter, Escape, Tab, kliknięcie poza polem i istniejącą obsługę Android Wstecz z priorytetem nad modalem. Nie narzuca wyboru z listy.

Formularz przekazuje statyczne lub zależne `podpowiedzi` i `opisPodpowiedzi`; funkcje pozostają w konfiguracji UI, poza modelem i bazą. Logika marek/modeli znajduje się wyłącznie w module samochodu. Modele odpowiadają całej wybranej marce po normalizacji; samo wpisanie fragmentu marki nie przypisuje jej automatycznie. Zmiana lub wyczyszczenie marki nie usuwa modelu. Otwarcie listy pokazuje wszystkie dostępne propozycje, pisanie ją filtruje.

Wyszukiwanie ignoruje wielkość liter, skrajne i powtarzające się spacje oraz znaki diakrytyczne (np. `skoda` → `Škoda`). Normalizacja dotyczy wyszukiwania, a nie automatycznej zmiany danych. Wybór propozycji wpisuje jej nazwę; ręczne wartości nadal zapisuje dotychczasowy formularz.

## Katalog i źródła

Ręcznie dobrany, **niepełny katalog: 8 marek, 32 nazwy rodzin modeli**, sprawdzone 28.10.2026 w oficjalnych źródłach poniżej. Nazwy pomijają odmiany nadwozia, napędu, wyposażenia i generacji. Katalog nie gwarantuje bieżącej produkcji ani dostępności handlowej. Nie zawiera cen, roczników ani danych technicznych.

| Marka | Modele | Źródło producenta |
|---|---|---|
| Dacia | Sandero, Duster, Jogger, Bigster | [Katalog modeli](https://www.dacia.pl/katalog-nci/marki-i-modele.html) |
| Ford | Focus, Puma, Kuga, Mustang | [Wykaz modeli serwisowanych](https://www.ford.pl/serwis/obsluga-i-oferty-serwisowe/serwisowanie/ford-service/przeglady-samochodow-do-4-lat) |
| Hyundai | i10, i20, i30, TUCSON | [Modele, w tym historyczne](https://www.hyundai.com/pl/pl/modele/ostatnie-egzemplarze.html) |
| Peugeot | 208, 308, 2008, 3008 | [Modele w programie producenta](https://www.peugeot.pl/serwis-czesci-i-akcesoria/program-peugeot-care.html) |
| Renault | Clio, Captur, Austral, Symbioz | [Oferty pojazdów w serwisie Renault](https://kup.renault.pl/nowedealer/jaszpol) |
| Škoda | Fabia, Octavia, Superb, Karoq | [Cenniki i katalogi modeli](https://www.skoda-auto.pl/oferta/cenniki/) |
| Toyota | Corolla, Yaris, RAV4, Camry | [Samochody hybrydowe](https://www.toyota.pl/nowe-samochody/hybrydowe) |
| Volkswagen | Golf, Polo, Passat, Tiguan | [Gama modeli](https://www.volkswagen.pl/pl/modele.html) |

Podpowiedzi dodatkowo uwzględniają własne nazwy z pojazdów już odczytanych przez istniejące repozytorium. Są to wartości użytkownika, nie zweryfikowane wpisy katalogowe. Modele innych marek nie są mieszane; duplikaty po normalizacji są pomijane, z pierwszeństwem nazwy katalogowej.

Rozbudowa: dopisz markę/model w `src/modules/samochod/katalogPojazdow.ts`, potwierdź nazwę w źródle producenta, uzupełnij tę tabelę oraz test liczebności. Nie wymaga to migracji, usługi sieciowej ani zależności. Formularz nie pobiera katalogu z internetu. Struktura `Pojazd`, baza i operacje zapisu pozostają bez zmian.

## Weryfikacja

Testy obejmują wyszukiwanie i zależności, klawiaturę, symulowane zdarzenia dotykowe, Wstecz w modalu oraz zapis i ponowny odczyt IndexedDB przy `navigator.onLine = false` i niedostępnym `fetch`. Edycja fixture istniejącego pojazdu sprawdza zachowanie ubezpieczenia, historii przebiegu/serwisu, tankowań, opon, notatki i pól własnych. Nie odczytywano prywatnej bazy użytkownika.

Wbudowana przeglądarka, lokalny adres testowy `127.0.0.1:5175`, szerokość 618 px: sprawdzono wyszukiwanie Škody, wybór strzałką i Enter, listę modeli, zapis i ponowną edycję pojazdu, Escape oraz panel pod polem w jasnym motywie klasycznym i Luxury. Użyto wyłącznie syntetycznego pojazdu testowego. Nie jest to próba na fizycznym telefonie.

Fizyczny Samsung wymaga sprawdzenia klawiatury, przewijania listy bez przypadkowego wyboru, dotyku, Wstecz i wyglądu Luxury przy otwartym modalu. Brak publikacji APK, wdrożenia i prac F6.
