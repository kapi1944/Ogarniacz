# Wspólne pola formularzy

F2: `PoleCzasu` obsługuje `czas` i dawny `time`, lokalne HH:mm oraz dotychczasowy krok w sekundach. Panel pod polem korzysta ze wspólnej obsługi Wstecz. Nie zmienia modelu czasu ani F1.

F3: `PoleKwoty` obsługuje PLN, EUR, USD, GBP, CHF, CZK i UAH (dwa miejsca dziesiętne), przecinek i kropkę. Nie zaokrągla nadmiarowych cyfr. Zapis do liczbowego modelu odrzuca wartości, których nie można zachować dokładnie.

Transakcja nadal przechowuje `kwota: number`; opcjonalne `waluta` zawiera kod ISO. Brak waluty oznacza PLN. Powiązane transakcje z innych modułów, rat i płatności stałych pozostają PLN. Budżety, cash flow i analizy obejmują PLN, inne waluty mają osobne podsumowania. Sumowanie transakcji używa dziesiętnych zapisów i BigInt, bez dodawania ułamków binarnych. Kursy i przewalutowanie są poza zakresem.

Nowa własna kwota rejestru zapisuje `{ kwota: "125.50", waluta: "EUR" }`; zapis dziesiętny chroni precyzję. Starsze wartości liczbowe są odczytywane jako PLN; obiekt powstaje dopiero przy zapisie formularza. Systemowe pola bez zadeklarowanego `kluczWaluty` pozostają PLN. Nie zmieniono indeksów, wersji Dexie ani protokołu synchronizacji. Pełne rekordy i nowe opcjonalne dane przechodzą przez dotychczasowy zapis lokalny, transport oraz backup z `passthrough`.

Testy IndexedDB i UI działają na syntetycznych danych. Do sprawdzenia na Samsungu: klawiatura, rozwijanie godzin/minut w modalu, Wstecz, pole widoczne nad panelem, waluty i przecinek, zapis offline i odczyt po ponownym uruchomieniu. Nie wykonano publikacji APK ani wdrożenia.
