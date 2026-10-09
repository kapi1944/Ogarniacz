# Ogarniacz jako aplikacja Windows 10/11

1. Włącz Tailscale na komputerze i otwórz w zwykłym profilu Microsoft Edge
   produkcyjny adres HTTPS Raspberry Pi zwrócony przez konfigurację Tailscale
   Serve (patrz [RASPBERRY_PI.md](RASPBERRY_PI.md)). Używaj stale tego samego
   adresu i profilu. Nie instaluj z localhost, Vite ani adresu HTTP.
2. Poczekaj na komunikat „Ogarniacz działa także offline”. W pasku adresu
   wybierz ikonę instalacji aplikacji, a następnie „Zainstaluj”.
3. W opcjach instalacji zaznacz utworzenie skrótu na pulpicie oraz przypięcie
   do paska zadań. Możesz też zrobić to później w `edge://apps` → Ogarniacz
   → Szczegóły. Opcjonalnie włącz uruchamianie po zalogowaniu do Windows.
4. Zamknij okno i uruchom Ogarniacza ze skrótu. Otworzy własne okno.
   Nie potrzebujesz EXE ani uruchomionego Vite; wersję produkcyjną obsługuje
   istniejący serwer Raspberry Pi. Po restarcie Windows użyj tego samego skrótu.

Instalacja korzysta z istniejącej IndexedDB danego adresu i profilu Edge.
Dane z localhost, innej domeny lub innej przeglądarki nie pojawią się
automatycznie — przenieś je istniejącym eksportem/importem kopii zapasowej.
Nie czyść danych witryny i nie zaznaczaj ich usunięcia przy odinstalowaniu.

Po pierwszym poprawnym zapisaniu aplikacji w cache można uruchamiać ją
offline i korzystać z lokalnych danych, także z modułów ładowanych na żądanie.
Synchronizacja, konto, Echo serwerowe i sprawdzanie aktualizacji wymagają
dostępu do serwera. Zainstalowanie PWA nie gwarantuje alarmów po zamknięciu
aplikacji. Zachowuj kopie zapasowe danych.

Nowa wersja jest sprawdzana przy starcie, co 15 minut i po odzyskaniu sieci.
Komunikat jest dostępny niezależnie od modułu: „Zaktualizuj” aktywuje
oczekujący service worker i odświeża okno, a „Później” ukrywa komunikat
o tej aktualizacji do zamknięcia aplikacji. Aktualizacja nie czyści IndexedDB.
Na Androidzie ten sam komunikat otwiera istniejący panel bezpiecznej
instalacji podpisanego APK; nie pobiera APK bez dalszego działania użytkownika.

PWA pobiera tylko wersję udostępnioną przez produkcyjny serwer, a Android
korzysta z dotychczasowego manifestu APK. Komunikat nie instaluje kodu z Git
ani nie wdraża main. Serwer powinien udostępniać wyłącznie sprawdzony build
wdrożony istniejącym procesem. Ten commit nie wdraża serwera ani wydania.

Kontrola po instalacji: dodaj lokalną notatkę, zamknij aplikację, odłącz sieć
i otwórz ją ze skrótu; sprawdź notatkę i przejście między modułami. Następnie
zrestartuj Windows i powtórz uruchomienie. To ręczna kontrola urządzenia;
lokalny build i smoke PWA nie zastępują tej próby ani kontroli produkcyjnego HTTPS.

Instrukcja integracji z Windows: [Microsoft Edge — instalowanie i zarządzanie aplikacjami](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge).
