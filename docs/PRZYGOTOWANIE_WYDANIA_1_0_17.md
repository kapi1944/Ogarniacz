# Przygotowanie wydania 1.0.17 — 17 października 2026

Stan: **WYMAGA DZIAŁANIA**. Ten dokument nie zatwierdza publikacji ani wdrożenia.

## Aktualizacja kontroli — 19 października 2026

Poniższe ustalenia aktualizują historyczny stan opisany dalej. **BLOKADA publikacji pozostaje po stronie Samsunga; brak dostępu do Google Drive został usunięty.**

- `main` lokalnie i na origin: `27b923836de4bd06d40d5c75e46432f55762f480`; CI tego SHA zakończone sukcesem.
- Folder Google Drive `__OGARNIACZ` (`1Gp__hh00lfZ0ND3fp2_6y36J2boBFzFG`) ma dostęp ograniczony. Oba zaszyfrowane JSON-y są obecne i nieudostępnione publicznie. Ponowne pobranie obu plików dało identyczne SHA-256 jak lokalne kopie poza repo. Rozmiary: 10869 i 11761 bajtów; koperta AES-256-GCM / PBKDF2 SHA-256, 600000 iteracji.
- Nie odszyfrowano rzeczywistych JSON-ów ani nie potwierdzono ich wewnętrznej checksum/kompletności. Zgodność kopii transportowej i poprawny nagłówek nie potwierdzają przywracalności. Potwierdzenia obok plików wskazują Windows: adres Tailscale oraz deklarowany localhost, którego przypisania do Ogarniacza nie zweryfikowano. Żaden z tych plików nie jest potwierdzonym eksportem Samsunga.
- Archiwum `C:\Users\Kacper\.ogarniacz\backups\przed-1.0.17\windows-20261018-162223\ogarniacz-windows.7z` istnieje: 711087797 bajtów. Bieżący SHA-256 zgadza się z `wynik.json`: `EB52537C90305416F01A9240019FF9D7AD646C99361425C029F0FB68FF311032`. Raport ma `ZWERYFIKOWANO`, po 7709 plików źródłowych i archiwalnych; zapisane kody testu błędnego hasła i odszyfrowania to odpowiednio 2 i 0. W tej kontroli sprawdzono zachowany raport i hash, nie powtarzano testu z hasłem. Jest to kopia wybranych magazynów Chrome, nie pełnego profilu; brak testu uruchomienia aplikacji po odtworzeniu. Archiwum nie zostało wysłane na Drive.
- Testy lokalne: `BackupService.test.ts`, `BackupProfili.test.ts`, `BackupUstawien.test.tsx` — **91/91 PASS**. To regresja kodu backupu, nie test odszyfrowania prywatnych plików ani dowód bezpieczeństwa telefonu.
- `adb devices` nadal nie wykrywa urządzenia. Aktualnego stanu kolejki/konfliktów Samsunga i zabezpieczenia jego danych nie potwierdzono. Dawny stan 3 oczekujących zmian nie jest potwierdzeniem bieżącego stanu. Sam eksport aplikacji nie zawiera kolejki synchronizacji.
- JSON-y pozostają lokalnie i poza repo; Git ich nie śledzi, reguły ignorowania działają. Nie wykonano nowych commitów/push, przepisywania historii, release, deployu, migracji, restartów, synchronizacji ani zmian kont.

Następny etap: odczytać na Samsungu wersję aplikacji i liczniki kolejki/konfliktów, potwierdzić pochodzenie oraz zakres kopii z telefonu, a następnie uzgodnić zabezpieczenie ewentualnych oczekujących zmian. Nie włączać synchronizacji tylko po to, aby wyzerować liczniki. Wdrożenie i rzeczywisty test SMTP nadal wymagają osobnego zatwierdzenia; bezpośrednio przed wdrożeniem potrzebny jest świeży snapshot SQLite istniejącą procedurą.

## Potwierdzone podczas przygotowania

- Lokalny `main` i zdalny `main`: `ef4394c83b38afd33d26db92e597236b608b61fb`.
- Zdalny `rpi-stable` i rzeczywisty HEAD Pi: `1b2cda513eb348cf33c1bfce0500473aa83acbb8`; main jest 16 commitów dalej. Gałęzi nie przesuwano.
- Przyjęto zakończone CI Web/Android i próbę migracji 4→8; nie powtarzano audytów, testów ani migracji.
- W `/etc/ogarniacz/ogarniacz.env` na Pi przygotowano poniższe ustawienia. Zachowano pozostałe wpisy, właściciela `root:kacper` i tryb `0640`. Przed zapisem utworzono chronioną kopię konfiguracji `ogarniacz.env.przed-smtp-…` w tym samym katalogu, tryb `0600`.

```dotenv
MAIL_PROVIDER=off
MAIL_FROM=kacper.madej.97@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=kacper.madej.97@gmail.com
SMTP_PASSWORD=
PASSWORD_RESET_ORIGIN=https://raspberrypi.tailb0bcf2.ts.net
```

Istniejący wpis CORS zachowano dokładnie:

```dotenv
CORS_ALLOWED_ORIGINS=https://localhost,https://raspberrypi.tailb0bcf2.ts.net
```

Nie konfiguruje się stałego odbiorcy. `server/konta.ts` odczytuje e-mail aktywnego konta z SQLite i przekazuje `konto.email` do wysyłki. Adres Gmail powyżej jest nadawcą i loginem SMTP.

Wysyłka pozostaje wyłączona. Nie restartowano ani nie przeładowywano usługi; działający proces nie wczytał nowej konfiguracji.

## Kopia SQLite z 17 października

Zweryfikowano istniejący plik:

`/home/kacper/apps/Ogarniacz/data/backup-reczny/ogarniacz-przed-kontami-2026-10-17T09-36-41-115Z.sqlite`

Rozmiar: 143360 bajtów, tryb `0600`. SHA-256:

`430074d3c9fbd6695de8e27fbeaca6b94d7ce9fb3ca8b2c4efb75ef600470b63`

`integrity_check=ok`, bez naruszeń kluczy obcych. Kontrola objęła także oddzielną tymczasową kopię plików SQLite/WAL/SHM. WAL ma 0 bajtów, więc główny plik zawiera kompletny snapshot. Hashe oryginalnych składników przed kontrolą i po niej są zgodne. Nie odczytywano ani nie wypisywano rekordów użytkownika. Nie wykonywano migracji ani próby przywracania do produkcji.

Kopię dodatkowo zapisano poza Pi, z identycznym SHA-256:

`C:\Users\Kacper\.ogarniacz\backups\przed-1.0.17\ogarniacz-przed-kontami-2026-10-17T09-36-41-115Z.sqlite`

Katalog Windows ograniczono ACL do bieżącego użytkownika i SYSTEM. Jest to kopia SQLite chroniona uprawnieniami, nie zaszyfrowany eksport aplikacji. Nie potwierdzono szyfrowania dysku Windows — odczyt stanu BitLockera wymaga uprawnień administratora. Kopia potwierdza snapshot z godziny 11:36 czasu polskiego, nie późniejsze zmiany. Bezpośrednio przed przyszłym wdrożeniem należy wykonać świeży snapshot istniejącą procedurą SQLite Backup API, z WAL i kontrolą integralności.

## Pozostałe działania operatora

### 1. Hasło aplikacji Google — wyłącznie poza rozmową

Na koncie nadawcy włącz weryfikację dwuetapową, jeżeli jeszcze nie działa, i utwórz hasło aplikacji o nazwie np. `Ogarniacz Pi SMTP` w [ustawieniach Google](https://myaccount.google.com/apppasswords). [Oficjalna instrukcja Google](https://support.google.com/mail/answer/185833?hl=pl) opisuje wymagania i ograniczenia dostępności tej funkcji.

We własnym terminalu, poza narzędziami Codexa i nagrywaniem sesji, otwórz:

```powershell
ssh -t kacper@100.103.132.111 "sudo nano -I /etc/ogarniacz/ogarniacz.env"
```

Uzupełnij tylko istniejącą linię `SMTP_PASSWORD=` hasłem aplikacji Google, bez separatorów spacji. Nie używaj zwykłego hasła konta Google. Zapisz przez Ctrl+O, Enter i zamknij Ctrl+X. Edytor z opcją `-I` ignoruje konfigurację nano; sekret nie jest argumentem polecenia ani wpisem historii powłoki. Nie przesyłaj pliku, zrzutu ekranu ani sekretu do rozmowy.

Pozostaw `MAIL_PROVIDER=off`, nie zmieniaj CORS i nie restartuj usługi. Uprawnienia można sprawdzić bez odczytu zawartości:

```powershell
ssh kacper@100.103.132.111 "stat -c '%U:%G %a' /etc/ogarniacz/ogarniacz.env"
```

Oczekiwane: `root:kacper 640`.

### 2. Samsung — eksport danych nie jest pełnym snapshotem

Kod eksportu zarówno na aktualnym main, jak i we wdrożonej wersji Pi pomija tabele `kolejkaSynchronizacji`, `konfliktySynchronizacji` i `stanSynchronizacji`. Eksport obejmuje wybrane sekcje rekordów i pliki dokumentów. Historia zmian nie jest zaznaczona domyślnie. Eksport dotyczy bieżącej bazy/profilu; nie stanowi kopii wszystkich profili, rejestru profili ani całej pamięci aplikacji. Szyfrowanie nie rozszerza jego zakresu. Nie zweryfikowano rzeczywistego pliku z telefonu ani wersji aplikacji na Samsungu; ADB nie widzi urządzenia.

Na telefonie otwórz Ustawienia → Dane / Backup, wybierz wszystkie sekcje, również historię, utwórz szyfrowany plik i skopiuj go poza aplikację, najlepiej także poza telefon. Zachowaj hasło samodzielnie. W panelu synchronizacji sprawdź liczbę zmian oczekujących oraz konfliktów; do oceny wystarczą liczby, bez treści danych.

Jeżeli kolejki lub konflikty są niepuste, sam eksport nie zabezpiecza ich stanu. Przed publikacją trzeba uzgodnić i wykonać pełne zabezpieczenie lokalnej bazy, zamiast uznawać eksport za kompletną kopię. Obecny manifest ma `android:allowBackup="false"`; nie ma tu potwierdzonej ścieżki pełnego snapshotu produkcyjnej aplikacji przez zwykły backup Androida. Nie instaluj debug APK, nie odinstalowuj aplikacji, nie czyść danych ani nie przełączaj kont w celu wykonania kopii. Puste kolejki nie dowodzą pełności eksportu, ale usuwają ryzyko utraty ich niepustej zawartości.

### 3. Windows — zachowanie IndexedDB

Znaleziono katalog originu Pi w Chrome:

`C:\Users\Kacper\AppData\Local\Google\Chrome\User Data\Default\IndexedDB\https_raspberrypi.tailb0bcf2.ts.net_0.indexeddb.leveldb`

Nie otwierano baz, nie migrowano ich i niczego w nich nie usuwano. Na komputerze istnieją też katalogi baz originów localhost; nie należy ich mylić z produkcyjnym adresem Pi.

Przed otwarciem nowego wydania zamknij Ogarniacza/PWA i Chrome, również procesy działające w tle. Wykonaj kopię całego `C:\Users\Kacper\AppData\Local\Google\Chrome\User Data` do zaszyfrowanego archiwum lub na zaszyfrowany nośnik. Pełny katalog zachowuje IndexedDB, ewentualne pliki Blob, Local Storage oraz plik `Local State`; sam eksport rekordów tego nie zapewnia. Kopia całego profilu obejmuje również inne prywatne dane przeglądarki, więc przechowuj ją lokalnie i w szyfrowaniu. Nie kopiuj tylko wybranych plików LevelDB podczas działania przeglądarki. Potwierdzono możliwość wykonania kopii plikowej; nie wykonano tej kopii ani próby jej odtworzenia.

### 4. Osobne zatwierdzenie kontrolowanego wdrożenia

Dopiero po zabezpieczeniu danych należy osobno zatwierdzić wdrożenie nowego backendu istniejącym aktualizatorem. `MAIL_PROVIDER=smtp` wolno aktywować dopiero w ramach tego kontrolowanego wdrożenia. Rzeczywiste doręczenie przez Gmail, dostęp do prywatnego linku oraz reset na uzgodnionym koncie należy sprawdzić po wdrożeniu zgodnie z `ODZYSKIWANIE_HASLA_EMAIL.md`, przed oficjalnym udostępnieniem funkcji. Ta próba zmienia hasło i unieważnia sesje, więc nie została wykonana w tym zadaniu. Nie usuwaj dotychczasowych sposobów odzyskiwania.

## Automatyczne wdrażanie Pi

Potwierdzono na żywym Pi: `ogarniacz-update.timer` jest `disabled` i `inactive`, `ogarniacz-update.service` jest `inactive`; `ogarniacz-update-auto.timer` nie jest zainstalowany. Brak `RPI_AUTO_UPDATE` w konfiguracji. W sprawdzonych systemowych crontabach i crontabach użytkowników nie znaleziono wpisów aktualizujących Ogarniacza. Workflow publikacji jest ręczny i może zatwierdzić `rpi-stable`, ale nie wykonuje SSH/deployu na Pi. **Brak aktywnej automatycznej ścieżki wdrażania Ogarniacza na Pi w sprawdzonej konfiguracji.**

Nie wykonano release, deployu, migracji produkcyjnej, restartów, aktywacji poczty ani zmian kont.
