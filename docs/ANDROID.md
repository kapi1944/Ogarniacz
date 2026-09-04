# Android

## Development

Włącz na telefonie **Opcje programistyczne → Debugowanie USB**, podłącz go pierwszy raz i zaakceptuj klucz RSA. Dla Wireless Debugging sparuj/połącz telefon narzędziem Android Studio albo standardowymi poleceniami `adb pair` i `adb connect`. Ogarniacz nie tworzy własnego mechanizmu parowania — gdy `adb devices` widzi urządzenie, ten sam pipeline działa przez USB i Wi-Fi.

```bash
npm run android:doctor
npm run android:deploy
```

Doctor sam wyszukuje wymagane przez obecny toolchain JDK 21 (w tym Android Studio JBR), Android SDK oraz `platform-tools/adb`, bez globalnego ustawiania `JAVA_HOME` i `PATH`. Inne wersje JDK pokazuje jako niezgodne. Przy wielu urządzeniach wskaż jedno:

```bash
npm run android:deploy -- --device SERIAL
```

Deploy buduje frontend, wykonuje Capacitor sync i debug APK, instaluje przez `adb install -r -d`, potwierdza wersję pakietu i uruchamia aplikację. Nie odinstalowuje Ogarniacza, więc zachowuje jego dane. Debug nie wymaga release keystore.

## Release signing i wersja

Jeden release keystore oraz alias `ogarniacz` muszą być zachowane do wszystkich kolejnych wydań. Ich utrata uniemożliwi aktualizowanie już zainstalowanej aplikacji. Jednorazowe utworzenie klucza poza repozytorium:

```bash
npm run android:keystore:create
```

`keytool` poprosi interaktywnie o hasła; skrypt ich nie zapisuje ani nie wyświetla. Następnie skopiuj `android/keystore.properties.example` do ignorowanego `android/keystore.properties`, ustaw ścieżkę do tego samego pliku `.jks` i uzupełnij sekrety. Nie commituj żadnego z tych plików. Kopię keystore i haseł przechowuj w bezpiecznym miejscu.

Wersja pochodzi wyłącznie z `package.json`; Gradle wylicza `versionCode` jako `major * 1000000 + minor * 1000 + patch`. Przed kolejnym wydaniem podbij ją jednym z poleceń:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

## Signed release i manifest

Build aplikacji przeznaczonej do aktualizacji musi znać pełny adres HTTPS manifestu. Adres pliku APK w `latest.json` pozostaje względny, dopóki nie podasz opcjonalnego adresu bazowego:

```powershell
$env:VITE_ANDROID_UPDATE_MANIFEST_URL='https://ogarniacz.local/updates/latest.json'
npm run android:release
```

Opcjonalny absolutny `apkUrl`:

```bash
npm run android:release -- --base-url https://ogarniacz.local/updates/
```

Artefakty powstają w `android/app/build/outputs/apk/release/`:

- `Ogarniacz-X.Y.Z-release.apk` — podpisany APK;
- `Ogarniacz-X.Y.Z-release.apk.sha256` — suma SHA-256;
- `latest.json` — wersja, `versionCode`, adres APK, SHA-256 i czas publikacji.

Opublikuj APK i `latest.json` pod tym samym endpointem HTTPS (np. później na Raspberry Pi albo tymczasowo jako pliki wydania). Klient nie jest związany z GitHubem ani konkretną domeną.

## Aktualizacja bez kabla

W **Ustawienia → Informacje o aplikacji** przycisk **Sprawdź aktualizacje** pobiera `latest.json`, porównuje `versionCode`, pobiera nowszy APK do prywatnej pamięci podręcznej, sprawdza SHA-256 i otwiera systemowy instalator przez `content://` z `FileProvider`. Android wymaga potwierdzenia instalacji. Przy pierwszej próbie może też otworzyć zgodę **Instaluj nieznane aplikacje** dla Ogarniacza; zgoda nie jest żądana przy starcie aplikacji.

Serwer powinien udostępniać manifest oraz APK przez HTTPS. To stały release key pozwala Androidowi potwierdzić, że nowy APK jest aktualizacją tej samej aplikacji; SHA-256 dodatkowo wykrywa uszkodzenie pobranego pliku.
