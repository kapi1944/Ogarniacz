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
