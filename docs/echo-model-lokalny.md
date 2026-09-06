# Echo: lokalny model i istniejący agent

Echo zachowuje `AgentEcho`, `KontekstRozmowyEcho`, rejestr, politykę ryzyka, walidację Zod i repozytoria Ogarniacza. Nie dodano zależności ani płatnej usługi.

## Uruchomienie

Bez konfiguracji działa dotychczasowy ograniczony provider offline. Swobodna interpretacja języka przez model wymaga uruchomionego lokalnie Ollama i pobranego modelu obsługującego polski oraz odpowiedzi JSON. Sam adapter nie instaluje modelu. Wybierz model dostępny lokalnie i odpowiedni do pamięci urządzenia.

W `.env.local` ustaw przed uruchomieniem Vite lub buildem:

```dotenv
VITE_ECHO_MODEL_URL=http://localhost:11434/api/chat
VITE_ECHO_MODEL=nazwa-zainstalowanego-modelu
```

Adres musi być osiągalny z urządzenia, na którym działa aplikacja. Na telefonie `localhost` oznacza telefon. Dla PWA na HTTPS potrzebny jest zgodny z polityką przeglądarki adres HTTPS lokalnego serwera oraz dopuszczenie pochodzenia aplikacji w konfiguracji Ollama. Nie umieszczaj w tych zmiennych sekretów. Rozmowa, preferencje i odczytane dane trafiają do skonfigurowanego serwera modelu.

Adapter używa [strukturalnych odpowiedzi Ollama](https://docs.ollama.com/capabilities/structured-outputs) i waliduje je ponownie w Zod. Brak połączenia lub niepoprawna odpowiedź kończy krok komunikatem, bez automatycznego ponawiania zapisu przez innego providera.

## Przepływ

Wypowiedź i bieżący wątek → intencja z wartościami i źródłami → odczyt narzędzi → aktualne dane → decyzja lub pytanie → walidacja i polityka → sprawdzenie stanu → zapis w istniejącym repozytorium → odpowiedź oparta na wyniku.

Intencja zawiera pewność, encje, wartości jawne, kontekstowe, odczytane i proponowane, brakujące pola, konflikty i informację o korekcie. Daty, godziny, zakresy i osoby są nazwanymi wartościami. Kontekst zachowuje sześć ostatnich intencji oraz dotychczasowe ograniczenia historii. Wyniki bieżącej tury są oddzielone od historii, aby dawna odpowiedź nie zastępowała nowego odczytu.

Model nie zapisuje bez bieżącego odczytu, znanych identyfikatorów i dostatecznie kompletnej intencji. Wybór kandydata zatrzymuje zapis: maksymalnie trzy propozycje albo potwierdzenie wyraźnego faworyta. Rejestr pozostaje rozszerzalny przez `zarejestruj`; nowe narzędzia mogą jawnie deklarować `rodzaj` oraz `sprawdzStan`.

Sprawdzenie duplikatów zadań i przypomnień działa także offline, w wykonawcy. Przypomnienie o nazwie pasującej do opłaconego rachunku za miesiąc terminu wymaga potwierdzenia. Kontrola respektuje dostęp do finansów. `subscription_state` zwraca oddzielnie subskrypcje i rachunki: brak rachunku nie dowodzi opłacenia ani zaległości. `list_calendar` odczytuje bloki Planera; zadania i wizyty mają własne istniejące narzędzia.

## Weryfikacja i Etap 2

Testy automatyczne używają kontrolowanych odpowiedzi modelu: weryfikują kontrakt, walidację, kontekst, blokady, wybór i realne repozytoria testowe. Nie dowodzą jakości językowej konkretnego modelu. W tym środowisku nie wykryto polecenia `ollama`; nie wykonano rozmowy z rzeczywistym modelem ani testu na telefonie.

Etap 2: uruchomienie i ocena konkretnego darmowego modelu na docelowym sprzęcie oraz dopracowanie doprecyzowania w wielu turach: zmiana tematu, anulowanie, wybór spośród kolejnych wyników, korekty godzin i niepełnych dat. Provider offline pozostaje ograniczony; nie deklarujemy, że rozumie dowolną potoczną wypowiedź. Gwarancje wykonawcy nie są gwarancją bezbłędnej interpretacji ani swobodnej odpowiedzi każdego modelu.
