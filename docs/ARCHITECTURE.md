# Architektura i zakres zmian

## Refaktoryzacja
- Nie przebudowuj architektury bez powodu.
- Możesz zaproponować i wykonać refaktoryzację, jeśli obecna architektura realnie utrudnia rozwój, niezawodność lub utrzymanie.
- Nie dokładaj warstw kompatybilności bez realnej potrzeby. Ustalaj warunek lub termin usunięcia legacy.

## Zakres zmian
- Minimalizuj zakres, ale modyfikuj wszystkie moduły niezbędne do kompletnego rozwiązania problemu.
- Nie wykonuj pobocznych zmian kosmetycznych „przy okazji”.
- Jeśli po drodze znajdziesz poważny błąd — napraw go lub wyraźnie zgłoś.
- „Najmniejsza rozsądna zmiana” = usuwa przyczynę, nie tylko objaw.

## Moduły wrażliwe
Echo, synchronizacja, OTA, konta, signing, backup:
- Nie są objęte globalnym zakazem modyfikacji.
- Zmiany są dozwolone, jeśli konieczne dla integralności funkcji.
- Wymagają dodatkowych testów i świadomej decyzji.
- Reguły „nie ruszaj X” stosujemy tylko lokalnie w promptach dla izolowanych zadań — nie jako stałą zasadę projektu.

## Raspberry Pi / backend
- Nowe endpointy i usługi są dozwolone.
- Każda usługa ma jasną odpowiedzialność.
- Preferuj rozszerzanie istniejącego serwera zamiast stawiania nowego.
- Backend może pełnić rolę proxy dla zewnętrznych API, żeby chronić klucze.

## Sposób pracy modeli
- Najpierw rozpoznaj dotknięty przepływ; plan dobierz do złożoności. Prosta, odwracalna zmiana nie wymaga osobnej fazy planowania.
- Uzasadniaj wybór rozwiązania (dlaczego API / biblioteka / refaktor).
- Jeśli proponujesz coś poza zakresem — krótko wyjaśnij co i dlaczego.
- Nie ukrywaj kompromisów: koszt, prywatność, vendor lock-in, dług techniczny.
- Jeśli istnieje lepsze rozwiązanie niż to, o które prosi użytkownik — powiedz o tym.

---

# Aktualna mapa implementacji

Stan sprawdzony w kodzie 2026-11-10. To mapa wejścia; szczegóły kontraktów danych, bezpieczeństwa i platform pozostają w dokumentach zasad i podlinkowanych implementacjach.

## Założenia

Ogarniacz jest aplikacją React + TypeScript + Vite, działającą local-first jako web/PWA, Android (Capacitor) i Windows (WebView2/.NET 8). Podstawowe dane lokalne są w IndexedDB. Opcjonalny backend Node.js z SQLite obsługuje konta, synchronizację i transport lokalnego modelu Echo. Warstwy domenowe korzystają z repozytoriów i serwisów; nie twórz obok nich drugiego magazynu.

## Warstwy

1. **UI i routing** — `src/app`, `src/components`, `src/modules`.
2. **Hooki aplikacji** — `src/hooks`; łączą komponenty z obserwowalnymi repozytoriami.
3. **Logika domenowa** — `src/services`; planer, recurrence, leki, przypomnienia, nawyki, backup, Echo i uprawnienia.
4. **Model** — `src/domain`; spójne typy, ID i daty.
5. **Dane lokalne** — `src/data`; Dexie, IndexedDB, migracje i repozytoria.
6. **Synchronizacja** — `KolejkaSynchronizacji`, `SyncEngine`, `RepozytoriumZdalneHttp` i backend `server/serwer.ts`; istnieją outbox, konflikty oraz ograniczenia tabel i danych prywatnych.

## Gdzie zacząć

| Zadanie | Istniejące wejście | Szczegóły na żądanie |
|---|---|---|
| Widok i formularz | `src/modules/`, `src/components/Interfejs.tsx`, `PoleDaty`, `PoleCzasu`, `PoleKwoty`, `PoleLiczbowe` | [Formularze](POLA_FORMULARZY.md), `src/styles/glowny.css`, właściwy skill UI/formularzy |
| Dane i profile | `src/data/BazaOgarniacza.ts`, `Repozytorium.ts`, `ProfileLokalne.ts` | [Zasady danych](DATA.md); `src/domain/typy.ts` i `ustawienia.ts` |
| Synchronizacja | `src/data/KolejkaSynchronizacji.ts`, `src/services/SyncEngine.ts`, `SynchronizacjaAplikacji.ts` | [Synchronizacja](SYNC_ARCHITECTURE.md), `src/data/RepozytoriumZdalneHttp.ts`, `server/serwer.ts` |
| Echo i głos | `src/app/DostawcaSesjiEcho.tsx`, `src/services/EchoService.ts` | [Aktualna mapa Echo](ECHO.md) |
| Backend | `server/main.ts` → `config.ts`, `baza.ts`, `serwer.ts`; migracje w `server/migracje.ts` | [Raspberry Pi](RASPBERRY_PI.md), `deploy/rpi/` |
| Android | `capacitor.config.ts`, `android/app/build.gradle`, `src/platform/platforma.ts` | [Android](ANDROID.md), [wydania](ANDROID_RELEASE.md) |
| Windows | `windows/Ogarniacz.Desktop/Program.cs`, `Ogarniacz.Desktop.csproj`, `windows/installer.iss` | Host ładuje skonfigurowany adres HTTPS w WebView2; brak osobnego silnika głosu Windows |
| Testy | `package.json`, `vite.config.ts`, `src/testy/konfiguracja.ts`, testy przy implementacjach | [Strategia](TESTING.md); backend `server/*.test.ts`, skrypty `scripts/*.test.mjs`, Windows `windows/TestyAktualizacji/` |

Przepływ zapisu:

```text
widok → hook / serwis → Repozytorium<T> → Dexie → IndexedDB
```

Przepływ odczytu:

```text
IndexedDB → repozytorium → useLiveQuery → widok
```

## Struktura katalogów

```text
src/
  app/            globalny layout, kontekst, wyszukiwanie, szybkie „+”, reminder engine
  components/     współdzielone, niewielkie elementy UI i rejestr CRUD
  data/           baza, migracje, repozytoria, granica synchronizacji
  domain/         modele i fabryki metadanych
  hooks/          dostęp reaktywny do repozytoriów
  modules/        niezależne grupy funkcjonalne
  services/       testowalna logika poza JSX
  styles/         tokeny i responsywny system UI
  testy/          konfiguracja środowiska testowego
```

## IndexedDB i migracje

Baza bazowa nazywa się `ogarniacz-v1`; aktywne profile mogą korzystać z odrębnych baz zarządzanych przez `ProfileLokalne.ts` i rejestr `ogarniacz-profile`. Aktualny schemat to **21** (`WERSJA_SCHEMATU_BAZY` w `BazaOgarniacza.ts`); wcześniejsze wersje są historią migracji, a nie bieżącą specyfikacją. Nie podnoś wersji bez zmiany wymagającej migracji.

Encje domenowe mają `id`, `createdAt`, `updatedAt` i opcjonalny `usunietoAt`. Repozytorium wykonuje soft-delete, pozostawiając znacznik dla synchronizacji. Nie utożsamiaj wszystkich tabel z encjami synchronizowanymi: listę wyjątków określa `KolejkaSynchronizacji.ts`, a transport Pul i Zobowiązań ma blokadę w `OchronaTransportuFz.ts`.

## Rejestr 2.0 — guardraile i Definition of Done

**Antycele:** Rejestr nie duplikuje logiki serwisów domenowych ani nie tworzy drugiego źródła prawdy dla wartości wyliczanych. Nie dodajemy abstrakcji bez co najmniej jednego realnego zastosowania, `eval` ani wykonywania dowolnego JS z konfiguracji. Poza zakresem pozostają pełny silnik formuł oraz rozbudowane uprawnienia Rejestru. Nie utrzymujemy dwóch pełnych implementacji tego samego mechanizmu; potwierdzone martwe mechanizmy usuwamy, zamiast ukrywać je „na później”.

**Definition of Done:** pole systemowe ma jawny tryb obsługi; resolver i akcja są wskazane stabilnym ID, a ich kod pozostaje poza Dexie i synchronizowanymi definicjami. Zapis domenowy przechodzi przez publiczny serwis domenowy. Zmiana formatu danych ma deterministyczną migrację przy otwarciu bazy oraz skoncentrowany test; bez zmiany formatu nie podnosimy wersji Dexie. `polaWlasne` przechowuje wyłącznie wartości `custom:*`; backup/restore zachowuje definicje, widoki i istniejące wartości, a przed destrukcyjnym restore powstaje kopia `before-restore`. Adapter starego UI może istnieć tylko jako mały, oznaczony przejściowy most z warunkiem usunięcia.

### GO dla migracji modułu

Przed migracją modułu potwierdź: (1) zachowanie dotychczasowej funkcjonalności, (2) stabilne ID i dane po migracji, (3) przejście odpowiednich testów regresji, (4) krótką dokumentację zmiany oraz (5) ręczny test bez blokującej regresji. Pierwsze planowane moduły to: Poczekalnia, Notatki, Zadania i Leki. To wyłącznie kolejność przygotowania — każda migracja wymaga osobnego GO.

## ID i daty

- encje używają `crypto.randomUUID()`;
- daty/czasy są zapisywane jako ISO 8601;
- wystąpienia dawki mają stabilny identyfikator `lekId:data:godzina`, aby ponowna decyzja zastępowała poprzednią dla tej samej dawki;
- wszystkie aktualizacje odświeżają `updatedAt`.

## Backup

`BackupService` buduje sekcje backupu w formacie **3**, z manifestem i checksum; import obsługuje migracje formatów 1–3 oraz walidację Zod. Bloby są kodowane Base64. UI szyfruje eksport i kopię `before-restore` przez istniejące AES-GCM/PBKDF2, a restore czeka na zabezpieczenie kopii. Szczegóły i ograniczenia platform: [SECURITY.md](SECURITY.md). Backup obejmuje także lokalną pamięć i dziennik Echo; nie oznacza to ich synchronizowania.

## Planer

Algorytm planowania jest deterministyczny i oddzielony od UI. Chroni pracę, wizyty oraz istniejące bloki, sortuje zadania według priorytetu i terminu, przyjmuje 30 minut dla zadania bez estymacji oraz ogranicza obowiązki do 75% dostępnego czasu. Pozostałe fragmenty stają się widocznym czasem wolnym/buforem.

## Przypomnienia

Jedna encja `Przypomnienie` obsługuje czasy absolutne, względne i cykliczne. Centrum przypomnień działa zawsze wewnątrz aplikacji. `Notification API` jest opcjonalnym kanałem dostarczenia. Service worker nie udaje gwarantowanego alarmu po całkowitym zamknięciu przeglądarki.

## Echo i ryzyko

`EchoService` deleguje do `AgentEcho`, który korzysta z `ProviderModeluEcho`, ograniczonego kontekstu oraz rejestru narzędzi Zod. Wykonawca egzekwuje dostęp, ryzyko i potwierdzenie dla operacji umiarkowanych/wysokich; narzędzia korzystają z istniejącej domeny i repozytoriów. Istnieją provider ograniczony offline i adapter backendowego modelu lokalnego. Mapa przepływu, pamięci, głosu, ograniczeń i testów: [ECHO.md](ECHO.md).

## Uprawnienia

`UprawnieniaService` jest niezależny od UI. Właściciel ma pełny dostęp. Edytor wymaga aktywnego `PermissionGrant` na moduł i operację. Ustawienia właściciela nigdy nie są dostępne Edytorowi. Lokalny „Podgląd jako Edytor” służy wyłącznie testom; nie jest uwierzytelnieniem ani zdalnym współdzieleniem.

## PWA

`vite-plugin-pwa` generuje manifest i service worker Workbox. Cache obejmuje statyczny shell, a żądania `/api/` zawsze omijają cache. Nowa wersja aplikacji jest wykrywana w tle i instalowana dopiero po potwierdzeniu użytkownika. Główne operacje odczytu i przechwytywania danych korzystają z tej samej domeny oraz IndexedDB na webie i Androidzie, więc nie wymagają internetu. Widoki tras są ładowane na żądanie.
