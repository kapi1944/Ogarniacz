# T2.1 — synchronizacja Androida, 2026-11-01

Zakres: połączenie, sesja, ponawianie i bezpieczeństwo kolejki. Punkt wyjścia:
aktualny `origin/main` (`d14279a`). Bez zmian serwera produkcyjnego i bez wydania.

## Ustalenia

`RepozytoriumZdalneHttp.mapujBladPolaczenia` tworzy `brak_polaczenia` po
odrzuceniu żądania: offline, timeout lub rozpoznany komunikat transportu.
`SyncEngine` zapisuje kod i `polaczenie: niedostepne`; diagnostyka pokazuje
„niedostępne”. Konto zapamiętane lokalnie może nadal dawać „zalogowany” — to
nie dowodzi dostępności serwera ani ważności jego bieżącej sesji.

Raport z telefonu nie zawiera pierwotnego wyjątku ani etapu żądania. Nie pozwala
rozstrzygnąć DNS, timeoutu, dostępności Tailscale/backendu ani błędnej
klasyfikacji odpowiedzi sesji. `adb devices` nie wykazał podłączonego telefonu.
Nie potwierdzono naprawy rzeczywistego połączenia tego urządzenia.

Potwierdzone testami i poprawione błędy klienta:

- Odpowiedź HTTP serwera kont mogła zostać uznana za brak sieci na podstawie
  `navigator.onLine` albo tekstu odpowiedzi. Teraz ma pierwszeństwo status HTTP;
  401 nadal oznacza brak/wygasłą sesję, pozostałe odpowiedzi używają istniejącego
  `blad_synchronizacji`. Nie dodano nowych kodów utrwalanych w bazie.
- Odświeżenie CSRF maskowało awarię serwera jako problem CSRF. Teraz zachowuje
  kategorię awarii; ponowny 403 CSRF nadal ma kategorię `csrf`.
- Natywne komunikaty `UnknownHostException`, `Connection reset`, `Socket closed`
  nie uruchamiały okresowego ponawiania, bo miały kategorię ogólnej synchronizacji.
  Teraz są rozpoznawane jako brak połączenia. Zachowano już sklasyfikowane błędy.
- Silnik wykonywał trzy identyczne próby dla błędów sesji i CSRF. Teraz kończy je
  od razu; jednokrotne odświeżenie CSRF i ponowienie POST pozostaje w adapterze HTTP.

Odzyskanie sieci, wznowienie aplikacji i zdarzenie konta uruchamiają synchronizację.
Po `brak_polaczenia` istniejący mechanizm ponawia co 60 sekund, gdy
`navigator.onLine` jest prawdziwe, także bez nowego zdarzenia `online`.
Po sukcesie kończy okresowe próby. Przejściowe błędy dostawcy nadal mają do trzech
prób z opóźnieniem 250/500 ms. Nie dodano pracy po całkowitym zamknięciu aplikacji.

## Bezpieczeństwo danych

Nie zmieniono schematu, formatu transportu, kolejki ani operacji usuwania danych.
Outbox usuwa wysłane identyfikatory dopiero po potwierdzeniu zapisu; nowa zmiana
w czasie wysyłania ma osobny identyfikator. Istniejące testy obejmują restart bazy,
konflikty i zmiany podczas wysyłania. Rozszerzony test potwierdza zachowanie
dziewięciu wpisów i ich treści podczas awarii, a następnie wysłanie całej dziewiątki
oraz zachowanie rekordów lokalnych po odzyskaniu połączenia.
Nie odczytywano ani nie modyfikowano dziewięciu zmian na rzeczywistym telefonie.

## Weryfikacja lokalna

- Przed poprawką: 7 nowych przypadków adaptera i 3 przypadki ponawiania sesji
  odtworzyły błędy.
- Po poprawce: 99/99 testów w 8 plikach, uruchomionych jak CI:
  `npm test -- --pool=forks --no-file-parallelism --maxWorkers=1`
  z filtrami RepozytoriumZdalneHttp, SyncEngine, SynchronizacjaAplikacji,
  KontaService, DiagnostykaSynchronizacji, KontekstProfilu, SynchronizacjaWeb
  i SynchronizacjaFinansowWspolnych.
- `npm run lint`: sukces, ostrzeżenia w niezmienianych plikach.
- `npm run build` (z `npm run typecheck`): sukces.
- `npm run pwa:smoke`: sukces.
- Równoległy przebieg miał niestabilny wynik istniejącego testu z zegarem;
  końcowy przebieg wykonano kolejno, zgodnie z konfiguracją CI.
- Pełna regresja i natywny build Androida pozostają w istniejącym CI po pushu.

## Dalsza próba na Androidzie

Na obecnej instalacji sprawdzić aktywne połączenie Tailscale i dostęp do
skonfigurowanego hosta HTTPS w przeglądarce telefonu. Wrócić do aplikacji i użyć
„Synchronizuj teraz”; zapisać nowy raport. Przy 401 zalogować ponownie na to samo
konto. Nie odinstalowywać aplikacji, nie czyścić danych i nie resetować konta.
Przy dalszym błędzie potrzebny jest zanonimizowany wyjątek transportu i etap
żądania z urządzenia, bez cookie, CSRF i treści rekordów.

Poprawiony frontend trafi do Androida dopiero w osobno zatwierdzonym APK.
To zadanie nie buduje ani nie publikuje wydania i nie aktualizuje Raspberry Pi.

Zmienione pliki: `src/data/RepozytoriumZdalneHttp.ts`,
`src/data/RepozytoriumZdalneHttp.test.ts`, `src/services/SyncEngine.ts`,
`src/services/SyncEngine.test.ts`, `src/services/SynchronizacjaAplikacji.test.ts`
oraz niniejszy raport.
