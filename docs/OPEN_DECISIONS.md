# Otwarte decyzje

Poniższe decyzje pozostają otwarte po wdrożeniu backendu, kont, sesyjnej synchronizacji Androida, Androida oraz oddzielnych kanałów APK, Web OTA, PWA i aktualizacji Raspberry.

1. **Finalny układ „Dzisiaj”** — obecny układ może być dalej strojony bez zmiany modeli.
2. **UX konfliktów synchronizacji** — serwer wykrywa konflikt wersji i klient zachowuje obie wersje; otwarty pozostaje docelowy sposób prezentacji i ręcznego scalania.
3. **Docelowa infrastruktura backendu** — obecnie działa Node.js + SQLite na Raspberry Pi przez prywatny HTTPS/Tailscale. Przyszła migracja nie powinna zmieniać kontraktów domenowych.
4. **Dalsza polityka kont i współdzielenia** — Właściciel, Edytor, zaproszenia, odzyskiwanie dostępu i granty są wdrożone; otwarta pozostaje potrzeba dodatkowych ról lub dokładniejszych grantów.
5. **Energia i bufory planera** — obecnie używany jest deterministyczny limit 75%, odstępy oraz wartości domyślne bez pełnego modelu energii.
6. **Automatyczne kategorie pamięci Echo** — docelowa automatyzacja pamięci nie została jeszcze ustalona.
7. **Poziomy proaktywności i cisza nocna** — istnieją podstawowe mechanizmy, ale ich finalna polityka pozostaje otwarta.
8. **Finalne STT/TTS i słowo wybudzające** — mechanizmy głosowe działają warstwowo; docelowy wake word wymaga prywatnej konfiguracji Picovoice.
9. **Platforma Smart Home** — nie wybrano docelowej platformy.
10. **Poczta, kalendarz, mapy i inne integracje** — pozostają późniejszym zakresem.
11. **Rola tylko do odczytu** — obecnie odczyt bez edycji realizowany jest przez zakres grantu, a nie osobną trzecią rolę.

## Weryfikacje wdrożeniowe

- Test aktualizacji z APK 1.0.13 oraz późniejszy test poprawionego instalatora na fizycznym Androidzie; szczegóły w `ANDROID_RELEASE.md`.
- Instalacja i sprawdzenie jednostek aktualizatora, panelu, healthchecku i rollbacku na działającym Raspberry Pi. Stan live nie wynika z testów lokalnych.
- Przed wyłączeniem surowego LAN na działającym Pi: potwierdzenie wszystkich aktywnych klientów na HTTPS Tailscale, sprawdzenie starych timerów i ręczne przełączenie `HOST` na loopback.

## Ograniczenia platformowe

- Notification API w PWA nie gwarantuje alarmu po całkowitym zamknięciu przeglądarki.
- Zachowanie alarmów i pracy w tle może zależeć od producenta i konfiguracji Androida.
- Wake word wymaga poprawnej natywnej konfiguracji i prywatnych danych Picovoice.
- Tauri nie jest obecnie wdrożone.
