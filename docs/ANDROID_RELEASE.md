# Produkcyjne wydanie Androida

## Jednorazowo w GitHub

W **Settings → Environments → New environment** utwórz `android-production`. W nim ustaw:

- **Secrets**: `ANDROID_RELEASE_KEYSTORE_BASE64` (Base64 istniejącego stałego `.jks`), `ANDROID_RELEASE_STORE_PASSWORD`, `ANDROID_RELEASE_KEY_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS`.
- **Variables**: `ANDROID_SYNC_API_URL`, `ANDROID_UPDATE_MANIFEST_URL`, `ANDROID_WEB_UPDATE_MANIFEST_URL`, `ANDROID_WEB_OTA_PUBLIC_KEY_PEM`.

Adresy aktualizacji muszą być HTTPS. Wartości publiczne są konfiguracją runtime APK; nie wpisuj tu tokenów ani kluczy prywatnych. Klucz `.jks` i hasła muszą być dokładnie tymi samymi, którymi podpisano już zainstalowane APK.

W **Settings → Actions → General → Workflow permissions** włącz odczyt i zapis dla workflowów. Jeśli `main` ma ochronę gałęzi, zezwól `github-actions[bot]` na zapis wersji przygotowanej przez ten workflow.

## Każde kolejne wydanie

Wejdź w **Actions → Produkcyjne wydanie Androida → Run workflow**, wybierz `patch`, `minor` albo `major`, opcjonalnie wpisz release notes i kliknij **Run workflow**.

Workflow wylicza wersję i `versionCode`, aktualizuje punkt zgodności Web OTA, buduje oraz weryfikuje podpisane APK, a dopiero potem tworzy tag i publiczny GitHub Release z APK, SHA-256 i `latest.json`.

Nie publikuje przy tym Web OTA; nowy tag jest tylko kontrolowaną bazą dla jego osobnego workflowu.

CI i release używają JDK 21 oraz uruchamiają celowane testy updatera APK i Web OTA. Web OTA wymaga publicznego wydania produkcyjnego z manifestem i APK zgodnymi z `minNativeVersionCode`; sam tag lub draft nie wystarcza. Konfiguracja podpisywanego manifestu pochodzi z tego samego commita co bundle.

## Test ręczny na Samsungu: 1.0.13 → następny patch

Wykonaj dopiero po osobno zatwierdzonym wydaniu następnego patcha. Ta poprawka nie publikuje APK ani Web OTA.

**Ograniczenie 1.0.13:** zainstalowany updater zatwierdza sesję przed zamknięciem strumienia APK. Android może odrzucić tę operację. Poprawka natywna zacznie działać dopiero w nowym APK; Web OTA nie naprawi starego instalatora. Jeśli przejście z 1.0.13 zatrzyma się na uruchomieniu instalatora, pobierz oficjalny APK z wydania GitHub i otwórz go systemowo (bez odinstalowania Ogarniacza). Nie traktuj tego obejścia jako zaliczenia testu updatera. Pełny test poprawionego instalatora wymaga potem przejścia z poprawionego APK do kolejnego wyższego `versionCode`.

1. Zanotuj wersję 1.0.13 (1000013), wersję Androida/One UI i przykładowe zapisane dane. Sprawdź wykrycie następnego patcha w Ustawieniach.
2. Wyłącz sieć podczas pobierania: ma być błąd i „Ponów pobieranie”. Włącz sieć, ponów; sprawdź postęp i etap SHA-256. Weryfikację uszkodzonego APK wykonuj wyłącznie z kontrolowanym artefaktem testowym: instalator nie może się otworzyć.
3. Wyłącz dla Ogarniacza „Instaluj nieznane aplikacje”. Po pobraniu przejdź do ustawień, wróć najpierw bez zgody, potem ze zgodą i wybierz „Ponów instalację”. Poprawny APK nie powinien być pobierany ponownie.
4. Otwórz systemowe potwierdzenie, anuluj instalację, ponów również po ponownym uruchomieniu aplikacji. Sprawdź brak ponownego pobierania oraz zachowanie danych.
5. Na urządzeniu testowym z małą ilością wolnego miejsca sprawdź czytelny błąd przed pobieraniem/instalacją; po zwolnieniu miejsca ponów. Nie usuwaj danych Ogarniacza.
6. Zatwierdź instalację. Po uruchomieniu sprawdź nową wersję, wyższy `versionCode`, zachowane dane i brak propozycji starszego APK. Web OTA wymagające wyższego kodu APK ma pozostać zablokowane.

Zapisz oddzielnie wyniki testu 1.0.13, ewentualnego obejścia systemowym instalatorem i testu poprawionego updatera. Testy jednostkowe nie potwierdzają zachowania PackageInstaller ani uprawnień na fizycznym Samsungu.
