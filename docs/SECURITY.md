# Bezpieczeństwo i dane użytkownika

## Reset hasła przez e-mail

Opcjonalne SMTP/API, token 256 bitów ważny 15 minut, w bazie tylko SHA-256.
Atomowy reset unieważnia wszystkie sesje i linki konta, zachowując UUID i stare
kody odzyskiwania. [Zabezpieczenia i konfiguracja operatora](ODZYSKIWANIE_HASLA_EMAIL.md).

## Hasła i sesje — etap 2

API dostępne dla każdej aktywnej tożsamości, również Edytora:

- `POST /api/account/password`: `aktualneHaslo`, `noweHaslo` (8–200 znaków); sukces unieważnia pozostałe sesje, zachowuje bieżącą.
- `GET /api/account/sessions`: wyłącznie własne niewygasłe sesje: `id`, `utworzonoAt`, `ostatniaAktywnoscAt`, `wygasaAt`, `biezaca`. ID jest losowe i niezależne od sekretu; odpowiedź nie zawiera tokenów ani hashy. Nie zbieramy User-Agent, IP ani identyfikatorów urządzeń do listy sesji.
- `POST /api/account/sessions/revoke`: `id`, ograniczone do użytkownika sesji uwierzytelniającej. Cudze/nieistniejące ID daje ten sam 404.
- `POST /api/account/sessions/revoke-all`: wszystkie sesje własnej tożsamości, niezależnie od aktywnego członkostwa, również bieżąca.
- `POST /api/account/sessions/revoke-others`: pozostałe własne sesje, z zachowaniem bieżącej i cudzych sesji; wymagany CSRF.
- `POST /api/account/users/password`: administrator podaje tylko UUID konta. W transakcji serwer zastępuje hash nieujawnionym losowym hasłem, ustawia wymuszenie zmiany, unieważnia sesje i stare kody oraz tworzy jeden kod odzyskiwania ważny godzinę. Odpowiedź pokazuje kod jeden raz; baza zawiera tylko hash. Użytkownik przez istniejące `POST /api/auth/recover` podaje kod i własne nowe hasło. Atomowe zużycie kodu uniemożliwia ponowne użycie; błędne nowe hasło wycofuje zużycie. Nie odzyskujemy dawnego hasła i nie tworzymy alternatywnego uwierzytelniania.
- Dotychczasowe `POST /api/auth/logout` wylogowuje bieżącą sesję. Usunięcie bieżącej sesji wygasza cookie z dotychczasowymi HttpOnly, Secure, SameSite=None.

Operacje zapisu wymagają istniejącego CSRF; listowanie nie rotuje CSRF. Odpowiedzi mają `Cache-Control: no-store`; istniejąca polityka CORS pozostaje zachowana. Panel nie zapisuje haseł ani listy sesji do storage i nie ustawia autofocus.

Limit nieudanych prób: 10 dla znormalizowanego e-maila i 50 dla adresu połączenia w oknie 15 minut. Obejmuje logowanie, odzyskiwanie i sprawdzanie hasła istniejącego konta przy zaproszeniu oraz zmianie hasła. Nieudany bootstrap/nieprawidłowy token zaproszenia zwiększa licznik adresu. Udane logowanie czyści wyłącznie licznik konta, nigdy adresu. Klucze kont są hashowane; mapa jest ograniczona do 10 000 wpisów i czyści wygasłe okna, a przy zapełnieniu odrzuca dalsze próby. Nie ufa `Forwarded` ani `X-Forwarded-For`. Za proxy adresowy limit jest wspólny dla klientów proxy, ale limit konta działa niezależnie od nagłówków i adresu. Liczniki są lokalne dla procesu/bazy i zerują się po restarcie; brak rozproszonego limitera.

### Ocena zwiększenia kosztu scrypt na Raspberry Pi 4

Etap zachowuje zapis `scrypt$N$r$p$sol$hash`, dotychczasowe N=16384, r=8, p=1, klucz 64 bajty i maxmem=64 MiB. Weryfikacja odczytuje parametry z istniejącego hasha; nie ma masowego przeliczenia ani zmiany algorytmu. To słabszy koszt od obecnych zaleceń [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt), np. N=131072/r=8/p=1 (około 128 MiB) albo N=32768/r=8/p=3 (około 32 MiB).

Stopniowe przejście jest możliwe: najpierw pomiar N=32768/r=8/p=1, następnie wariantu OWASP 32768/8/3 lub 131072/8/1. Pierwszy krok sam nie osiąga wskazanego kosztu OWASP. Przy r=8 pamięć rośnie w przybliżeniu od 16 do 32 i 128 MiB; [Node.js](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) wymaga maxmem powyżej kosztu 128*N*r z zapasem (dla N=131072 np. 192 MiB). Zwiększanie p podnosi koszt CPU przy podobnym głównym koszcie pamięci.

Nie wykonano pomiarów na Raspberry Pi 4 i nie zwiększono automatycznie parametrów. Przed podniesieniem kosztu trzeba zmierzyć czas logowania/zmiany hasła (w tym p95), RSS, temperaturę i opóźnienia pozostałych żądań na docelowym Pi z działającymi usługami. Obecny `scryptSync` blokuje pętlę zdarzeń: większy koszt wymaga oceny przejścia na asynchroniczny scrypt z ograniczoną liczbą równoległych operacji. Docelowy koszt można następnie stosować do nowych/zmienianych haseł i podnosić hash po poprawnym logowaniu, bez znajomości haseł z góry. Parametry starego hasha muszą nadal pozostawać obsługiwane; limit pamięci musi pozwalać sprawdzać najsilniejszy zapisany wariant także po cofnięciu konfiguracji. Te kroki wymagają osobnej implementacji i pomiarów.

## Nigdy nie rób
- nie commituj sekretów, kluczy API, tokenów, keystore,
- nie generuj nowego klucza podpisującego APK,
- nie obniżaj `versionCode`,
- nie usuwaj ani nie nadpisuj danych użytkownika podczas aktualizacji,
- nie wykonuj destrukcyjnych operacji „żeby naprawić” problem,
- nie wysyłaj danych użytkownika na zewnątrz bez świadomego włączenia funkcji,
- nie loguj sekretów ani pełnych danych osobowych,
- nie publikuj release z niewyjaśnioną regresją.

## Zawsze rób
- migracje przy zmianach schematu,
- backup przed operacjami ryzykownymi,
- minimalizację przesyłanych danych,
- rozdzielenie sekretów od kodu.

## Nienegocjowalne
- Brak sekretów w repo i froncie.
- Brak regresji danych użytkownika.
- Brak obniżania `versionCode`.
- Brak publikacji release z niewyjaśnioną regresją.
- Brak destrukcyjnych operacji bez backupu.
- Brak ukrytych kosztów i ukrytego wysyłania danych.

## Szyfrowanie kopii — Health 2.0, etap 5.1

`BackupService.szyfrujBackup` szyfruje cały istniejący backup (manifest, checksum, sekcje i transportowe Bloby). Ustawienia tworzą wyłącznie zaszyfrowane kopie; pobieranie kopii `before-restore` również wymaga hasła. Dotychczasowy `utworzBackup` pozostaje konstruktorem danych, używanym także przez zabezpieczenie przed restore. Nie zapisuje automatycznie jawnego pliku.

Algorytmy: natywne Web Crypto, AES-256-GCM z tagiem 128 bitów oraz PBKDF2-HMAC-SHA-256 z 600 000 iteracji. Każde szyfrowanie losuje sól 16 bajtów i IV 12 bajtów przez `crypto.getRandomValues`. Klucze są nieeksportowalne. Brak obsługi kryptografii kończy operację czytelnym błędem, bez jawnego eksportu. Liczba iteracji odpowiada wskazaniu [OWASP dla PBKDF2-HMAC-SHA-256](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2); parametry GCM korzystają z [Web Crypto](https://www.w3.org/TR/WebCryptoAPI/).

Koperta JSON:

```json
{
  "naglowek": {
    "format": "ogarniacz-backup-szyfrowany",
    "wersja": 1,
    "szyfr": "AES-256-GCM",
    "kdf": { "algorytm": "PBKDF2", "hash": "SHA-256", "iteracje": 600000, "sol": "<Base64: 16 bajtów>" },
    "iv": "<Base64: 12 bajtów>"
  },
  "szyfrogram": "<Base64: szyfrogram z dołączonym tagiem GCM>"
}
```

Nagłówek jest uwierzytelniany jako AAD: UTF-8 kanonicznego JSON według istniejącego `kanonizuj` (klucze obiektów posortowane, bez odstępów). Koperta v1 dopuszcza wyłącznie powyższe algorytmy i parametry; inne wartości są odrzucane przed KDF, również aby ograniczyć koszt przetwarzania niezaufanego pliku. Poza szyfrogramem nie ma manifestu ani informacji o rekordach. Rozmiar pliku pozostaje widoczny.

Import: rozpoznanie koperty → hasło → uwierzytelnione odszyfrowanie → dotychczasowa walidacja checksum, struktury i zgodności v1–v3 → podgląd manifestu → istniejące potwierdzenie i transakcyjny restore. Błędy przed restore nie zapisują niczego do bazy. Nie zmieniono schematu Dexie ani struktury rekordów.

Hasło żyje tylko w polu formularza i pamięci podczas operacji; pola są czyszczone przed przetwarzaniem lub po anulowaniu. Hasła i klucze nie trafiają do ustawień, storage, bazy ani logów. Bufory hasła i jawnych bajtów są zerowane po użyciu, ale JavaScript nie zapewnia wymuszonego wymazania stringów ani `CryptoKey` z pamięci.

Ograniczenia: brak odzyskiwania zapomnianego hasła; bezpieczeństwo zależy też od jego siły i urządzenia. UI zaleca długie, unikalne hasło. Cały JSON i Base64 są przetwarzane w pamięci, bez strumieniowania; test dużej kopii obejmuje 5 MiB treści. Wewnętrzna baza i historyczne jawne pliki nie są szyfrowane tą funkcją. Testy Web Crypto w Node/jsdom nie zastępują próby w PWA lub na Androidzie.

## Interfejs kopii — Health 2.0, etap 5.2

Panel rozróżnia integralność kopii, szyfrowanie eksportowanego pliku, lokalną bazę i synchronizację. Historyczne pliki v1–v3 są rozpoznawane bez hasła i wyraźnie oznaczone jako niezabezpieczone hasłem. Dla zaszyfrowanej kopii podgląd i wybór sekcji pojawiają się dopiero po odszyfrowaniu i walidacji. Formularze backupu nie mają autofocus; opcja „Pokaż hasło” działa na obu polach i nie zapisuje hasła w ustawieniach.

Przed przywracaniem użytkownik podaje nowe hasło dla pełnej kopii ochronnej bieżącego stanu. Istniejący `przywrocBackup` tworzy i waliduje `before-restore`, a następnie **czeka** na asynchroniczny callback `poUtworzeniuKopii`: szyfrowanie całej kopii oraz zapis wyłącznie zaszyfrowanego pliku przez istniejącą usługę plików. Błąd lub odrzucenie callbacku zatrzymuje operację przed transakcją zapisu. Nazwa pliku zawiera pełny czas, aby kolejne kopie w tym samym dniu nie nadpisywały wcześniejszych.

Android czeka na zapis przez SAF oraz zgodny pełny odczyt dokumentu; anulowanie lub błąd blokuje restore. PWA/desktopowa przeglądarka potwierdza tylko rozpoczęcie pobierania, więc dodatkowe potwierdzenie „Mam zapisaną kopię — przywróć” wymaga sprawdzenia pobranego pliku przez użytkownika. Anulowanie lub zamknięcie panelu przed zakończeniem zabezpieczenia kopii blokuje przywracanie. Ponowne pobranie dostępnej kopii ochronnej przekazuje już zaszyfrowany plik; nie eksportuje jawnych danych.

### Próba na Samsungu (na wersji zawierającej etap 5.2)

1. W Ustawieniach otwórz Dane / Backup. Sprawdź, że klawiatura nie otwiera się sama, także po wybraniu tworzenia kopii.
2. Na danych testowych wybierz sekcje, utwórz zaszyfrowany backup, wpisz i potwierdź hasło. Sprawdź „Pokaż hasło”, następnie zapisz plik. W aplikacji Android wybierz miejsce w systemowym oknie SAF i sprawdź tam plik; w PWA w pobranych plikach przeglądarki. Szczegóły i ograniczenia udostępniania opisuje `ANDROID.md`.
3. Wybierz zapisany plik do przywracania. Anuluj pierwszą próbę, potem sprawdź błędne hasło. Podgląd sekcji nie powinien się pojawić. Przy poprawnym haśle sprawdź dane i wybór sekcji.
4. Na danych testowych rozpocznij przywracanie, ustaw hasło kopii ochronnej i sprawdź zapis pliku `ogarniacz-before-restore-…json` przed zmianą danych. W PWA najpierw sprawdź pobrany plik i dopiero wtedy potwierdź przywrócenie. Anulowanie tego potwierdzenia nie zmienia bazy.
5. Sprawdź import starszej jawnej kopii: bez pytania o hasło, z informacją o braku zabezpieczenia. Jej przywracanie nadal wymaga szyfrowanej kopii ochronnej.

Automatyczne testy obejmują logikę Web Crypto, UI w jsdom oraz czekanie na callback przed zapisem w IndexedDB. Zmiana nie obejmuje SyncEngine, Echo ani logiki Zdrowia. Build webowy nie potwierdza działania fizycznej klawiatury Samsunga ani natywnego zapisu plików.
