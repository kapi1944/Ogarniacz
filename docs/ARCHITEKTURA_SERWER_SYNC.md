# Architektura serwera, kont i synchronizacji

## Stan wdrożony

Ogarniacz pozostaje local-first. React używa istniejących repozytoriów Dexie/IndexedDB, a każdy zapis domenowy i odpowiadająca mu pozycja outbox powstają atomowo. `SyncEngine` przesyła zmiany przez istniejące `RepozytoriumZdalneHttp`; brak sieci nie blokuje odczytu ani zapisu lokalnego.

Raspberry Pi uruchamia jeden proces Node.js 24 z `node:http`, SQLite w trybie WAL, statycznym buildem aplikacji, kontami, synchronizacją i healthcheckiem. Nie dodano drugiego backendu, Redisa, brokera, CRDT ani osobnego modelu danych.

```text
Web/PWA lub Android
  ├─ IndexedDB + trwały outbox
  └─ HTTPS + sesja HttpOnly + CSRF
              │
       Tailscale Serve (tailnet)
              │
       127.0.0.1:8787 Node.js
          ├─ konta i granty
          ├─ API synchronizacji
          ├─ /health
          └─ SQLite
```

## Konta i własność

`uzytkownicy` przechowują unikalny e-mail i hash hasła `scrypt`. `czlonkostwa` wiążą użytkownika z Właścicielem i rolą. Sesja ma losowy token przechowywany w bazie wyłącznie jako SHA-256; klient otrzymuje go w cookie `HttpOnly; Secure; SameSite=None`. Każdy zapis sesyjny wymaga osobnego tokenu CSRF.

Pierwszy Właściciel powstaje przez jednorazowy `OWNER_BOOTSTRAP_TOKEN` z env serwera. Zaproszenia Edytora są jednorazowe i ważne siedem dni. Odzyskanie dostępu używa jednorazowego kodu, zmienia hash hasła oraz unieważnia wszystkie sesje. Próby logowania, odzyskiwania i przyjmowania zaproszeń są limitowane.

Serwer, nie UI, wyznacza z sesji `uzytkownikId`, `wlascicielId` i rolę. Właściciel synchronizuje własne rekordy. Edytor otrzymuje odczyt i edycję tylko dla jawnie nadanych modułów; ustawienia i Echo nie są udostępniane przez ogólny sync. Grant sekcji nie otwiera całego modułu. Cofnięcie grantu działa od kolejnego żądania, a cofnięcie Edytora usuwa jego sesje dla danego Właściciela.

`installationId` nadal identyfikuje urządzenie, nie konto. Wiele instalacji jednego użytkownika korzysta z tego samego zbioru właściciela, zachowując własne identyfikatory do idempotencji i wykrywania konfliktów.

## Synchronizacja i konflikty

Rekord serwerowy przechowuje właściciela, tabelę, `id`, JSON danych, `createdAt`, `updatedAt`, wersję, tombstone i ostatnią instalację. `zmianaId` ma unikalność w obrębie właściciela, dlatego retry tej samej paczki nie duplikuje encji ani nie zwiększa wersji drugi raz.

Serwer przyjmuje zmianę tylko wtedy, gdy jej baza odpowiada bieżącej wersji. Równoległa edycja zwraca HTTP 409; klient ponownie pobiera rekord i zapisuje obie wersje jako jawny konflikt. Edycja kontra usunięcie również nie jest rozstrzygana przez ślepe LWW. Szczegółowe reguły i zachowanie offline opisuje [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md).

## Dostęp zdalny i operacje

Produkcyjny Node nasłuchuje wyłącznie na `127.0.0.1:8787`. Tailscale Serve udostępnia Web/PWA i API pod prywatnym adresem HTTPS w tailnecie; router nie ma port forwardingu, a publiczny Funnel nie jest używany. Ten sam adres jest `VITE_SYNC_API_URL` Androida, zaś `CORS_ALLOWED_ORIGINS` zawiera dokładne originy PWA i `https://localhost` Capacitor.

Systemd uruchamia aplikację po restarcie, restartuje ją po błędzie, wysyła logi do journald i ogranicza zapis procesu do katalogu bazy. Procedurę instalacji, healthchecki i test restartu opisuje [RASPBERRY_PI.md](./RASPBERRY_PI.md).

Sekrety pozostają wyłącznie w `/etc/ogarniacz/ogarniacz.env` z ograniczonymi prawami. `VITE_*` zawiera tylko publiczny adres serwera. Stary `SYNC_ACCESS_KEY` jest opcjonalnym mostem migracyjnym dla zainstalowanego APK 1.0.7 i należy go usunąć po zalogowaniu urządzeń.
