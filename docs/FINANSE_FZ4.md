# FZ-4 — lokalne zakupy, produkty i partie

Kontrakt: [Pule i Zobowiązania](FINANSE_PULE_ZOBOWIAZANIA.md). Fundamenty: [FZ-2](FINANSE_FZ2.md), [FZ-3](FINANSE_FZ3.md).

## Obsługa

Formularz Puli udostępnia jawny wybór rodzaju: finansowa lub zakupowa. Istniejące Pule zachowują rodzaj. Po pierwszym fakcie, również później anulowanym, rodzaj i waluta są zablokowane. Pule zakupowe korzystają z dotychczasowych tras `/finanse/pule` i `/finanse/pule/:pulaId`, wpłat, wydatków, archiwum i historii.

W szczegółach Puli zakupowej dostępne są historia zakupów, katalog produktów, szczegóły produktu i partii, dostępne sztuki oraz wartość zapasu. Katalog jest projekcją partii według `produktId`, bez tabeli produktów. Wybór produktu przy kolejnym zakupie zachowuje jego ID i tworzy nowe UUID zakupu i partii. Identyczne nazwy nie scalają produktów automatycznie. Szczegóły partii pokazują pierwotną ilość i koszt, udział kosztów dodatkowych, datę rodzica, korekty, straty i identyfikatory.

Nowy zakup zawiera nazwę, datę, opis, 1–100 partii i do 100 kosztów dodatkowych. Koszt partii podaje się dla całości, bez zaokrąglania ceny jednostkowej. Koszty dostawy, transportu, opakowań, prowizji i inne nazwy korzystają z `alokujKoszt`: proporcja kosztu towaru, przy zerowym koszcie proporcja sztuk, deterministyczne reszty po UUID. Formularz pokazuje sumę i alokację. Cały opłacony zakup tworzy jeden wydatek `operacjeKas`; zerowy koszt nie tworzy płatności. Nie tworzy wydatku osobistego.

Opcjonalne UUID dokumentów wskazują istniejące dokumenty z trwałą ochroną finansową. Nieprawidłowy identyfikator, brak dokumentu lub jego ochrony wycofuje całą transakcję. Wgrywanie plików i aparat pozostają zakresem FZ-8.

## Korekty i integralność

`PuleService` rejestruje zakupy i dopisuje korekty do `zakupyPul`, przez `wTransakcjiFinansowej` i `zapiszGrupeFinansowa`. Zachowuje oryginalne partie, koszty i datę zakupu. Obowiązują kontrola Właściciela i aktywnej bazy profilu, rewizje zakupu/Puli, stabilne ID polecenia, pełna historia i atomowy outbox. Ponowienie po utracie odpowiedzi korzysta z zapisanego podpisu i nie cofa późniejszych zmian. Błędy pozostawiają formularz ze szkicem; wielokrotne kliknięcie nie uruchamia równoległych zapisów.

Korekta ceny zmienia koszt wybranej partii. Korekta kosztów dodatkowych rozdziela podpisaną różnicę na partie, zachowując pierwotne koszty. Obie przeliczają wartość zapasu bez automatycznej dopłaty lub zwrotu gotówki. Rozbieżność wymaga uzasadnienia, podpisanej całkowitej ilości i kosztu dodatkowo przyjętych sztuk. Strata zachowuje historyczny koszt i pokazuje go osobno; formularz wymaga dla niej zmiany kosztu 0.

Pomyłka przyjęcia wymaga dwóch różnych partii tego samego zakupu i przeciwnych zmian ilości. Koryguje przypisanie przyjętych sztuk, zachowując osobny koszt każdej partii; nie jest zwrotem dostawcy ani stratą. Koszt jednostkowy jest przeliczany dla skorygowanej ilości. Pusta partia wymaga zerowego kosztu, a korekta nie może pozostawić niedostępnych sztuk w rozchodach. Daty i korekty oznaczają projekcję jako przeliczoną.

Anulowanie służy błędnemu zapisowi zakupu. Dopisuje korektę wszystkich pozostałych sztuk i kosztu oraz powiązane storno pierwotnego wydatku, pozostawiając oba fakty i historię. Nie jest faktycznym zwrotem od dostawcy. Zakup wykorzystany przez sprzedaż nie może zostać anulowany. Aktywne anulowanie blokuje kolejne korekty i storno wcześniejszych korekt do wycofania anulowania. Storno korekty oznacza ją miękko, a w przypadku anulowania atomowo oznacza także jego operację gotówkową. Ponowne storno innym poleceniem jest odrzucane. Cały graf i projekcja są sprawdzane przed zatwierdzeniem; niedostępne sztuki, błędne kwoty lub awaria historii wycofują wszystkie skutki.

Nie ma migracji: wykorzystywany jest schemat Dexie 21 i istniejący format backupu 3 z sekcją FZ. Pełny backup/restore obejmuje zakupy, partie, koszty, korekty, gotówkę oraz historię. Dane pozostają lokalne i zablokowane w transporcie do FZ-7. Sprzedaż, Zobowiązania i publikacja są poza tym etapem.

## Weryfikacja

`PuleZakupowe.test.ts` i `WidokZakupowPuli.test.tsx` sprawdzają zakup offline, wiele partii, kolejny zakup produktu, podział 1000 groszy na 333/333/334, alokację kosztów, korekty/storna/anulowanie, ujemny stan, idempotencję, rewizje, archiwum, rollback, dokumenty, backup/restore, izolację baz i odmowę Edytora. UI obejmuje zachowanie szkicu i ID po błędzie, blokadę wielokrotnego kliknięcia oraz Wstecz: partia → produkt → Pula → lista.

Celowana regresja finansów obejmuje 11 zestawów, w tym FZ-2/FZ-3, synchronizację F7, osobiste Finanse i Rozliczenia. Typecheck, lint (tylko zastane ostrzeżenia), build frontendu i backendu, 98/98 testów serwera oraz PWA smoke przechodzą. Lokalne testy HTTP i PWA wymagają uruchomienia poza ograniczeniem gniazd sandboxa.

W Chrome sprawdzono zakup, katalog, szczegóły produktu i partii, formularze zakupu i korekty. Oględziny objęły Classic jasny/ciemny, Flat jasny i Luxury jasny/ciemny; Flat ciemny potwierdzono przez DOM i pomiary, ponieważ mechanizm zrzutów przeglądarki przekraczał limit czasu. Pomiary korekty obejmują szerokości 320, 390, około 768, 1280 i 1920 px bez poziomego przepełnienia. Formularze korzystają z tych samych komponentów i tokenów wszystkich platform. Testy przeglądarkowe i CI nie zastępują fizycznej akceptacji Androida, instalatora Windows ani Raspberry Pi. Końcowe liczby testów i wynik CI są raportowane przy zakończeniu zadania. Nie publikować APK, nie aktualizować `rpi-stable` ani urządzeń i nie wdrażać backendu.
