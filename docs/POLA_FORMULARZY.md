# Wspólne pola formularzy

F2: `PoleCzasu` obsługuje `czas` i dawny `time`, lokalne HH:mm oraz dotychczasowy krok w sekundach. Panel pod polem korzysta ze wspólnej obsługi Wstecz. Nie zmienia modelu czasu ani F1.

F3: `PoleKwoty` obsługuje PLN, EUR, USD, GBP, CHF, CZK i UAH (dwa miejsca dziesiętne), przecinek i kropkę. Nie zaokrągla nadmiarowych cyfr. Zapis do liczbowego modelu odrzuca wartości, których nie można zachować dokładnie.

Transakcja nadal przechowuje `kwota: number`; opcjonalne `waluta` zawiera kod ISO. Brak waluty oznacza PLN. Powiązane transakcje z innych modułów, rat i płatności stałych pozostają PLN. Budżety, cash flow i analizy obejmują PLN, inne waluty mają osobne podsumowania. Sumowanie transakcji używa dziesiętnych zapisów i BigInt, bez dodawania ułamków binarnych. Kursy i przewalutowanie są poza zakresem.

Nowa własna kwota rejestru zapisuje `{ kwota: "125.50", waluta: "EUR" }`; zapis dziesiętny chroni precyzję. Starsze wartości liczbowe są odczytywane jako PLN; obiekt powstaje dopiero przy zapisie formularza. Systemowe pola bez zadeklarowanego `kluczWaluty` pozostają PLN. Nie zmieniono indeksów, wersji Dexie ani protokołu synchronizacji. Pełne rekordy i nowe opcjonalne dane przechodzą przez dotychczasowy zapis lokalny, transport oraz backup z `passthrough`.

Testy IndexedDB i UI działają na syntetycznych danych. Do sprawdzenia na Samsungu: klawiatura, rozwijanie godzin/minut w modalu, Wstecz, pole widoczne nad panelem, waluty i przecinek, zapis offline i odczyt po ponownym uruchomieniu. Nie wykonano publikacji APK ani wdrożenia.

F4: `PoleLiczbowe` obsługuje `liczba` i dawny `number`, przecinek/kropkę, liczby ujemne, minimum, maksimum, krok i puste wartości. Litery i błędne wklejenia są odrzucane w całości z blokadą zapisu i polskim komunikatem. Wpisany separator pozostaje widoczny; model otrzymuje dotychczasową liczbę. Utrata cyfr przy konwersji blokuje zapis. Historyczne liczby w notacji wykładniczej są rozwijane dziesiętnie do edycji.

Definicja pola może deklarować `jednostka`, `min`, `max`, `krok`; opcjonalne metadane nie zmieniają znaczenia rekordów, schematu bazy ani formatu backupu. Własne właściwości liczbowe mogą otrzymać jednostkę w dotychczasowym oknie tworzenia. Jednostka z etykiety nie jest powtarzana przy polu. Starszy `number` zachowuje domyślny krok 1; jawny krok ma pierwszeństwo. `liczba` bez kroku dopuszcza dowolny dokładnie zapisywalny ułamek. Przebiegi w formularzu samochodu mają krok 0,1 km, paliwo 0,01 l. Brak konwersji jednostek. F1–F3 zachowują swoje kontrolki.

Próba F4 na Samsungu: wpisz `125430,5` km i `42,75` l, sprawdź brak podwójnego km, klawiaturę dla dodatnich i ujemnych wartości, odrzucenie liter, granice/krok oraz odczyt po ponownym uruchomieniu offline. Testy automatyczne nie stanowią fizycznej akceptacji urządzenia.
