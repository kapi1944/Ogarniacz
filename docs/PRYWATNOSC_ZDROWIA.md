# Health 2.0 — prywatność dostępu (etap 8)

Etap 8 rozszerza istniejący PermissionGrant i repozytoria. Nie zmienia Dexie ani formatu backupu; zachowuje AES-256-GCM z etapów 5.1 (`1e3e233`) i 5.2 (`02d260c`).

| Kategoria | Uprawnienie Edytora | Synchronizacja aktualnego klienta |
| --- | --- | --- |
| Ogólne zdrowie | Dotychczasowe moduły: Zdrowie, Leki, Wizyty, Skierowania | Leki, dawki, wizyty, skierowania, recepty i definicje terapii według dotychczasowej konfiguracji |
| Dokumentacja medyczna | Dokumenty oraz Zdrowie / dokumentacja | Dokumenty i pliki nadal mogą być synchronizowane po włączeniu funkcji |
| Wyniki badań | Zdrowie / badania | Wykluczone |
| Dziennik psychiatryczny i samopoczucie | Zdrowie / samopoczucie | Wykluczone, także definicje skal |
| Notatki terapeutyczne | Zdrowie / psychoterapia; ćwiczenia dodatkowo Zadania | Wszystkie `wpisyTerapii`, również starsze bez znacznika, i oznaczone ćwiczenia wykluczone |
| Ważne informacje | Zdrowie / wazne_informacje | Wykluczone |
| Przyszłe nagrania i transkrypcje | Zarezerwowany prywatny zakres `nagrania` | Brak implementacji i przełącznika udającego ochronę |

Ogólny grant Zdrowia nie obejmuje prywatnych sekcji. Cofnięcie lub zmiana grantów/Edytora/konta ponownie montuje widoki, zamyka ich podglądy i formularze. Repozytoria i domenowy zapis dawek sprawdzają bieżący dostęp także przy wywołaniu z zachowanego obiektu lub starego callbacku. Usunięcie i przywrócenie korzystają z kontroli edycji; prywatny zapis wymaga również odczytu. Nie można usunąć klasyfikacji medycznej z istniejącego dokumentu przez zwykłą edycję.

Globalne wyszukiwanie, Pulpit i Dzisiaj korzystają z chronionych repozytoriów. Powiadomienia sprawdzają dostęp przed dostarczeniem i zachowują istniejące ukrywanie szczegółów. Echo nie otrzymuje notatek sesji ani sklasyfikowanych dokumentów medycznych, także dla właściciela. Historia filtruje odczyty zdrowia i dawne wpisy oznaczonych ćwiczeń. Pełny backup jest funkcją właściciela; jawny eksport ustawień pomija definicje dziennika. Eksport karty zdrowotnej pozostaje świadomym jawnym eksportem po podglądzie i ponownym sprawdzeniu danych/uprawnień.

Pierwsza zapisana sesja konta wiąże profil urządzenia z `wlascicielId` w lokalnym metadanym `ogarniacz-wlasciciel-danych`. Kolejne konto innego właściciela nie przejmuje lokalnego zdrowia, eksportu ani synchronizacji. Wylogowanie zachowuje wiązanie. W razie niezgodności wróć do właściwego konta lub użyj osobnego profilu przeglądarki/urządzenia. Nie ma automatycznego przenoszenia, kasowania ani drugiego systemu kont. Historyczna baza sprzed tej zmiany nie ma informacji o właścicielu: pierwsze wiązanie nie potwierdza jej wcześniejszego pochodzenia.

## Ochrona lokalna i ograniczenia

IndexedDB pozostaje jawna. Uprawnienia aplikacji i lokalny Podgląd Edytora nie chronią przed osobą kontrolującą urządzenie, narzędzia deweloperskie lub sam kod klienta. Tryb bez konta zachowuje dotychczasowe lokalne uprawnienia; nie stanowi uwierzytelnienia. Chroń konto systemowe, blokadę urządzenia i profil przeglądarki.

Zmiana nie dodaje treści zdrowia do logów, historii błędów, ustawień ani cache. Statyczny cache PWA nie jest magazynem zdrowia. Definicje skal pozostają w dotychczasowych lokalnych ustawieniach, objętych pełnym szyfrowanym backupem; nie trafiają do jawnego eksportu ustawień ani synchronizacji. Właściciel może nadal sam wpisać prywatny tekst do zwykłej notatki, zadania lub rozmowy z Echo — aplikacja nie zgaduje kategorii tekstu. Starsze dokumenty bez metadanych ani powiązań zdrowotnych wymagają ręcznego sklasyfikowania.

Istniejące natywne alarmy są uzgadniane przy pracy aplikacji; nie cofniemy już pokazanych powiadomień ani kopii udostępnionych wcześniej. Nie weryfikowano fizycznego Androida, produkcyjnego Raspberry ani rzeczywistej zawartości serwera. Zmiany ochrony API wymagają późniejszego świadomego wdrożenia; lokalny commit nie zmienia produkcji.

## Starsze dane na serwerze: procedura bez kasowania

Wcześniejszy klient mógł wysyłać nieoznaczone `wpisyTerapii` i definicje `terapie`, dokumenty/pliki, leki, dawki, wizyty, skierowania i recepty. Oznaczone sesje i ćwiczenia były wykluczane od etapu 5; dziennik od etapu 4, wyniki od etapu 6 i ważne informacje od etapu 7. Aktualny klient dodatkowo wyklucza całą tabelę notatek sesji, również jej historyczną kolejkę i pull. Nie usuwamy zdalnych rekordów.

Serwer SQLite przechowuje rekordy w `rekordy_synchronizacji`, JSON w `dane_json`, klucz właściciela w `uzytkownik_id`. API synchronizacji obsługuje `usunietoAt`/`deleted_at` jako soft-delete i nadal przechowuje JSON. Nie ma endpointu gwarantującego trwałe usunięcie treści. Samo oznaczenie jako usunięte nie wystarczy. Nowa kontrola API wymaga jawnego grantu dla dokumentacji i dawnych sesji oraz sprawdza również istniejący rekord przy edycji; ogólny grant nie pozwala ominąć ochrony usunięciem metadanych.

1. Użytkownik decyduje, czy przeglądać i usuwać dane serwera, których właścicieli, kategorii i okresów to dotyczy oraz czy zachować kopię. Osobno rozstrzyga dokumenty i pliki, definicje terapii oraz notatki; nie kasować całej tabeli zdrowia na podstawie domysłu.
2. Wstrzymać synchronizację na wszystkich urządzeniach, zamknąć starsze klienty. Zrobić zaszyfrowany backup lokalny oraz zabezpieczoną kopię SQLite zgodną z trybem WAL (właściwa kopia bazy, nie przypadkowa kopia jednego aktywnego pliku). Nie drukować treści rekordów do terminala ani logów.
3. Administrator przygotowuje tylko odczytową listę kandydatów według konkretnego `uzytkownik_id`, tabeli i ID, porównuje ją z danymi lokalnymi. Raport do zatwierdzenia zawiera kategorie, ID i liczby, bez treści sesji. Sprawdzić także pliki, konflikty na urządzeniach, starsze backupy serwera i politykę retencji.
4. Dopiero po zatwierdzeniu tej konkretnej listy przygotować osobne zadanie trwałego usunięcia w transakcji, z kontrolą liczby rekordów i możliwością odtworzenia zabezpieczonej kopii. Uwzględnić retencję backupów i pozostałości SQLite/WAL; zwykły SQL DELETE lub soft-delete nie potwierdza fizycznego wymazania nośnika.
5. Przed wznowieniem używać wyłącznie klienta z etapem 8. Sprawdzić brak usuniętych treści w odczycie serwera oraz brak ich ponownego przesłania. Lokalna baza nie jest automatycznie kasowana.

Żaden krok usuwający dane nie został wykonany w etapie 8.


## Zmienione pliki

- `docs/PRYWATNOSC_ZDROWIA.md`
- `server/konta.test.ts`
- `server/konta.ts`
- `server/serwer.ts`
- `src/app/DostawcaKonta.tsx`
- `src/app/KontekstAplikacji.tsx`
- `src/app/SilnikPrzypomnien.tsx`
- `src/data/KolejkaSynchronizacji.ts`
- `src/data/Repozytorium.ts`
- `src/modules/ustawienia/WidokUstawien.tsx`
- `src/modules/zdrowie/HistoriaZdrowia.tsx`
- `src/modules/zdrowie/SesjePsychoterapii.tsx`
- `src/modules/zdrowie/WidokSamopoczucia.tsx`
- `src/platform/NotificationService.ts`
- `src/services/BackupService.ts`
- `src/services/BadaniaService.ts`
- `src/services/echo/NarzedziaEcho.ts`
- `src/services/HistoriaZdrowiaService.ts`
- `src/services/HistoriaZmianService.ts`
- `src/services/KontaService.ts`
- `src/services/LekiService.ts`
- `src/services/PrywatnoscZdrowia.test.ts`
- `src/services/PrzypomnieniaLekow.ts`
- `src/services/PsychoterapiaService.test.ts`
- `src/services/PsychoterapiaService.ts`
- `src/services/SamopoczucieService.ts`
- `src/services/SyncEngine.ts`
- `src/services/TransferUstawienService.ts`
- `src/services/UprawnieniaService.ts`

## Weryfikacja lokalna

- Końcowe testy celowane: 326/326 w 25 plikach. Osobno UI globalnego wyszukiwania: 2/2 (łącznie 328 różnych testów).
- Serwer: 43/43 testów; server:build poprawny.
- Typecheck i build web/PWA: poprawne. Lint zmienionych plików: bez ostrzeżeń. Pełny lint: bez błędów, 20 istniejących ostrzeżeń poza zmianą.
- Pełna regresja uruchomiona wcześniej: 892/896. Dwa błędy WidokiPracy.test.tsx (Brak DostawcyAplikacji) odtworzono również z archiwum niezmienionego HEAD 0a7d51f. Dwa błędy czasowe RejestrPoczekalni/SynchronizacjaAplikacji przeszły przy osobnym powtórzeniu. Test wyboru wyniku wyszukiwania również raz nie przeszedł w większej grupie i przeszedł osobno; jego kod i mock źródła nie były zmieniane.
- Kontrole ID z bezpośredniego linku, zmian dostępu, relacji dokumentu i transferu wykonano w testach usług/IndexedDB oraz HTTP na lokalnym serwerze testowym. Nie wykonano manualnej akceptacji przeglądarkowej ani testu na fizycznym Androidzie lub produkcji.
- Nie wykonywano kasowania danych serwera, push, release ani deploy.
