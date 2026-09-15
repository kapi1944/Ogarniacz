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
- Najpierw diagnoza i plan, potem zmiana.
- Uzasadniaj wybór rozwiązania (dlaczego API / biblioteka / refaktor).
- Jeśli proponujesz coś poza zakresem — krótko wyjaśnij co i dlaczego.
- Nie ukrywaj kompromisów: koszt, prywatność, vendor lock-in, dług techniczny.
- Jeśli istnieje lepsze rozwiązanie niż to, o które prosi użytkownik — powiedz o tym.

---

# Architektura Ogarniacza v1

## Założenia

Ogarniacz v1 jest aplikacją webową desktop-first i PWA. Działa local-first bez konta, backendu i zewnętrznego API. Kod UI nie komunikuje się bezpośrednio z IndexedDB: wszystkie operacje przechodzą przez repozytoria i serwisy.

## Warstwy

1. **UI i routing** — `src/app`, `src/components`, `src/modules`.
2. **Hooki aplikacji** — `src/hooks`; łączą komponenty z obserwowalnymi repozytoriami.
3. **Logika domenowa** — `src/services`; planer, recurrence, leki, przypomnienia, nawyki, backup, Echo i uprawnienia.
4. **Model** — `src/domain`; spójne typy, ID i daty.
5. **Dane lokalne** — `src/data`; Dexie, IndexedDB, migracje i repozytoria.
6. **Granica przyszłej synchronizacji** — `DostawcaSynchronizacji` i `RepozytoriumZdalne`; brak fikcyjnego serwera.

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

Baza nazywa się `ogarniacz-v1`.

- **wersja 1** — historyczny minimalny rdzeń: zadania, leki, dziennik leków, ustawienia;
- **wersja 2** — pełny zestaw encji Ogarniacza v1, indeksy i migracja brakujących pól zadania.

Każda encja ma `id`, `createdAt`, `updatedAt` i opcjonalny `usunietoAt`. Repozytorium wykonuje soft-delete. Dzięki temu rekord usunięty pozostawia znacznik potrzebny przyszłej synchronizacji. Twarde czyszczenie jest dostępne wyłącznie w Ustawieniach po wpisaniu frazy potwierdzającej.

## Rejestr 2.0 — guardraile i Definition of Done

**Antycele:** Rejestr nie duplikuje logiki serwisów domenowych ani nie tworzy drugiego źródła prawdy dla wartości wyliczanych. Nie dodajemy abstrakcji bez co najmniej jednego realnego zastosowania, `eval` ani wykonywania dowolnego JS z konfiguracji. Poza zakresem pozostają pełny silnik formuł oraz rozbudowane uprawnienia Rejestru. Nie utrzymujemy dwóch pełnych implementacji tego samego mechanizmu; potwierdzone martwe mechanizmy usuwamy, zamiast ukrywać je „na później”.

**Definition of Done:** pole systemowe ma jawny tryb obsługi; resolver i akcja są wskazane stabilnym ID, a ich kod pozostaje poza Dexie i synchronizowanymi definicjami. Zapis domenowy przechodzi przez publiczny serwis domenowy. Zmiana formatu danych ma deterministyczną migrację przy otwarciu bazy oraz skoncentrowany test; bez zmiany formatu nie podnosimy wersji Dexie. `polaWlasne` przechowuje wyłącznie wartości `custom:*`; backup/restore zachowuje definicje, widoki i istniejące wartości, a przed destrukcyjnym restore powstaje kopia `before-restore`. Adapter starego UI może istnieć tylko jako mały, oznaczony przejściowy most z warunkiem usunięcia.

## ID i daty

- encje używają `crypto.randomUUID()`;
- daty/czasy są zapisywane jako ISO 8601;
- wystąpienia dawki mają stabilny identyfikator `lekId:data:godzina`, aby ponowna decyzja zastępowała poprzednią dla tej samej dawki;
- wszystkie aktualizacje odświeżają `updatedAt`.

## Backup

`BackupService` eksportuje wszystkie tabele do formatu `ogarniacz-backup` w wersji 1. Blob dokumentu jest kodowany Base64. Import jest walidowany przez Zod i obsługuje scalenie lub pełne nadpisanie po potwierdzeniu.

## Planer

Algorytm planowania jest deterministyczny i oddzielony od UI. Chroni pracę, wizyty oraz istniejące bloki, sortuje zadania według priorytetu i terminu, przyjmuje 30 minut dla zadania bez estymacji oraz ogranicza obowiązki do 75% dostępnego czasu. Pozostałe fragmenty stają się widocznym czasem wolnym/buforem.

## Przypomnienia

Jedna encja `Przypomnienie` obsługuje czasy absolutne, względne i cykliczne. Centrum przypomnień działa zawsze wewnątrz aplikacji. `Notification API` jest opcjonalnym kanałem dostarczenia. Service worker nie udaje gwarantowanego alarmu po całkowitym zamknięciu przeglądarki.

## Echo i ryzyko

`EchoService` korzysta z wymiennego kontraktu `ProviderEcho`. Obecny `LokalnyProviderEcho` jest regułowy i nie używa sieci. `RyzykoDzialaniaService` klasyfikuje działania:

- niskie — wykonanie bez dodatkowej zgody;
- umiarkowane — modal potwierdzenia;
- wysokie — potwierdzenie i przekierowanie do właściwego ekranu zamiast tekstowej automatyzacji.

Ważne działania zapisują się w `DziennikEcho`.

## Uprawnienia

`UprawnieniaService` jest niezależny od UI. Właściciel ma pełny dostęp. Edytor wymaga aktywnego `PermissionGrant` na moduł i operację. Ustawienia właściciela nigdy nie są dostępne Edytorowi. Lokalny „Podgląd jako Edytor” służy wyłącznie testom; nie jest uwierzytelnieniem ani zdalnym współdzieleniem.

## PWA

`vite-plugin-pwa` generuje manifest i service worker Workbox. Cache obejmuje statyczny shell, a żądania `/api/` zawsze omijają cache. Nowa wersja aplikacji jest wykrywana w tle i instalowana dopiero po potwierdzeniu użytkownika. Główne operacje odczytu i przechwytywania danych korzystają z tej samej domeny oraz IndexedDB na webie i Androidzie, więc nie wymagają internetu. Widoki tras są ładowane na żądanie.
