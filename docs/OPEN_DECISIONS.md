# Otwarte decyzje

Poniższe decyzje celowo nie zostały zamknięte. Obecne rozwiązania są lokalne i wymienne.

1. **Finalny układ „Dzisiaj”** — v1 stosuje kolejność: Teraz → Oś dnia → Reakcje → Echo. Układ może zostać zmieniony bez zmiany modeli.
2. **Konflikty synchronizacji** — istnieją `updatedAt` i tombstones; polityka merge nie została arbitralnie wybrana.
3. **Finalny backend** — brak backendu; granicę wyznaczają `DostawcaSynchronizacji` i `RepozytoriumZdalne`.
4. **Logowanie i odzyskiwanie dostępu** — brak konta w local-first v1.
5. **Energia i bufory planera** — v1 używa deterministycznego limitu 75%, 10-minutowych odstępów i domyślnych 30 minut bez estymacji.
6. **Automatyczne kategorie pamięci Echo** — v1 pozwala wyłącznie na wpis ręczny lub jawnie zaproponowany.
7. **Poziomy proaktywności i cisza nocna** — v1 ma przełącznik proaktywności i pełne wyciszenie.
8. **Finalne STT/TTS i słowo wybudzające** — v1 używa opcjonalnych Web Speech API z fallbackiem tekstowym.
9. **Platforma Smart Home** — nie wybrano i nie dodano zależności.
10. **Poczta, kalendarz, mapy i inne integracje** — brak integracji i kluczy API.
11. **Ewentualna rola tylko do odczytu** — v1 ma wyłącznie Właściciela i Edytora. Odczyt bez edycji jest zakresem grantu, nie trzecią rolą.

## Ograniczenia platformowe

- Notification API w PWA nie gwarantuje alarmu po całkowitym zamknięciu przeglądarki.
- Lokalny podgląd Edytora nie jest uwierzytelnieniem ani bezpiecznym współdzieleniem.
- Synchronizacja, Android i Tauri wymagają przyszłej warstwy platformowej.
