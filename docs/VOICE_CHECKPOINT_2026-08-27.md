# Ogarniacz — checkpoint ustaleń głosowych 2026-08-27

Ten dokument zapisuje decyzje zatwierdzone w rozmowie głosowej i ich techniczną interpretację.

## Pulpit i zadania

- Oś czasu pozostaje centrum Pulpitu.
- Tylko planowany sen jest kompresowany do 50%; domyślnie 22:30–06:30, zakres edytowalny.
- Elementy z konkretną godziną trafiają na oś.
- Dzisiejsze elementy bez godziny / END_OF_DAY trafiają do sekcji „bez godziny”.
- Luźne elementy są niżej.
- Ranking: ASAP i pilne/zaległe wyżej, najbliższe terminy dalej, luźne i LOW niżej.
- Nie zmieniamy istniejących enumów domenowych tylko z powodu prostszych etykiet UX.

## Przypomnienia

- Jeden wspólny mechanizm wyliczania przypomnień dla zadań, leków, wizyt i późniejszych modułów.
- Na tym etapie bez natywnych push/system notifications.
- Moduły pozostają źródłem prawdy; Pulpit używa sourceRef.

## Leki i wizyty

- Własne moduły i CRUD pozostają niezależne.
- Najbliższe dawki i terminy mogą być reprezentowane na osi/kafelkach Pulpitu.
- Brak kopiowania rekordów modułów do storage Pulpitu.

## Finanse

- Na Pulpicie tylko alerty, terminy i najbliższe płatności — nie pełna księgowość.
- Progi budżetu: 90% ostrzeżenie, 95% stan krytyczny.
- Zaległe płatności: wyraźny stan, licznik dni opóźnienia; pulsowanie tylko jako dodatkowy sygnał i z poszanowaniem reduced-motion.

## Bezpieczeństwo i synchronizacja

- Najpierw stabilna lokalna warstwa danych i backup.
- Hasło główne i opcjonalny PIN modułu finansów pozostają osobnym etapem bezpieczeństwa — nie wolno implementować atrap.
- Szyfrowana synchronizacja dopiero po stabilizacji lokalnej warstwy danych.

## Kolejność modułów drugiego rzutu

1. Poczekalnia
2. Notatki dzienne
3. Samochód
4. Zakupy
5. Integracje
