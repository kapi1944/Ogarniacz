# Web OTA Android

Web OTA publikuje wyłącznie gotowy ZIP z zawartością `dist`. Kanał jest niezależny od `latest.json` OTA APK i używa stałego tagu GitHub Release `web-ota`.

Manifest `web-ota.json` zawiera: `bundleVersion`, pełny `commitSha`, absolutny adres HTTPS `url`, `sha256`, `signature`, `minNativeVersionCode` i `publishedAt`.

Podpis `SHA256withRSA` jest liczony z tekstu UTF-8 z polami rozdzielonymi znakiem nowej linii:

```text
ogarniacz-web-ota-v1
bundleVersion
commitSha
url
sha256
minNativeVersionCode
publishedAt
```

Publiczny klucz X.509 PEM należy przed buildem APK umieścić jako `android/web-ota-public-key.pem`. Plik jest ignorowany przez Git; wzór znajduje się w `android/web-ota-public-key.example.pem`. Prywatny klucz nie może trafić do repozytorium — w GitHub Actions powinien być odtwarzany wyłącznie z sekretu na czas podpisania manifestu.

Workflow publikacji powinien:

1. zbudować `dist` dla wskazanego commita,
2. spakować zawartość `dist` tak, aby `index.html` był w katalogu głównym ZIP,
3. policzyć SHA-256 ZIP,
4. ustawić minimalny zgodny `versionCode` APK,
5. podpisać dokładnie powyższy tekst prywatnym kluczem,
6. zastąpić assets `web-ota.zip` i `web-ota.json` w release o tagu `web-ota`.

Najpierw publikuj ZIP, a manifest na końcu. Nie używaj `/releases/latest` i nie publikuj źródeł React/TypeScript jako danych wykonywalnych przez klienta.
