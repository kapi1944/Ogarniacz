# Ekran kokpitu

Ekran kokpitu jest dostępny z menu Ogarniacza i pod adresem `/panel`. Pierwsze otwarcie pokazuje plansze. Przycisk zmiany widoku przełącza między planszami i widokiem ciągłym. W ustawieniach Kokpitu można przypiąć widok startowy albo wracać do ostatniego.

## Obsługa

- Plansze mają osobne nazwy, ikony i siatki. Można je przełączać przyciskami, paskiem lub gestem poziomym. Fokus na kontrolkach klawiaturowych, otwarte okno dialogowe, edycja i pisanie zatrzymują automatyczne przełączanie.
- Widok ciągły ma osobne sekcje. Wysokość pierwszej można ustawić automatycznie, w jednostkach wysokości ekranu albo w pikselach.
- Edytor pozwala ustawić siatkę, przeciągnąć lub zmienić rozmiar bloku i wybrać jego wygląd. Do przesuwania i skalowania można też użyć przycisków w konfiguratorze wybranego bloku. Kolizja blokuje operację. Zmiana siatki może zaproponować przełożenie istniejących bloków. Gdy wszystkie się nie mieszczą, edytor pozostawia ostatnią poprawną siatkę.
- Zapis utrwala roboczy układ. Anuluj oraz Wstecz po modyfikacji pokazują potwierdzenie odrzucenia zmian. Historia obejmuje ostatnie 60 operacji w otwartym edytorze. W bardzo małych polach plansza pokazuje ikonę bloku, która otwiera jego szczegóły.
- Dostępne są cztery automatycznie dobierane profile powierzchni, ręczny profil prezentacyjny i nazwane kopie jako warianty. Wybór profilu na danej instalacji jest niezależny od profilu otwartego w edytorze.
- Ambient po okresie bezczynności pokazuje wybrane informacje w uproszczonej postaci. Używa przyciemnienia treści i opcjonalnego okresowego przesunięcia. Zasady blokady i wygaszania ekranu ustala system urządzenia.

## Prywatność

Publiczny jest trybem początkowym. Zwykłe zadania i przypomnienia są w nim podsumowane bez tytułów. Budżety pokazują ogólny stan limitów po włączeniu opcji publicznego wskaźnika. Akcje zmieniające dane i sterowanie Domem są dostępne w trybie prywatnym po sprawdzeniu sesji i uprawnień.

Kolejność rozstrzygania to ważna sesja, dostęp do modułu, ręczny wybór, Grafik pracy, pierwszy pasujący przedział godzinowy i tryb publiczny. Grafik bierze pod uwagę wyjątki, urlopy i święta. Przedział z końcem wcześniejszym od początku obejmuje część kolejnego dnia. Ręczny wybór działa do zmiany reguły, przez 15, 30, 60 lub 120 minut albo do odwołania. Przy braku połączenia i po wygaśnięciu sesji zostaje widok publiczny. Prywatny widok wymaga istniejącego konta online. Dostęp po wyjściu z Kokpitu podlega regułom bieżącej sesji Ogarniacza.

Kokpit potwierdza sesję przy wejściu, po wznowieniu widoku i co 30 sekund w aktywnym oknie. Zdarzenie wygaśnięcia usuwa prywatne bloki od razu. Zapis akcji ponownie sprawdza uprawnienie i tożsamość. Home Assistant zachowuje dotychczasową autoryzację serwerową i potwierdzenie poleceń. Powiadomienia natywne podlegają ustawieniom systemu.

## Model danych i zgodność

- Opcjonalne `ustawienia.kokpit` ma własną wersję formatu. Istniejące rekordy bez pola są odczytywane z konfiguracją domyślną. Nieznany typ bloku zachowuje miejsce i ustawienia. Nieobsługiwana wersja konfiguracji pozostaje w rekordzie, a Kokpit odczytuje układ domyślny.
- Profile i warianty są częścią ustawień konta, kopii zapasowej i standardowego rekordu synchronizacji. Starszy zapis lub kopia bez pola zachowuje Kokpit, gdy jego konfiguracja jest już obecna lokalnie. Odtworzenie na nowej instalacji wymaga kopii zawierającej Kokpit albo rekordu synchronizacji z tym polem.
- Lokalny wybór aktywnego profilu jest powiązany z identyfikatorem istniejącej instalacji i użytkownikiem. Automatyczny wybór korzysta z wymiarów okna. Ustawienie lokalne nie jest częścią backupu ani synchronizacji.
- Siatka obsługuje 2–16 kolumn i 1–12 wierszy, do 20 plansz i 20 sekcji w profilu, do 12 nazwanych wariantów i 1500 zapisanych instancji bloków łącznie. Zmiany korzystają z dotychczasowej tabeli ustawień i kontraktu JSON synchronizacji. Schematy Dexie i SQLite pozostają w swoich wersjach.

## Platformy i weryfikacja

Web/PWA i Windows używają Fullscreen API. Widok Androida przełącza powierzchnię aplikacji, a opcja immersji korzysta z natywnego mostu Capacitor `SystemBars`. Stan pasków systemowych jest niezależny od paska plansz. Kontrolka wyjścia znajduje się w osobnym rzędzie nad siatką i uwzględnia bezpieczny obszar.

Pogoda sygnalizuje brak skonfigurowanego źródła. Kalendarz opiera się na module Terminów. Interakcje używają istniejących serwisów zadań, przypomnień, finansów i kont. Zegar i data mają jeden wspólny zegar minutowy, a widok plansz montuje wyłącznie aktualną planszę.

Po zmianie kodu uruchom `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run pwa:smoke` i `npm run server:test`. Przy próbie na urządzeniu sprawdź zwłaszcza systemowe gesty Androida, paski w obu orientacjach, wyjście z pełnego ekranu oraz czytelność siatki na docelowym ekranie.
