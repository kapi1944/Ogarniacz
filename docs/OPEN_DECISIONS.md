# Ogarniacz — otwarte decyzje (23.10.2026)

Aktualny plan: [ROADMAP.md](ROADMAP.md). Kryteria weryfikacji: [ETAP_1_WERYFIKACJA_2026-10-23.md](ETAP_1_WERYFIKACJA_2026-10-23.md).

## Wymagają potwierdzenia operatora, nie ponownej implementacji

1. **Raspberry:** odczyty SSH z 23.10.2026 potwierdzają HEAD `82f3d6f` zgodny z `rpi-stable`, zdrowy backend, jednostki i włączoną flagę aktualizatora. Do potwierdzenia pozostaje widok panelu w rzeczywistej sesji Właściciela; nowszy `main` nie jest wdrożony (szczegóły w raporcie).
2. **Fizyczny Samsung:** zainstalowana wersja APK, kolejka/konflikty, odtworzenie sesji, alarmy i aktualizator; próba nowego APK tylko gdy dostępny jest wyższy versionCode.
3. **Odtwarzalność danych:** pełny zakres poszczególnych backupów, w tym ograniczenia eksportu IndexedDB i brak pełnego snapshotu kolejki w zwykłym eksporcie.
4. **Historyczny backup w publicznym Git:** ocena ryzyka, decyzja o rotacji ewentualnych sekretów, ewentualne przepisanie historii tylko po odrębnym zatwierdzeniu i planie dla wszystkich klonów.
5. **Reset hasła e-mail:** jawne uruchomienie i test doręczenia w środowisku produkcyjnym, bez publikowania sekretów.

## Decyzje produktowe

1. Dzisiaj 2.0: docelowy układ, priorytety szybkich działań oraz obsługa dotykowa.
2. Planer: czy dotychczasowe limity i bufory energii odpowiadają rzeczywistemu użyciu.
3. Echo: polityka pamięci, proaktywność, STT/TTS, budżet zasobów Raspberry i prywatna konfiguracja wake word.
4. Smart Home: zakres widocznych urządzeń, sposób grupowania, częstotliwość odświeżania i polityka potwierdzeń; obecny adapter REST i UI już istnieją.
5. Współdzielenie: czy potrzebna jest odrębna rola tylko do odczytu, skoro obsługują ją granty.
6. Integracje zewnętrzne (kalendarz/poczta/mapy) i późniejszy panel sprzętu PC.
7. Docelowa platforma Windows/Tauri tylko po określeniu wymaganych operacji systemowych.

## Ograniczenia platform

- PWA nie gwarantuje alarmu po całkowitym zamknięciu przeglądarki.
- Android może ograniczać działanie powiadomień i mikrofonu w tle.
- Echo wake word wymaga prawidłowej konfiguracji natywnej i prywatnych danych dostawcy.
- Web OTA zostało wycofane; brak natywnej szybkiej aktualizacji JS w APK.
- Zielone testy repozytorium nie są dowodem wdrożenia, prawidłowego rollbacku ani zachowania danych na rzeczywistych urządzeniach.
