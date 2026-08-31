# Echo — architektura centralnego agenta Ogarniacza

## 1. Wizja

Echo jest długoterminowo centralnym inteligentnym asystentem Ogarniacza, a nie parserem komend ani osobnym chatbotem. Użytkownik opisuje naturalnie cel, Echo utrzymuje kontekst rozmowy, pobiera tylko potrzebne dane, wnioskuje, proponuje lub wykonuje dozwolone działania i odpowiada tym samym agentem w kanale tekstowym oraz głosowym.

Inspiracją jest funkcjonalny model interakcji osobistego asystenta znany z J.A.R.V.I.S.-a: płynna rozmowa, świadomość kontekstu, dobór narzędzi i kontrolowana proaktywność. Echo nie kopiuje postaci, głosu, dialogów ani charakterystycznego stylu tej fikcyjnej postaci.

## 2. Dlaczego poprzednie Echo było parserem

Poprzedni `EchoService` łączył w jednej ścieżce cztery odpowiedzialności: rozpoznawanie fraz przez `startsWith`, `includes` i regexy, ocenę ryzyka na podstawie słów, bezpośredni dostęp do repozytoriów oraz składanie odpowiedzi. Jedna wypowiedź była więc jednocześnie tekstem użytkownika, formatem polecenia i nośnikiem argumentów operacji. Nierozpoznane wypowiedzi trafiały do jednego komunikatu wyliczającego obsługiwaną składnię. Follow-up nie miał stanu rozmowy, a głos dostarczał jedynie kolejną izolowaną komendę.

Do zachowania nadawały się repozytoria, serwisy domenowe, centralne poziomy ryzyka, dziennik działań, STT/TTS jako adaptery wejścia i wyjścia oraz lokalny charakter danych. Nie należało zachowywać tekstu jako kontraktu wykonawczego.

## 3. Granica LLM i systemu deterministycznego

Model językowy odpowiada za:

- interpretację naturalnego języka i odniesień do wcześniejszych tur;
- decyzję, czy odpowiedzieć, dopytać albo wywołać jedno lub kilka narzędzi;
- dobór narzędzia i przygotowanie strukturalnych argumentów;
- wnioskowanie na podstawie kontrolowanych wyników narzędzi;
- naturalne sformułowanie odpowiedzi, w tym uczciwe wskazanie braku danych.

Warstwa deterministyczna odpowiada za:

- rejestr dostępnych narzędzi i ich jawne schematy;
- walidację nazwy oraz argumentów tool calla;
- politykę ryzyka i wymagane potwierdzenie;
- wykonanie przez istniejące repozytoria lub serwisy domenowe;
- ograniczenie liczby kroków, timeout, anulowanie i kontrolowane błędy;
- dziennik działań oraz minimalizację danych przekazywanych modelowi.

LLM nie otrzymuje obiektu bazy, SQL, funkcji JavaScript, dostępu do shella ani prawa do bezpośredniego zapisu IndexedDB. Nieznane narzędzie i argumenty niezgodne ze schematem są blokowane przed wykonaniem.

## 4. Przepływ i agent loop

```text
tekst lub transkrypcja STT
        ↓
     AgentEcho
        ↓
kontekst czasu + ograniczony kontekst rozmowy + definicje narzędzi
        ↓
 ProviderModeluEcho
        ↓
 odpowiedź / pytanie / tool calle
        ↓
rejestr → walidacja → polityka → wykonawca → domena Ogarniacza
        ↓
 wynik narzędzia wraca do kontekstu i ponownie do providera
```

Jedna tura może zawierać wiele wywołań narzędzi oraz kilka kolejnych kroków modelu. `AgentEcho` ma twardy domyślny limit sześciu kroków. Przekroczenie limitu kończy się bezpieczną, naturalną odpowiedzią. Każde zapytanie do providera ma timeout i może zostać anulowane przez `AbortSignal`. Błąd modelu nie uruchamia żadnej zastępczej heurystyki wykonawczej.

Odpowiedź providera jest dyskryminowaną strukturą: `odpowiedz`, `pytanie` albo `narzedzia`. Kontrakt ma opcjonalną metodę odpowiedzi strumieniowej, dzięki czemu dalszy provider i TTS nie są zablokowane przez założenie `response: string`.

## 5. Narzędzia

`NarzedzieEcho<TArgumenty, TWynik>` definiuje nazwę modelową, opis, schemat Zod argumentów, poziom ryzyka i funkcję wykonawczą. `RejestrNarzedziEcho` publikuje modelowi jedynie opis oraz JSON Schema. `WykonawcaNarzedziEcho` wyszukuje narzędzie, waliduje argumenty, pyta politykę o zgodę, wykonuje zamkniętą funkcję i zwraca kontrolowany wynik.

Pierwszy pionowy wycinek zawiera:

- `list_tasks`;
- `get_task`;
- `create_task`;
- `update_task`;
- `list_reminders`;
- `create_reminder`.

Zestaw obejmuje odczyt, utworzenie i zmianę oraz dwie istniejące domeny. Pozwala udowodnić agent loop bez tworzenia katalogu narzędzi „na przyszłość”. Wyniki zawierają tylko pola potrzebne w rozmowie, a nie pełną bazę. Kolejne moduły powinny dodawać małe, domenowe narzędzia używające istniejących serwisów.

## 6. Conversation context

`KontekstRozmowyEcho` jest krótkotrwałym stanem jednej rozmowy. Przechowuje ograniczoną liczbę ostatnich tur, aktualny temat, ostatnio wskazane encje, ostatnie wyniki narzędzi, ostatnią akcję, nierozwiązane pytanie i odniesienia czasowe. Limity zapobiegają bezterminowemu wzrostowi promptu. Starsze tury są odrzucane, a kontekst jawnie zaznacza ich pominięcie; pole na zatwierdzone streszczenie umożliwia późniejsze kondensowanie przez model bez udawania dziś semantycznego streszczania heurystyką.

Kontekst jest wspólny dla tekstu i transkrypcji STT, dlatego follow-up nie tworzy osobnej sesji „komend głosowych”. Docelowy backend powinien wiązać kontekst z `rozmowaId`, użytkownikiem i ograniczonym czasem życia.

## 7. Long-term memory

Pamięć długoterminowa jest oddzielona od kontekstu rozmowy. Kontrakt `MagazynPamieciEcho` przewiduje kontrolowane wyszukiwanie, zapis i usuwanie, a kandydat pamięci ma treść, typ, źródło, timestamp i confidence. `PolitykaPamieciEcho` nie pozwala traktować każdej wypowiedzi jako pamięci: zapis ręczny i jawna prośba są dopuszczalne, propozycja Echo wymaga akceptacji.

Obecna tabela `pamiecEcho` oraz edytowalny ekran właściciela pozostają fundamentem. Przed połączeniem kontraktu z trwałym magazynem trzeba uzgodnić migrację metadanych confidence/timestamp oraz zasady danych wrażliwych. Wektorowa baza nie jest potrzebna na tym etapie; najpierw wystarczą filtrowane rekordy i jawne narzędzia pamięci.

## 8. Proaktywność

Proaktywność ma trzy osobne poziomy:

1. `WgladEcho` — wykryty fakt lub konflikt wraz ze źródłami.
2. `SugestiaEcho` — naturalna propozycja możliwego działania.
3. Tool call — rzeczywista akcja przechodząca przez zwykłą politykę i executor.

Typy `WgladEcho` i `SugestiaEcho` wyznaczają granicę dla przyszłego `SilnikProaktywnosciEcho`. Silnik powinien korzystać z kontrolowanych reguł/zdarzeń domenowych i ewentualnego wnioskowania modelu, respektować ustawienia wyciszenia oraz proaktywności i domyślnie proponować zamiast zmieniać dane. Nie dodano harmonogramu ani autonomicznych akcji.

## 9. Ryzyko i potwierdzenia

Ryzyko jest cechą narzędzia, nie słów znalezionych w wypowiedzi. Model może zaproponować dowolny dostępny tool call, lecz `PolitykaDzialanEcho` rozstrzyga wykonanie:

- `niskie` — wykonanie bez dodatkowego pytania;
- `umiarkowane` — jawne potwierdzenie przed wykonaniem;
- `wysokie` — jawne potwierdzenie przed wykonaniem.

W przyszłości poziom umiarkowany może zależeć od ustawień użytkownika i skali zmiany. Tokenem potwierdzenia jest konkretne, oczekujące wywołanie o znanym identyfikatorze, nazwie i argumentach; ponowna interpretacja pierwotnego zdania nie jest potrzebna. Usuwanie, finanse, dostęp i operacje zewnętrzne wymagają osobnych narzędzi oraz ostrzejszych zasad.

## 10. Czas

Każde zadanie modelu otrzymuje jawnie bieżący timestamp ISO, lokalną datę i strefę czasową urządzenia. Model nie ma zgadywać daty. Grafik pracy, kalendarz, wyjątki i zajęte okna będą pobierane narzędziami tylko wtedy, gdy pytanie ich wymaga. Rozumienie zwrotów „jutro”, „po pracy” czy „to drugie” należy do LLM pracującego na tych jawnych danych i kontekście, a nie do zestawu regexów.

## 11. STT, TTS i rozmowa ciągła

Web Speech API pozostaje obecnym adapterem STT/TTS. Transkrypcja jest wysyłana bezpośrednio do tego samego `EchoService` i `AgentEcho`, którego używa formularz tekstowy. Brak Web Speech API nie wyłącza rozmowy tekstowej.

Obecny nasłuch nadal obejmuje pojedynczą wypowiedź. Nie jest to jednak izolowana komenda: kontekst agenta pozostaje między turami. Następne etapy to osobny kontroler sesji głosowej, częściowe transkrypcje, kolejka TTS, krótkie okno follow-up po odpowiedzi, przerwanie wypowiedzi Echo przez użytkownika i dopiero później opcjonalny wake word. Wake-word engine nie należy do agenta ani providera modelu.

## 12. Provider modelu i Raspberry

`ProviderModeluEcho` nie zawiera nazw OpenAI, Anthropic, Ollama, llama.cpp ani konkretnego modelu. Obsługuje instrukcje systemowe, kontekst rozmowy i czasu, definicje tools, strukturalne decyzje, anulowanie oraz opcjonalny streaming. Timeout jest wymuszany przez agenta.

Pierwszym docelowym adapterem będzie provider łączący backend Ogarniacza z lokalnym inference serverem na Raspberry Pi lub serwerze Ogarniacza. Wybór runtime'u i modelu nastąpi dopiero po poznaniu RAM, CPU/GPU/NPU, systemu, budżetu opóźnienia i wymaganej jakości polszczyzny. Klient nigdy nie powinien łączyć się bezpośrednio z inference serverem.

## 13. Kontrakt serwera

Backend udostępnia `POST /api/echo/message` z `rozmowaId`, `wiadomosc` i źródłem `tekst | stt`. Odpowiedź zawiera identyfikator rozmowy, tryb i treść oraz może później przenieść bezpieczny kontrakt potwierdzenia. Wejście jest ograniczone rozmiarem i walidowane. Brak providera daje kontrolowane `503` w trybie ograniczonym. Endpoint nie loguje treści rozmowy i nie daje dostępu do bazy ani inference servera.

Streaming powinien zostać dodany za backendem Ogarniacza, np. jako SSE lub strumieniowana odpowiedź HTTP, kiedy fundament serwera będzie gotowy. Obecny kontrakt providera nie blokuje tego kierunku.

## 14. Prywatność i bezpieczeństwo

- model dostaje tylko wyniki wybranych narzędzi, nie pełną bazę;
- narzędzia zwracają ograniczone projekcje pól;
- rozmowy, hasła, tokeny i dane dostępowe nie są logowane;
- klient nie otrzymuje dostępu do serwera modelu;
- nieznane narzędzia, zły schemat i brak potwierdzenia są blokowane;
- błąd lub timeout nie uruchamia alternatywnego zapisu;
- local-first i lokalny model pozostają preferowanym kierunkiem dla prywatnych danych.

Przed produkcyjnym wdrożeniem serwerowego agenta potrzebne są uwierzytelnienie, autoryzacja per użytkownik, izolacja rozmów, limity żądań, redakcja logów i testy prompt injection dla treści zwracanych przez narzędzia.

## 15. Offline i degraded mode

`LokalnyOgraniczonyProviderEcho` jest świadomym trybem awaryjnym. Pozwala otworzyć ekran, prowadzić ograniczony kontekst i używać wspólnych adapterów tekst/STT/TTS, ale nie udaje pełnego NLP. Nie zamienia swobodnej wypowiedzi w akcję na podstawie listy synonimów. Gdy nie potrafi wiarygodnie zinterpretować treści, mówi to naturalnie i nie zmienia danych.

Rejestr, walidator, polityka i narzędzia działają bez LLM i mogą być testowane strukturalnymi tool callami. Naturalny wybór narzędzia, wieloetapowe rozumowanie, fleksja, korekty, zaimki i swobodne daty względne zaczną działać dopiero po podłączeniu właściwego providera LLM.

## 16. Roadmapa

1. **Fundament — wykonane:** agent loop, provider abstraction, ograniczony kontekst, jawny czas, registry/executor/policy, sześć narzędzi, wspólna ścieżka tekst/STT, kontrakt serwera, UX i testy architektury.
2. **Serwerowy provider lokalny:** adapter backend → inference server, strukturalne tool calle, timeout/anulowanie, bezpieczna konfiguracja i testy kontraktowe na docelowym sprzęcie.
3. **Serwerowe tools:** przeniesienie wykonania do uwierzytelnionej warstwy domenowej backendu; pionowy wycinek zadania/przypomnienia przed kolejnymi modułami.
4. **Trwałe rozmowy:** magazyn sesji po `rozmowaId`, kondensacja starszych tur przez model i kontrola rozmiaru/kadencji.
5. **Pamięć długoterminowa:** migracja metadanych, jawne zapamiętaj/edytuj/usuń, retrieval i kontrola danych wrażliwych.
6. **Dane czasu i planowania:** grafik, wyjątki, kalendarz i bloki czasu jako narzędzia umożliwiające ocenę obciążenia oraz wolnych okien.
7. **Proaktywność:** źródła zdarzeń → wglądy → sugestie, deduplikacja, wyciszenie i brak autonomicznych ryzykownych zmian.
8. **Voice loop i streaming:** strumień modelu, porcjowany TTS, follow-up window, przerwanie, a dopiero potem wybór rozwiązania wake word.
9. **Rozszerzanie narzędzi:** małymi pionowymi wycinkami dla notatek, kalendarza, pracy, kontaktów, finansów, zdrowia i samochodu, każdorazowo z minimalizacją danych oraz polityką ryzyka.

Warunkiem przejścia do trybu pełnego jest to, by użytkownik nie musiał znać nazw narzędzi ani poprawnych komend. Model interpretuje rozmowę; deterministyczny system wyłącznie bezpiecznie realizuje jej wynik.
