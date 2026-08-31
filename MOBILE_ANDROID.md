# Android

## Transfer danych przed synchronizacją

Desktop/PWA i Android używają jednego formatu OgarniaczBackup. Do czasu uruchomienia automatycznej synchronizacji transfer jest ręczny:

1. Na urządzeniu źródłowym otwórz **Ustawienia → Backup**, utwórz backup i zapisz albo udostępnij plik JSON.
2. Na urządzeniu docelowym wybierz ten plik w tej samej sekcji.
3. Ogarniacz sprawdzi format, wersję i checksum, wykona wymagane migracje, utworzy backup before-restore, a następnie przywróci wybrane sekcje.

Dokumenty i inne dane typu Blob są kodowane do Base64 wyłącznie na czas transportu w pliku backupu. Po imporcie wracają do Blob w IndexedDB. Losowy installationId identyfikuje źródłową instalację w manifeście; nie pochodzi z IMEI, Android ID ani identyfikatora sprzętowego.
