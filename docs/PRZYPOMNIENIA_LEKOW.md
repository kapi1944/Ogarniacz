# Health 2.0 — etap 3B

Podstawa: lokalny `main`, etap 3A `87953c3`. Zmiany PWA `462af63` i powiadomień synchronizacji `a82ed0c` były już przodkami lokalnego HEAD. Zachowano ich działanie i aktywację aktualizacji przez użytkownika.

## Planowanie i decyzje

`uzgodnijPrzypomnieniaLekow` rozszerza istniejące przypomnienia, a dostarczanie pozostaje w `SilnikPrzypomnien` → `NotificationService` → istniejący harmonogram Androida lub kanał przeglądarkowy. Nie dodano drugiego schedulera. `generujDawkiDnia` wybiera wersję według dokładnej chwili wystąpienia, również dla zapisanych przyszłych wersji. Plan obejmuje 7 lokalnych dat od dnia uzgodnienia oraz daty istniejących aktywnych i odroczonych dawek. Po starcie, wznowieniu, zmianie danych oraz co minutę aplikacja uzgadnia plan. Powtórne uzgodnienie nie zapisuje identycznych rekordów ani duplikatów outboxu.

Alarmy zachowują ID wystąpień 3A, pełny czas i wersję schematu; powtórzone jesienne godziny interwałowe mają oddzielne alarmy. Wiosenne nieistniejące godziny są pomijane zgodnie z generatorem 3A. Nie dodano nowej polityki dla konkretnych godzin ani nie zmieniono wersjonowania.

Zmiana schematu, zakończenie harmonogramu, dezaktywacja leku i decyzje o dawce zmieniają projekcję przypomnień. Natywne uzgodnienie anuluje stare alarmy i planuje nowe. Rekordy przypomnień, historyczne przyjęcia i ruchy zapasu nie są usuwane. Cofnięcie decyzji ponownie uaktywnia przypomnienie zgodnie z bieżącym dziennikiem. Odroczenie przez północ zachowuje pierwotną datę i ID wystąpienia.

Akcje „Przyjęto”, „Odroczono”, „Pominięto” na Androidzie otwierają właściwy formularz z potwierdzeniem. Zwykłe kliknięcie oraz kliknięcie PWA otwierają ekran konkretnej dawki. Przed otwarciem akcji natywnej, w widoku i ponownie wewnątrz transakcji zapisu sprawdzane są aktualny schemat oraz stan dziennika. Spóźnione dostarczenie nie nadpisuje odroczenia. Ponowne kliknięcie nie zużywa zapasu. Zakończenie ogólnego przypomnienia ani zamknięcie powiadomienia nie potwierdza przyjęcia.

Przyjęcie przechodzi przez usługę 2A: rzeczywista ilość i czas, dziennik, ruch zapasu i outbox są atomowe. Niedobór wymaga osobnego potwierdzenia rozbieżności; nie tworzymy dostawy. Potwierdzanie Echo z 2B pozostaje niezmienione. Potwierdzenie z innego urządzenia jest uwzględniane po dotarciu aktualnego dziennika przez istniejącą synchronizację; aplikacja nie zna jeszcze nieodebranych decyzji urządzenia offline.

## Platformy i interfejs

Android korzysta z dotychczasowego pluginu Local Notifications, kanałów, sprawdzania zgody, dokładnych alarmów z istniejącym fallbackiem i odtwarzania alarmów przez dotychczasowe komponenty natywne. Nie dodano pluginu, uprawnień ani Android Web OTA. Użytkownik powinien otworzyć aplikację co najmniej raz w tygodniu, aby uzupełnić plan. Tryb oszczędzania baterii, odebranie zgód lub wymuszone zatrzymanie aplikacji mogą opóźniać albo blokować alarmy. Dostarczenia po ubiciu procesu i restarcie telefonu nie potwierdzono fizycznie. Udostępnienie zmian Androida wymaga nowego podpisanego APK; nie wykonano wydania.

PWA podczas działania aplikacji dostarcza przez aktywny istniejący service worker (`showNotification`), a gdy go brak — przez Notification API. Do Workbox dodano wyłącznie obsługę kliknięcia; nie planuje ona alarmów w tle. Timery przeglądarki mogą być ograniczane również w tle. Całkowicie zamknięta PWA nie ma gwarantowanych alarmów. Nie dodano push ani serwera powiadomień.

Widok Zdrowie pokazuje najbliższą dawkę i termin/status przypomnienia, odroczenie oraz dawki wymagające uwagi. Przełącznik korzysta z istniejącego globalnego ustawienia powiadomień; link prowadzi do dotychczasowych preferencji, zgód i ukrywania szczegółów zdrowotnych. Ukrywanie nazwy leku działa na obu platformach.

## Zmienione pliki

- Model i zapis: `src/domain/typy.ts`, `src/services/LekiService.ts`, `src/services/PrzypomnieniaLekow.ts`, `docs/DATA.md`.
- Silnik i Android: `src/app/SilnikPrzypomnien.tsx`, `src/platform/NotificationService.ts`, `src/platform/HarmonogramPrzypomnienAndroid.ts`, `src/platform/NawigacjaPlatformy.tsx`, `src/platform/typy.ts`, `src/platform/trasy.ts`.
- Widok: `src/modules/zdrowie/WidokiZdrowia.tsx`, `src/modules/zdrowie/PrzypomnieniaDawek.tsx`.
- PWA: `public/powiadomienia-sw.js`, `vite.config.ts`, `scripts/pwa-smoke.mjs`.
- Testy: `src/services/PrzypomnieniaLekow.test.ts`, `src/platform/NotificationService.test.ts`, `scripts/powiadomienia-sw.test.mjs`, `src/app/SilnikPrzypomnien.test.tsx`, `src/modules/zdrowie/WidokiZdrowia.test.tsx`.
- Dokumentacja: ten plik.

## Checklista Samsung — do wykonania na urządzeniu

Walidacja lokalna: 135 testów Vitest w 10 bezpośrednio związanych plikach oraz 2 testy kliknięć service workera (Node). Typecheck, build web/PWA, smoke PWA i `git diff --check` przeszły. Lint zakończył się bez błędów, z ostrzeżeniami istniejącego kodu. Build wykonano dla weryfikacji importu obsługi powiadomień do wygenerowanego service workera. Nie wykonano pełnej regresji repo ani testu telefonu, sesji drugiego urządzenia lub produkcyjnej instalacji PWA.

1. Na APK zawierającym zmianę włącz powiadomienia; sprawdź kanał Zdrowie oraz zgody na dokładne alarmy. Zaplanuj dwa leki na tę samą najbliższą godzinę i sprawdź dwa alarmy przy zablokowanym ekranie oraz aplikacji w tle.
2. Użyj „Przyjęto”; sprawdź formularz, rzeczywistą ilość, wpis dziennika i jednorazowe zużycie. Kliknij tę samą akcję ponownie; sprawdź odrzucenie. Zamknij inny alarm bez decyzji — dziennik ma pozostać bez przyjęcia.
3. Odrocz dawkę przez północ; sprawdź nowy termin i pierwotne ID. Pomiń inną dawkę; sprawdź anulowanie alarmu bez zużycia. Cofnij przyjęcie; sprawdź zwrot faktycznie zużytej ilości i ponowne przypomnienie.
4. Zmień schemat od konkretnej przyszłej chwili, potem wyłącz lek. Sprawdź zastąpienie/anulowanie alarmów, odrzucenie wcześniej wyświetlonych akcji oraz zachowanie historii. Sprawdź niedobór z jawnym potwierdzeniem rozbieżności.
5. Uruchom ponownie aplikację i telefon; sprawdź brak duplikatów oraz dostarczenie po restarcie. Powtórz bez dokładnych alarmów i z ograniczeniami baterii. Wyniki zapisuj osobno, bez utożsamiania ich z testami automatycznymi.
6. Włącz ukrywanie szczegółów i sprawdź ekran blokady. Potwierdź dawkę na drugim urządzeniu, zsynchronizuj i spróbuj starej akcji na Samsungu — nie może nadpisać nowego stanu. Dla interwału przy jesiennym cofnięciu czasu sprawdź oddzielne wystąpienia obu godzin.
