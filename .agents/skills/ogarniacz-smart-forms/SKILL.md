---
name: ogarniacz-smart-forms
description: Twórz i poprawiaj formularze Ogarniacza z wykorzystaniem wspólnych pól daty, czasu, kwoty i liczby. Używaj przy walidacji, zapisie wartości oraz zachowaniu klawiatury i paneli pól; dla samej kolorystyki wybierz skill UI.
---

# Wspólne formularze Ogarniacza

## Aktywacja

Użyj przy dodawaniu lub naprawie pola formularza, jego walidacji, integracji z modelem albo obsługi panelu i Wstecz. Zmiany samych stylów należą do `ogarniacz-ui-design-system`.

## Wykonanie

1. Odczytaj [POLA_FORMULARZY.md](../../../docs/POLA_FORMULARZY.md) oraz tylko formularz i model objęte zadaniem. Potwierdź typ zapisywanej wartości i sposób obsługi błędu.
2. Rozszerz istniejący komponent zamiast tworzyć drugi mechanizm: [PoleDaty](../../../src/components/PoleDaty.tsx), [PoleCzasu](../../../src/components/PoleCzasu.tsx), [PoleKwoty](../../../src/components/PoleKwoty.tsx), [PoleLiczbowe](../../../src/components/PoleLiczbowe.tsx). Wczytaj jedynie potrzebne implementacje i bezpośrednich użytkowników.
3. Dla liczb i kwot sprawdź istniejące funkcje w [liczby.ts](../../../src/domain/liczby.ts) i [kwoty.ts](../../../src/domain/kwoty.ts). Zachowaj rozdzielenie tekstu edycji od wartości modelu, precyzję, obsługę pustej wartości i błędów według dokumentacji. Nie dodawaj własnego parsera przed sprawdzeniem istniejącego.
4. Podepnij zapis przez dotychczasowy hook lub serwis i repozytorium zgodnie z [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md). Jeśli zmieniasz kontrakt danych, zastosuj odpowiednie dokumenty zasad z [AGENTS.md](../../../AGENTS.md); sama wymiana kontrolki nie uzasadnia migracji.
5. Dobierz testy dotkniętego pola i formularza według [TESTING.md](../../../docs/TESTING.md). Sprawdź odpowiednie granice, separator, precyzję, blokadę błędnego zapisu oraz ponowny odczyt. Przy zmianie panelu sprawdź fokus, widoczność pola i Wstecz; przy zmianie mobilnej opisz osobno akceptację urządzenia.

## Granice

Zachowaj kompatybilność starszych wartości i istniejące reguły waluty, czasu oraz jednostek. Nie rozszerzaj zadania o przewalutowanie, konwersję jednostek ani nowy system formularzy. Wspólny komponent zmieniaj z uwzględnieniem jego rzeczywistych użytkowników.

## Zakończenie

Formularz korzysta z istniejących mechanizmów, poprawne dane zapisują się i odczytują bez utraty znaczenia, a błędne wejście ma czytelny polski komunikat. Raport zawiera zakres regresji i oddziela testy automatyczne od sprawdzenia na urządzeniu.
