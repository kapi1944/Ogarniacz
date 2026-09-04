# Ogarniacz v1

Ogarniacz to prywatne, lokalne centrum dowodzenia codziennym życiem. Łączy zadania, plan dnia, zdrowie, przypomnienia, zakupy, finanse, wiedzę i lokalnego asystenta Echo. Aplikacja działa bez konta, backendu i internetu; dane pozostają w IndexedDB wybranej przeglądarki.

## Wymagania

- Windows 10/11;
- Node.js 20 lub nowszy;
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

Dane są zapisane w **IndexedDB** pod nazwą `ogarniacz-v1`, w profilu konkretnej przeglądarki i dla konkretnego adresu aplikacji. Nie znajdują się w pliku repozytorium. Wyczyszczenie danych witryny w przeglądarce usuwa bazę.

`localStorage` przechowuje jedynie stan zwinięcia sidebara. Dane użytkownika nie są tam zapisywane.

## Backup i import

1. Otwórz **Ustawienia → Backup i import**.
2. Kliknij **Eksportuj pełną kopię**. Przeglądarka pobierze wersjonowany plik JSON.
3. Przy imporcie wybierz plik i tryb:
   - **Scal po ID** — dodaje rekordy i aktualizuje rekordy o tych samych identyfikatorach;
   - **Nadpisz całą bazę** — najpierw usuwa bieżące dane i wymaga osobnego potwierdzenia.

Pliki dokumentów przechowywane jako Blob są kodowane w backupie jako Base64.

## Instalacja PWA

1. Uruchom build przez `npm run build`, a następnie `npm run preview`.
2. Otwórz aplikację w Chrome lub Edge.
3. W pasku adresu wybierz ikonę instalacji albo menu przeglądarki → **Zainstaluj Ogarniacz**.

PWA ma manifest, ikony, service worker i offline shell. Dane lokalne pozostają dostępne bez internetu. Zwykła przeglądarkowa PWA nie gwarantuje alarmów systemowych po całkowitym zamknięciu aplikacji.

## Dokumentacja

- [Android: deploy, release i aktualizacje bez kabla](docs/ANDROID.md)
- [Architektura](docs/ARCHITECTURE.md)
- [Model danych](docs/DATA_MODEL.md)
- [Specyfikacja v1](docs/SPECYFIKACJA_OGARNIACZ_V1.md)
- [Otwarte decyzje](docs/OPEN_DECISIONS.md)
- [Roadmapa](docs/ROADMAP.md)
- [Testowanie](docs/TESTING.md)
