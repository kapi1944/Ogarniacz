# Architektura serwera i synchronizacji Ogarniacza

## 1. Stan obecny

Ogarniacz jest aplikacją local-first. React korzysta z `useRepozytorium`, a wspólne `Repozytorium` zapisuje dane do Dexie/IndexedDB (`ogarniacz-v1`). Baza ma 35 tabel i migracje Dexie do schematu 6.

Większość modułów korzysta z repozytorium albo serwisów, które je otrzymują. Bezpośredni dostęp do Dexie pozostaje w infrastrukturze: `BazaOgarniacza`, `BackupService`, `DaneDemonstracyjneService`, `HistoriaZmianService` i `SyncEngine`; część testów używa bazy bezpośrednio. To są miejsca do dalszego izolowania, ale nie wymagają teraz przepisywania UI.

Każda encja domenowa dziedziczy wspólną strukturę `id`, `createdAt`, `updatedAt` i opcjonalne `usunietoAt`. Identyfikatory są generowane jako UUID przez `crypto.randomUUID()`. Nie ma jeszcze `userId` ani `version` w rekordach. `installationId` jest osobnym, lokalnie generowanym i stabilnym identyfikatorem instalacji przechowywanym w `localStorage`; backup go opisuje, ale nie nadpisuje.

Soft delete już istnieje jako `usunietoAt`. Repozytorium ukrywa takie rekordy na liście, ale zachowuje je w bazie; `SyncEngine` przenosi je jako tombstones. Historia zmian jest dostępna dla wybranych tabel. Nie istnieje jeszcze serwer ani trwały provider API: `RepozytoriumZdalneInMemory` służy wyłącznie testom.

Backup/import obejmuje wybrane sekcje, waliduje checksum i wersję schematu oraz wykonuje kopię `before-restore`. Jest to transfer pliku, nie synchronizacja wielourządzeniowa.

## 2. Stan docelowy

Klient zachowuje IndexedDB jako lokalną bazę/cache. Repozytorium pozostaje punktem wejścia dla UI, a późniejszy adapter synchronizacji będzie dopisywał lokalne zmiany do kolejki i wymieniał je z API.

Raspberry Pi uruchamia jeden proces backendu Node.js, jedną centralną bazę SQLite i reverse proxy. Backend ma API, sesje/auth, synchronizację i healthcheck. Nie planuje się mikroserwisów, brokera, Redisa, Kubernetes ani CRDT.

```text
UI React / Capacitor
        |
        v
Repozytorium klienta -> IndexedDB + kolejka offline
        |                         ^
        +------ Sync API ---------+
                    |
          Raspberry: Node.js API
             |       |       |
          auth   sync      health
                    |
                SQLite
                    |
       reverse proxy / systemd
                    |
       LAN lub Cloudflare Tunnel (później)
```

## 3. Wybrany backend

Wybrano **Node.js 24 + TypeScript + wbudowane `node:http` i `node:sqlite`**. Obecny frontend jest TypeScriptowy, a ten wariant nie dodaje frameworka ani natywnych zależności wymagających kompilowania na Raspberry. Dobrze pasuje do systemd, ma mały narzut, prosty test HTTP i korzysta z tej samej platformy uruchomieniowej co klientowy ekosystem.

Rozważone kandydatury: Fastify daje wygodniejszy routing i walidację, ale wprowadza kolejną warstwę zależności; Hono jest lekkie, lecz wymaga dodatkowego adaptera runtime; własny serwer Node jest najmniejszy i wystarczający dla pierwszego fundamentu. Walidacja payloadów zostanie dodana przy pierwszym API encji, najpewniej przez istniejące Zod.

Wymagany jest Node.js 24 LTS lub nowszy z obsługą `node:sqlite`. Nie instalowano niczego na Raspberry.

## 4. Wybrana baza

Wybrano **SQLite**. Przy jednym głównym użytkowniku, kilku urządzeniach i umiarkowanym ruchu daje najmniejszy koszt administracji, prosty backup jednego pliku, transakcje i dobrą niezawodność na Raspberry. WAL jest włączony w fundamencie.

PostgreSQL byłby lepszy przy wielu równoczesnych użytkownikach, dużym ruchu i rozbudowanej administracji, ale obecnie zwiększyłby wymagania deploymentu i backupu bez uzasadnionej korzyści. Model SQL pozostaje przenośny, więc przejście w przyszłości jest możliwe.

## 5. Auth

Ogarniacz będzie miał własne lokalne konto: `uzytkownicy.id`, unikalny email i `haslo_hash`. Hasła będą hashowane współczesnym algorytmem bibliotecznym (preferowany Argon2id; ewentualnie scrypt, jeśli ograniczenia runtime tego wymagają), nigdy plaintextem i bez własnej kryptografii.

Web użyje sesji przechowywanej po stronie serwera lub krótkiego tokenu w bezpiecznym, `HttpOnly`, `Secure`, `SameSite` cookie. Długowieczne sekrety sesji nie trafią do `localStorage`. Capacitor/Android użyje tego samego API i bezpiecznego magazynu platformowego dla krótkotrwałego stanu logowania; nie będzie współdzielić `installationId` z kontem.

Cloudflare Tunnel nie jest systemem kont. Google/Apple nie są częścią pierwszej wersji.

## 6. `installationId` i `userId`

`userId` identyfikuje konto, a `installationId` konkretną instalację aplikacji/przeglądarki:

```text
userId
├── installationId Galaxy
├── installationId laptop
├── installationId PC
└── installationId przeglądarki
```

Instalacja generuje własny UUID i zachowuje go lokalnie. Backup może przenieść dane, ale nie może zastąpić lokalnego `installationId`. Każde żądanie synchronizacji będzie przekazywać installation ID, a serwer powiąże je z zalogowanym user ID.

## 7. Model synchronizacji

Minimalny rekord serwerowy przechowuje: `userId`, `tabela`, `rekordId`, JSON danych, `createdAt`, `updatedAt`, `version`, `deletedAt` oraz ostatnią instalację. Klient po zapisie zachowuje rekord w IndexedDB i dodaje zmianę do kolejki outbox. Po połączeniu wysyła zmiany, pobiera zmiany od kursora i zapisuje je lokalnie. Tombstone pozostaje wystarczająco długo, aby offline urządzenie mogło odebrać usunięcie.

Pierwsza wersja użyje deterministycznego LWW na poziomie rekordu: wygrywa nowsze `updatedAt`, przy remisie większy leksykograficznie `installationId`; serwer zawsze sprawdza `userId` i dozwoloną tabelę. Dla zadań, notatek, projektów, kontaktów i prostych ustawień jest to akceptowalne. Wydatki, płatności, dzienniki leków i historii nie powinny być bezrefleksyjnie nadpisywane — dla nich później potrzebna będzie ochrona operacji/dedykowane rozstrzyganie, nie merge CRDT.

Przepływ obsługuje utworzenie, aktualizację, usunięcie, offline, ponowne połączenie i idempotentne ponowienie. Obecny lokalny `SyncEngine` zachowuje konflikty do ręcznego wyboru; adapter API może najpierw zachować tę semantykę, a LWW włączyć dopiero po potwierdzeniu dla konkretnej encji.

## 8. Offline i migracja IndexedDB

IndexedDB pozostaje źródłem odczytu klienta podczas offline. Kolejka zmian nie będzie osobnym magazynem obok Dexie: zostanie dodana do istniejącej bazy i repozytorium. Po zalogowaniu klient wykona synchronizację przyrostową, a potem będzie synchronizował cyklicznie i po odzyskaniu połączenia.

Migracja istniejących danych będzie etapowa: przypisanie konta do lokalnej instalacji, audyt brakujących metadanych, eksport kontrolny, wysłanie rekordów z zachowaniem UUID i tombstones, weryfikacja liczników/checksum, a następnie normalna synchronizacja. Backup/restore nadal pozostanie dostępny i nie będzie zmieniał lokalnego installation ID.

## 9. Raspberry i dostęp publiczny

Docelowo systemd uruchomi backend, SQLite będzie na lokalnym trwałym dysku, a reverse proxy obsłuży frontend/API. Adres LAN to `http://ogarniacz.local`. Publiczny adres będzie konfigurowany przez env/config, np. `https://ogarniacz.example.invalid` jako dokumentacyjny placeholder, nigdy jako stała biznesowa.

Docelowy przepływ: Internet → HTTPS → Cloudflare → Cloudflare Tunnel → Raspberry → reverse proxy → frontend/API. Nie będzie port-forwardingu ani publicznego SSH. Tunnel i domena są poza tym etapem.

## 10. Backup i operacje

SQLite będzie backupowane jako spójna kopia bazy, najlepiej przez mechanizm SQLite backup/WAL, dodatkowo z rotacją i testem odtworzenia. Backup aplikacyjny pozostaje potrzebny dla selektywnego eksportu danych i migracji. Sekrety auth będą wyłącznie w env/sekretach systemowych, nie w bundle klienta ani logach.

## 11. Zrealizowany fundament

Dodano `server/` z konfiguracją env, otwarciem SQLite, migracjami i endpointem `GET /health` oraz `GET /api/health`. Pierwsza migracja tworzy tabele użytkowników, instalacji i rekordów synchronizacji z kluczem złożonym oraz indeksem po czasie zmiany. Dodano `.env.example`, osobny build serwera i trzy testy: błędna konfiguracja, idempotentne migracje i brak wycieku ścieżki/sekretów w healthchecku.

Etap 7 dodał trwałe API `/api/sync/changes` oraz klientowy `RepozytoriumZdalneHttp` za istniejącym `SyncEngine`. Prywatny model jednego właściciela mapuje klucz dostępu na serwerowy `SYNC_USER_ID`, a każda instalacja nadal zachowuje osobny `installationId`. Jest to działający model synchronizacji prywatnego wdrożenia, nie docelowy system sesji dla publicznej usługi.

## 12. Kolejność wdrożenia

1. **Etap A — fundament backendu + healthcheck:** wykonany w tym commitcie.
2. **Etap B — centralna baza + migrations:** wykonany w zakresie schematu bazowego; dalsze migracje będą wersjonowane.
3. **Etap C — auth:** konto lokalne, hash Argon2id/scrypt, cookie sesyjne i powiązanie instalacji.
4. **Etap D — pierwsza encja i API:** zadania, walidacja, CRUD/sync endpointy i LWW lub jawny konflikt.
5. **Etap E — client repository adapter:** kontrakt API za istniejącym repozytorium bez zmiany UI.
6. **Etap F — sync offline/online:** outbox, kursor, retry, tombstones, reconnect i test dwóch instalacji.
7. **Etap G — migracja istniejących danych:** dopiero po przejściu pionowego wycinka i backupie.
8. **Etap H — kolejne typy danych:** według ryzyka; dzienniki/płatności wymagają osobnych reguł konfliktów.
9. **Etap I — deployment Raspberry:** systemd, reverse proxy, firewall LAN, backup i monitoring.
10. **Etap J — Cloudflare Tunnel:** po wyborze domeny i sprawdzeniu dostępu LAN.

Granica bieżącego zadania kończy się na fundamencie A/B. Nie migrowano modułów i nie konfigurowano tunelu.
