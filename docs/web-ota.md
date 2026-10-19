# Android Web OTA — kanał wycofany

Android uruchamia wyłącznie frontend wbudowany w podpisany APK z workflow
**Publikuj Ogarniacza**. Usunięto plugin pobierania i aktywacji, magazyn pakietów,
manifest, konfigurację klucza OTA oraz workflow publikacji. Nie używaj dawnego
release `web-ota` do aktualizowania aplikacji.

`MigracjaPozostalosciWebOta` usuwa wyłącznie stary `serverBasePath`, stan
`OgarniaczWebOta.stan` i prywatny katalog `files/web-ota`. Po udanym czyszczeniu
zapisuje trwały znacznik i przy kolejnych startach nie powtarza operacji.
Nieudany zapis lub czyszczenie jest ponawiane; wybór zasobów `public` w
`MainActivity` niezależnie zabezpiecza start APK. Migracja nie odczytuje ścieżek
z metadanych OTA i nie usuwa IndexedDB, sesji ani innych ustawień.

Web/PWA nadal używa Workbox i service workera po wdrożeniu Raspberry z
`rpi-stable`. Aktualizację przeglądarki zatwierdza użytkownik.
