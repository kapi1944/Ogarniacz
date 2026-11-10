# Ogarniacz v1

Ogarniacz to prywatne centrum dowodzenia codziennym życiem. Łączy zadania, plan dnia, zdrowie, przypomnienia, zakupy, finanse, wiedzę i asystenta Echo. Podstawowe funkcje działają local-first w IndexedDB; opcjonalny backend obsługuje konta, synchronizację i lokalny model Echo. Klienci: web/PWA, Android (Capacitor) i Windows (WebView2).

## Wymagania

- Windows 10/11;
- Node.js 24 (wersja używana przez CI i backend);
- aktualny Chrome, Edge albo inna nowoczesna przeglądarka.

## Instalacja

PowerShell, Terminal Windows lub Git Bash:

```bash
cd C:/GitHub/Projects/Ogarniacz/Ogarniacz
npm install
```

## Development

```bash
npm run dev
```

Otwórz adres pokazany w terminalu, standardowo [http://localhost:5173](http://localhost:5173). Zatrzymanie serwera: `Ctrl+C`.

## Build produkcyjny

```bash
npm run build
```

Gotowe pliki powstaną w `dist/`.

## Podgląd buildu

```bash
npm run preview
```

Otwórz adres pokazany w terminalu, standardowo [http://localhost:4173](http://localhost:4173).

## Testy i kontrola jakości

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Testy w trybie obserwacji:

```bash
npm run test:watch
```

## Gdzie są dane

Dane klienta są zapisane w **IndexedDB**, w bazie bazowej `ogarniacz-v1` lub bazie aktywnego profilu, dla konkretnego adresu aplikacji. Wyczyszczenie danych witryny usuwa dane lokalne. Opcjonalny backend przechowuje dane serwerowe w SQLite; domyślny prywatny katalog `data/` jest ignorowany przez Git.

Profile lokalne są zarządzane przez `src/data/ProfileLokalne.ts`. `localStorage` zawiera także metadane konta offline i właściciela danych, a `sessionStorage` przechowuje CSRF. Nie traktuj danych witryny jako publicznych ani nie eksportuj ich do raportów agentów.

## Backup i import

1. Otwórz **Ustawienia → Dane / Backup** i wybierz sekcje kopii.
2. Ustaw hasło i zapisz zaszyfrowany plik JSON; zachowaj hasło poza aplikacją.
3. Import odszyfrowuje i waliduje kopię przed podglądem. Obsługuje również starsze jawne formaty 1–3.
4. Przed restore aplikacja zabezpiecza pełną kopię `before-restore` i wymaga właściwego potwierdzenia. Szczegóły zapisu na Androidzie i ograniczeń pobierania PWA: [Bezpieczeństwo kopii](docs/SECURITY.md).

Pliki dokumentów przechowywane jako Blob są kodowane w backupie jako Base64.

## Instalacja PWA

1. Uruchom build przez `npm run build`, a następnie `npm run preview`.
2. Otwórz aplikację w Chrome lub Edge.
3. W pasku adresu wybierz ikonę instalacji albo menu przeglądarki → **Zainstaluj Ogarniacz**.

PWA ma manifest, ikony, service worker i offline shell. Dane lokalne pozostają dostępne bez internetu. Zwykła przeglądarkowa PWA nie gwarantuje alarmów systemowych po całkowitym zamknięciu aplikacji.

## Dokumentacja

- [Android: deploy, release i aktualizacje bez kabla](docs/ANDROID.md)
- [Architektura](docs/ARCHITECTURE.md)
- [Echo — aktualna implementacja](docs/ECHO.md)
- [Upgrade 2026 — analiza i kolejne etapy](docs/UPGRADE_2026.md)
- [Model danych](docs/DATA_MODEL.md)
- [Specyfikacja v1](docs/SPECYFIKACJA_OGARNIACZ_V1.md)
- [Otwarte decyzje](docs/OPEN_DECISIONS.md)
- [Roadmapa](docs/ROADMAP.md)
- [Testowanie](docs/TESTING.md)
