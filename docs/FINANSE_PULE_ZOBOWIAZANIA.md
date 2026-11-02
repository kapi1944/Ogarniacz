# Finanse — Pule, Rozliczenia i Zobowiązania (FZ-1)

Data weryfikacji: 02.11.2026. Status: kontrakt do zatwierdzenia, bez implementacji FZ-2–FZ-10.
Wymagania tego dokumentu opisują projekt przyszłych etapów, chyba że wyraźnie oznaczono je jako stan potwierdzony.

## 1. Cel funkcjonalny i granice

Trzy współpracujące obszary Finansów: **Pule**, istniejące **Wspólne rozliczenia**, **Zobowiązania**. Pula finansowa zbiera rzeczywiste wpłaty i wydatki na dowolny cel, bez obowiązkowych uczestników. Pula zakupowa dodaje zakupy, osobne partie produktów, sprzedaż, odroczone płatności, dokumenty i rentowność. Zobowiązania obejmują należności, własne długi i ich operacje. Osoba może mieć wiele niezależnych zobowiązań w obu kierunkach.

Local-first, jedna waluta na Pulę, domyślnie PLN; wyłącznie Właściciel lub dotychczasowy lokalny tryb bez konta. Uczestnik, kupujący i osoba zadłużona nie otrzymują kont ani uprawnień. Nie ma automatycznej kompensaty ani scalania partii/długów. Rozliczenia zachowują silnik F7 oraz obecne trasy i zachowanie. Brak automatycznego księgowania nowych zdarzeń w osobistych `wydatki`, budżetach, ratach lub rachunkach.

FZ-1 zmienia wyłącznie ten dokument. Bez migracji, otwierania baz produkcyjnych, deployu, publikacji, zmian uwierzytelniania, OCR, nowych zależności i automatyzacji zewnętrznych. Późniejsze etapy wymagają osobnych poleceń. Kontrakt nie jest zgodą na wdrożenie backendu ani aktualizację urządzeń.

## 2. Potwierdzony stan repozytorium

Po `git fetch origin` lokalny `main` i `origin/main`: **`bb7760fd0f2c236f78fe75bbfe95af27cc869147`**. Nie pojawił się nowszy commit niż wskazany przez użytkownika. [CI 41508367517](https://github.com/kapi1944/Ogarniacz/actions/runs/41508367517) dla dokładnie tego SHA: `completed / success`, potwierdzone przez `gh run view` i `gh run list`. Nie jest to dowód stanu wdrożenia Raspberry Pi ani telefonu.

Status przed zmianą: śledzone pliki i indeks czyste; nieśledzony `Ogarniacz_Broszura_Luxury_Dark_V2.pdf` pozostawiony bez odczytu i zmian. Dokument przygotowano w odizolowanym, czystym worktree z aktualnego `origin/main`. Commit obejmuje wyłącznie dokument FZ-1.

Aktualny schemat [BazaOgarniacza.ts](../src/data/BazaOgarniacza.ts): **Dexie 20**, baza `ogarniacz-v1` lub baza aktywnego profilu. Pięć tabel F7: `wspolneKasy`, `operacjeKas`, `rozliczenia`, `wydatkiGrupowe`, `zwrotyRozliczen`. Starsze Finanse mają m.in. `wydatki`, `budzety`, `kontaFinansowe`, `rachunki`, `platnosciRachunkow`, `platnosciStale`, `planyRat`, `raty`. Backup: **format 3**, istniejące sekcje `finanse`, `wspolneKasy`, `rozliczenia`, `dokumenty`, `historia`; eksport użytkownika jest szyfrowany istniejącym mechanizmem.

| Etap | Stan potwierdzony w aktualnym kodzie |
| --- | --- |
| F7.1 | Czyste obliczenia groszowe, cztery podziały, finansujący/koszt/zwroty, deterministyczne reszty i propozycje przelewów. |
| F7.2 / F7.2A | Trwałe modele i pięć tabel dodanych w Dexie 20; backup i blokada zwykłego CRUD. Nie utożsamiać historycznej numeracji etapów z osobną dodatkową implementacją F7.2. |
| F7.3 | Serwisy kas i rozliczeń, transakcje, rewizje, historia wersji, stabilne polecenia zapisu, soft-delete/przywracanie, archiwizacja. |
| F7.4 | Chroniona synchronizacja pięciu tabel, negocjacja, pełny obraz F7, walidacja relacji/historii, blokada bilansów przy niekompletności/konflikcie, Właściciel. |
| F7.5–F7.6 | Brak ekranów kas i formularza kaucji. Model `kaucja` oraz serwisy kas istnieją; to nie oznacza gotowej funkcji UI. |
| F7.7 | Lista i szczegóły rozliczeń, osoby bez kont, wydatki, podziały i propozycje zwrotów pod `/finanse/rozliczenia`. |
| F7.8 | Formularz rzeczywistych zwrotów, częściowe spłaty, ostrzeżenie nadpłaty, historia usunięcia/przywrócenia, status wyliczany, archiwum i wznowienie. |
| Późniejsze zmiany | Ostatnie zmiany tych serwisów/UI: `5720bfa` (F7.8), `ab2bb6c` (F7.7), `fbfab90` (F7.4). `754530f` poprawia obsługę błędów synchronizacji Androida; `bb7760f` dodaje podsumowanie po pracy do wspólnego mechanizmu przypomnień i Echo. Nie implementują Pul zakupowych ani samodzielnych zobowiązań. |

Weryfikacja jest celowana. Czytano obowiązkowe [AGENTS.md](../AGENTS.md), [INSTRUCTIONS.md](INSTRUCTIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA.md](DATA.md), [TESTING.md](TESTING.md), [FINANSE_KASY_I_ROZLICZENIA.md](FINANSE_KASY_I_ROZLICZENIA.md), [POLA_FORMULARZY.md](POLA_FORMULARZY.md), odpowiednie skille projektu oraz potrzebne zasady z [SECURITY.md](SECURITY.md). Historyczny dokument F7 zawiera też starsze opisy (np. Dexie 19 i niegotowe ekrany); powyższy stan wynika z kodu, nie z tych opisów.

Zakres źródeł: `WidokFinansow`, `WidokRozliczen`, formularze rozliczeń i zwrotów, `FinanseService`, `RozliczeniaService`, `WspolneKasyService`, `ObliczeniaFinansowWspolnych`, `ZapisFinansowWspolnych`, `server/wspolne/{modeleFinansowWspolnych,ZapisFinansowy,WalidacjaFinansowa,SynchronizacjaFinansow}`, `typy`, `kwoty`, `BazaOgarniacza`, `Repozytorium`, `useRepozytorium`, `HistoriaZmianService`, `ProfileLokalne`, `KontekstProfilu`, `KolejkaSynchronizacji`, `SyncEngine`, `RepozytoriumZdalneHttp`, `BackupService`, `UprawnieniaService`, `server/{serwer,synchronizacja,konta}`, `PrzypomnieniaService`, `SilnikPrzypomnien`, `PodsumowaniePoPracyService`, narzędzia/agenta Echo, `NotificationService`, `HarmonogramPrzypomnienAndroid`, `WidokiOrganizacji`, `WidokiCzasu`, dostawcy pulpitu, `WidokiWiedzy`, typ `Dokument`, użycie aparatu w `LekiOcrService`, wspólne pola, `Interfejs`, tokeny stylów, routing i workflow CI. To lista przeanalizowanych granic, nie deklaracja pełnego audytu tych modułów.

## 3. A — mechanizmy gotowe do ponownego użycia

- **Kasa i gotówka:** `WspolnaKasa` oraz `OperacjaKasy` już reprezentują pojemnik środków i faktyczne wpływy/wydatki/korekty. Pula nie potrzebuje drugiej tabeli sald ani drugiego silnika kas. `WspolneKasyService` zachowuje walutę po pierwszej operacji, także usuniętej; saldo jest projekcją.
- **Pieniądze:** `kwotaNaGrosze`, `groszeNaKwote`, `normalizujKwote`, `WALUTY`; obliczenia z `BigInt`, kontrola bezpiecznego zakresu. Nowe encje nie używają historycznego `Wydatek.kwota` jako modelu pieniędzy.
- **Bezpieczny zapis F7:** `{ idZapisu, oczekiwanaRewizja }`, kanoniczna treść polecenia, `rewizja`, `historiaWersji`, kontrola profilu, transakcja z historią i istniejącą kolejką. Powtórzenie identycznego polecenia nie odtwarza starszego stanu.
- **Rozliczenia:** uczestnicy, cztery podziały, finansowanie i rzeczywiste zwroty pozostają istniejącą domeną; nie eksportować propozycji przelewów jako długów.
- **Infrastruktura:** aktywna baza profilu, sygnał anulowania, `useLiveQuery`, istniejące repozytoria, soft-delete, transport Blobów, szyfrowany backup, `/api/sync/changes`, konflikty, sesja i CSRF.
- **Przypomnienia:** encja `Przypomnienie`, centrum, odroczenie, kanał Android/PWA, uzgadnianie przy zmianach danych i wznowieniu. Nowe podsumowanie po pracy pokazuje wzorzec stabilnego ID, transakcyjnego uzgadniania i osobnych danych dostarczenia; nie należy kopiować jego reguł godzinowych do długów.
- **UI:** `PoleKwoty`, `PoleLiczbowe`, `PoleDaty`, `PoleCzasu`, `Modal`, `Karta`, nagłówki, istniejąca obsługa Wstecz i tokeny Classic/Flat/Luxury.

## 4. B–E — rozszerzenia, granice i rzeczywiste braki

| Klasa | Wniosek i wymagane działanie |
| --- | --- |
| B: rozszerzyć | Kasy o rodzaj Puli i opcjonalny cel; operacje o typowane źródło i identyfikator operacji; zapis F7 o atomowe grupy wielorekordowe; walidację klient/serwer, historię, backup, listy tabel i negocjację możliwości. |
| B: rozszerzyć | Dokumenty o trwałą ochronę finansową; przypomnienia o chronione powiązanie finansowe, regułę strefową i odwołanie do aktualnego zobowiązania; routing oraz dostawców Harmonogramu/Echo. |
| C: zachować | Algorytmy podziału i zwrotów F7, dotychczasowe kwoty osobistych Finansów, znaczenie `etap`/archiwum, profile, uwierzytelnianie, istniejące identyfikatory i metadane, ochronę zdrowia, zwykłe trasy. Brak migracji do Rejestru. |
| D: zaimplementować | Zakupy/partie, ewidencję sprzedaży i zwrotów towaru, zobowiązania obu kierunków, osoby finansowe, operacje spłat/umorzeń, rentowność, osobne UI, spięcie ze wspólnymi przypomnieniami i dokumentami. |
| E: konflikt | `ZapisFinansowWspolnych` i transakcja znają obecnie pięć tabel; nie można wywołać kilku niezależnych zapisów i nazwać tego atomową sprzedażą. Potrzebna lokalna transakcja całej operacji i analogiczna grupa w istniejącym sync. |
| E: konflikt | Samo dopisanie tabel do F7 ujawni rozszerzone rekordy starym klientom lub pozwoli im usunąć nieznane pola. Potrzebna osobna wersja możliwości FZ i filtrowanie także rekordów w starych tabelach, dokumentów oraz przypomnień. |
| E: konflikt | `sekcjePrywatnosci` zna obecnie tylko ochronę medyczną. Grant `dokumenty` może odczytać zwykły paragon. Finansowe przypomnienie może wyciec przez ogólne przypomnienia, wyszukiwanie, eksport lub narzędzia Echo, jeśli filtr obejmie tylko ekran Finansów. |
| E: konflikt | `PoleKwoty` celowo odrzuca więcej niż dwie cyfry ułamka. Cena jednostkowa wyliczona z 10,00 / 3 nie mieści się w takim polu; wymaga jawnego trybu ceny jednostkowej, bez zmiany walidacji zwykłych kwot. |
| E: konflikt | Dzisiejsza cykliczność przypomnień nie jest kompletnym kontraktem kalendarza w dowolnej strefie IANA; kopiowanie sufiksu czasu w `zakonczPrzypomnienie` nie wystarczy do obsługi DST. |
| E: konflikt | Harmonogram zbiera dostawców w `WidokiCzasu`; błąd dostawcy bywa zamieniany na pustą listę. Dla finansów taki brak nie może oznaczać „brak długów”. Wymagany jawny stan niedostępności danych. |

## 5. Docelowa architektura

`widok → hook → publiczny serwis domenowy → istniejąca transakcja Dexie / repozytoria → historia + outbox`. Odczyt: jeden spójny obraz rekordów, walidacja kompletności, czyste obliczenia, projekcja dla UI. Zmiana danych unieważnia projekcję; nie inkrementuje utrwalanego salda lub stanu magazynu.

**Pule:** logiczny `Pula` rozszerza istniejącą `WspolnaKasa`; przechowywanie nadal w `wspolneKasy`. Zwykłe operacje Puli są `OperacjaKasy` w `operacjeKas`. Rozszerzamy `WspolneKasyService` o obsługę Puli finansowej; `PuleService` odpowiada tylko za zakupy/sprzedaż i ich powiązania. `ObliczeniaPul` zawiera czyste projekcje bez dostępu do Dexie. Nazwy plików są kontraktem odpowiedzialności, nie poleceniem tworzenia pustych plików.

**Rozliczenia:** `RozliczeniaService`, dotychczasowe tabele i silnik bez przebudowy. Brak automatycznego przenoszenia bilansu grupy do Zobowiązań. Ewentualna przyszła ręczna konwersja jest poza FZ V1.

**Zobowiązania:** `ZobowiazaniaService` zapisuje osoby, zobowiązania i operacje. `SplataZobowiazania` jest rodzajem operacji zobowiązania. Dla długu pochodzącego ze sprzedaży ta sama operacja spłaty jest jedynym faktem wpływu gotówki do Puli. `OperacjaPuli` to projekcja sumy dwóch rozłącznych zbiorów: `operacjeKas` oraz gotówkowych `operacjeZobowiazan` powiązanych z Pulą. Nie zapisujemy drugiego wpływu w `operacjeKas` dla tej samej spłaty.

To celowo ograniczone połączenie dwóch domen, bez uniwersalnej księgi dla aplikacji. Wspólny raport składa gotowe projekcje; nie miesza należności z gotówką i nie sumuje automatycznie osobistych Finansów z Pulami.

Reguły czyste i schematy przechowujemy przy istniejących kontraktach `server/wspolne`, bez Dexie/React/DOM. Klient zachowuje publiczne re-eksporty. Serwer nadal buduje `dist-server/main.js` według `tsconfig.server.json`.

## 6. Minimalny model danych

### 6.1. Metadane i typy wspólne

Każdy rekord tabeli: `id`, `createdAt`, `updatedAt`, opcjonalne `usunietoAt`, a dla nowych zapisów finansowych wymagane `rewizja >= 1` i `historiaWersji` według rozszerzonego kontraktu F7. Każda osadzona partia/pozycja/korekta także ma stabilne UUID i te same metadane; jej rewizją jest rewizja rodzica, a historia zachowuje pełne stany elementu. Nie tworzymy osobnej historii osadzonych elementów. Usunięte ID pozostają zarezerwowane.

Kwoty `*Grosze`: sprawdzony bezpieczny całkowity `number`, niezależnie od waluty o dwóch miejscach z `WALUTY`. Iloczyny, sumy i ułamki obliczamy wewnętrznie przez `BigInt`; `BigInt` nie trafia do JSON. Daty zdarzeń: lokalne `YYYY-MM-DD`; techniczne chwile: ISO UTC; termin zobowiązania jest datą, reguła przypomnienia przechowuje osobno strefę IANA i lokalne HH:mm. Własność wynika z istniejącej bazy profilu i sesji, bez nowego `ownerId` będącego źródłem uprawnień.

Polecenie wielorekordowe: `idOperacjiZrodlowej` (UUID nadane raz), `idZapisu` (UUID polecenia), `oczekiwaneRewizje: [{ tabela, id, rewizja }]`, kanoniczna treść. Potomne rekordy otrzymują UUID raz w szkicu polecenia; ich ID i treść nie zmieniają się przy ponowieniu. Para `(idOperacjiZrodlowej, rolaZapisu)` jest unikalna w obrazie domeny. Rewizja źródła zawiera `skladOperacji: [{ tabela, id }]`; szczegóły transportu w §14. Źródłowa sprzedaż, zakup lub operacja zobowiązania jest dowodem wykonania polecenia, bez osobnej tabeli pokwitowań.

### 6.2. Tabele i osadzenie encji

**Pięć nowych tabel**, dwie istniejące rozszerzone; brak nowych tabel `pule`, `partie`, `pozycjeSprzedazy`, `splaty` lub `salda`.

| Encja logiczna / tabela | Pola biznesowe i zasady |
| --- | --- |
| `Pula` / istniejąca `wspolneKasy` | Dziedziczy nazwę, opis, ikonę, kolor, walutę, status/archiwizację. Nowe `pula: { wersja: 1, rodzaj: finansowa / zakupowa, celGrosze? }`. Nowa Pula zaczyna od `saldoPoczatkoweGrosze = 0`; wcześniejsze środki zapisuje jako jawny wpływ. Rodzaj niezmienny po pierwszej operacji domenowej; waluta po pierwszym fakcie finansowym, także później usuniętym/anulowanym. Cel dodatni lub brak; brak uczestników jest poprawny. |
| `OperacjaPuli` / istniejąca `operacjeKas` oraz projekcja spłat | `OperacjaKasy` zachowuje `kasaId`, typ, dodatnią kwotę wpływu/wydatku lub podpisaną korektę, walutę, datę, opis. Nowe `powiazaniePuli?: { wersja: 1, idOperacjiZrodlowej, rolaZapisu, rodzaj: wplata / zakup / koszt / zaplataSprzedazy / zwrotKlientowi / zwrotDostawcy / korekta, zakupId?, sprzedazId?, korektaId?, osobaId? }`. Korekta wymaga uzasadnienia i określenia skutku; samo `typ=korekta` nie oznacza zakupu, sprzedaży ani umorzenia. Spłata jest wirtualnym wierszem z `operacjeZobowiazan`, bez zapisu kopii. |
| `ZakupPuli` / nowe `zakupyPul` | `pulaId`, `nazwa`, `dataZakupu`, `waluta`, `opis`, `partie[]`, `kosztyDodatkowe[]`, `korekty[]`, `dokumentyIds[]`, `idOperacjiZrodlowej`. Suma zakupu wynika z partii i kosztów, nie z osobnego salda. V1 rejestruje rzeczywisty opłacony zakup; zakup na kredyt od dostawcy wymaga jawnego zobowiązania w przeciwnym kierunku i pozostaje ręczną operacją, bez udawania zapłaty w Puli. |
| `PartiaProduktu` / `zakupyPul.partie[]` | `id`, `produktId` (stabilny klucz grupowania w Puli), `nazwaProduktu` (historyczna kopia), `liczbaSztuk > 0` całkowita, `kosztTowaruGrosze >= 0`, opcjonalny `dokumentyIds[]`. Ten sam produkt kupiony ponownie dostaje nowe ID partii, może zachować `produktId`. `zakupId` i `pulaId` wynikają z rodzica. Koszt jednostkowy jest dokładnym ułamkiem koszt/liczba, nie zaokrąglonym źródłem kosztu. |
| `SprzedazPuli` / nowe `sprzedazePul` | `pulaId`, `waluta`, `dataSprzedazy`, `kupujacyId?`, `pozycje[]`, `korekty[]`, `opis`, `idOperacjiZrodlowej`, `operacjaPierwszejZaplatyId?`, `zobowiazanieId?`. Otrzymane i pozostałe kwoty są projekcją. Należna cena to suma pozycji i jawnych korekt ceny, nie suma wpłat. |
| `PozycjaSprzedazy` / `sprzedazePul.pozycje[]` | `id`, `zakupId`, `partiaId`, `liczbaSztuk > 0`, `cenaCalkowitaGrosze >= 0`, `zrodloCeny: jednostkowa / calkowita`, `cenaJednostkowa: { licznikGroszy, mianownik }` jako nieujemne bezpieczne całkowite liczby, mianownik dodatni. Iloczyn ułamka i liczby sztuk musi równać się całkowitej cenie w groszach. Nie przechowuje niezależnego stanu magazynu. |
| `OsobaFinansowa` / nowe `osobyFinansowe` | `nazwa`, `wyroznik?`, `kontaktId?`, `nieaktywna?`, metadane/historia. Osoba ma własne UUID, bez wymaganego konta i kontaktu; identyczne nazwy nie są tożsamością. Istniejące `kontakty` są opcjonalnym odnośnikiem; nie ujawniamy długów przez grant kontaktów. Dezaktywacja zachowuje stare spłaty i identyfikację. |
| `Zobowiazanie` / nowe `zobowiazania` | `osobaId`, `kierunek: do_mnie / ode_mnie`, `nazwa`, `kwotaPoczatkowaGrosze > 0`, `waluta`, `dataPowstania`, `termin?`, `opis`, `zrodlo?: { rodzaj: sprzedaz_puli / pozyczka / zakup_dla_osoby / reczne, id?, pulaId? }`, `przypomnienia: { aktywne, przedTerminDni[], wDniuTerminu, poTerminieCoDni, godzina, strefaCzasowa, bezTerminuRegula? }`, `zarchiwizowanoAt?`, `idOperacjiZrodlowej`. Brak pola bieżącego salda i utrwalanego statusu spłaty. Wymagalność i archiwum są niezależne od spłacenia. |
| `SplataZobowiazania` i inne operacje / nowe `operacjeZobowiazan` | `zobowiazanieId`, `rodzaj: splata / zwrot_nadplaty / umorzenie / korekta_kwoty / storno`, `kwotaGrosze`, `waluta`, `dataOperacji`, `opis`, `idOperacjiZrodlowej`, `rolaZapisu`, `operacjaKorygowanaId?`, `pulaId?`, `sprzedazId?`, `korektaId?`. `splata`/`zwrot_nadplaty`/`umorzenie` mają dodatnią kwotę; `korekta_kwoty` podpisaną niezerową różnicę; storno wskazuje dokładnie jeden fakt i odwraca jego skutki. Źródło Puli i kierunek są sprawdzane z zobowiązaniem, nie dowolnie nadawane przez formularz. |

Osobna tabela osób jest potrzebna do salda wzajemnego jednej identyfikowalnej osoby i wielu długów; nie wystarczy dopasowanie nazwy. Brak osobnej tabeli produktów jest świadomy: katalog Puli to projekcja partii po `produktId`; nazwy historyczne nie są nadpisywane. Zakup zawiera partie, a sprzedaż pozycje, bo waliduje się i koryguje je wspólnie; nie mają niezależnego cyklu synchronizacji. Limit V1: 100 partii na zakup, 100 pozycji na sprzedaż, 100 pozycji kosztów dodatkowych; większy nowy zakup/sprzedaż wymaga podziału przed zatwierdzeniem. Istniejących korekt i historii nie obcinamy; limit rozmiaru rekordu/transportu jest jawnym ograniczeniem (§14), a nie pozwoleniem na odrzucanie starszych faktów.

Indeksy nowych tabel: wspólne `id, updatedAt, usunietoAt`; `zakupyPul`: `pulaId, dataZakupu`; `sprzedazePul`: `pulaId, dataSprzedazy, kupujacyId`; `osobyFinansowe`: `nieaktywna`; `zobowiazania`: `osobaId, kierunek, termin, zarchiwizowanoAt`; `operacjeZobowiazan`: `zobowiazanieId, pulaId, dataOperacji, idOperacjiZrodlowej`. Zagnieżdżone partie odczytujemy po zakupie; w V1 nie potrzebują indeksu ani tabeli. Unikalność ról operacji i identyfikatorów osadzonych wymusza walidator obrazu, nie sam indeks.

### 6.3. Koszty dodatkowe i korekty jako dane

`kosztyDodatkowe[]`: metadane, `id`, `nazwa`, `kwotaGrosze >= 0`, `alokacja: [{ partiaId, kwotaGrosze }]`. Suma alokacji równa kosztowi. Domyślnie proporcja kosztu towaru, a przy zerowej sumie kosztów proporcja sztuk; największe reszty z remisem po ID partii. Można jawnie zatwierdzić własną alokację o tej samej sumie. Nie naliczamy kosztu ponownie jako niezależnego wydatku, jeśli zapłacono go razem z zakupem.

`korekty[]` zakupu/sprzedaży: metadane, `id`, `rodzaj: cena / zwrot_towaru / pomylka_partii / rozbieznosc / anulowanie`, `dataOperacji`, `uzasadnienie`, `pozycje[]` wskazujące oryginalną partię/pozycję, `zmianaSztuk` (podpisana liczba całkowita), `zmianaCenyGrosze`/`zmianaKosztuGrosze` (podpisane grosze), `powiazaneOperacjeIds[]`, `idOperacjiZrodlowej`. Nieistotne pola rodzaju są zabronione przez unię schematu. `pomylka_partii` wymaga pary równych, przeciwnych zmian ilości ze wskazaniem starej i właściwej partii. Zwrot towaru wskazuje liczbę sztuk wracających do sprzedaży oraz sztuk uszkodzonych; tylko pierwsza zwiększa dostępność. Rozbieżność magazynowa ma ilość, koszt i uzasadnienie, bez automatycznego przepływu gotówki.

## 7. Relacje i integralność

```text
wspolneKasy (Pula)
  ├─ operacjeKas (fakty gotówki poza spłatami)
  ├─ zakupyPul ─ partie[] ─ produktId
  ├─ sprzedazePul ─ pozycje[] ─ zakupId + partiaId
  │                 └─ zobowiazanieId → zobowiazania
  └─ operacjeZobowiazan (projekcja wpłat/zwrotów powiązanych z Pulą)
osobyFinansowe ← zobowiazania ← operacjeZobowiazan
dokumenty ← dokumentyIds zakupu / partii
przypomnienia → zobowiązanie lub zbiorcza reguła (projekcja)
```

Rodzic i dziecko muszą należeć do tego samego profilu, Puli i waluty. Źródła oraz ID rodziców po zapisaniu są nieprzenoszalne; błędne przypisanie wymaga jawnej korekty. Jedno zobowiązanie sprzedażowe na sprzedaż, jeśli pozostała kwota jest dodatnia; jedna sprzedaż może mieć wiele pozycji i wiele późniejszych spłat. Ręczne długi tej samej osoby pozostają oddzielne.

Nie ma kaskadowego fizycznego usuwania. Użyta partia, osoba, zakup lub sprzedaż zachowuje ID i historię. Soft-delete dotyczy pomyłki zapisu; usunięcie rodzica użytego w aktywnych relacjach jest blokowane. Preferowana archiwizacja. Fakty zrealizowane korygujemy/stornujemy, zamiast usuwać płatności przez usunięcie źródła. Przywrócenie sprawdza niezmienniki na nowo; może wymagać korekty zależnych zapisów.

## 8. Niezmienniki finansowe i magazynowe

1. Kwoty i ich sumy są dokładne do grosza; żadnego `Number(tekst) * 100`, `toFixed` jako naprawy danych ani sumowania ułamków binarnych. Bezpieczny zakres kontrolujemy także po sumowaniu/iloczynie.
2. Jedna Pula i jej operacje mają jedną walutę. Brak konwersji kursów. Osobę i raport podsumowujemy oddzielnie dla każdej waluty.
3. Zakup tego samego produktu nigdy nie zmienia wcześniejszej partii. Dostępność wynika z przyjętych sztuk, wydań, zwrotów, korekt i strat; nie ma ręcznego `aktualnyStan`.
4. Sprzedaż zmniejsza zapas przy zapisie niezależnie od momentu zapłaty. Należność nie zwiększa gotówki. Umorzenie nie jest wpłatą. Spłata nie zwiększa przychodu należnego ani sprzedanej ilości.
5. Jedna rzeczywista płatność ma dokładnie jeden kanoniczny rekord: pierwsza płatność sprzedaży w `operacjeKas`, późniejsza spłata w `operacjeZobowiazan`. Nie zapisujemy obu dla tego samego zdarzenia. ID płatności jest jedynym kluczem liczenia tego faktu, źródło i rola zapewniają idempotencję.
6. Dodatnia początkowa należność sprzedażowa = uzgodniona cena minus faktyczna pierwsza wpłata, z minimum zero. Pierwsza wpłata nie występuje ponownie jako spłata tej należności. Dla nadpłaty przed utworzeniem należności obowiązuje §9.
7. Częściowe spłaty, korekty ceny i zwroty nie nadpisują kwoty początkowej. Pozostała kwota wynika z operacji; dodatnia oznacza dług w pierwotnym kierunku, ujemna nadpłatę w przeciwnym. Nie powstaje automatyczny drugi dług.
8. Spłacenie, umorzenie, nadpłata, opóźnienie i archiwizacja są rozróżniane. Zero po umorzeniu nie oznacza „zapłacono całość”.
9. Identyczne powtórzenie polecenia niczego nie księguje. Inna treść przy tym samym ID, nieaktualna rewizja lub zmiana profilu przerywa całą operację. Różne rzeczywiste płatności offline są zachowane, także jeśli dają nadpłatę.
10. Niekompletność, konflikt albo ujemny zapas po scaleniu blokuje wiarygodny bilans/rentowność/status „spłacone”. UI pokazuje przyczynę i historię, bez zastępczego zera.

## 9. Operacje, sprzedaż i korekty

### 9.1. Jedno polecenie „Sprzedaż z odroczoną płatnością”

`zarejestrujSprzedazPuli(polecenie, dane)` przyjmuje ID sprzedaży, pozycji, pierwszej płatności i ewentualnego długu, oczekiwane rewizje Puli/zakupów, identyfikację kupującego, datę, ceny i otrzymaną kwotę. W jednej transakcji:

1. Sprawdza Właściciela, aktywny profil, kompletność i brak konfliktów, aktywną Pulę zakupową, tożsamość polecenia, wersje zakupów i dostępny zapas każdej partii, także przy kilku pozycjach tej samej partii.
2. Waliduje sumy i tworzy sprzedaż; to ten rekord jest źródłem rozchodu sztuk. Nie zapisuje drugiej kopii rozchodu w partii.
3. Jeśli wpłata dodatnia, zapisuje jeden wpływ `operacjeKas` z rolą `pierwsza_zaplata` i ID sprzedaży. Zero nie tworzy pustej płatności.
4. Jeśli pozostaje kwota, wymaga `kupujacyId` wskazującego trwałą osobę finansową i tworzy jedno `Zobowiazanie` `do_mnie` z kwotą pozostałą i źródłem sprzedaży. Sama nazwa w opisie nie spełnia identyfikacji.
5. Zapisuje pełne rewizje i lokalną historię oraz outbox wszystkich skutków z jednym `idOperacjiZrodlowej`. Po transakcji powiadamia istniejący mechanizm zmian. Projekcje są odczytywane ponownie, nie utrwalane.

Transakcja obejmuje dotknięte tabele, osoby, Pulę, zakupy, sprzedaże, operacje kas, zobowiązania, ich operacje, historię, stan/konflikty synchronizacji i outbox. Błąd któregokolwiek zapisu wycofuje całość. Aparat, odczyt pliku i inne operacje zewnętrzne muszą zakończyć się przed transakcją IndexedDB. Rewizja zakupu służy wykrywaniu zmiany kosztu; równoległe sprzedaże lokalne serializuje transakcja obejmująca tabelę sprzedaży.

`zarejestrujSplateZobowiazania` w jednej transakcji odczytuje zobowiązanie i jego operacje, sprawdza profil, kompletność, potwierdzenie nadpłaty, zapisuje jedną spłatę, historię i outbox. Dla źródła Puli wyliczana projekcja gotówki natychmiast obejmuje ten sam rekord. Nie wywołuje `dodajOperacjeKasy`. Podgląd formularza nie zastępuje ponownej walidacji w transakcji.

Ta sama zasada dotyczy zwrotu pieniędzy: jeśli istnieje powiązane zobowiązanie sprzedażowe, zwrot jest wyłącznie jego `zwrot_nadplaty` przy kierunku `do_mnie` albo `splata` przy `ode_mnie`. Nie tworzy równocześnie `operacjeKas.zwrotKlientowi`. Bez zobowiązania gotówkowy zwrot w pełni opłaconej sprzedaży może być jednym powiązanym wypływem w `operacjeKas`, jeżeli korekta ceny i zwrot są atomowe i nie pozostawiają kwoty do oddania. Przy odroczeniu zwrotu tworzy się zobowiązanie. Walidator odrzuca dwa źródła gotówki dla tej samej roli/operacji.

### 9.2. Dwukierunkowa cena bez utraty grosza

Źródłem uzgodnionej ceny pozycji jest `cenaCalkowitaGrosze`, a dokładnym objaśnieniem jednostkowym ułamek. Edycja ceny całkowitej wyznacza skrócony ułamek `cenaCalkowitaGrosze / liczbaSztuk`. Dla 3 sztuk za 10,00 PLN zapis to 1000 groszy i `1000/3` grosza za sztukę. UI pokazuje np. „≈ 3,333333 PLN/szt.; razem dokładnie 10,00 PLN” oraz dostępny dokładny iloraz, bez ponownego przeliczenia przy samym fokusie/blur.

Edycja jednostkowej ceny dziesiętnej parsuje tekst przez licznik i skalę dziesiętną (do 6 cyfr po przecinku w V1). Przemnożenie przez sztuki musi dać całkowite grosze. Jeśli nie daje, zapis blokuje polski komunikat: użytkownik zmienia cenę albo jawnie wybiera i zatwierdza cenę całkowitą do grosza. Dopiero taka decyzja zmienia źródło na `calkowita`. Nie zaokrąglamy niejawnie. 3 × 3,33 daje 9,99; 3 × 3,333333 nie jest dokładnie 10,00 i wymaga decyzji; 3 sztuki za 10,00 jest poprawne w trybie całkowitym.

Zmiana liczby sztuk w trybie jednostkowym zachowuje wpisaną dokładną cenę jednostkową i przelicza całość według tej samej walidacji; w trybie całkowitym zachowuje uzgodnioną całość i przelicza iloraz. UI wyraźnie pokazuje aktywny tryb. Zmiana trybu wymaga świadomej edycji, nie wynika z zaokrąglonego podglądu.

`PoleKwoty` obsługuje całość, wpłatę i zwykłe kwoty. Cena jednostkowa korzysta z małego jawnego rozszerzenia wspólnego pola o tryb ceny (tekst/ułamek, walidacja bez `number`), zachowującego domyślny kontrakt dwóch cyfr. Nie używamy `PoleLiczbowe` jako parsera pieniędzy. Liczba sztuk: `PoleLiczbowe`, min. 1, krok 1, dodatkowo bezpieczna liczba całkowita w serwisie.

### 9.3. Reguły korekt

| Sytuacja | Skutek wymagany |
| --- | --- |
| Kolejna częściowa spłata | Nowy kanoniczny fakt gotówki, zmniejszenie pozostałej należności. Cena i zapas bez zmian. |
| Nadpłata istniejącego długu | Ostrzeżenie i potwierdzenie; cała rzeczywista kwota pozostaje wpłatą, pozostała kwota staje się ujemna. Nadpłata nie jest przychodem należnym. Zwrot nadpłaty jest osobnym faktem wypływu, zmniejsza nadpłatę. |
| Pierwsza wpłata przekracza cenę sprzedaży | Wymagany kupujący i potwierdzenie. Jeden wpływ pełnej otrzymanej kwoty; bez należności zerowej. Dla nadwyżki atomowo powstaje zobowiązanie `ode_mnie` ze źródłem tej sprzedaży i jawnie oznaczoną rolą `nadplata_poczatkowa`. To alternatywa wobec należności `do_mnie`, nigdy oba początkowe długi. |
| Korekta ceny bez zwrotu towaru | Rewizja/korekta sprzedaży zmienia należny przychód. Jeśli istnieje dług `do_mnie`, atomowa `korekta_kwoty` tej samej różnicy zmienia jego saldo. Gotówka i zapas bez zmian. Jeśli sprzedaż była w pełni opłacona i bez długu, dodatnia dopłata tworzy dług `do_mnie`, a zwrot nadwyżki dług `ode_mnie`, z dokładnym źródłem korekty. |
| Korekta przy początkowej nadpłacie (`ode_mnie`) | Zmiana ceny o +X zmniejsza zobowiązanie do zwrotu o X (`korekta_kwoty = -X`); obniżka zwiększa je. Ujemny wynik oznacza dopłatę kupującego. Jedna relacja zobowiązania sprzedaży nadal wystarcza; projekcja uwzględnia kierunek. |
| Częściowy/całkowity zwrot towaru | Korekta oryginalnych pozycji i ceny, decyzja o przyjętych/uszkodzonych sztukach, korekta należności. Osobno faktyczny zwrot gotówki, jeśli nastąpił; samo przyjęcie produktu nie udaje przelewu. Wartość kosztu wraca do zapasu tylko dla sztuk przyjętych do sprzedaży; uszkodzone dają stratę. |
| Anulowanie po zapisaniu | Korekta odwraca należny przychód i rozchód tylko faktycznie niewydanych/zwróconych sztuk. Pierwsza wpłata i spłaty pozostają. Dług może stać się nadpłatą do oddania; zwrot pieniędzy jest osobną operacją. Nie ma kaskadowego usuwania spłat. |
| Błędna partia/produkt | Jawna korekta powiązanych pozycji przenosi wydane sztuki ze starej partii na właściwą, sprawdza dostępność, przelicza koszt i marżę. Uzgodniona cena i gotówka pozostają, chyba że użytkownik osobno je koryguje. |
| Korekta zakupu/dodatkowego kosztu | Zachowuje oryginalne dane, dodaje zmianę i alokację; przelicza koszt sprzedanych sztuk i zapasu. Raport oznacza przeliczenie. Zmiana kosztu nie tworzy płatności; rzeczywisty dopłacony/odzyskany pieniądz jest oddzielnym powiązanym faktem. |
| Zwrot do dostawcy/strata | Ilość nie może obejmować sprzedanych sztuk. Zmniejszenie zapasu i kosztu przy zwrocie; wpływ zwrotu pieniędzy dopiero po jego faktycznym otrzymaniu. Strata nie zmniejsza historycznego kosztu nabycia, jest pokazana osobno. |
| Pomyłka w spłacie/umorzeniu | Storno wskazanego faktu albo soft-delete/przywrócenie błędnego zapisu z rewizją i historią. Storno i usunięcie tego samego skutku nie mogą odwrócić go dwukrotnie. Faktyczny przelew powrotny jest `zwrot_nadplaty`, nie storno. |

Gdy wcześniej nie istniał dług, korekta sprzedaży tworzy kwotę początkową równą powstałej różnicy do otrzymania/oddania, a nie ponownie całej cenie. Późniejsze korekty używają tego samego długu. Korekty związane z towarem i należnością zawsze są jedną grupą operacji.

Umorzenie nie może przekroczyć dodatniej pozostałej kwoty w kierunku długu; brak automatycznego umarzania nadpłaty. Niezależne umorzenia offline przekraczające razem kwotę wymagają konfliktu domenowego, nie tworzą fałszywej nadpłaty. Pożyczka/ręczny dług nie dowodzi przepływu gotówki: kwota początkowa rejestruje relację, a wydanie/otrzymanie pieniędzy może być osobnym, jawnie powiązanym faktem. Nie dopisujemy osobistego przychodu/wydatku bez polecenia użytkownika.

Archiwizacja Puli/zobowiązania blokuje nowe zwykłe zapisy do jawnego przywrócenia; nie oznacza spłaty i domyślnie nie wyłącza przypomnień o niezerowym długu. Potwierdzenie archiwizacji pokazuje pozostałą kwotę i osobną opcję wyłączenia przypomnień. Rzeczywiste operacje już zapisane offline przed archiwizacją pozostają w historii i wyniku po synchronizacji.

## 10. Deterministyczny silnik obliczeń i raporty

Każda funkcja przyjmuje niemutowalne, zwalidowane dane jednej waluty i jawny moment odniesienia tam, gdzie potrzebny. Nie czyta globalnej bazy/zegara. Publiczna projekcja zwraca `kompletne` oraz wynik albo przyczynę braku wyniku; błędnych danych nie pomija. Tabele źródłowe i storna są normalizowane raz przed obliczeniem. Wiersze wirtualne mają klucze `kasa:<id>` / `zobowiazanie:<id>`; żadnego deduplikowania po kwocie, nazwie ani dacie.

### 10.1. Zapas i koszt

V1 obejmuje całe sztuki. Dla partii o pierwotnie alokowanym koszcie nabycia `K` (towar + koszty dodatkowe + korekty ceny nabycia) i `N` przyjętych sztukach definiujemy skumulowany koszt `A(n) = floor(K*n/N)` przez `BigInt`. Koszt zakresu kolejnych `q` sztuk to `A(n+q)-A(n)`. Wydania porządkujemy po `dataSprzedazy`, ID sprzedaży, ID pozycji (porządek kodów znaków, bez locale). Zapewnia to pełne rozdzielenie wszystkich groszy. Przykład: 3 sztuki o koszcie 1000 groszy mają koszt kolejnych wydań 333, 333, 334.

Zwrot wskazuje oryginalną pozycję i zakres zwracanych sztuk; częściowe zwroty odwracają ostatnie jeszcze niezwrócone sztuki tej pozycji. Przywracają dokładnie przypisany im koszt, bez nowego dzielenia. Ponowna sprzedaż zwróconych sztuk zużywa ich zachowany koszt, w kolejności oryginalnych numerów sztuk; zakresy są wyliczane, nie zapisujemy osobnych rekordów każdej sztuki. Zwrot dostawcy i strata również wskazują zakres dostępnych sztuk. Zmiana kosztu/operacja z datą wsteczną powoduje deterministyczne przeliczenie całej partii i oznaczenie raportu jako przeliczonego. Koszt to ewidencja zarządcza, bez deklaracji księgowości podatkowej lub fakturowania.

Zwrot do dostawcy usuwa koszt wskazanych sztuk z wartości zapasu, ale nie zmienia dzielnika `N` ani kosztu pozostałych sztuk przez ponowne dzielenie pomniejszonego kosztu. Różnica pomiędzy przypisanym kosztem zwróconych sztuk a uzgodnanym zwrotem ceny jest jawnym kosztem/przysporzeniem korekty, osobno od magazynu. Strata usuwa wartość sztuk z zapasu do kosztu strat. Techniczny odczyt odtwarza kolejno zdarzenia przyjęć, wydań i korekt po dacie i stabilnym ID; dla kilku korekt jednego dnia dodatkowo respektuje wskazane źródło, a cykl lub zwrot przed wydaniem jest błędem walidacji. Nie wybiera sztuk, które w danym zdarzeniu były już niedostępne.

### 10.2. Kontrakty funkcji

| Funkcja | Znaczenie wyniku |
| --- | --- |
| `obliczKosztCalkowityPuli` | Suma kosztów zakupów towarów i kosztów dodatkowych oraz niezależnych kosztów Puli po korektach/zwrotach do dostawcy. Nie dodaje ponownie powiązanych płatności za te same koszty. Zwraca osobno koszt towaru, koszty dodatkowe i pozostałe koszty. |
| `obliczOtrzymaneWplaty` | Suma rzeczywiście otrzymanych wpływów, w tym pierwszych wpłat i spłat należności. Oddzielne kategorie: finansowanie Puli, zapłaty sprzedażowe, zwroty dostawców, inne. Zwraca brutto wpływów oraz netto po rzeczywistych zwrotach, bez umorzeń i należności. |
| `obliczBilansGotowkowy` | Saldo otwarcia (tylko istniejąca kasa) + kanoniczne wpływy − wypływy + jawne korekty gotówki. Zakup/sprzedaż bez płatności nie zmienia bilansu. |
| `obliczStanPartii` | Przyjęte sztuki + zwroty nadające się do sprzedaży + korekty przyjęć − wydania − zwroty dostawcy − straty. Wynik ujemny to rozbieżność blokująca, bez cichego `max(0)`. |
| `obliczPozostalyZapas` | Ilości dostępne po partii i produkcie; sumowanie ilości wyłącznie w sztukach, partie pozostają odrębne. |
| `obliczWartoscZapasu` | Koszt nabycia przypisany do dostępnych sztuk, po korektach. Nie cena potencjalnej sprzedaży. Koszt rozchodów netto + koszt strat + wartość zapasu = koszt partii po zwrotach do dostawcy. |
| `obliczNaleznosciPuli` | Osobno dodatnie kwoty do otrzymania i nadpłaty/kwoty do oddania ze sprzedaży; uwzględnia oba kierunki zobowiązania. Nie maskuje ich jednym saldem netto. |
| `obliczMarzeSprzedazy` | Przychód należny netto po korektach/zwrotach − koszt sprzedanych sztuk netto. Procent marży tylko przy dodatnim przychodzie; przy zerze `brak`, nie dzielenie przez zero. Wpłaty i umorzenie nie zmieniają marży handlowej; umorzenie pokazujemy jako osobną stratę należności. |
| `obliczKosztNieodzyskany` | Podpisane rzeczywiste wypływy na zakupy/koszty − faktycznie otrzymane zwroty dostawców − zapłaty klientów netto (wpłaty minus rzeczywiste zwroty klientom). Jest miarą odzyskania gotówki, więc uzgodniony, ale nieotrzymany zwrot dostawcy go jeszcze nie zmniejsza. Wpłaty właściciela nie są odzyskaniem kosztu ze sprzedaży. Wynik ujemny oznacza odzyskaną nadwyżkę, nie jest obcinany do zera. |
| `obliczEfektywneObciazenieJednostkowe` | Koszt nieodzyskany / liczba pozostałych dostępnych sztuk jako dokładny ułamek. Tylko dla jednego produktu albo wyraźnie wybranego jednorodnego zestawu. Dla mieszanego koszyka bez jawnej alokacji i przy zerowym zapasie wynik `brak`; nie udajemy kosztu nabycia. |
| `obliczSaldoZobowiazanOsoby` | Lista niezależnych długów i sumy per waluta: do otrzymania, do oddania, informacyjne saldo wzajemne. Ujemna pozostała kwota odwraca znak wkładu. Brak automatycznej kompensaty i łączenia rekordów. |

Dla zobowiązania: `pozostalo = kwotaPoczatkowa + suma(korekt_kwoty) − suma(splat) + suma(zwrotow_nadplaty) − suma(umorzen)`, po uwzględnieniu storna. `kierunek` określa, czy `splata` jest wpływem (`do_mnie`) czy wypływem (`ode_mnie`); zwrot nadpłaty działa odwrotnie. Operacje niegotówkowe nie mają wkładu w bilans Puli. Statusy wyliczane: otwarte, częściowo spłacone, spłacone, zamknięte z umorzeniem, nadpłata; przeterminowanie to niezależna flaga daty i dodatniej pozostałej kwoty. Nadpłata jest prezentowana jako kwota do zwrotu, a przypomnienia wymagają reakcji także do jej rozliczenia.

Przykład odbioru: zakup 10 sztuk po 10 PLN i transport 20 PLN daje koszt 120 PLN. Sprzedaż 3 sztuk za 60 PLN, otrzymano 20 PLN: zapas 7, koszt sprzedaży 36 PLN, zapas wart 84 PLN, marża 24 PLN, należność 40 PLN, bilans gotówki −100 PLN bez finansowania, koszt nieodzyskany 100 PLN. Późniejsze 30 PLN daje gotówkę −70, dług 10, niezmienną marżę 24. Kolejne 15 PLN daje gotówkę −55, nadpłatę 5, niezmienny przychód należny 60. Zwrot nadpłaty 5 daje bilans −60, pozostało zero. Wpłata właściciela 120 PLN podnosi bilans o 120, ale nie zmienia marży ani odzyskania kosztu ze sprzedaży.

Raporty V1: zakres dat, Pula, produkt/partia, osoba i waluta; osobne kolumny gotówki, sprzedaży należnej, należności, kwot do zwrotu, kosztu nabycia, kosztu sprzedaży, strat, umorzeń, marży, zapasu i kosztu nieodzyskanego. Podsumowanie całości Puli i zakresu dat mają jasno opisany zakres: przepływy w okresie, zapas/saldo na koniec okresu z uwzględnieniem wcześniejszych operacji. Nie sumujemy wartości zapasu z gotówką jako „zysku”. Raport może być projekcją w UI; eksport fiskalny/księgowy poza zakresem.

## 11. Przypomnienia, Harmonogram i Echo

### 11.1. Jeden mechanizm

`PrzypomnieniaZobowiazan` będzie adapterem uzgadniającym projekcję w istniejącej tabeli `przypomnienia`, uruchamianym przez `SilnikPrzypomnien` obok dawek i podsumowania po pracy. Nie tworzy własnego zegara, service workera, systemu dostarczeń ani kolejki. Uzgodnienie odczytuje aktualne zobowiązania/operacje, konfigurację i istniejące przypomnienia w spójnej transakcji; nieaktualne wystąpienia oznacza `pominiete` i anuluje ich alarmy przez istniejący kanał. Finansowe projekcje nie trafiają do outboxu, zgodnie z lokalną polityką poniżej. Po spłacie/umorzeniu/korektach, sync, restore, zmianie reguły, strefy i wznowieniu aplikacji ponownie wyznacza plan.

Rozszerzenie `Przypomnienie.finansowe`: `{ wersja: 1, zobowiazanieId?, rodzaj: termin / bez_terminu_zbiorcze, regulaId, dataLokalna, strefaCzasowa, wersjaStanu, nieaktualne? }`. Kwota pozostała jest wyliczana przy prezentacji; wersja stanu obejmuje ID i rewizje zobowiązań i operacji oraz konfigurację. `zrodlo` może pozostać `{ typ: finanse, id: zobowiazanieId }`; jawny resolver finansowy prowadzi do szczegółów, bo obecny `sciezkaDlaSourceRef` kieruje do ogólnego modułu. Zbiorcze przypomnienie prowadzi do filtrowanej listy Zobowiązań. ID wystąpienia i klucz deduplikacji: `fz:dlug:<id>:<regulaId>:<dataLokalna>:<faza>` albo `fz:bez-terminu:<regulaId>:<dataLokalna>` w obrębie aktywnej bazy profilu, bez identyfikatora lokalnej instalacji.

Spłata częściowa zmienia treść kwoty, nie tworzy nowego wystąpienia tego samego dnia. Zero wyłącza przyszłe alarmy; zamknięcie przypomnienia oznacza obsłużenie tego wystąpienia, nigdy spłatę. Ujemne saldo pokazuje obowiązek zwrotu nadpłaty; pełne finansowe rozliczenie oznacza zero. Przy niekompletności plan finansowy nie podaje kwot ani stanu „brak długów”, a aplikacja pokazuje ograniczenie synchronizacji.

### 11.2. Reguły domyślne i czas

- **Z terminem:** domyślnie 3 dni przed terminem, w dniu terminu i co 7 dni po nim, o 10:00 w strefie reguły, do zerowego rozliczenia lub wyłączenia. Wszystkie progi, godzina, interwał i aktywność edytowalne; po terminie nie generujemy cofniętych alarmów „przed”.
- **Bez terminu:** jedna zbiorcza wiadomość dla aktywnych niezerowych zobowiązań bez terminu, domyślnie co tydzień w sobotę o 10:00. Zawiera oddzielne sumy do otrzymania/do oddania per waluta i odnośnik do listy, bez kompensaty. Konfiguracja w istniejących ustawieniach aktywnego profilu: stabilne `regulaId`, aktywność, dzień tygodnia, HH:mm, `coIleTygodni >= 1`, data zakotwiczenia i strefa. Indywidualny dług może być wyłączony z przypomnień. Inna częstotliwość tej wspólnej reguły nadal daje jedno zbiorcze wystąpienie.
- Strefa początkowa pochodzi z ustawienia użytkownika/rozpoznanej strefy IANA; dla tego użytkownika domyślnie `Europe/Warsaw`, a przy braku poprawnej konfiguracji to jawny fallback do potwierdzenia w ustawieniach. Nie wymuszamy Warszawy wszystkim i nie przeliczamy tygodnia jako `7*24h`. Reguła zachowuje zapisane lokalne HH:mm w wybranej strefie, także po podróży; zmiana strefy urządzenia nie zmienia jej po cichu.
- Lokalna nieistniejąca godzina wiosną: najbliższa poprawna minuta po luce tego samego dnia, oznaczona w podglądzie; jesienne powtórzenie: pierwsze wystąpienie. Jedno ID dla lokalnego dnia/fazy, więc bez podwójnego alarmu. Przy ręcznej zmianie reguły UI pokazuje rozstrzygnięty czas i strefę.
- Ograniczony plan na 30 dni do przodu; niezależne od kliknięcia „Zrobione” generowanie następnego wystąpienia. Po dłuższym offline jedno aktualne podsumowanie zaległości, bez lawiny historycznych alarmów. Wystąpienia sprzed aktualizacji pozostają historią.

Zbiorcza reguła jest polem `Ustawienia.finanseFz: { wersja: 1, regulaBezTerminu, rewizja, updatedAt }`, nie nową tabelą. Normalizator zachowuje nieznane dane FZ albo odmawia ich zapisu, zamiast zastępować je domyślnymi. Staremu klientowi backend nie zwraca tego pola, a przy jego zapisie ustawień zachowuje dotychczasowy fragment FZ; stary klient nie może go usunąć przez pominięcie. Nowy klient przesyła ustawienia zawierające ten fragment tylko po negocjacji FZ, w przeciwnym razie cały taki rekord czeka w istniejącej kolejce. Nowy GET zwraca ustawienia raz, w pełnej wersji; fragment FZ jest częścią kontroli kompletności obrazu. Konflikt reguły wymaga wyboru pełnej reguły i ponownego planowania, bez konfliktu sald. Nie zmieniamy ustawień powiadomień pozostałych modułów przy tej operacji.

### 11.3. Kanały i Echo

Harmonogram dostaje dostawcę otwartych terminów Zobowiązań w istniejącym kontrakcie `DostawcaElementowPulpitu`; to projekcja źródeł, nie automatycznie utworzone zadania, rachunki lub bloki. Zobowiązanie bez terminu nie dostaje fikcyjnej daty wymagalności z sobotniego przypomnienia. Centrum przypomnień korzysta z tej samej projekcji/rekordów. Właściciel widzi akcje przejścia, odroczenia i wyłączenia reguły; ogólna akcja „Zrobione” nie księguje pieniędzy.

Echo korzysta z obecnych narzędzi, polityki ryzyka i dostępu do aktywnego profilu. W FZ-9 dodajemy tylko odczyt: lista długów, kwota pozostała, termin, skrót do szczegółów. Pytanie o jedną osobę z kilkoma długami zwraca listę i prosi o wybór przy niejednoznacznym odnośniku; nie scala ich. Echo nie rejestruje automatycznie spłaty z wypowiedzi ani nie wysyła dokumentów do modelu. Dane finansowe nie trafiają do ogólnego kontekstu/briefingu bez aktywnego Właściciela i włączonego przez niego zakresu Finansów. Proaktywność/wyciszenie Echo dotyczy wypowiedzi Echo, nie wyłącza samodzielnie jawnie aktywnej reguły finansowej. Reguły po pracy pozostają niezależne.

Android używa obecnego `NotificationService` i `HarmonogramPrzypomnienAndroid`; nowy rekord musi mieć wersję alarmu uwzględniającą aktualność, kwotę i strefę. Cofnięcie spłaty lub zmiana profilu anuluje/przeplanuje właściwe alarmy. Szczegóły finansowe domyślnie ukryte na ekranie blokady; otwarcie prowadzi przez istniejącą ochronę aplikacji. Brak zgody, ograniczenia baterii, zatrzymanie aplikacji, reboot i dostępność alarmów dokładnych oznaczają brak gwarancji punktualnego dostarczenia. Kanał Beta ma istniejące ograniczenia powiadomień i nie potwierdza działania kanału stabilnego.

PWA i Windows/Web gwarantują wyłącznie aktualizację Centrum po uruchomieniu/wznowieniu aplikacji i dane offline zapisane lokalnie; Notification API jest opcjonalne. Nie obiecujemy alarmu po zamknięciu przeglądarki. Bez łączności urządzenie nie zna spłaty wykonanej na innym urządzeniu; po synchronizacji usuwa nieaktualne alarmy. Bez centralnego dostarczenia nie obiecujemy jednego systemowego powiadomienia na wszystkie urządzenia; deduplikacja dotyczy logicznego wystąpienia i lokalnego kanału.

Finansowe przypomnienia są **lokalną odtwarzalną projekcją**, nie są wysyłane zwykłym kanałem przypomnień do starszego backendu/klienta. Synchronizujemy źródła i reguły przez FZ, a każde urządzenie uzgadnia lokalny plan. Pola dostarczenia/planowania pozostają lokalne. Ochrona obejmuje prefiks `fz:` oraz metadane, repozytorium, centrum, Harmonogram, historię, wyszukiwanie, eksport i Echo. Edytor nie otrzymuje nawet nazwy/kwoty/powiązania długu przez ogólny grant przypomnień.

## 12. Projekt interfejsu i dokumenty

### 12.1. Ekrany

| Trasa | Zakres |
| --- | --- |
| `/finanse` | Obecny ekran i zachowanie, tylko skróty Pule / Wspólne rozliczenia / Zobowiązania. Bez nowych formularzy wewnątrz monolitu `WidokFinansow`. |
| `/finanse/pule` | Osobny `WidokPul`: lista, rodzaj, waluta, saldo z oznaczeniem kompletności, cel, archiwum, tworzenie bez uczestników. |
| `/finanse/pule/:pulaId` | Osobne szczegóły i sekcje Przegląd, Produkty, Sprzedaż, Wpłaty, Należności, Historia, Dokumenty. Dla Puli finansowej Produkty/Sprzedaż nieaktywne z wyjaśnieniem zakresu. Zakupy dostępne z Produktów i Dokumentów. |
| `/finanse/zobowiazania` | Osobny `WidokZobowiazan`: zakładki Dłużnicy / Moje długi, filtry osoby/waluty/statusu/archiwum. Wiele kart tej samej osoby, ewentualne informacyjne saldo wzajemne. |
| `/finanse/zobowiazania/:zobowiazanieId` | Kwota początkowa i pozostała, wyraźny kierunek, źródło, spłaty, Historia, Terminy i przypomnienia, nadpłata/umorzenie, archiwum. |
| `/finanse/rozliczenia` i szczegóły | Zachowane istniejące komponenty, trasy i kontrakty. |

Modale i formularze wydzielone lokalnie; serwisy walidują dane także poza UI. Brakujący rekord, ładowanie, pusty stan, offline, nieobsługiwany backend, konflikt i brak dostępu to różne stany. Przy blokadzie bilansu pozostaje czytelna historia, a nie fałszywe 0,00. Edytor otrzymuje odmowę również po bezpośrednim wejściu.

`PoleDaty` dla zakupu/sprzedaży/spłaty i terminu; `PoleCzasu` dla reguły, `PoleKwoty` dla celu/ceny całkowitej/wpłat; `PoleLiczbowe` dla sztuk. Błąd zachowuje szkic i ID; podwójne zatwierdzenie blokuje trwający zapis. Wstecz: panel pola → modal → szczegóły/lista → Finanse, także po deep linku. Rozszerzyć `App`, lazy loading, whitelistę `platform/trasy`, resolver źródeł i nawigację platformy, z walidacją UUID i odrzuceniem dowolnych prefiksów/URL.

Kompatybilność projektowana, **jeszcze nie potwierdzona działającym UI FZ**: tokeny i `Karta`/`Modal` wspólne dla Classic/Flat/Luxury, jasnego i ciemnego motywu. Jedna kolumna na 320/390 px, czytelny układ 768/1280/1920 px, brak poziomego przepełnienia dokumentu, długie polskie etykiety, focus i opis błędu, cele dotykowe co najmniej 44 px. Duża tabela sprzedaży przechodzi w karty lub ma jawny lokalny obszar przewijania. Weryfikacja w Androidzie, PWA, Windows/Web oraz przeglądarce obsługującej Raspberry Pi — bez specjalnej odmiany logiki finansowej dla platformy.

### 12.2. Paragony i dokumenty

Wykorzystujemy istniejące `dokumenty`, `Dokument.plik: Blob`, transport Base64 i szyfrowany backup. Brak osobnego magazynu plików. `dokumentyIds[]` przy zakupie/partii jest kanoniczną relacją finansową; dokument może być przypisany do całego zakupu i kilku jego partii. Dodajemy `Dokument.finansowe: { wersja: 1, tylkoWlasciciel: true }` jako trwałą klasyfikację ochrony, niezależną od relacji. Odczyt w ogólnych Dokumentach może wyliczać powiązania odwrotne. Nie utrzymujemy drugiej niezależnie edytowalnej listy relacji w `powiazania`.

Ochrona finansowa jest monotoniczna: odłączenie pliku, usunięcie zakupu, import starej kopii i konflikt nie zdejmują jej. Łączymy ograniczenia finansowe i medyczne, nie zastępujemy jednych drugimi. Klient i backend odmawiają Edytorowi także z grantami `dokumenty`, `finanse` i prywatnych sekcji zdrowia. Ochrona obejmuje listę, podgląd, bezpośredni odczyt, Blob, wyszukiwanie, historię, eksport/restore i sync. Backend wykrywa powiązanie również z obrazu źródeł, zanim rekord opuści proces; nie ufa samemu znacznikowi klienta. Starszy klient nie może odczytać ani nadpisać finansowego pliku (§14).

JPG, PNG, WebP i PDF; wiele plików. Limit V1: pojedynczy plik 5 MiB, maksymalnie 10 dokumentów na zakup/partię; pomiar całej zakodowanej paczki przed wysłaniem. Maksymalna paczka transportowa 20 MiB pozostawia zapas do istniejących 25 MiB serwera. Dokumenty wysyłamy w porcjach przez obecny endpoint, metadane klasyfikacji zawsze z treścią; nie dzielimy arbitralnie atomowej operacji pieniężnej. Kontrola MIME i zawartości, nazwy/rozmiaru, bez wykonywania HTML/SVG; poprawne zwalnianie adresów podglądu. Brakujący Blob jest jawnym stanem „załącznik niedostępny”, a nie pustym dokumentem.

Android: istnieje zależność `@capacitor/camera` i użycie `Camera.takePhoto` w `LekiOcrService`, ale brak gotowego ogólnego przepływu paragonu. W FZ-8 wykorzystać aparat i odczyt URI do Blobu, bez wywołania OCR leków i bez ML Kit. Anulowanie/aparat bez uprawnień/błąd odczytu nie tworzy dokumentu ani zakupu. Plik jest przygotowany przed transakcją; zapis dokumentu z klasyfikacją i jego relacji jest atomowy lokalnie. Web/PWA mają wybór pliku, opcjonalny systemowy capture zależny od przeglądarki. Fizyczny Android wymaga osobnej próby aparatu, przycisku Wstecz i zapisu offline.

Dokument może dotrzeć później niż zakup bez blokowania matematycznego bilansu, **o ile metadane relacji i ochrona są kompletne**. Niekompletny zakup/partie/płatności blokują bilans; brak samych bajtów PDF blokuje status kompletności załączników/backup, nie udaje brakującego kosztu. Zakup z brakującym dokumentem w pełnym backupie wymaga naprawy albo jawnego eksportu metadanych, który nie może być opisany jako pełna kopia.

## 13. Plan migracji i backupu

1. FZ-2 ponownie sprawdza aktualny numer Dexie. Dla obecnej bazy 20 kolejna migracja to **21**: dodaje pięć tabel z §6, bez zmiany istniejących ID, kwot, uczestników, zwrotów i historii. Indeksy starych tabel zmieniać tylko, jeśli wymagane przez wdrażany odczyt. Nie otwierać produkcyjnych baz w testach.
2. Nowe Pule korzystają ze znaczników `pula.wersja=1`; starsze kasy pozostają bez przepisywania. W nowym UI można je pokazać jako „dotychczasowa kasa” z ich starym saldem. Aktywacja rozszerzeń jest jawnym poleceniem z rewizją, historią i zachowaniem salda otwarcia; nie kopiuje operacji do nowej kasy. Od aktywacji rekord i wszystkie jego operacje są chronione możliwościami FZ. UI starej kasy nie obiecuje funkcji produktu ani zobowiązań.
3. Zmiana bazy jest addytywna; migracja powtarzalna i testowana na reprezentatywnej syntetycznej bazie v20 z lokalnymi F7, soft-delete, historią, profilem i kolejką. Brak automatycznej migracji grup rozliczeniowych do Pul i brak zmian dawnych `kwota`.
4. Downgrade klienta na bazie Dexie 21 może skończyć się `VersionError`; należy pokazać bezpieczny komunikat/ścieżkę powrotu do zgodnej wersji, bez resetowania bazy. Sam stary klient nie zrealizuje nowej obsługi błędu — scenariusz cofnięcia wersji musi być sprawdzony przed publikacją, a odzyskanie używa zgodnego klienta i backupu, nie kasowania bazy.
5. Backup formatu 3 zachowuje dotychczasowy transport, checksum, szyfrowanie, profil i `before-restore`. Dodaje jedną nową sekcję **`puleZobowiazania`**, wersja schematu sekcji 1: pełne FZ Pule i ich `operacjeKas`, wszystkie pięć nowych tabel, wymagane dokumenty finansowe z Blobami i trwałą ochroną oraz reguły przypomnień. Jedna sekcja jest potrzebna, ponieważ sprzedaż i dług stanowią niepodzielny graf.
6. Aby nie mieć dwóch kopii w tej samej kopii zapasowej, źródło `wspolneKasy` od tej wersji eksportuje wyłącznie stare kasy/operacje bez aktywacji FZ, a `dokumenty` wyłącznie dokumenty bez klasyfikacji finansowej. Finansowe źródła i pliki trafiają tylko do `puleZobowiazania`. Wymaga to wersji 2 schematu sekcji `wspolneKasy` i `dokumenty` oraz obsługi ich wersji 1 w nowym importerze. Analogicznie sekcja `ustawienia` w wersji 2 pomija fragment `finanseFz`, który zapisuje wyłącznie sekcja FZ; importer wspiera wcześniejszą wersję ustawień, zachowując obecny fragment FZ przy jej przywracaniu. Pozostałe sekcje i globalny format bez zmiany. Plik finansowo-medyczny należy do sekcji FZ, a wybór sekcji zdrowotnej zależnej od niego wymusza dołączenie sekcji FZ lub blokuje eksport z jasnym wyjaśnieniem.
7. Stary backup bez sekcji FZ nie czyści żadnych danych FZ, także operacji w starych tabelach i finansowych dokumentów. Przywracanie `wspolneKasy`/`dokumenty` v1 nie może nadpisać FZ rekordu o tym samym ID i usunąć jego rozszerzeń/ochrony: konflikt blokuje import tego wyboru, zamiast cichego obcięcia. Nadpisanie obejmuje tylko zakres danych wybranej, obecnej sekcji; brak sekcji nie oznacza pustej sekcji.
8. FZ restore waliduje cały graf, ceny, ilości, źródła płatności, rewizje i Bloby przed zapisem. Scalanie używa tych samych zasad pełnych wersji/grup co sync; nie wybiera osobno sprzedaży i jej długu. Powstaje pełny zaszyfrowany `before-restore`, a po potwierdzeniu jedna transakcja z kolejką/znacznikami przygotowania. Przerwanie lub zmiana profilu wycofuje całość.
9. Przypomnienia finansowe i ich stany dostarczenia nie są kanonicznym składnikiem backupu; reguły i źródła odtwarzają plan lokalnie. Obecny eksport sekcji przypomnień musi je wykluczyć, aby starszy importer nie pozyskał danych finansowych boczną ścieżką. Lokalna historia nowych encji pozostaje chroniona; pełne wersje biznesowe są w rekordach FZ.
10. Starszy importer odrzuci nieznaną sekcję/wersję zamiast częściowego przywrócenia. Nowy manifest i UI muszą jasno wskazywać wymaganego klienta FZ; test potwierdza odmowę bez zapisu. Nie zwiększamy globalnego formatu bez potrzeby, lecz nie zakładamy automatycznej kompatybilności.

## 14. Kontrakt synchronizacji i konfliktów

### 14.1. Możliwości i zgodność

Rozszerzamy **istniejące GET/POST `/api/sync/changes`**, kolejkę i `rekordy_synchronizacji`; bez drugiego endpointu finansowego. Nowy kontrakt możliwości: `finansePuleZobowiazania: { wersja: 1, tabele: [zakupyPul, sprzedazePul, osobyFinansowe, zobowiazania, operacjeZobowiazan], grupyAtomowe: true, dokumentyChronione: true }`. Klient deklaruje żądaną wersję w istniejącym żądaniu GET, a serwer odpowiada zakresem i wersją; brak lub częściowa zgodność oznacza brak wysyłki FZ. To rozszerzenie protokołu, nie nowa integracja.

Wymagana jest walidacja całej odpowiedzi, nie tylko sprawdzenie pięciu nazw. Pozytywna negocjacja obejmuje rozszerzenia starych tabel, źródła spłat, ochronę dokumentów i grupy. Stan profilu oddziela przygotowanie/ograniczenie/kompletność FZ od istniejącego F7, tak aby brak FZ backendu nie wyłączał dotychczasowych rozliczeń. Bez obsługi backendu zapis offline i pełny backup działają; kolejka czeka, a UI jawnie pokazuje lokalny zakres danych. Dla świeżego urządzenia podłączonego do backendu bez możliwości potwierdzenia FZ nie wolno pokazywać pustego, kompletnego salda FZ właściciela.

| Klient / backend | Zachowanie |
| --- | --- |
| Stary klient / nowy backend | Zachowany obraz i licznik F7 tylko dla starych kas i rozliczeń. Bez tabel FZ, aktywowanych Pul i ich operacji, finansowych plików oraz przypomnień. Nieobecność rekordu w żądaniu/odpowiedzi nie jest poleceniem usunięcia. |
| Nowy klient / stary backend | Nie wysyła żadnego rekordu FZ, także z `wspolneKasy`, `operacjeKas`, `dokumenty`. Zachowuje outbox, wskazuje ograniczenie. Zwykłe F7 działa nadal. |
| Nowy klient / nowy backend | Pełny zwalidowany obraz FZ z licznikami per tabela, identyfikatorem obrazu i atomowymi grupami; źródła i rewizje przenoszone razem. |
| Stary klient próbuje zmienić/usunąć znane dawniej ID aktywowanej Puli | Serwer sprawdza dotychczasowy zapis/rodzica i odmawia bez możliwości FZ. Nie ufa brakowi znacznika w nowym payloadzie. Tak samo dokument finansowy i tombstone. |

Nie dopisujemy FZ do starej, globalnie zwracanej listy pięciu tabel F7 bez wersjonowania. Istniejąca ścieżka `zwykle` musi wykluczać FZ także przy braku flagi, a licznik F7 odpowiadać dokładnie przefiltrowanemu obrazowi. Ochrona starych klientów obejmuje też aktywację wcześniej znanej kasy: backend nie może przyjąć od nich starszej wersji kasującej znacznik. Stary klient może zachować nieaktualną lokalną kopię sprzed aktywacji; nie da się odebrać mu już posiadanych danych, ale jego zapis nie zmieni danych FZ.

Wyjątek projekcji dotyczy wyłącznie fragmentu konfiguracyjnego ustawień z §11.2: zachowanie pola FZ przy zapisie starego klienta nie scala kwot ani operacji finansowych. Odpowiedź dla nowego klienta zawiera jeden pełny rekord ustawień, bez dwóch sprzecznych kopii w części zwykłej i obrazie FZ. Backend odmawia staremu klientowi jawnego ustawienia/wyzerowania pola `finanseFz`; brak pola oznacza zachowanie jego dotychczasowej treści.

### 14.2. Atomowa grupa na istniejącej kolejce

Obecne `zmianaId`, `installationId`, warunek wersji bazowej i pełne historie pozostają. Rozszerzenie dodaje do żądania `grupyOperacji: [{ idOperacjiZrodlowej, elementy: [{ tabela, id }] }]` oraz jawne potwierdzenie przyjętych grup i wersji w odpowiedzi. Źródłowa rewizja zawiera ten sam skład i treść polecenia; serwer porównuje je, waliduje wszystkie role i relacje. Grupy nie mają osobnej kolejki, tabeli ani endpointu.

Outbox może skompaktować kilka zmian jednego rekordu: wysyłka zbiera domknięcie wszystkich niepotwierdzonych grup z historii dotkniętych rekordów i aktualne pełne wersje ich członków. Jednego członka nie wolno wysłać/odznaczyć osobno. Wszystkie grupy współdzielące niepotwierdzony rekord tworzą jedną składową atomową. Klient po ACK usuwa tylko dokładnie potwierdzoną wersję kolejki; późniejsze lokalne zmiany pozostają. Utrata odpowiedzi ponawia tę samą treść i ID; serwer rozpoznaje kontynuację/identyczny zapis, bez drugiej płatności.

Serwer składa obraz `stan zapisany + wszystkie zmiany składowej`, waliduje schematy, niezmienną historię, zakres Właściciela, relacje, sumy, role źródłowe, waluty, cenę, stan partii i skutki korekt. Kolejność rekordów nie ma znaczenia. Zapis składowej w jednej istniejącej transakcji SQLite: wszystko lub nic. Błąd jednego członka nie daje ACK dla pozostałych. Walidacja wspólna jest czysta i buduje się na klient/serwer; zmiana uwierzytelniania nie jest potrzebna.

GET FZ zwraca kompletny spójny obraz źródeł finansowych wraz z tombstone'ami i historią, z licznikami i identyfikatorem obrazu. Klient sprawdza kompletność i zapisuje ten obraz transakcyjnie; błąd/przerwana odpowiedź nie usuwa kolejki i nie zastępuje części danych. Na V1 bez stronicowania finansowego obrazu; backend nie może zwrócić po cichu pierwszych N rekordów. Duży obraz/historia ponad limit jest jawnym ograniczeniem blokującym synchronizację FZ, z zachowaniem danych/backupem. Stronicowany snapshot lub zmiana limitów wymaga osobnego kontraktu przed jego implementacją, nie doraźnego odcinania historii.

Dokumenty mają osobne porcje w tej samej synchronizacji, po danych źródłowych lub razem z nimi, zawsze z ochroną; graf finansowy wskazuje oczekiwane ID plików. Uzgodnienie nie traktuje braku bajtów jako usunięcia dokumentu. Płatności i ich długi/źródła nie mogą być porcjowane w sposób łamiący atomową grupę. Paczka ponad 20 MiB blokuje daną składową z czytelnym komunikatem; pozostałe niezależne dane mogą się synchronizować. Nie obcinamy historii i nie odrzucamy Blobu w celu udawania sukcesu.

### 14.3. Konflikty i kompletność

- Rozbieżna edycja tego samego rekordu: istniejący konflikt pełnych wersji, zachowane oba warianty i rewizja rozstrzygnięcia. Dla FZ wybór musi obejmować zależną grupę, a po wyborze walidujemy cały graf. Brak ręcznego mieszania kwoty jednej wersji z ilością/drugą należnością. Historyczne F7 zachowuje dotychczasowy sposób rozstrzygania.
- Dwie niezależne płatności mają różne ID i obie są faktami; sumujemy je, nawet gdy pojawia się nadpłata. Identyczne ID z inną treścią to konflikt, nie nowa wpłata.
- Dwie sprzedaże offline tej samej ostatniej sztuki mają różne ID, ale wspólny zapas. Lokalnie obie mogły być poprawne. Serwer przyjmie pierwszą poprawną składową, drugą zatrzyma jako konflikt domenowy ilości; nie przyjmuje samej wpłaty/długu. Klient zachowuje całą oczekującą operację i oznacza daną Pulę jako wymagającą uzgodnienia, blokując wiarygodny bilans/zapas. Nie wolno automatycznie anulować prawdziwej sprzedaży ani dodać fikcyjnej dostawy.
- Rozwiązanie rozbieżności: Właściciel sprawdza rzeczywisty stan, wskazuje błędną partię, brakujący rzeczywisty zakup, pomyłkę wpisu albo zwrot/anulowanie niewykonanej dostawy. Tworzy spójną korektę z historią całej składowej; dopiero poprawny obraz odblokowuje wyniki. Przy dwóch rzeczywistych wydaniach bez pokrycia zapisujemy jawną rozbieżność do wyjaśnienia, bez pozornie poprawnego zera.
- Konflikt FZ blokuje powiązaną Pulę/zobowiązania; raport przekrojowy nie jest kompletny. Brak relacji, brak potwierdzonego obrazu lub nieznana wersja blokuje wynik, nie udaje braku długów. Można pokazać ostatni kompletny stan tylko z wyraźną datą i oznaczeniem historycznym, bez umożliwienia na nim zapisu sprzedaży.
- Każdy odczyt/zapis/restore i ACK sprawdza sygnał profilu; zmiana konta nie przenosi historii, alarmów ani odznaczania kolejki do innej bazy.

Kolejność przyszłego uruchomienia: testy kompatybilności → zgodny backend → test negocjacji na profilu testowym → zgodny klient → dwa urządzenia i restore. Wdrożenie/aktualizacje dopiero na osobne polecenie. FZ-1 nie potwierdza obsługi FZ na aktualnym serwerze produkcyjnym.

## 15. Macierz testów kolejnych etapów

To **testy do wykonania w implementacji**, nie wyniki FZ-1. Testujemy obserwowalne skutki, rollback i dane odczytane ponownie, nie prywatne nazwy funkcji. Dane syntetyczne/zanonimizowane, bez produkcji.

| Obszar / etap | Przypadki i oczekiwany wynik |
| --- | --- |
| Pieniądze / FZ-2 | 0,01; przecinek/kropka; granice MAX_SAFE_INTEGER i iloczyny ponad zakres; brak ułamkowego grosza; identyczny wynik po zmianie kolejności wejść; różne waluty odrzucone. |
| Ceny / FZ-5 | 3 × 3,33 = 9,99; 3 za 10,00 zachowuje 1000 groszy po zapisie/odczycie i fokusie; niecałkowite grosze wymagają decyzji; jednostkowa i całkowita w obie strony; zero ceny i wiele pozycji. |
| Partie i koszty / FZ-4 | Ten sam produkt kupiony dwa razy daje dwa ID partii, różne koszty i ceny; 1000/3 rozdziela koszt 333/333/334; koszty dodatkowe z resztą grosza; pełne zużycie daje zero zapasu i pełen koszt; zwrot przywraca właściwy koszt. |
| Gotówka / FZ-3, FZ-5 | Wpłata właściciela podnosi saldo, nie przychód sprzedaży; brakująca wpłata nie zwiększa gotówki; zakup i jego płatność nie naliczają kosztu dwukrotnie; ujemny bilans jawny. |
| Zobowiązania / FZ-6 | 100 → spłata 60 → 40 → spłata 40 → zero; nadpłata 120 → −20 i zwrot 20 → zero; umorzenie 40 po wpłacie 60 daje zero z umorzeniem, gotówka nadal 60. |
| Osoby/kierunki / FZ-6 | Jedna osoba: dwa długi do_mnie i jeden ode_mnie, niezależne historie i terminy; saldo informacyjne per waluta; brak kompensaty, identyczne nazwy nie scalają osób. |
| Sprzedaż odroczona / FZ-6 | Przykład §10 z 120/60/20/30/15; kupujący wymagany przy niedopłacie/nadpłacie; initial payment liczona tylko raz, spłata tylko raz, zero nie tworzy pustego długu/wpłaty. |
| Korekty / FZ-6 | Obniżenie ceny po spłacie tworzy kwotę do oddania bez usunięcia pieniędzy; zwrot towaru bez zwrotu gotówki; towar uszkodzony; błędna partia; storno/soft-delete bez podwójnego odwrócenia; anulowanie z częściową spłatą. |
| Transakcje / FZ-2, FZ-6 | Usterka zapisu historii/outboxu/ostatniego członka wycofuje cały zakup/sprzedaż/dług; ponowienie po utracie odpowiedzi; nieaktualny formularz; zmiana profilu podczas oczekiwania. |
| Migracja / FZ-2 | v20 z F7, tombstone'ami, historią i kolejką → następna wersja bez zmiany danych; powtórne otwarcie; stare kasy bez automatycznej aktywacji; downgrade bez resetu. |
| Backup / FZ-2, FZ-7, FZ-8 | Pełny round-trip źródeł i Blobów, szyfrowanie i before-restore; starsza kopia nie czyści FZ; v1 sekcji nie nadpisuje aktywowanej Puli/ochrony; selektywny restore nie rozrywa grafu; odmowa starego importera bez zapisu. |
| Sync / FZ-7 | Nowy/stary klient × nowy/stary backend; brak możliwości zachowuje kolejkę; stare żądanie nie usuwa rozszerzeń; odwrócona kolejność rodziców/dzieci, przerwana odpowiedź, limit rozmiaru, utrata ACK, compaction outboxu i atomowe składowe. |
| Konflikty / FZ-7 | Dwaj kupujący na ostatnią sztukę offline; dwie realne spłaty offline; umorzenia przekraczające saldo; pełne warianty i korekta grupy; brak fałszywego kompletnego bilansu przy częściowym obrazie. |
| Uprawnienia / każdy etap | Dwaj właściciele z identycznymi ID; Edytor z grantami finanse/dokumenty/przypomnienia/kontakty odrzucony przez UI, repo, serwisy, historię, GET/POST, Echo i eksport. Tombstone/odłączenie pliku nie luzuje dostępu. |
| Dokumenty / FZ-8 | Wiele plików, JPG/PNG/WebP/PDF, aparat Android, anulowanie, zły MIME/rozmiar, brak Blobu, awaria transakcji, brak podglądu Edytora, dokument finansowo-medyczny, błędny/niepełny backup. |
| Przypomnienia / FZ-9 | Bez terminu: sobota 10:00 i jedno logiczne podsumowanie; zmiana dnia/interwału/strefy; częściowa wpłata aktualizuje kwotę; zero/wyłączenie anuluje plan; nadpłata wymaga zwrotu; archiwum nie udaje spłaty. |
| DST/offline / FZ-9 | Europe/Warsaw: 28.03.2027 nieistniejące 02:30 → pierwsza poprawna minuta, 31.10.2027 powtórzone 02:30 → jedno pierwsze wystąpienie; 10:00 pozostaje 10:00; inna strefa użytkownika; wznowienie po kilku tygodniach bez lawiny alarmów. |
| Echo/Harmonogram / FZ-9 | Odczyt tej samej aktualnej kwoty i statusu; bez fikcyjnych zadań; kilka długów wymaga identyfikacji; zamknięcie przypomnienia nie spłaca; brak dostępu/niekompletność nie daje pustej listy „brak długów”; regresja podsumowania po pracy i dawek. |
| UI/platformy / FZ-3–FZ-10 | Classic/Flat/Luxury × jasny/ciemny, 320/390/768/1280/1920; klawiatura i focus; Android Wstecz, aparat i ograniczenia alarmów na fizycznym urządzeniu; PWA offline/restart, Windows/Web, przeglądarka Raspberry; poprawne odświeżenie/deep link. |
| Regresja / FZ-10 | Dotychczasowe Finanse i F7.1–F7.8, dane/profil/sync/backup, przypomnienia dawek i po pracy; brak zmian kwot osobistych i algorytmów podziału. |

Dobór uruchomień według `ogarniacz-test-selector`: najpierw celowany zestaw obszaru; przy zmianie kontraktów klient/serwer także `typecheck` i `server:build`, testy migracji/backup/sync na granicach. FZ-10 wymaga pełnej bramki projektu i oddzielnej, opisanej akceptacji urządzeń; test headless nie zastępuje fizycznego Androida/Raspberry.

## 16. Ryzyka i ograniczenia

| Ryzyko | Ograniczenie / warunek |
| --- | --- |
| Ponowne księgowanie pierwszej wpłaty lub spłaty | Rozłączne kanoniczne źródła, role i ID, atomowa walidacja relacji, przykłady §10 jako odbiór. |
| Niepełna atomowość sync przy wielu tabelach | Grupy i ich domknięcie/ACK w istniejącym protokole; test utraty odpowiedzi i kompaktowania; bez tego FZ-7 nie jest ukończony. |
| Stary klient kasuje nieznane pola lub ujawnia plik | Wersjonowanie FZ na poziomie rekordu i rodzica, filtrowanie GET, odmowa POST do aktywowanych danych, monotoniczna ochrona dokumentów. |
| Równoległa sprzedaż offline przekracza zapas | Jawny konflikt domenowy całej operacji i uzgodnienie faktów przez właściciela. Bez obietnicy globalnej rezerwacji przy braku internetu. |
| Historia/Blob rośnie ponad limit | Jawne limity i odmowa danej składowej bez utraty danych; brak cichego skracania. Test typowego profilu i pomiar pamięci na urządzeniach przed wdrożeniem. |
| Cena jednostkowa zmienia uzgodnioną całość | Dokładny ułamek, jawny tryb edycji, brak przepisywania przybliżenia, kontrola całkowitego grosza. |
| Należność lub umorzenie wygląda jak wpłata | Oddzielne kolumny/statusy i wpływ w obliczeniach wyłącznie operacji gotówkowych. |
| Koszt nabycia mylony z kosztem nieodzyskanym | Osobne nazwy, wzory i przykład; brak efektywnej stawki dla niejednorodnego koszyka. |
| Dokument lub przypomnienie ujawnia finanse Edytorowi | Dostęp na wszystkich granicach, nie tylko widok; test bocznych ścieżek i starych klientów. |
| Alarm nie dotrze lub będzie nieaktualny offline | Centrum i odtworzenie po wznowieniu, wersja stanu, ograniczenia kanałów opisane użytkownikowi, brak gwarancji między urządzeniami. |
| Archiwum ukrywa realny dług | Widoczny status niespłacenia, osobne wyłączenie przypomnień, późne fakty offline nadal wpływają na wynik. |

Kontrakt wybiera konkretne zasady V1 (sztuki całkowite, koszt alokowany deterministycznie, domyślne progi 3/0/7 dni, lokalne projekcje alarmów). Nie pozostawia otwartego wyboru silnika sald ani sposobu księgowania. Jeśli implementacja ujawni sprzeczność, należy opisać ją i zmienić kontrakt przed zmianą znaczenia danych, bez samodzielnego rozbudowywania zakresu.

## 17. Kryteria akceptacji FZ-1 i wykonana weryfikacja

FZ-1 jest gotowy do zatwierdzenia, gdy: aktualny `origin/main` i jego CI są sprawdzone, stan F7 i przypomnień potwierdzony kodem, rozdzielono A–E, wskazano tabele i osadzanie, wzory, transakcję sprzedaży/spłaty, zgodność starych klientów, ochronę dokumentów, przypomnienia/DST, backup i niekompletność oraz wejścia/wyjścia FZ-2–FZ-10. Ten dokument realizuje te warunki; nie potwierdza gotowości implementacji do publikacji.

Weryfikacja FZ-1: odczyt aktualnych źródeł i workflow; kontrola odwołań lokalnych i struktury dokumentu, diffu/białych znaków oraz zakresu zmienionych plików przed commitem. Nie dodano testów pozornych ani kodu produkcyjnego. Nie uruchamiano lokalnie pełnej regresji aplikacji, buildów ani prób urządzeń dla samej dokumentacji. Wynik CI nowego commita i SHA należy podać w raporcie końcowym; nie da się osadzić SHA własnego commita w jego treści bez samoodniesienia.

Workflow `ci.yml` uruchamia się także dla dokumentacji (brak filtra ścieżek); po autoryzowanym pushu trzeba odczytać wynik dla dokładnego SHA. Istniejący CI buduje artefakty testowe, w tym APK Debug, lecz nie publikuje wydania i nie aktualizuje urządzeń. `auto-publish.yml` wymaga `AUTO_PUBLISH_ENABLED == true`; przy weryfikacji zmienna repozytorium nie była ustawiona, a ostatni workflow automatycznej publikacji miał `skipped`. Przed pushem ponownie sprawdzić ten warunek, bez zmiany workflow/ustawień. Nie uruchamiać ręcznie release ani Test Build.

## 18. Etapy FZ-2–FZ-10 i kontrakty wejścia

Każdy kolejny etap zaczyna od aktualnego `origin/main`, statusu i CI, stosuje AGENTS i właściwe skille, czyta ten kontrakt oraz tylko potrzebne źródła. Zakresy są kolejne; koniec etapu nie upoważnia do następnego ani do deployu/release. Implementacja zachowuje nazwy po polsku, obecne metadane i granice uprawnień. Każdy etap raportuje zmienione zachowanie, testy wykonane/niewykonane, migrację/protokół oraz ewentualne odchylenie wymagające zatwierdzenia. Nie tworzyć z góry pustych usług lub typów dla niewdrażanej funkcji.

| Etap | Wejście i zakres | Wyjście / jednoznaczny warunek ukończenia |
| --- | --- | --- |
| FZ-2 — fundament danych i obliczeń | Zatwierdzony FZ-1; schemat, czyste funkcje §6–10, chroniony zapis i migracja, pełny backup od pierwszego nowego rekordu. Brak ekranów i wysyłki FZ. | Addytywna migracja, walidatory, bezpieczny zapis/historia/outbox, backup starego/nowego grafu, celowane testy pieniędzy i rollbacku; nowe rekordy jawnie wstrzymane w sync. Niewdrożone jeszcze komendy nie są dostępne produkcyjnie. |
| FZ-3 — Pule finansowe | FZ-2; istniejące kasy/operacje, nowe trasy listy/szczegółów, cel, wpłaty/wydatki, historia i archiwum. | Pełny lokalny przepływ bez uczestników, bilans z faktów, blokada waluty, błędy zachowują formularz, testy właściciela/UI/Wstecz i starej kasy; brak regresji Rozliczeń. |
| FZ-4 — zakupy, produkty i partie | FZ-2–FZ-3; `zakupyPul`, osobne partie, alokacja kosztów, zapas/wartość i korekty zakupowe. | Dwa zakupy produktu pozostają dwiema partiami, dokładny koszt całości, ponowienie/rollback, dokumenty jeszcze bez wgrywania plików; testy stanów i podziału groszy. |
| FZ-5 — sprzedaż i ceny | FZ-4; `sprzedazePul`, pozycje i konkretne partie, dwukierunkowe ceny, rozchód, pierwsza pełna zapłata, zwrot/korekta towaru. | Sprzedaż opłacona w całości, brak ujemnego lokalnego zapasu, 3 sztuki za 10,00 bez utraty grosza; nie udostępniać odroczonej płatności do FZ-6. Celowane testy cen, kosztu i zwrotu. |
| FZ-6 — Zobowiązania i sprzedaż odroczona | FZ-2 i FZ-5; osoby, oba kierunki, wiele długów, spłaty, umorzenia, nadpłaty, korekty oraz atomowe połączenie ze sprzedażą. | Rzeczywisty przepływ §9 i przykład §10, brak kopii spłaty w kasie, pełne UI/historia/archiwum, test transakcji i niezależnych długów. Powiązane źródła korygowane razem. |
| FZ-7 — synchronizacja i zgodność | FZ-2–FZ-6, stabilne schematy; możliwości FZ, grupy/ACK, walidacja obrazu, ochrona starych klientów, konflikty ilości i izolacja. | Macierz 2×2 klient/backend, utrata ACK, outbox compaction, dwa urządzenia testowe, stary backup, brak fałszywych bilansów. Pełny protokół §14 przetestowany bez wdrożenia produkcyjnego. |
| FZ-8 — paragony i pliki | FZ-7; trwała ochrona Dokumentów, wiele załączników, aparat, ograniczenia transportu i domknięty backup. | Pliki i relacje po restore/sync, odmowa Edytora i starego klienta, przerwane zapisy bez pustych rekordów; fizyczny Android opisany osobno. Bez OCR. |
| FZ-9 — przypomnienia, Harmonogram i Echo | FZ-6–FZ-8; źródła/reguły, lokalna projekcja na istniejącym reminder engine, dostawca Harmonogramu i odczyt Echo. | Jedno sobotnie podsumowanie, reguły terminowe, DST/inne strefy, aktualizacja po spłacie, anulowanie, brak wycieku, regresja dawek i po pracy. Brak gwarancji systemowego alarmu. |
| FZ-10 — raporty i odbiór | FZ-2–FZ-9; raporty §10, kompletność danych i pełna macierz/platformy. | Potwierdzone wzory na danych z korektami/zwrotami/umorzeniami, pełna bramka projektu, opisane pomiary i akceptacja urządzeń albo jawne blokery. Brak release/deployu w ramach odbioru. |

### Krótkie kontrakty do zlecenia kolejnych etapów

**FZ-2:** „Zaimplementuj wyłącznie fundament FZ-2 według §6–10 i §13. Sprawdź bieżący schemat, dodaj addytywną migrację i walidację, czyste obliczenia oraz wymagane bezpieczne zapisy z historią/outboxem i pełnym backupem. Nowe dane pozostają lokalne do FZ-7. Testuj migrację, dokładność, idempotencję, rollback, profil i stary restore. Nie dodawaj ekranów ani nie uruchamiaj FZ-3.”

**FZ-3:** „Na ukończonym FZ-2 dodaj osobne ekrany Pul finansowych i trasy §12. Użyj istniejących kas, serwisów i pól. Obsłuż wpływy/wydatki, cel, historię, archiwum i brak uczestników; saldo wyliczaj. Zweryfikuj Wstecz, motywy i właściciela. Nie wdrażaj produktów ani synchronizacji.”

**FZ-4:** „Na FZ-3 dodaj zakupy, osobne partie, katalog jako projekcję, koszty dodatkowe i stany z §6/§10. Zachowaj każdy zakup oraz ID partii, dokładną alokację kosztów i pełny backup. Testuj dwa zakupy produktu, reszty groszy i korekty. Nie implementuj sprzedaży ani aparatu.”

**FZ-5:** „Na FZ-4 dodaj sprzedaż opłaconą w całości, wybór konkretnych partii i rozchód. Wprowadź dwukierunkową cenę zgodnie z §9.2 bez niejawnego zaokrąglania, oraz korekty/zwroty towaru. Testuj ceny i brak ujemnego lokalnego zapasu. Nie udostępniaj płatności odroczonej do FZ-6.”

**FZ-6:** „Na FZ-5 dodaj Zobowiązania obu kierunków, osoby, wiele niezależnych długów, spłaty i umorzenia. Wprowadź atomową sprzedaż odroczoną i wszystkie związane korekty z §9; jedna spłata jest jedynym faktem wpłaty do Puli. Testuj przykład §10, nadpłaty i awarię ostatniego zapisu. Nie twórz osobnego salda ani automatycznej kompensaty.”

**FZ-7:** „Na FZ-6 rozszerz wyłącznie istniejącą synchronizację według §14, bez nowego endpointu. Zaimplementuj możliwości FZ, grupy atomowe, ACK, walidację i konflikty grafu/ilości, ochronę starszych klientów oraz kompletność. Zachowaj sesje i F7. Uruchom macierz zgodności i testy granic klient/serwer; nie wdrażaj backendu.”

**FZ-8:** „Na FZ-7 dodaj dokumenty zakupów/partii przez istniejące Dokumenty i aparat Androida, bez OCR. Ochrona finansowa musi działać przed pierwszym zapisem pliku i pozostać po odłączeniu. Testuj Edytora, starego klienta, anulowanie, limity, round-trip Blobów i pełny backup. Nie twórz magazynu plików.”

**FZ-9:** „Na FZ-8 dodaj przypomnienia Zobowiązań jako chronioną lokalną projekcję wspólnego silnika (§11), dostawcę Harmonogramu i odczyt Echo. Zachowaj sobotę 10:00 i konfigurowalną strefę/regułę; częściowa spłata aktualizuje, zero anuluje. Testuj DST, wznowienie offline i regresję alarmów dawek/po pracy. Nie dodawaj drugiego silnika ani automatycznych spłat przez Echo.”

**FZ-10:** „Po FZ-9 zrealizuj raporty §10 i odbiór §15. Rozdziel gotówkę, przychód należny, koszty, zapas, umorzenia i rentowność; blokuj wynik przy niekompletności. Uruchom pełną bramkę i opisz testy platform oraz brakujące próby urządzeń. Nie publikuj wydania i nie aktualizuj Raspberry Pi.”

Ocena FZ-1: **gotowy do zatwierdzenia**. Zatwierdzenie kontraktu i polecenie implementacji FZ-2 są osobnymi krokami.
