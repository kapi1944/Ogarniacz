# Odzyskanie istniejącego konta na Raspberry Pi

Procedura dla administratora własnego systemu z dostępem SSH do konta `kacper`.
Nie wymaga zalogowania do aplikacji, działającej poczty ani starego hasła/kodu.
Nie tworzy konta i nie uruchamia bootstrapu, migracji, restore ani aktualizacji usługi.

## Potwierdzone środowisko — 2026-10-24

Odczyt przez SSH: `ogarniacz.service` działa jako `kacper:kacper`, UMask `0027`,
Node `/usr/bin/node` 24.20.0. `DATABASE_PATH` wskazuje
`/home/kacper/apps/Ogarniacz/data/ogarniacz.sqlite`; baza ma schemat 8 i tabelę
`tokeny_resetowania_hasla`. Backend nasłuchuje na `http://127.0.0.1:8787`,
aplikacja jest dostępna pod `https://raspberrypi.tailb0bcf2.ts.net`.

`/home/kacper` ma `0700`, bez dodatkowych grantów ACL, i chroni cały podkatalog
aplikacji. `apps`, repo i `data` mają `0775`, baza/WAL/SHM `0644`, właściciel
`kacper:kacper`; sama ta szerokość trybów nie udostępnia plików przez prywatny
katalog nadrzędny. Nie rozluźniaj `0700` ani nie dodawaj dostępu innym użytkownikom.
Narzędzie ponownie sprawdza tę granicę, właścicieli, dowiązania oraz dostęp OS.

## Przygotowanie narzędzia — bez zmiany produkcyjnej bazy

Poniższe czynności wykonuje Właściciel, gdy zdecyduje się skorzystać z procedury.
Nie wykonano ich automatycznie w ramach implementacji. Połącz się przez znany,
zweryfikowany klucz SSH; nie wyłączaj sprawdzania klucza hosta:

```bash
ssh -t kacper@raspberrypi
id
stat -c '%U:%G %a %n' /home/kacper /home/kacper/apps/Ogarniacz/data/ogarniacz.sqlite
```

Zainstaluj **tylko samodzielny skrypt** z poniższego, niezmiennego commita,
jako `kacper`, bez `sudo`. Nie przełączaj działającego checkoutu na `main`.
Fetch pobiera obiekty Git; nie aktualizuje aplikacji ani `rpi-stable`.
Wymagany jest Node 24 z `node:sqlite`, bez dodatkowych pakietów.

```bash
umask 077
install -d -m 0700 /home/kacper/.local/lib/ogarniacz
git -C /home/kacper/apps/Ogarniacz fetch origin main
git -C /home/kacper/apps/Ogarniacz show 303faa6a551bc561a84d213697f6825d0508c863:scripts/odzyskaj-konto-rpi.mjs > /home/kacper/.local/lib/ogarniacz/odzyskaj-konto-rpi.mjs.nowy && printf '%s\n' '2204c76d2f614ff33f928a854f44156c229ccb946318204700e29d040176c96b  /home/kacper/.local/lib/ogarniacz/odzyskaj-konto-rpi.mjs.nowy' | sha256sum --check - && install -m 0700 /home/kacper/.local/lib/ogarniacz/odzyskaj-konto-rpi.mjs.nowy /home/kacper/.local/lib/ogarniacz/odzyskaj-konto-rpi.mjs
```

Kontynuuj dopiero po wyniku `OK` i poprawnym zakończeniu instalacji. Skrypt nie
wczytuje `.env`, nie przyjmuje dowolnej ścieżki produkcyjnej i nie podnosi uprawnień.
Uruchomienie jako root lub przez `sudo` jest odrzucane. Konto `kacper` i root już
mają administracyjny dostęp do bazy; narzędzie nie dodaje im nowego uprawnienia.

## Tylko odczyt — wybór właściwego konta

```bash
/usr/bin/node /home/kacper/.local/lib/ogarniacz/odzyskaj-konto-rpi.mjs list
```

Lista zawiera wyłącznie UUID, login, e-mail, rolę systemową, status oraz kolumnę
`wlasciciel` (`1` oznacza aktywne własne członkostwo Właściciela). Wybierz istniejące
konto po tych danych i skopiuj jego UUID. Rola systemowa administratora jest
niezależna od roli Właściciela. Lista otwiera SQLite z `readOnly: true`; nie zapisuje
rekordów ani nie ujawnia hashy, sesji lub prywatnych danych synchronizacji.

## Zapis do bazy — jednorazowy link po decyzji Właściciela

Wyłącz nagrywanie terminala/SSH i udostępnianie ekranu. Nie używaj `tee`, przekierowań,
logowania tmux ani `script`. Terminal z PTY może być nagrywany — skrypt tego nie wykrywa.
Nie zapisuj linku w historii, logach, notatkach ani zgłoszeniach. UUID nie jest sekretem:

```bash
/usr/bin/node /home/kacper/.local/lib/ogarniacz/odzyskaj-konto-rpi.mjs issue --user-id UUID_Z_LISTY
```

Zastąp `UUID_Z_LISTY` dokładną wartością z tabeli. Sprawdź wskazane konto, a na pytanie
terminala wpisz `odzyskaj UUID_Z_LISTY` z tym samym UUID. Inna odpowiedź anuluje operację.
Wymagany jest interaktywny terminal zarówno na wejściu, jak i wyjściu.

Po zatwierdzeniu narzędzie w `BEGIN IMMEDIATE` sprawdza aktywność konta, zastępuje
jego wcześniejsze linki i zapisuje tylko SHA-256 tokenu z 32 losowych bajtów, ważnego
15 minut. Samo wydanie linku **nie zmienia hasła ani sesji**. Nie ma nowych endpointów.
SQLite czeka na blokadę do 5 sekund; narzędzie współpracuje z działającym backendem.

## Ustawienie hasła i logowanie

1. W zaufanej przeglądarce z dostępem Tailscale otwórz wyświetlony link
   `https://raspberrypi.tailb0bcf2.ts.net/#reset-hasla=…`. Nie wpisuj tokenu do query URL.
   Fragment nie jest wysyłany do serwera przy nawigacji i aplikacja usuwa go z historii.
2. Ustaw własne nowe hasło (8–200 znaków) i potwierdź je. Formularz używa istniejącego
   `POST /api/auth/password/reset`; token jest przesyłany w ciele HTTPS, hasło hashowane
   obecnym scrypt. Otwarcie linku nie zużywa tokenu, zatwierdzony reset zużywa go raz.
3. Po sukcesie wybierz „Przejdź do logowania”. Zaloguj się e-mailem lub loginem z listy
   i nowym hasłem. Wszystkie wcześniejsze sesje konta są unieważnione; konto zachowuje
   UUID, członkostwa, granty, kody odzyskiwania, profile i rekordy użytkownika.
4. Potwierdź właściwe konto i dostęp do jego danych. Nie twórz nowego Właściciela.
   Zachowaj stary profil Chromium HTTP z oczekującą zmianą. Sam reset w HTTPS nie
   migruje IndexedDB ani kolejki między originami i nie potwierdza synchronizacji.

## Odmowa lub błąd

- **Uprawnienia/ścieżka:** sprawdź `id` i `stat` z sekcji przygotowania. Nie używaj
  `sudo node`, `chmod 777`, nie zmieniaj właściciela bazy ani nie obchodź dowiązań.
  Zmiana prywatnego katalogu, ACL, użytkownika usługi lub ścieżki wymaga osobnego
  kroku administracyjnego i oceny ochrony bazy/WAL/SHM. Narzędzie ma wtedy odmówić.
- **Brak bazy/schematu 8:** zatrzymaj procedurę. Nie twórz pustej bazy, nie uruchamiaj
  bootstrapu ani migracji. Potrzebna jest osobno zatwierdzona naprawa/wdrożenie backendu.
- **Baza zajęta:** spróbuj później. Nie usuwaj WAL/SHM i nie restartuj usługi.
  Przy błędach I/O lub ponownych ostrzeżeniach o napięciu najpierw zapewnij stabilne
  zasilanie i osobno uzgodnij diagnostykę oraz backup przez SQLite backup API.
  Nie kopiuj aktywnej bazy zwykłym `cp`. Ewentualna przerwa serwisowa wymaga zgody.
- **Błędny UUID/nieaktywne konto:** ponów `list`; narzędzie nie zmienia statusu ani roli.
- **Link nieważny/użyty lub odświeżenie formularza:** ponownie otwórz ważny link lub
  świadomie wydaj nowy. Nowe wydanie unieważnia poprzedni link tego konta.

Tryb deweloperski `--test-db /bezwzgledna/sciezka/syntetyczna.sqlite` działa tylko
w katalogu tymczasowym systemu i wymaga jawnego znacznika `odzyskiwanie_testowe`
z wierszem `nazwa='syntetyczna'`. Na Linux nadal sprawdza uprawnienia OS; na Windows
obsługuje wyłącznie syntetyczne testy, nigdy bazę produkcyjną.

## Ustawienia i zakres weryfikacji

„Konto i bezpieczeństwo” udostępnia metadane konta, wspólny formularz hasła, aktywne
sesje i opis metod odzyskiwania. Zwykła zmiana hasła zachowuje bieżącą sesję,
unieważnia pozostałe i potwierdza sukces dopiero po zapisie serwera. Nie raportujemy
dostępności poczty, ponieważ backend nie udostępnia bezpiecznego kontraktu jej statusu.
Konfiguracja operatora: [Odzyskiwanie przez e-mail](ODZYSKIWANIE_HASLA_EMAIL.md).

Testy używają izolowanych kont i baz, w tym WAL oraz prawdziwego lokalnego HTTP.
Odczyt konfiguracji/uprawnień Pi nie oznacza wykonania resetu. Nie wygenerowano
produkcyjnego tokenu, nie zmieniono haseł, sesji, danych przeglądarki, launcherów
ani `rpi-stable`. Fizyczna akceptacja Samsunga i kiosku Pi pozostaje do osobnej próby.
