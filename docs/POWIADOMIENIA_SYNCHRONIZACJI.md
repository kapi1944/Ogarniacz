# Status i powiadomienia synchronizacji

Istniejący `SyncEngine` nadal obsługuje kolejkę zmian, ponowienia, zapis
pobranych danych i rozstrzyganie konfliktów. Powiadomienia korzystają z wyniku
jego ukończonej operacji, a nie z `/health`. Wywołania współbieżne otrzymują
jeden wynik i jedno podsumowanie. Liczniki nie zawierają treści rekordów.

Synchronizacja działa w tle przy uruchomieniu, odzyskaniu sieci, wznowieniu,
zalogowaniu i trzy sekundy po lokalnej zmianie. Po błędzie połączenia
koordynator ponawia próbę raz na minutę, gdy urządzenie ma sieć. Nie dodano
osobnego silnika ani kolejki. Brak serwera nie blokuje lokalnej pracy.

Status w górnym pasku działa również na Androidzie i prowadzi do Ustawień
→ Synchronizacja. Błąd, wygasła sesja lub konflikt pozostawia trwały komunikat.
Krótkie toasty podsumowują liczbę wysłanych, pobranych i konfliktowych zmian.
Nie ma toastu sukcesu dla operacji bez zmian. Postęp jest pokazywany dopiero
dla dłuższych operacji; powtarzane ostrzeżenia o tym samym problemie są
wyciszane do zmiany problemu albo udanej synchronizacji.

W Ustawieniach → Synchronizacja można włączyć **Systemowe powiadomienia
synchronizacji**. Opcja jest domyślnie wyłączona i zapamiętana tylko na tym
urządzeniu/profilu, poza synchronizowanymi danymi. Zgoda systemowa jest
wywoływana wyłącznie przy świadomym włączeniu. Odmowa nie wyłącza toastów.

Android używa istniejącego Capacitor Local Notifications oraz kanału
`ogarniacz-system`. Powiadomienie ma osobny identyfikator `-1`, bez akcji
„Wykonane” i „Za 15 min”, i nie jest oznaczone jako przypomnienie.
Rekoncyliacja alarmów zdrowotnych go nie usuwa; komunikat synchronizacji
nie anuluje ani nie przeplanowuje tych alarmów. Web/Windows/PWA używa
istniejącego Notification API po zgodzie. Kliknięcie otwiera Ustawienia.
Systemowe komunikaty zawierają tylko liczniki i stałe, bezpieczne opisy
statusu, bez szczegółów medycznych, odpowiedzi serwera ani danych sesji.

Testy lokalne obejmują rzeczywisty `SyncEngine` z IndexedDB testowym,
opóźnione potwierdzenie wysyłki, offline/reconnect, niedostępność serwera,
konflikty, deduplikację oraz odrębność alarmów Androida. Mocki transportu
i API powiadomień nie potwierdzają działania produkcyjnego Raspberry,
systemowego panelu Windows ani fizycznego Androida. Do ręcznej próby:
włącz opcję, zmień lokalny rekord, sprawdź pojedyncze podsumowanie i kanał;
odłącz sieć, zmień rekord, przywróć sieć i sprawdź automatyczne wysłanie.
Zweryfikuj też, że zaplanowany alarm leku pozostał bez zmian.
