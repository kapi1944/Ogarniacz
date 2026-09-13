# Zewnętrzne API, SDK, biblioteki, chmura

## Zewnętrzne API i usługi chmurowe
- Dozwolone, jeśli dają istotną przewagę funkcjonalną, jakościową lub kosztową.
- Preferuj: stabilne API, aktywne utrzymanie, darmowy lub tani próg, możliwość wymiany dostawcy.
- Dotyczy m.in.: AI, STT/TTS, OCR, mapy, geokodowanie, pogoda, powiadomienia, kalendarz.
- Przy nowej integracji zawsze podaj: co wysyłamy, dokąd, po co, jak to wyłączyć, co dzieje się z danymi po stronie dostawcy.

## Klucze i sekrety
- Sekrety i klucze API nigdy nie trafiają do repozytorium ani do frontendu.
- Klucze trzymamy po stronie backendu (Raspberry Pi / proxy) albo w bezpiecznym storage.

## Dane użytkownika
- Mogą opuścić urządzenie tylko w zakresie koniecznym do działania danej funkcji.
- Wysyłka wyłącznie po świadomym włączeniu funkcji przez użytkownika.
- Nigdy nie loguj sekretów ani pełnych danych osobowych.

## Biblioteki i zależności
- Dodawanie bibliotek dozwolone, jeśli są aktywnie utrzymywane, sensownie małe i rozwiązują problem lepiej niż własna implementacja.
- Preferuj biblioteki dojrzałe, popularne, z jasną licencją.
- Nie pisz setek linii własnego kodu tylko po to, żeby uniknąć jednej zależności.
- Unikaj bibliotek porzuconych i wymuszających vendor lock-in.

## Local-first vs cloud
- Dane osobiste i podstawowe funkcje: local-first.
- Funkcje naturalnie wymagające chmury (AI, dane bieżące, geokodowanie, pogoda): cloud/API jest w porządku.
- Użytkownik musi mieć możliwość włączenia/wyłączenia integracji i zobaczenia, co jest wysyłane.

## Płatne usługi
- Preferuj darmowe i lokalne.
- Możesz zaproponować płatną opcję, jeśli daje istotną przewagę (jakość, koszt utrzymania, niezawodność).
- Nie aktywuj żadnych kosztów bez zgody użytkownika.
