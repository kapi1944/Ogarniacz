# Finanse — wspólne kasy i rozliczenia

Data przeglądu: 27.10.2026. Punkt odniesienia: commit `21ce6f9`.

Dokument przekłada specyfikację funkcjonalną na zakres wdrożenia zgodny z obecną implementacją. Powstał po celowanym przeglądzie Finansów, zapisu, profili, synchronizacji, historii i załączników. Nie jest pełnym audytem aplikacji. Pierwotny przegląd opisuje stan z 27.10.2026. Modele, obliczenia i serwisy F7.1–F7.3 są już zaimplementowane; poniższy rozdział F7.4 opisuje aktualny kontrakt synchronizacji. Ekrany kolejnych etapów pozostają poza zakresem.

## 1. Co rzeczywiście istnieje

| Obszar | Ustalenie z kodu | Wykorzystanie przy rozbudowie |
| --- | --- | --- |
| Ekran Finansów | [WidokFinansow.tsx](../src/modules/finanse/WidokFinansow.tsx) łączy podsumowania, transakcje, subskrypcje, płatności stałe, konta, raty i budżety. | Dodać skróty do dwóch osobnych ekranów w Finansach. Nie rozbudowywać dalej jednego dużego komponentu. |
| Obecne modele | [typy.ts](../src/domain/typy.ts): `Wydatek` obsługuje wydatek, przychód i transfer; `KontoFinansowe` jest opisem źródła środków. | Kasa nie jest kolejnym typem konta. Obecne modele nie mają podziału kosztu, wielu finansujących ani zwrotów między uczestnikami. |
| Kwoty | `Wydatek.kwota`, limity i raty są liczbami w głównej jednostce waluty. UI oraz dostawca pulpitu zakładają PLN. | Nowe encje przechowują najmniejsze jednostki waluty. Nie zmieniać znaczenia istniejącego pola `kwota`. |
| Obliczenia | [FinanseService.ts](../src/services/FinanseService.ts) liczy budżety, cash flow i raty. | Zachować istniejące funkcje. Brakuje silnika kas i rozliczeń; nowe wspólne funkcje ograniczyć do potrzeb tych dwóch funkcji. |
| Zapis i odczyt | [Repozytorium.ts](../src/data/Repozytorium.ts), [useRepozytorium.ts](../src/hooks/useRepozytorium.ts): zapis przez repozytoria, reaktywny odczyt, soft-delete. | Zachować ten przepływ. Złożone walidacje i zapisy finansowe umieścić w serwisach domenowych, poza JSX. |
| Historia | [HistoriaZmianService.ts](../src/services/HistoriaZmianService.ts) zapisuje wybrane pola przed i po zmianie; repozytorium łączy zapis rekordu, historii i kolejki w transakcji. | Rozszerzyć konfigurację o nowe encje. Samo dopisanie tabel do konfiguracji nie zapewni historii na innych urządzeniach. |
| Schemat bazy | [BazaOgarniacza.ts](../src/data/BazaOgarniacza.ts) ma wersję 19 oraz centralną listę tabel. | Nowe tabele wymagają migracji kolejnej wersji i wpisów w `MapaTabel`; aktualną wersję ponownie sprawdzić w chwili wdrożenia. |
| Profile | [ProfileLokalne.ts](../src/data/ProfileLokalne.ts) rozdziela bazy według serwera, użytkownika i właściciela; [KontekstProfilu.ts](../src/services/KontekstProfilu.ts) zamyka profil i zatrzymuje synchronizację przy zmianie konta. | Nowe dane muszą pozostać w aktywnej bazie. Nie tworzyć osobnego magazynu finansowego ani globalnego cache sald. |
| Synchronizacja | [KolejkaSynchronizacji.ts](../src/data/KolejkaSynchronizacji.ts), [SyncEngine.ts](../src/services/SyncEngine.ts), [synchronizacja.ts](../server/synchronizacja.ts) obsługują kolejkę, konflikty, identyfikatory zmian, upsert i znaczniki usunięcia. Serwer ma jawną listę obsługiwanych tabel. | Rozszerzyć istniejącą ścieżkę. Nie tworzyć osobnej kolejki ani endpointów finansowych do zwykłego przesyłania rekordów. |
| Autoryzacja | [serwer.ts](../server/serwer.ts) wyznacza właściciela z sesji i filtruje odczyt/zapis przez [konta.ts](../server/konta.ts). Grant `finanse` obejmuje obecne tabele Finansów. | Dla nowych tabel V1 wprowadzić jawną zasadę „tylko właściciel”, również przy ogólnym grancie Edytora do Finansów. |
| Backup | [BackupService.ts](../src/services/BackupService.ts) ma format 3, sekcje, walidację, kontekst profilu, transport Blobów i kopię przed przywracaniem. | Nowe dane objąć backupem od pierwszego zapisu. Starsza kopia bez nowych danych nie może ich wyczyścić. |
| Załączniki | `Dokument` ma Blob, MIME, nazwę, rozmiar i powiązania. [WidokiWiedzy.tsx](../src/modules/wiedza/WidokiWiedzy.tsx) udostępnia formularz dokumentów; [RepozytoriumZdalneHttp.ts](../src/data/RepozytoriumZdalneHttp.ts) używa transportu Blobów z backupu. | Wykorzystać istniejący zapis i transport. Brakuje gotowej obsługi paragonów przy operacjach i ochrony załącznika finansowego tylko dla właściciela. |
| Nawigacja i wygląd | [App.tsx](../src/App.tsx) ma trasę `/finanse`; [trasy.ts](../src/platform/trasy.ts) osobno ogranicza dopuszczalne odnośniki platformowe. [Interfejs.tsx](../src/components/Interfejs.tsx) i [glowny.css](../src/styles/glowny.css) udostępniają komponenty oraz styl Luxury. | Nowe podstrony pozostają w module `finanse`. Wykorzystać istniejące komponenty i tokeny; sprawdzić również whitelistę odnośników Androida. |

### Ważne granice ponownego użycia

- `przygotujWydatekZeZrodla` sprawdza powiązanie na przekazanej liście. Nie jest atomową ochroną przed równoczesnym podwójnym zapisem. Nie używać go jako gwarancji idempotencji nowych operacji.
- `historiaZmian` jest wyłączona z synchronizacji. Pobranie rekordu przez `SyncEngine` zapisuje go bez tworzenia kompletnej historii wcześniejszych zmian z innych urządzeń.
- Serwer sprawdza obecnie głównie strukturę transportu i metadane. Nowe sumy finansowania, podziału i poprawność kwot wymagają własnej walidacji domenowej również na granicy synchronizacji.
- Dodanie pola `ownerId` nie zastępuje profilu ani uwierzytelnionej sesji. Nie wprowadzać drugiego, niezależnego źródła własności danych.
- [tsconfig.server.json](../tsconfig.server.json) ogranicza kompilację serwera do katalogu `server`. Nie importować wprost klientowego serwisu zależnego od Dexie/UI. Wspólny kontrakt walidacji trzeba wydzielić bez zależności platformowych i sprawdzić w obu kompilacjach; ewentualna zmiana położenia źródeł nie może zmienić oczekiwanej ścieżki `dist-server/main.js`.

## 2. Zakres pierwszej wersji

W Finansach powstają dwie niezależne funkcje:

1. **Wspólne kasy:** dowolna liczba kas, wpływy, wydatki, korekty, saldo, zwroty kaucji, historia.
2. **Rozliczenia:** dowolna liczba grup, uczestnicy bez kont, wielu finansujących jeden wydatek, cztery podziały kosztów, wykluczanie uczestników, bilans, częściowe zwroty i archiwum.

Obie działają lokalnie, a po włączeniu istniejącej synchronizacji przesyłają dane między urządzeniami tego samego właściciela. W V1 „wspólna” oznacza wspólny cel lub grupę osób, nie współdzielenie między kontami. Nazwy uczestników nie nadają uprawnień do aplikacji. Tryb lokalny bez konta pozostaje obsługiwany.

Składki z deklaracjami i celami oraz paragony stanowią kolejne, osobno wdrażane rozszerzenia. Współdzielenie między kontami, finansowanie rozliczenia z kasy, raporty/eksport, rozliczenia cykliczne i OCR pozostają poza pierwszą wersją. Istniejący backup obejmuje nowe dane od początku, niezależnie od późniejszego eksportu raportów.

### Wspólny silnik o ograniczonym zakresie

Proponowane lokalizacje nowych plików:

- `src/domain/finanseWspolne.ts` — typy i schematy nowych danych; rejestracja tabel nadal w `MapaTabel`.
- `src/services/ObliczeniaFinansowWspolnych.ts` — parsowanie i formatowanie kwot, saldo, podziały, bilanse i propozycje zwrotów.
- `src/services/WspolneKasyService.ts` — walidacja i zapis operacji kas.
- `src/services/RozliczeniaService.ts` — walidacja i zapis wydatków, uczestników i zwrotów.
- `src/modules/finanse/` — osobne komponenty kas i rozliczeń; formularze wydzielać według realnej złożoności.

Nazwy są propozycją, nie poleceniem tworzenia pustych plików. Nie powstaje uniwersalna księga dla całej aplikacji. Wydatki kas i grup nie trafiają automatycznie do obecnej tabeli `wydatki`, cash flow, budżetów ani kafelka osobistych Finansów. Zapobiega to podwójnemu liczeniu oraz przypisywaniu właścicielowi kosztów całej grupy.

## 3. Proponowany kontrakt danych

### Zrealizowany zakres F7.1 — sam silnik offline

`src/domain/finanseWspolne.ts` definiuje wyłącznie wejścia i wyniki obliczeń,
a `src/services/ObliczeniaFinansowWspolnych.ts` udostępnia czyste funkcje:
`kwotaNaGrosze`, `groszeNaKwote`, `obliczPodzialKosztu`,
`obliczWydatekWspolny` i `obliczRozliczenieWspolne`.
Nie utworzono encji trwałych, tabel, zapisu ani interfejsu.

- `kwotaGrosze` to bezpieczna całkowita liczba najmniejszych jednostek waluty;
  stare `kwota` nadal oznacza jednostki główne. Konwersja tekstu używa
  normalizatora F3 i wewnętrznego `BigInt`, bez mnożenia liczb zmiennoprzecinkowych.
- Silnik obsługuje obecną listę `WALUTY` z F3 (wszystkie mają dwie cyfry ułamka),
  zamiast osobnej listy PLN/EUR proponowanej niżej. Jedno wywołanie rozliczenia
  dotyczy jednej waluty; inna waluta operacji powoduje błąd.
- Podział wskazuje osoby obciążone konkretnym wydatkiem. Pominięcie ID wyklucza
  osobę z kosztu, ale nie blokuje finansowania. Dodanie osoby do grupy nie zmienia
  list podziału wcześniejszych zakupów. Procenty są całkowitymi setnymi procenta.
- Podział stosuje największe reszty z remisami według kodów znaków ID.
  Bilanse uwzględniają osobno finansowanie, koszt i rzeczywiste zwroty.
  Propozycje łączą każdorazowo największy pozostały dług z największą należnością
  (remisy według ID), bez obietnicy globalnego minimum liczby przelewów.
- Rozliczenie przyjmuje pełny zestaw bieżących, nieusuniętych wydatków i zwrotów
  jednej grupy. Powtórzone ID w obrębie każdej listy są błędem, a nie kolejną
  operacją. Idempotencja zapisu i filtrowanie usuniętych danych należą do późniejszej
  warstwy zapisu, której F7.1 nie implementuje.
- Zwroty są jawnym wejściem, propozycje jedynie wynikiem. Częściowy zwrot
  zmniejsza dług, nadpłata lub zmiana/usunięcie zakupu może odwrócić należność.
  Silnik odzwierciedla także faktyczny przelew w złym kierunku; przyszły formularz
  powinien ostrzegać przed nadpłatą. Zwroty nie zwiększają sumy wydatków.
- Wszystkie wyniki i sumy muszą mieścić się w bezpiecznym zakresie całkowitym.
  Silnik nie modyfikuje wejść i nie wyznacza trwałego statusu rozliczenia.

Wszystkie nowe encje zachowują istniejące `EncjaBazowa`, UUID i metadane dat. Dziedziczone nazwy `createdAt` i `updatedAt` pozostają zgodne z repozytorium; nowe pola mają nazwy polskie. Własność wynika z bazy profilu oraz zakresu sesji na serwerze. Nie dodajemy wymaganego identyfikatora konta do lokalnych rekordów bez konta.

| Tabela | Najważniejsze nowe pola |
| --- | --- |
| `wspolneKasy` | `nazwa`, `opis`, `ikona`, `kolor`, `waluta`, `saldoPoczatkoweGrosze`, `status: aktywna / zarchiwizowana` |
| `operacjeKas` | `kasaId`, `typ: wplyw / wydatek / korekta`, `kwotaGrosze`, `waluta`, `dataOperacji`, `kategoria`, `zrodlo`, `opis`, opcjonalne `kaucja` |
| `rozliczenia` | `nazwa`, `opis`, `waluta`, `uczestnicy[]`, `domyslnyPodzial`, `etap: aktywne / oczekuje`, `dataRozpoczecia`, opcjonalne `dataZakonczenia`, `zarchiwizowanoAt` |
| `wydatkiGrupowe` | `rozliczenieId`, `nazwa`, `kwotaGrosze`, `waluta`, `dataOperacji`, `finansujacy[]`, `metodaPodzialu`, `parametryPodzialu`, `podzialKosztu[]`, `opis` |
| `zwrotyRozliczen` | `rozliczenieId`, `odUczestnikaId`, `doUczestnikaId`, `kwotaGrosze`, `waluta`, `dataOperacji`, `opis` |

Uczestnik rozliczenia ma stabilne `id`, `nazwa` i opcjonalne oznaczenie nieaktywności. Uczestnicy są zapisani w rozliczeniu; V1 nie wymaga osobnej globalnej książki osób. Dwie osoby o tej samej nazwie muszą być rozróżnialne. Zmiana nazwy nie zmienia ID. Uczestnika użytego w historii nie można usunąć; można go wyłączyć z nowych wydatków. Dodanie nowej osoby nie zmienia podziałów wcześniejszych wydatków.

Pozycja finansowania i pozycja wynikowego podziału mają `uczestnikId` i `kwotaGrosze`. Parametry podziału zachowują historyczne wagi, procenty lub kwoty. Zmiana domyślnej metody nie przelicza zapisanych wydatków.

`kaucja` zachowuje pozycje z nazwą opakowania, liczbą sztuk i stawką w groszach, sumę obliczoną oraz ewentualną kwotę ręcznie zatwierdzoną i uzasadnienie różnicy. Wpływem jest wyłącznie `kwotaGrosze` operacji. Nie zapisujemy dodatkowego przychodu dla obliczonej sumy. Ustawienia ostatniego źródła i stawek są lokalne dla konkretnej kasy/profilu, nie globalne dla wszystkich kont.

### Zrealizowany zakres F7.3 — lokalny zapis

`WspolneKasyService` obsługuje tworzenie, odczyt, ustawienia i archiwizację kas
oraz wpływy, wydatki, korekty z uzasadnieniem, edycję, miękkie usunięcie i przywrócenie
operacji. Saldo jest wyliczane z operacji przy odczycie; może być ujemne.
Waluty nie można zmienić po pierwszej operacji, również usuniętej.

`RozliczeniaService` obsługuje grupy, uczestników bez konta, zmianę nazwy
i wyłączenie uczestnika, wielu finansujących, cztery podziały F7.1, edycję,
usunięcie i przywrócenie wydatku oraz rzeczywistych zwrotów. Nie udostępnia
usuwania uczestników. Wyłączenie blokuje nowe przypisania kosztu/finansowania,
ale zachowuje istniejące przypisania w edycji historii. Dodanie osoby nie zmienia
historycznych podziałów. Zwroty pozostają zapisane po zmianie/usunięciu wydatku,
więc bilans może wskazać odwrotną należność. Nadpłata jest dopuszczalna;
ostrzeżenie w formularzu należy do przyszłego etapu interfejsu.

Każdy zapis otrzymuje od wywołującego stabilne ID rekordu oraz
`{ idZapisu, oczekiwanaRewizja }`. Wywołujący losuje UUID `idZapisu` **przed**
pierwszą próbą i zachowuje oba ID oraz treść przy ponowieniu po błędzie.
Utworzenie oczekuje rewizji 0; dalsze zmiany oczekują rewizji odczytanego rekordu.
Historia przechowuje kanoniczną treść polecenia, jego ID oraz stany biznesowe
`przed`/`po`. Ponowienie identycznego polecenia zwraca bieżący rekord bez zapisu,
także gdy później wykonano inne zmiany. Nie odtwarza wtedy dawnego stanu.
Inna treść tego samego polecenia, zajęte ID rekordu i nieaktualna rewizja
powodują `KonfliktZapisuFinansowego`. Nowe polecenie bez zmiany wartości nie
zwiększa rewizji; po późniejszej zmianie jego starej rewizji nie można użyć.

Transakcja Dexie obejmuje pięć tabel F7 i istniejącą `historiaZmian`, dzięki
czemu walidacja powiązań i pełnego bilansu jest spójna także przy równoczesnych
zapisach. Każda rzeczywista zmiana dopisuje jedną rewizję. `historiaWersji` nie
zagnieżdża historii ani metadanych uwierzytelniania. Globalny podgląd nadal
korzysta z `HistoriaZmianService`; przywrócenie ma tam zgodny typ `aktualizacja`,
a w historii rekordu jawny typ `przywrocenie`. Stary rekord F7.2A bez rewizji
otrzymuje przy pierwszej zmianie rewizję 1 i zapis poprzednich wartości.

Dostęp wymaga istniejącego kontekstu właściciela i zgodności bazy z aktywnym
profilem. Konto musi używać bazy profilu; nie zapisujemy nowych finansów konta
w bazie globalnej. Lokalna praca bez konta korzysta z dotychczasowej kontroli
dostępu właściciela. Edytor (także podgląd lokalny z grantem Finansów) nie ma
dostępu do serwisów, historii finansowej ani jej eksportu/przywracania. Ogólny
CRUD pięciu tabel pozostaje zablokowany. Zmiana/zamknięcie profilu podczas
operacji przerywa transakcję. Nie powstaje drugi system kont.

Backup zachowuje format 3 i schemat Dexie 20. Odtwarzanie waliduje kwoty,
waluty, relacje, finansowanie, podziały i ciągłość historii, także dla usuniętych
rekordów. Starsze sekcje bez danych F7 nie czyszczą nowych tabel.

### Zrealizowany zakres F7.4 — synchronizacja i ochrona danych

Pięć tabel `wspolneKasy`, `operacjeKas`, `rozliczenia`, `wydatkiGrupowe`
i `zwrotyRozliczen` korzysta z istniejących `SyncEngine`, endpointu
`/api/sync/changes`, outboxu, `zmianaId`, `bazowyUpdatedAt`, ponowień i soft-delete.
Nie zmieniono modelu osobistych Finansów, wersji Dexie 20 ani schematu SQLite.
Tryb lokalny bez konta nadal działa. W tej zmianie nie wdrożono backendu ani APK.

**Pierwsze przygotowanie:** transakcja aktywnej bazy obejmuje pięć tabel,
kolejkę i `stanSynchronizacji`. Skanuje wszystkie rekordy, także usunięte
oraz starsze od `ostatniSync`. Nie zmienia ich ID, rewizji ani historii;
zachowuje istniejące oczekujące zmiany. Dopiero z kompletną kolejką zapisuje
`finanseWspolneZmigrowane`. Ten znacznik oznacza przygotowanie outboxu,
nie potwierdzenie wysłania. Kolejne zapisy finansowe zapisują rekord, historię
i kolejkę atomowo. Import kopii usuwa nieaktualne oczekujące migawki zastąpionych
tabel i unieważnia znacznik w tej samej transakcji; następna synchronizacja
przygotowuje pełne przywrócone dane. Zgodność z serwerem jest sprawdzana niezależnie.

**Negocjacja:** nowy klient prosi w GET o `finanseWspolne=1`. Odpowiedź nowego
backendu zawiera `obslugiwaneTabeleFinansowe` i `liczbaRekordowFinansowych`.
Wysyłka pięciu tabel wymaga potwierdzenia obsługi wszystkich pięciu.
Brak deklaracji (stary backend) zatrzymuje wyłącznie te zmiany: pozostają
w kolejce, pozostałe moduły synchronizują się normalnie, a istniejący komunikat
synchronizacji informuje o ograniczeniu. Dane pominięte przez serwer nie są
uznawane za wysłane. Starszy klient bez parametru GET nie otrzymuje nowych tabel.

**Odbiór i walidacja:** backend zwraca pełny obraz nowych tabel właściciela
niezależnie od kursora, z liczbą rekordów, łącznie ze znacznikami usunięcia.
Pozostałe tabele zachowują dotychczasowy kursor. Klient sprawdza kompletność
odpowiedzi i zapisuje finansową część atomowo. Walidacja na obu końcach składa
najpierw cały obraz (istniejące dane i paczkę), więc dziecko może poprzedzać
rodzica. Sprawdza schemat, identyfikatory, daty, bezpieczne całkowite kwoty,
waluty, relacje, finansowanie, deterministyczny podział, zwroty, ciągłość i stany
historii, także warianty konfliktów. Niepełny lub niespójny obraz nie jest
zapisywany. Odczyt salda/bilansu odmawia zwrócenia wyniku po wykryciu niepełnej
paczki oraz przy nierozstrzygniętym konflikcie finansowym. Identyczne migawki
nie wywołują kolejnych zapisów i powiadomień. Zmiana lokalnych danych podczas
pobierania nie może ich nadpisać.

Czyste schematy i dotychczasowe obliczenia są współdzielone w `server/wspolne/`;
publiczne ścieżki importów klienta pozostają dostępne. Serwer nie importuje
Dexie, React ani kodu przeglądarki. `rootDir` i start `dist-server/main.js`
pozostają bez zmian. Obowiązuje dotychczasowy limit POST 25 MiB; odrzucenie
paczki pozostawia dane lokalne i oczekujące zmiany.

**Konflikty:** serwer wymaga zgodnej wersji bazowej również dla tego samego
`installationId` i nie pozwala zastąpić zatwierdzonej historii. Klient rozpoznaje
kontynuację znanej historii po pominiętej odpowiedzi. Rozbieżne gałęzie wymagają
wyboru pełnego rekordu; ręczne łączenie pól finansowych jest zabronione.
Rozstrzygnięcie dopisuje rewizję `rozstrzygniecie` do historii wersji serwera,
przechowując pełne `wariantyKonfliktu.lokalny` i `.zdalny` oraz `wybrano`.
Odrzucona gałąź nie wpływa na saldo. Także wybór wersji zdalnej trafia do kolejki,
żeby archiwum obu wariantów dotarło na inne urządzenia. Zwykła historia zmian
jest odtwarzana z nowych wersji przy odbiorze, bez synchronizowania całej tabeli
`historiaZmian`. Różne ID rzeczywistych zwrotów pozostają różnymi operacjami,
niezależnie od czasu nadejścia i ewentualnej nadpłaty.

**Dostęp:** sesja serwera wyznacza właściciela; pola rekordu i nagłówki klienta
nie nadają własności. Właściciel musi być użytkownikiem aktywnego kontekstu.
Edytor z grantem `finanse` nie odczytuje i nie zapisuje tych tabel. Reguła działa
w serwerowej kontroli tabel, GET/POST, transporcie klienta, kolejce, serwisach
i odczycie/rozstrzyganiu konfliktów. Zmiana profilu zatrzymuje operację przed
zapisem do innej bazy lub usunięciem jej kolejki. Nie dodano nowego systemu kont.

**Kolejność uruchomienia produkcyjnego (osobny etap):**

1. Utworzyć kopię backendu i danych urządzeń. Wdrożyć zgodny backend F7.4
   dotychczasową autoryzowaną ścieżką, z zachowaniem `dist-server/main.js`.
2. Na syntetycznym profilu potwierdzić deklarację pięciu tabel, pełny GET,
   walidację POST, izolację właścicieli i odmowę Edytorowi. Starsze klienty
   mogą nadal działać obok nowego backendu.
3. Dopiero potem aktualizować urządzenia istniejącym mechanizmem publikacji.
   Wysyłka nowych tabel nastąpi tylko po pozytywnej negocjacji i przy świadomie
   włączonej istniejącej synchronizacji. Wcześniej zaktualizowane urządzenie
   zachowa oczekujące dane do chwili uzyskania zgodnego backendu.
4. Potwierdzić na dwóch urządzeniach tego samego właściciela pierwszy upload,
   powtórzenie po utracie odpowiedzi, historię i konflikt. Testy lokalne nie
   zastępują tej próby ani testu Androida/Raspberry Pi.

### Historia zmian między urządzeniami — kontrakt

Samo obecne `historiaZmian` nie spełnia tego wymagania. F7.3 wdraża lokalne `rewizja` i `historiaWersji` w tym samym rekordzie co dane finansowe. Historia zawiera poprzednie wartości biznesowe, rodzaj zmiany i czas; nie zagnieżdża ponownie całej historii ani Blobów. F7.4 przenosi rekord i jego historię razem, również gdy urządzenie ominęło kilka kolejnych edycji.

Serwis finansowy porównuje oczekiwaną rewizję z rekordem odczytanym w transakcji, dopisuje poprzednią wersję i nadaje nowszy `updatedAt`. Ponowienie identycznego zapisu nie tworzy kolejnej rewizji ani wpisu historii. Zapis obejmuje rekord, lokalną historię i istniejącą kolejkę w jednej transakcji. Ochrona musi obejmować także przywrócenie i usunięcie.

Historia lokalna pozostaje przydatna w istniejącym podglądzie zmian. `historiaWersji` nowych encji jest źródłem odtworzenia ich historii między urządzeniami; nie rozszerzamy globalnej synchronizacji `historiaZmian`. Finansowe konflikty rozstrzygamy jako kompletny rekord wraz z historią, bez mieszania kwoty z jednej wersji i podziału z drugiej. Zachowujemy także odrzucony wariant z oznaczeniem wyniku rozstrzygnięcia; nie włączamy go do bieżącego salda. Rewizja służy kontroli lokalnej edycji, nie zastępuje istniejącego wykrywania konfliktów między urządzeniami.

To rozszerzenie wymaga testów wielkości i walidacji historii. Nie jest księgą audytową odporną na ingerencję właściciela urządzenia. Alternatywny osobny dziennik rewizji zwiększałby zakres synchronizacji i nie jest proponowany w V1.

## 4. Niezmienniki finansowe

### Kwoty i waluta

- Dla V1 proponowana jawna lista walut to PLN i EUR, obie z dwoma miejscami dziesiętnymi. Nazwa `kwotaGrosze` oznacza najmniejszą jednostkę danej waluty. Inne waluty wymagają określenia ich precyzji przed udostępnieniem, bez zakładania, że zawsze wynosi dwa.
- Wszystkie zapisane kwoty i sumy są bezpiecznymi liczbami całkowitymi. Odrzucamy `NaN`, nieskończoność, notację wykładniczą, nadmiar miejsc dziesiętnych i przekroczenie bezpiecznego zakresu.
- Kwotę z formularza parsujemy z tekstu, obsługując przecinek lub kropkę; nie opieramy dokładności na `Number(tekst) * 100`.
- Wpływ, wydatek, finansowanie i zwrot nie mogą mieć ujemnej kwoty. Operacja wpływu, wydatku i zwrotu musi być dodatnia; pojedynczy udział w podziale może wynosić zero. Korekta jest podpisaną kwotą różnicy, różną od zera, z wymaganym uzasadnieniem.
- Waluta operacji musi odpowiadać walucie kasy/rozliczenia. Po pierwszej operacji nie można zmienić waluty. Nie przeliczamy kursów i nie sumujemy różnych walut w jedno saldo.
- Datę operacji zapisujemy jako lokalne `YYYY-MM-DD`; techniczny czas zapisu jako ISO. Zmiana strefy nie przesuwa daty zakupu. Dane usunięte nie uczestniczą w wyliczeniach.

### Kasy

`saldo = saldoPoczatkoweGrosze + suma(wplywow) - suma(wydatkow) + suma(korekt)`

Saldo jest projekcją ważnych, zapisanych operacji. Nie zapisujemy niezależnego pola aktualnego salda i nie zwiększamy go przy odbiorze paczki synchronizacji. Nie potrzeba stanu „zatwierdzona”, jeżeli V1 nie przechowuje szkiców: poprawny zapis formularza zatwierdza operację.

Ujemne saldo jest dozwolone. Przed zapisem wydatku formularz pokazuje kwotę niedoboru; po zapisie saldo pozostaje wyraźnie oznaczone. Samo ostrzeżenie nie tworzy osobistej należności wobec kasy.

### Wydatki grupowe

`suma(finansujacy.kwotaGrosze) = kwotaGrosze = suma(podzialKosztu.kwotaGrosze)`

Finansujący i obciążeni kosztem to niezależne listy. Każde ID musi należeć do rozliczenia, w każdej liście występować najwyżej raz, a koszt musi być pokryty w całości. Wpłata uczestnika przy kasie sklepowej jest finansowaniem wydatku; późniejszy przelew między uczestnikami jest zwrotem. Nie tworzymy trzeciej, nieokreślonej kategorii „wpłat”.

- **Po równo:** równe wagi wybranych osób.
- **Kwotowo:** jawne kwoty muszą sumować się dokładnie do ceny. Nie wyrównujemy błędnego formularza po cichu.
- **Procentowo:** wartości procentowe przechowujemy w całkowitych setnych częściach procenta; suma wynosi dokładnie 10 000.
- **Według udziałów:** nieujemne całkowite wagi; przynajmniej jedna dodatnia. W V1 bez ułamkowych wag.

Poza podziałem kwotowym stosujemy metodę największych reszt: obliczamy części całkowite, a pozostałe grosze przydzielamy według malejących reszt. Remisy rozstrzyga stały porządek ID, niezależny od kolejności formularza i języka urządzenia. Iloczyny muszą być dokładne, np. przez `BigInt` wewnątrz obliczenia; do bazy trafiają wyłącznie sprawdzone liczby całkowite.

Przykłady: 1 grosz na trzy osoby daje 1/0/0, a 800 zł przy wagach 2:2:2:1 daje 228,57/228,57/228,57/114,29 zł. Zapisujemy wynik przy wydatku, a nie odtwarzamy go z późniejszych ustawień grupy.

### Bilans i zwroty

`bilansOsoby = wylozone - przypisanyKoszt + wyslaneZwroty - otrzymaneZwroty`

Dodatni bilans oznacza należność do otrzymania, ujemny — kwotę do oddania. Suma bilansów musi wynosić zero. Zwrot nie zmienia sumy wydatków wydarzenia. Edycja lub usunięcie wydatku przy istniejących zwrotach przelicza bilans i może odwrócić kierunek należności.

Propozycje przelewów powstają deterministycznie przez łączenie największych długów z największymi należnościami, z remisami według ID. Dla `n` osób z niezerowym bilansem wystarczy najwyżej `n - 1` propozycji. Nie obiecujemy globalnie minimalnej liczby przelewów.

Zwrot zapisujemy jako faktycznie wykonany przelew: dodatnia kwota, różne osoby, ta sama grupa i waluta. Częściowy zwrot zmniejsza należność. Przekroczenie aktualnej propozycji wymaga ostrzeżenia, lecz rzeczywisty nadpłacony przelew nadal można zarejestrować. Dwa urządzenia offline mogą zapisać różne prawdziwe przelewy; po synchronizacji pokazujemy wynikową nadpłatę/odwrotną należność. Nie wolno usuwać jednego przelewu tylko dlatego, że przekroczył wcześniej obliczony dług.

Status „Rozliczone” jest wyliczany tylko dla zakończonego zbierania wydatków i wszystkich bilansów równych zero. Pusta aktywna grupa nie staje się automatycznie rozliczona. Archiwizacja jest osobna, blokuje zwykłą edycję i jest odwracalna. Później dostarczona operacja offline musi być widoczna: nie może pozostawić komunikatu „Rozliczone” przy niezerowym bilansie.

## 5. Zapis, izolacja i zgodność

1. UUID nowej operacji powstaje raz przy rozpoczęciu zapisu i jest zachowywany po błędzie lub ponowieniu. Podwójne naciśnięcie przycisku nie generuje dwóch operacji. Ponowiony identyczny zapis to brak zmiany; ten sam ID z inną treścią nie jest automatycznie nowym wydatkiem.
2. Zapis finansowy odczytuje w transakcji rodzica, poprzednią wersję i warunki edycji. Zmiana, historia i outbox są atomowe; błąd nie może pozostawić częściowego zapisu. UI nie obchodzi serwisu przez zwykły formularz CRUD.
3. Serwer zachowuje istniejące deduplikowanie `zmianaId` i upsert według właściciela/tabeli/ID. Ponowna dostawa tego samego rekordu nie zmienia wyliczanego salda. Własność zawsze pochodzi z sesji, nigdy z przesłanej nazwy czy pola właściciela.
4. Nowe tabele wymagają jawnego dopuszczenia w transporcie serwera i walidacji ich schematów po obu stronach. Walidacja relacji uwzględnia zapisanych rodziców oraz rodziców w tej samej paczce. Nie uzależniać poprawności od kolejności rekordów w paczce.
5. V1 odmawia odczytu i zapisu nowych danych Edytorowi, nawet z grantem `finanse`. Sprawdzić UI, serwisy/repozytoria, pobieranie i wysyłanie synchronizacji, historię oraz późniejsze załączniki. Nie zmieniać zasad dostępu do dawnych Finansów.
6. Odczyt paczki i rozstrzygnięcie konfliktu muszą zachować kompletne niezmienniki finansowania i kosztu. Przejściowo brakujący rodzic nie może oznaczać usunięcia dziecka ani pokazania wiarygodnego zera; widok sygnalizuje niekompletne dane. Test obejmuje przerwanie pobierania między tabelami.
7. Usunięcie rodzica nie usuwa fizycznie jego operacji. Zalecana ścieżka to archiwum; ukrycie/usunięcie z zachowaniem znaczników nie zmienia historii. Stare ID nie mogą zostać ponownie użyte dla innej kasy lub grupy.
8. Zalecane są dwie nowe sekcje backupu: `wspolneKasy` i `rozliczenia`. Pozwala to pozostawić dotychczasową sekcję `finanse` bez zmiany semantyki. Starszy backup bez nowej sekcji nie czyści nowych tabel. Zdefiniować zgodność wersji schematu; nie podnosić całego formatu backupu bez potrzeby.
9. Nie otwierać ani nie przenosić produkcyjnych baz. Test migracji obejmuje istniejące lokalne dane Finansów i profile; dane testowe są syntetyczne lub zanonimizowane. Realne przywracanie nadal wymaga istniejącej kopii ochronnej i potwierdzenia.
10. Backend wdraża się przed klientem wysyłającym nowe tabele. Starszy backend nie może powodować utraty ani usuwania nieprzyjętych zmian z kolejki. Starszy klient z nieznaną tabelą wymaga jawnej strategii zgodności przed release; nie wolno zakładać, że automatycznie ją pominie. Nie wykonywać deployu w ramach prac implementacyjnych bez osobnego zlecenia.

## 6. Ekrany

- `/finanse` zachowuje dotychczasowe funkcje i otrzymuje skróty „Wspólne kasy” oraz „Rozliczenia”. Bez nowego modułu głównego w menu.
- `/finanse/kasy` i `/finanse/kasy/:kasaId`: lista, tworzenie, duże saldo, wpływy/wydatki, historia, ustawienia; po wdrożeniu kaucji także skrót „Zwrot kaucji”.
- `/finanse/rozliczenia` i `/finanse/rozliczenia/:rozliczenieId`: lista i archiwum, wydatki, bilans, osoby, historia; wyróżnione komunikaty „Julka → Kacper: 11,00 zł” oraz „Zarejestruj zwrot”.
- Telefon: jedna kolumna, czytelne saldo i duże przyciski. Szeroki ekran: podsumowanie obok historii. Układ zależy od szerokości, nie od rozpoznawania Raspberry Pi.
- Luxury i pozostałe motywy korzystają ze wspólnych tokenów. Ostrzeżenia i kierunki przepływu oznaczać także tekstem, nie wyłącznie kolorem.
- Sprawdzić back/forward, bezpośrednie wejście i odświeżenie podstrony, systemowe Wstecz Androida oraz dopuszczalne odnośniki. Dopasowanie dynamicznych ścieżek musi walidować identyfikatory, bez dopuszczania dowolnego prefiksu.

## 7. Prompty implementacyjne

Uruchamiać kolejno. Każdy prompt dotyczy jednego etapu i kończy się działającym, sprawdzonym zakresem oraz krótkim raportem. Nie należy zlecać wszystkich etapów naraz.

### Wspólny wstęp do każdego promptu

> Pracujesz w repozytorium Ogarniacz. Stosuj AGENTS.md i odpowiednie dokumenty zasad. Przeczytaj `docs/FINANSE_KASY_I_ROZLICZENIA.md`, a następnie tylko kod potrzebny dla wskazanego etapu. Bez internetu, podagentów, pełnego audytu i pobocznych refaktorów. Nowe nazwy i komentarze po polsku; zachowaj istniejące kontrakty metadanych. Najpierw sprawdź aktualny stan repo i ustalenia poprzedniego etapu. Wykonaj wskazany etap do końca, bez przechodzenia do kolejnych. Nie dodawaj integracji, usług, OCR, AI ani zależności. Nie wykonuj deployu, release ani zmian na danych produkcyjnych. Testuj zmieniony obszar i wymagane granice danych; przy zmianie modelu aktualizuj dokumentację migracji. Na końcu podaj zmienione zachowanie, wyniki testów i rzeczywiste ograniczenia.

### Etap 1 — dane, obliczenia i bezpieczny zapis

> Wprowadź pięć nowych typów i tabel z rozdziału 3 oraz czyste obliczenia z rozdziału 4. Zachowaj stare pola `kwota` i działanie dotychczasowych Finansów. Dodaj kolejną migrację Dexie bez przepisywania dawnych kwot. Wprowadź serwisy domenowe sprawdzające niezmienniki, rewizję, idempotencję, historię wersji, soft-delete/przywrócenie i atomowość z istniejącym outboxem. Nie dodawaj jeszcze ekranów.
>
> Obliczaj podziały deterministycznie i dokładnie, oddzielaj finansowanie od kosztu, a zwroty od wydatków. Rozszerz lokalną historię oraz backup o nowe sekcje i ścisłe schematy, zachowując wcześniejsze formaty. Odczyt, zapis i historia nowych danych mają od początku respektować dostęp tylko właściciela lub tryb lokalny bez konta. Nie dodawaj nieużywanych mechanizmów dla późniejszych rozszerzeń.
>
> Testy: przykłady kwot i bilansów z rozdziału 8, stara baza i profile po migracji, podwójny zapis, nieaktualny formularz, rollback przy błędzie outboxu, historia po zmianie/usunięciu/przywróceniu, granice bezpiecznych liczb oraz backup nowy i stary bez czyszczenia nowych tabel. Dostosuj istniejące testy migracji i backupu; nie podmieniaj danych użytkownika.

### Etap 2 — synchronizacja i prywatność nowych tabel

> Rozszerz obecną synchronizację o pięć nowych tabel. Zachowaj obecne sesje, kontekst właściciela, `zmianaId`, kolejkę, znaczniki usunięcia i obsługę konfliktów. Wprowadź walidację danych finansowych na serwerze i przy odbiorze; rodzic w tej samej paczce może wystąpić po dziecku. Nie twórz nowego API ani równoległego silnika synchronizacji.
>
> Egzekwuj jawną regułę V1: nowe dane dostępne tylko właścicielowi; ogólny grant `finanse` nie uprawnia Edytora do ich odczytu ani zapisu. Rozstrzygaj finansowy konflikt jako kompletną wersję wraz z historią, zachowując odrzucony wariant jako historię rozstrzygnięcia. Nie dopuszczaj ręcznego scalenia pól naruszającego sumy. Rozwiąż zgodność starego i nowego klienta/backendu minimalnym rozszerzeniem istniejącego kontraktu; opisz kolejność aktualizacji i zachowanie nieznanych tabel. Nie uruchamiaj wdrożenia.
>
> Wspólną walidację udostępnij bez importowania zależności przeglądarki do serwera. Uwzględnij obecny `rootDir` serwera; uruchom sprawdzenie typów klienta i kompilację serwera, zachowując ścieżkę startową `dist-server/main.js`.
>
> Testy: dwie lokalne instalacje tego samego właściciela, różni właściciele z takimi samymi ID rekordów, Edytor z grantem Finansów, ponowienie po utracie odpowiedzi, równoległa edycja, historia po kilku pominiętych edycjach, usunięcie offline, przerwana paczka, zmiana profilu w trakcie operacji, nieobsługiwana wersja backendu/klienta i zachowanie oczekujących zmian. Sprawdź też regresję synchronizacji starych Finansów.

### Etap 3 — wspólne kasy w interfejsie

> Dodaj listę i szczegóły kas w podstronach Finansów, skrót z obecnego widoku i formularze tworzenia, wpływu, wydatku oraz korekty. Użyj serwisów z etapu 1, istniejących komponentów i reaktywnego odczytu. Saldo wyliczaj z operacji, nie utrwalaj jego kopii. Walutę blokuj po pierwszej operacji. Pozwól na ujemne saldo z widoczną kwotą niedoboru. Udostępnij historię, edycję operacji, usunięcie/przywrócenie i archiwizację z zachowaniem zasad danych. Błędy zapisu nie mogą zamykać formularza ani powodować ponownego nadania ID.
>
> Zachowaj stare Finanse. Dodaj poprawne trasy i obsługę odnośników platformowych tylko w potrzebnym zakresie. Sprawdź układ telefonu i szerokiego ekranu oraz Luxury. Testy UI: pełny przepływ kasy, ostrzeżenie o niedoborze, walidacja i błąd zapisu, podwójne zatwierdzenie, archiwum, powrót do danych po odświeżeniu oraz odmowa dostępu Edytorowi.

### Etap 4 — zwroty kaucji

> Dodaj do kasy tryb wpływu „Zwrot kaucji”. Liczba sztuk musi być nieujemną liczbą całkowitą; stawki dodatnimi kwotami w najmniejszych jednostkach waluty. Zaproponuj edytowalne stawki początkowe 0,50/0,50/1,00 zł dla przykładu PLN; są ustawieniem użytkownika, nie zewnętrznym źródłem stawek. Nie przenoś ich automatycznie na inną walutę. Pokaż sumy pozycji i razem. Pozwól zapisać inną rzeczywiście otrzymaną sumę z uzasadnieniem, zachowując wszystkie wartości historyczne. Zapis tworzy dokładnie jedną operację wpływu.
>
> Zapamiętaj ostatnie źródło zwrotu i stawki w zakresie konkretnej kasy. Bez OCR i bez aparatu w tym etapie. Testy: 20 plastikowych, 15 puszek i 3 szklane według przykładu dają 2050 groszy; ręczna korekta, brak opakowań, niedozwolone wartości, zmiana stawek bez zmiany historii, ponowienie zapisu i izolacja ustawień profili.

### Etap 5 — rozliczenia, osoby, wydatki i bilans

> Dodaj listę rozliczeń oraz ekran grupy, tworzenie, uczestników bez kont i formularz wydatku z wieloma finansującymi oraz czterema metodami podziału. Umożliw wykluczenie osób z kosztu. Zachowuj stałe ID uczestników; dodanie lub zmiana osoby nie przelicza historycznych wydatków. Pokazuj łączne wydatki, faktycznie wyłożone kwoty, przypisane koszty i proste propozycje „kto → komu → ile”. Korzystaj z gotowego silnika i serwisów, bez własnych obliczeń pieniężnych w JSX. Nie zapisuj wydatku grupowego w osobistym rejestrze `wydatki`.
>
> Testy UI i integracyjne: przykłady 40 zł, 60 zł z finansowaniem 40/20 i 80 zł z kosztem 50/30, cztery osoby z przykładu 800 zł, trzy osoby przy jednym groszu, dwa identyczne imiona, zmiana nazwy, wyłączenie uczestnika, edycja ceny/podziału oraz odmowa usunięcia osoby użytej w historii. Sprawdź bezpośrednie wejście, Wstecz i Luxury.

### Etap 6 — częściowe zwroty, zakończenie i archiwum

> Dodaj zapis faktycznego zwrotu między uczestnikami, w tym częściowego. Formularz może rozpoczynać się od propozycji bilansu, ale zapisuje osobny `ZwrotRozliczenia`. Pokaż, ile oddano i ile pozostało; nadpłatę oznacz i przelicz jako przeciwną należność. Zwrot nie zwiększa sumy kosztów. Edycja/usunięcie wcześniejszego wydatku musi prawidłowo uwzględnić istniejące zwroty. Dodaj etapy aktywne/oczekuje, wyliczany stan rozliczone i osobną archiwizację z odwracalnym otwarciem. Późny zapis offline nie może pozostawić fałszywego stanu rozliczonego.
>
> Testy: dług 100 zł → zwrot 60 zł → pozostało 40 zł → zwrot 40 zł → zero; zwrot w złym kierunku, nadpłata, dwie prawdziwe wpłaty offline, powtórzenie tego samego ID, usunięcie zwrotu, zmiana wydatku po zwrocie, blokada zwykłej edycji archiwum i późna synchronizacja. Potwierdź niezmienioną sumę wydatków przy każdym zwrocie.

### Etap 7 — składki i cele kas, po ukończeniu V1

> Rozszerz kasy o opcjonalnych uczestników ze stałymi ID, cel finansowy i deklarowaną/oczekiwaną składkę. Deklaracja nie tworzy operacji i nie zwiększa salda. Rzeczywista składka jest wpływem przypisanym do uczestnika; jej ponowiony zapis pozostaje idempotentny. Oddziel „zebrano ze składek” od aktualnego salda po wydatkach i od sumy deklaracji. Zachowaj zwykłą kasę bez uczestników. Nowe opcjonalne dane objąć walidacją, historią, synchronizacją i backupem bez resetu starszych rekordów.
>
> Testy: zadeklarowana składka bez wpływu na saldo, częściowa i pełna wpłata, wpłata bez deklaracji, zmiana oczekiwanej kwoty, cel zero/brak celu, przykład 250/300 = 83,3%, wydatek po zbiórce bez zmiany historycznej sumy zebranych składek oraz izolacja właścicieli.

### Etap 8 — paragony i zdjęcia, osobne rozszerzenie

> Dodaj wspólną obsługę załączników operacji kas i wydatków grupowych na bazie istniejącego `Dokument`, transportu Blobów i usług platformowych. Operacja wskazuje `zalacznikiIds`; załącznik ma jednoznaczne powiązanie z typem i ID operacji. Nie twórz drugiego magazynu plików. Obsłuż JPG, PNG, WebP i PDF, wybór pliku oraz wykonanie zdjęcia na Androidzie istniejącą zależnością aparatu. Nie uruchamiaj OCR.
>
> Zanim zapiszesz pierwszy paragon, zapewnij trwałą ochronę finansowego dokumentu tylko dla właściciela także w ogólnym module Dokumenty, synchronizacji i historii. Grant `dokumenty` ani `finanse` nie może ujawnić paragonu. Nie wystarczy ukryć przycisk. Powiązanie musi pozostać chronione również po odłączeniu/usunięciu operacji. Rozszerz istniejącą klasyfikację w minimalnym potrzebnym zakresie, zachowując ochronę dokumentów zdrowotnych.
>
> Ustal jawne limity pliku i paczki, uwzględniając narzut Base64 oraz obecny limit serwera 25 MiB. Nie wysyłaj paczki, która blokuje całą kolejkę. Waliduj typ/rozmiar i poprawnie sprzątaj adresy podglądów; anulowanie aparatu nie tworzy pustego dokumentu. Backup musi obejmować relacje i pliki; częściowy backup/restore nie może po cichu zgubić paragonów ani ich klasyfikacji. Testy: plik i zdjęcie, anulowanie, błąd zapisu, synchronizacja między urządzeniami, przywrócenie, duży plik, brakujący dokument i próba odczytu przez Edytora. Aparat i Wstecz sprawdzić także na fizycznym Androidzie.

## 8. Minimalne przypadki odbioru obliczeń

| Przypadek | Oczekiwany wynik |
| --- | --- |
| Kasa: początek 0, wpływy 235 zł, wydatki 87,50 zł | Saldo 147,50 zł |
| Ta sama operacja kasy wysłana ponownie | Saldo i historia bez dodatkowego księgowania |
| Korekta -12,40 zł | Saldo niższe o 12,40 zł; uzasadnienie w historii |
| Zmiana/usunięcie/przywrócenie operacji | Saldo wynika z bieżących rekordów; poprzednie stany można odtworzyć |
| 20 × 50 gr + 15 × 50 gr + 3 × 100 gr | Jeden wpływ 2050 groszy |
| Pizza 40 zł, Kacper płaci 40 zł, podział równy | Julka → Kacper 20 zł |
| Zakupy 60 zł, finansowanie 40/20 zł, podział równy | Julka → Kacper 10 zł |
| Wydatek 80 zł, płaci Julka, koszt Kacper/Julka 50/30 zł | Kacper → Julka 50 zł |
| Wydatki 82 zł, finansowanie 52/30 zł, podział równy | Julka → Kacper 11 zł |
| 800 zł, cztery osoby, finansowanie 500/200/100/0 zł | Adam → Kacper 100 zł; Michał → Kacper 200 zł |
| 800 zł, wagi 2:2:2:1 | 22857/22857/22857/11429 groszy; suma 80000 |
| 1 grosz / 3 osoby, zmiana kolejności formularza | Ten sam odbiorca reszty według stabilnego porządku ID |
| Niepoprawna suma finansowania/procentów/kwot | Brak zapisu; czytelny błąd |
| Zwrot 60 zł przy długu 100 zł | Pozostaje 40 zł; suma kosztów bez zmian |
| Zwrot 120 zł przy długu 100 zł | Ostrzeżenie; po świadomym zapisie przeciwna należność 20 zł |
| Rozliczenie po wszystkich zwrotach | Wszystkie bilanse równe zero; brak propozycji przelewów |

## 9. Weryfikacja stanu zastanego

Przygotowanie tego dokumentu nie zmieniło kodu aplikacji, schematu bazy ani danych użytkownika. Nie wykonano wdrożenia, budowania APK, pomiarów na Raspberry Pi ani testu interfejsu na telefonie.

Uruchomiono istniejące testy:

```text
npm test -- src/services/FinanseService.test.ts src/services/HistoriaZmianService.test.ts src/services/SyncEngine.test.ts src/data/ProfileLokalne.test.ts src/data/RepozytoriumZdalneHttp.test.ts src/services/RejestrPolSystemowychFinansow.test.ts
Wynik: 6 plików, 57 testów — wszystkie przeszły.

node --experimental-strip-types --test --test-name-pattern='sync|Administrator będący Właścicielem A|Edytor nie przekracza grantu' server/serwer.test.ts server/konta.test.ts
Wynik: 8 wybranych testów — wszystkie przeszły.
```

Pierwsza próba testów klienta zatrzymała się na uprawnieniach do plików tymczasowych; powtórzenie z katalogiem tymczasowym pod `node_modules/.cache/przeglad-finansow` przeszło. Testy serwera wymagały uruchomienia poza ograniczeniem połączeń localhost w piaskownicy. Testy używały syntetycznych danych, bez kontaktu z produkcyjnym serwerem i bez internetu.

Te wyniki potwierdzają działanie sprawdzonych istniejących mechanizmów, nie gotowość jeszcze niezaimplementowanych kas i rozliczeń. Pierwszym zadaniem implementacyjnym jest etap 1; użyteczne ekrany kas i kaucji powstaną po etapach 1–4, a komplet podstawowej wersji po etapie 6.
