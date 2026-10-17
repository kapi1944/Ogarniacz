# Odzyskiwanie hasła przez e-mail

Rozszerzenie istniejących kont, bez zmiany historycznych UUID. Na bazowym
`31223e2` nie było infrastruktury wysyłki e-mail. Dodano SMTP (Nodemailer) oraz
opcjonalne API Resend. Domyślnie poczta jest wyłączona. Nie uruchomiono produkcji,
migracji produkcyjnej, release, deployu ani usług Pi.

## Ustawienia operatora

Uzupełnij wyłącznie na Pi istniejący `/etc/ogarniacz/ogarniacz.env`
(root:kacper, tryb 0640). Sekretów nie wpisuj do repozytorium ani `VITE_*`.

| Zmienna wspólna | Wartość |
| --- | --- |
| `MAIL_PROVIDER` | `smtp` lub `resend`; `off` albo brak wyłącza wysyłkę |
| `MAIL_FROM` | Jeden adres nadawcy zaakceptowany przez operatora, bez nazwy wyświetlanej |
| `PASSWORD_RESET_ORIGIN` | Dokładny prywatny origin aplikacji, np. `https://pi.twoj-tailnet.ts.net`, bez końcowego `/`, ścieżki, query i fragmentu |
| `CORS_ALLOWED_ORIGINS` | Zachowaj dotychczasowe originy i dodaj adres aplikacji, np. `https://localhost,https://pi.twoj-tailnet.ts.net` |

Wariant `MAIL_PROVIDER=smtp`:

| Zmienna | Wartość od operatora |
| --- | --- |
| `SMTP_HOST` | Nazwa serwera SMTP |
| `SMTP_PORT` | Zwykle `465` dla TLS od początku albo `587` dla STARTTLS |
| `SMTP_SECURE` | `true` dla 465, `false` dla 587; STARTTLS nadal obowiązkowe |
| `SMTP_USER` | Login SMTP |
| `SMTP_PASSWORD` | Hasło aplikacyjne / sekret SMTP |

Wymagane są uwierzytelnione SMTP, TLS co najmniej 1.2 i prawidłowy certyfikat.
Nie ma nieszyfrowanego fallbacku. Pi potrzebuje połączenia wychodzącego do hosta
i portu operatora. Samo konto pocztowe bez uprawnień SMTP nie wystarczy.
[Dokumentacja SMTP](https://nodemailer.com/smtp).

Wariant `MAIL_PROVIDER=resend`: dodatkowo ustaw `MAIL_API_KEY` na klucz
ograniczony do wysyłki i właściwej domeny; nie potrzeba zmiennych SMTP.
Pi łączy się z `https://api.resend.com/emails` przez wychodzący HTTPS/443.
Zweryfikuj domenę nadawcy u operatora, dodaj podane przez niego rekordy SPF/DKIM
i skonfiguruj DMARC. [Dokumentacja API](https://resend.com/docs/api-reference/emails/send-email).

Wyłącz śledzenie kliknięć i przepisywanie linków u operatora. Tailscale jest
adresem aplikacji, nie domeną nadawcy. Dla własnej domeny nadawcy potrzebujesz
kontroli DNS; przy SMTP skrzynki operatora użyj dozwolonego przez niego adresu.
Nie aktywowano płatnych usług.

## Przepływ i zabezpieczenia

- „Nie pamiętasz hasła?” wywołuje `POST /api/auth/password/request` z `email`.
  Wiadomość trafia wyłącznie na zapisany adres aktywnego istniejącego konta.
  Brak konta, nieaktywne konto, brak poczty, limit i awaria operatora dają ten sam
  status 202 i komunikat. Wysyłka następuje po odpowiedzi, bez czekania na dostawcę.
  Prośba nie zmienia hasła, kodów ani sesji.
- Token: 32 losowe bajty, ważność 15 minut. SQLite zapisuje tylko SHA-256,
  UUID konta i termin ważności. Wygasłe tokeny są usuwane przy kolejnych wydaniach.
- Link: `https://pi.tailnet.ts.net/#reset-hasla=…`. Origin pochodzi wyłącznie
  z konfiguracji, nigdy z Host/Forwarded. Fragment nie trafia do żądań HTTP
  ani Referer. Klient usuwa go z bieżącej historii przed startem profili.
  Token pozostaje w pamięci; po odświeżeniu trzeba ponownie otworzyć link
  z wiadomości. Samo otwarcie linku nie zużywa tokenu.
- `POST /api/auth/password/reset` przyjmuje `token` i `noweHaslo` (8–200 znaków),
  bez starego hasła, kodu ani sesji. Korzysta z obecnego scrypt. Zużycie tokenu,
  zmiana hasła, usunięcie pozostałych linków konta, wyzerowanie wymuszenia zmiany
  hasła i usunięcie wszystkich sesji użytkownika są atomowe. Użytkownik następnie
  loguje się ponownie. Błąd hasła/transakcji nie zużywa tokenu.
- Każda zmiana hasła, e-maila lub statusu konta unieważnia wcześniej wydane linki.
- Prośby: 3 na znormalizowany e-mail i 20 na adres połączenia / 15 minut,
  również dla nieznanych kont. Oddzielna mapa do 10 000 kluczy, bez blokowania
  zwykłego logowania. Użycie tokenu korzysta z obecnego limitera uwierzytelniania:
  do 50 prób na adres / 15 minut, potem 429. Nie ufamy X-Forwarded-For.
  Za Tailscale Serve limit adresowy może być wspólny dla klientów proxy.
  Liczniki są w pamięci procesu i zerują się po restarcie; nie są rozproszone.
- Transport ogranicza równoległość do 10 wysyłek i ustawia timeouty.
  Nie ma trwałej kolejki ani automatycznego ponawiania po restarcie procesu.
  Błąd wysyłki usuwa token tej wiadomości i nie narusza innych linków.
- Nowe endpointy wymagają JSON, odrzucają obcy Origin i zwracają `no-store`.
  Logi protokołu SMTP są wyłączone; log awarii to stały tekst bez odpowiedzi
  operatora, e-maila, hasła, tokenu i klucza API.

Dostawca otrzymuje nadawcę, odbiorcę i tekst wiadomości z prywatnym linkiem
oraz tokenem — to konieczne do doręczenia. Nie otrzymuje hasła ani danych
domenowych Ogarniacza. Retencja treści i logi operatora zależą od jego ustawień
i regulaminu; skrzynka odbiorcza przechowuje wiadomość. `MAIL_PROVIDER=off`
wyłącza nowe wysyłki po wczytaniu konfiguracji przez proces. Już wydane linki
pozostają ważne do zużycia, wygaśnięcia lub zmiany konta.

## Dane i zgodność

SQLite 7 → 8 dodaje `tokeny_resetowania_hasla`, indeks konta i trigger
unieważniania linków. Migracja jest transakcyjna i idempotentna. Zachowuje
konta, UUID, członkostwa, granty, stare kody, sesje i rekordy synchronizacji;
nie zmienia IndexedDB. Uruchomi się przy przyszłym starcie zaktualizowanego
backendu. Testy jednostkowe korzystają z baz syntetycznych; końcowa kontrola
objęła również osobną kopię istniejącego backupu produkcyjnego w wersji 4.
Przed przyszłym wdrożeniem zabezpiecz aktualną bazę procedurą backupu instalacji.

„Odzyskaj dostęp”, `POST /api/auth/recover` i reset administracyjny pozostają
dostępne. Reset e-mailowy nie usuwa starych kodów. Nie usuwaj starej ścieżki
przed potwierdzeniem rzeczywistego doręczenia i skutecznego resetu.

## Próba po osobno zatwierdzonym wdrożeniu

1. Sprawdź zapisany e-mail konta i dostęp właściciela do skrzynki. Nie twórz
   drugiego konta i nie zmieniaj UUID. Uzupełnij konfigurację operatora.
2. Po osobno zatwierdzonym wdrożeniu i wczytaniu ustawień poproś o link.
   Sprawdź doręczenie, nadawcę, spam i brak przepisywania linku.
3. Otwórz wiadomość w przeglądarce na urządzeniu z aktywnym Tailscale i dostępem
   do Pi. Korzystamy z istniejącego Serve/HTTPS, bez Funnel i publicznych portów.
   Jest to ścieżka webowa, nie nowy Android App Link.
4. Ustaw hasło, zaloguj się na tym samym koncie i potwierdź dostęp do danych
   oraz wylogowanie innych sesji. Sprawdź odrzucenie ponownego użycia linku
   i wygaśnięcie nieużytego linku po 15 minutach.

Testy automatyczne korzystają z syntetycznych kont i atrap transportu;
nie potwierdzają doręczenia przez operatora ani działania w prawdziwym tailnecie.

## Końcowa kontrola — 2026-10-17

Reset przetestowano przez rzeczywiste lokalne HTTP bez cookie, sesji i CSRF.
Poprawny token pozwala ustawić hasło, następne równoległe użycie jest odrzucane.
Porównano neutralne odpowiedzi dla konta aktywnego, nieaktywnego i nieistniejącego,
awarii poczty oraz wyłączonego dostawcy. Zweryfikowano wygaśnięcie, limity,
odrzucanie obcego Origin, atomowy rollback oraz działanie starych kodów.
Test resetu zawiera niepuste członkostwa, granty, instalacje i dane synchronizacji;
pozostają identyczne po zmianie hasła.

Migracja 4 → 8: **PASS** na osobnej lokalnej kopii backupu produkcyjnego
z 2026-10-11. Porównano wszystkie historyczne kolumny wszystkich dziewięciu
tabel danych przed migracją i po niej. Zachowane zostały konta i ich UUID,
hashe haseł, członkostwa, granty, instalacje, sesje, kody, zaproszenia,
rekordy synchronizacji i przetworzone zmiany. `integrity_check`,
`foreign_key_check` i ponowienie migracji przeszły poprawnie. SHA-256 oryginału
przed próbą i po niej: `8e5682dc7b4f0da69e3d980a2ae8be10a128f762cf084766ff223515b7fad25b`.
Nie otwierano bazy serwera i nie modyfikowano oryginalnego backupu.
Produkcyjny backup nie zawierał grantów; zachowanie niepustych grantów podczas
resetu dodatkowo potwierdzono na danych syntetycznych.

### Ocena npm audit

| Zgłoszenie | Rzeczywisty zakres i wynik kontroli |
| --- | --- |
| `@capacitor/android` 8.5.0, critical | Podatny kod proxy WebView jest obecny w zależności aplikacji. Nawigacja wewnątrz WebView może uruchomić zdalny skrypt w originie aplikacji i udostępnić mu dane lokalne oraz pluginy. Brak włączonego `CapacitorHttp` nie usuwa luki. Jest to blokada wydania APK na starej zależności. Zastosowano poprawkę patch **8.5.1**, bez zmiany major i bez publikacji APK. Istniejące instalacje wymagają w przyszłości osobno zatwierdzonej przebudowy i dystrybucji APK; sam Web OTA nie naprawia warstwy natywnej. Nie przeprowadzono ataku na telefon ani produkcję. |
| `source-map-js` 1.2.1, high | Złośliwe offsety sekcji sourcemapy mogą blokować pętlę zdarzeń. Zależność pochodzi z narzędzi build/test (PostCSS, jsdom, magicast), nie ze ścieżki endpointów kont. Zastosowano poprawkę patch **1.2.2** w lockfile. |
| `uuid` 7.0.3 oraz łańcuch `xcode` → `@capacitor/cli`, 3 wpisy moderate | To jeden problem propagowany w drzewie zależności narzędziowych iOS. Advisory dotyczy v3/v5/v6 z przekazanym buforem. Zainstalowany `xcode/lib/pbxProject.js` używa wyłącznie `uuid.v4()` bez bufora; backend i kod aplikacji nie importują tej biblioteki. Nie wykazano osiągalności podatnej funkcji w badanych ścieżkach. Brak wpływu na reset webowy i runtime Androida; pozostawiono zależność bez wymuszonej zmiany major lub downgrade'u CLI. Ponownie ocenić przy dodawaniu iOS lub zmianie użycia UUID. |

Źródła: [advisory producenta Capacitor](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv),
[source-map-js](https://github.com/7rulnik/source-map-js/issues/76),
[advisory producenta UUID](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
Nie uruchamiano `npm audit fix --force` ani aktualizacji major. Ocena braku
osiągalności UUID wynika ze statycznej analizy aktualnego drzewa i wywołań,
nie z ogólnej gwarancji bezpieczeństwa tej biblioteki.

Po poprawkach: `npm audit --omit=dev` — **0 zgłoszeń**; pełny `npm audit` —
**3 moderate**, wyłącznie opisany łańcuch narzędziowy UUID/xcode/CLI.
Celowane testy klienta/UI: **23/23**; testy backendu: **85/85**.
Typecheck, build webowy i backendowy, PWA smoke, lint zmienionych plików
oraz kontrola diffu zakończyły się poprawnie. Pełny lint nie zgłasza błędów;
zachowuje istniejące ostrzeżenia spoza zmiany. Wynik CI konkretnego commita
jest sprawdzany osobno po push; te wyniki nie oznaczają publikacji lub deployu.
