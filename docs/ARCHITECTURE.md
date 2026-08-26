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

`vite-plugin-pwa` generuje manifest i service worker Workbox. Cache obejmuje statyczny shell. Główne operacje odczytu i przechwytywania danych korzystają z IndexedDB i nie wymagają internetu.
