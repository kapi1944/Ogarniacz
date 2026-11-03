# FZ-3 — lokalne Pule finansowe

Kontrakt: [Pule i Zobowiązania](FINANSE_PULE_ZOBOWIAZANIA.md). Fundament: [FZ-2](FINANSE_FZ2.md).

## Interfejs

Podmoduł Finansów ma dwie trasy ładowane leniwie: `/finanse/pule` oraz `/finanse/pule/:pulaId`. Odnośnik „Pule” znajduje się w Finansach; główne menu i Wspólne rozliczenia zachowują dotychczasowy zakres. Whitelista platformy przyjmuje szczegóły z UUID. Wstecz zamyka panel daty, następnie modal, wraca do listy i Finansów, także po bezpośrednim wejściu.

`WidokPul` udostępnia listę, wyszukiwanie po nazwie, aktywne/archiwalne/wszystkie oraz kolejność ostatniej aktywności. Karty pokazują nazwę, opis, rodzaj, walutę, saldo, cel, postęp i ostatnią operację. Stare kasy bez znacznika `pula.wersja = 1` nie są wyświetlane ani aktywowane.

`FormularzPuli` tworzy wyłącznie rodzaj `finansowa`, domyślnie PLN, bez uczestników i z zerowym saldem otwarcia. Nazwa jest wymagana, opis i dodatni cel opcjonalne. Walutę można zmienić tylko przed pierwszym faktem, również później usuniętym. Formularz korzysta z istniejącego wyboru waluty i `PoleKwoty`.

`FormularzOperacjiPuli` zapisuje rzeczywiste wpłaty i wydatki z datą przez `PoleDaty`, dokładną kwotą przez `PoleKwoty`, opisem i opcjonalnym źródłem/kategorią. Nie tworzy wydatków osobistych, należności ani zobowiązań. Ujemne saldo jest dozwolone; formularz pokazuje ostrzeżenie i przewidywaną kwotę. Rodzaj zakupowy, produkty i sprzedaż nie są udostępnione.

## Zapis, saldo i historia

`WspolneKasyService` rozszerzono o komendy `utworzPuleFinansowa`, `edytujPuleFinansowa`, `zapiszOperacjePuli`, `zmienArchiwizacjePuli` oraz odczyty `listaPodsumowanPul` i `pobierzWidokPuli`. Dane pozostają w `wspolneKasy` i `operacjeKas`. Nie dodano tabel, migracji ani niezależnego salda.

Komendy korzystają z istniejących `wTransakcjiFinansowej` i `zapiszGrupeFinansowa`: kontrola profilu/Właściciela, rewizja rekordu i rodzica, walidacja całego grafu, historia oraz outbox w jednej transakcji. Tekstowe źródło wpłaty można poprawić; źródło zobowiązania pozostaje niezmienne. ID szkicu i polecenia są zachowywane przy ponowieniu tej samej treści, blokada zapisu chroni przed wielokrotnym kliknięciem. Błąd i konflikt pozostawiają formularz otwarty z danymi. Po konflikcie należy odczytać aktualny rekord przed kolejną edycją.

Saldo pochodzi z pełnego obrazu FZ i `obliczProjekcjePuli`, po sprawdzeniu kompletności i konfliktów. Zabezpieczenie `pobierzSaldoKasy` pozostało. Sumy wpłat i wydatków powstają z aktywnych faktów przez `sumaGroszy`. Postęp to suma wpłat / cel, niezależnie od salda po wydatkach; brak celu oznacza brak wskaźnika. Niekompletność blokuje kwoty i zwykłe zapisy, zachowując historię do wglądu.

Historia pozwala obejrzeć szczegóły, poprawić błędną operację bez zmiany kierunku, usunąć ją miękko i przywrócić. Rewizje pokazują stany przed i po. Archiwizacja wymaga potwierdzenia, zachowuje fakty i saldo oraz blokuje edycję i nowe operacje do przywrócenia.

## Offline i ochrona

Właściciel oraz dotychczasowy tryb lokalny bez konta mogą pracować bez internetu. Edytor, również z grantem Finanse, nie otrzymuje dostępu przez UI ani serwisy. Odczyty i zapisy dotyczą wyłącznie aktywnej bazy zgodnej z profilem.

Transport FZ pozostaje wstrzymany do FZ-7. Rekordy są oczekujące w istniejącej kolejce, lecz nie trafiają do wysyłki. UI wyjaśnia lokalny zakres, pokazuje brak połączenia i wskazuje backup w Ustawieniach. Używany jest pełny backup FZ-2 z zachowaniem historii i grafu po restore; nie wdrożono nowego protokołu ani backendu.

## Weryfikacja i granice

Nowe testy: `PuleFinansowe.test.ts` oraz `WidokPul.test.tsx`. Obejmują kwoty i cel, ujemne saldo, walutę po usuniętym fakcie, korekty/soft-delete/przywracanie, archiwum, ponowienia, rollback, konflikty, zachowanie szkicu, profile/Właściciela/Edytora, offline, ponowne otwarcie bazy, backup, blokadę transportu i nawigację. Regresja obejmuje również FZ-2, stare kasy, Wspólne rozliczenia i osobiste Finanse. PWA smoke rozszerzono o listę i szczegóły Pul.

Wykonane lokalnie: celowana regresja finansów 124/124 (8 zestawów), testy serwera 98/98, lint (wyłącznie istniejące ostrzeżenia), typecheck, build frontendu/backendu i PWA smoke. Pełny lokalny przebieg: 1615/1616; jeden test Ustawień przekroczył czas oczekiwania na komunikat zapisu. Końcowe powtórzenie całego zestawu Ustawień: 25/25 zarówno w bieżącym kodzie, jak i w czystym FZ-2. Nie zmieniono ani nie wyłączono tych testów. Wynik CI i SHA są podawane w raporcie wykonania.

Sprawdzono renderowane rzeczywiste komponenty listy, szczegółów i formularza: Classic/Flat/Luxury × jasny/ciemny × 320/390/768/1280/1920 px. Pomiary obejmują przepełnienie i przyciski 44 px, oględziny — długie etykiety oraz kontrast dialogu Luxury. To render testowy i automatyczna obsługa Wstecz, nie fizyczna akceptacja Androida. Nie publikowano APK, nie aktualizowano Raspberry Pi ani `rpi-stable`. FZ-4–FZ-10 wymagają osobnych poleceń.
