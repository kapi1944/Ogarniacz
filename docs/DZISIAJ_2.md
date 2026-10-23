# Dzisiaj 2.0 — etap 2

Zakres: Dzisiaj, wspólna projekcja dnia, oś Pulpitu, nawigacja planera i ergonomia trzech istniejących stylów. Bez migracji, nowych zależności, zmian backendu i publikacji.

- Najbliższy krok uwzględnia datę, znany czas trwania i status źródła. Wykonane, anulowane i pominięte nie wracają jako propozycje działań. Zakończone sprawy pozostają w rozwijanym podsumowaniu.
- Zaległości pokazują liczbę zadań zamiast sumy minut opóźnienia. Odczyt poprzednich dni używa istniejącego indeksu terminu i zachowuje w pamięci trzy najważniejsze pozycje; prywatne ćwiczenia terapii pozostają wykluczone.
- Wykonanie i przełożenie na jutro zachowujące godzinę korzystają z repozytorium zadań. Lokalna blokada dotyczy konkretnego zadania. Warunek aktualności, zapis, historia i istniejący outbox są w jednej transakcji.
- Cofanie porównuje cały aktualny rekord ze stanem po operacji. Nowsza edycja, usunięcie lub synchronizacja powoduje odmowę. Cofnięcie dodania również sprawdza stan w transakcji usuwania. Błędy nie ujawniają surowych szczegółów i zwalniają blokadę.
- Ręczne bloki planera korzystają z istniejącej projekcji `utworzWydarzeniaPlanera` i referencji źródłowej. Dzisiaj, Pulpit i podgląd dnia nie zapisują ich kopii.
- Czterotygodniowy horyzont Dzisiaj otwiera istniejący podgląd dnia, z dostępem do planera i dodawania. Licznik odróżnia wykonane działania od pustego dnia.
- Znaczniki osi trafiają do wolnych wierszy. Duża liczba terminów przewija się lokalnie; zachowano skalowanie snu, grafik i dojazdy. Godzina jest widoczna przy każdej etykiecie; pełne szczegóły otwiera wybór terminu.
- Planer i Pulpit używają tego samego nawigatora daty. Skróty planera liczą dni kalendarzowe także przy zmianie czasu. Dzisiaj odświeża zegar co minutę i po powrocie do aplikacji.
- Luxury rozszerza istniejące tokeny powierzchni i złota, Flat zachowuje proste powierzchnie i czytelne granice, Klasyczny zachowuje kolorystykę. Własna paleta, motywy, gęstość, ograniczenie ruchu i wybór scrollbarów pozostają w obecnym systemie personalizacji. Oficjalne logo jest skalowane proporcjonalnie bez modyfikacji plików.

Weryfikacja lokalna: pełny Vitest 1133/1133; dodatkowe testy obejmują transakcje, konflikt cofnięcia, dwukrotny submit, uprawnienia, statusy, północ, podgląd horyzontu i reaktywność bloków planera. Kontrola przeglądarkowa obejmuje Luxury 360–1440 px, Flat 390 px, Klasyczny 1024 px, kolidujące terminy, wykonanie/cofnięcie i natywny kalendarz obsługiwany klawiaturą.

Nie wykonano testu na fizycznym Samsungu ani dotykowym panelu Raspberry Pi. Sama szerokość przeglądarki nie potwierdza obsługi dotyku, klawiatury ekranowej i natywnego selektora Androida. Commit/push i wynik CI są raportowane dla końcowego SHA w podsumowaniu zadania. Nie uruchamiać publikacji APK ani aktualizacji Raspberry w ramach tego etapu.
