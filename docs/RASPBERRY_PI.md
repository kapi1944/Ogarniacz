# Raspberry Pi — prywatne wdrożenie HTTPS

## Architektura

Istniejący proces Node.js obsługuje build Reacta, konta, synchronizację, Echo i `GET /health` na porcie `8787`. Backend domyślnie używa `HOST=127.0.0.1`, co ogranicza proces do loopbacku, a Tailscale Serve przekazuje prywatny adres `https://<urządzenie>.<tailnet>.ts.net` i automatycznie zapewnia certyfikat TLS. Dostęp mają tylko urządzenia dopuszczone do tailnetu; nie używamy publicznego Tailscale Funnel ani port forwardingu.

Zweryfikowany produkcyjny klient Android korzysta z HTTPS Tailscale i nie wymaga już bezpośredniego dostępu przez LAN. Aktualizacja skryptem nie zmienia `HOST`; istniejącą konfigurację live przełącz ręcznie według procedury „Migracja live na loopback” poniżej.

Ten wariant pasuje do prywatnej aplikacji jednej osoby: telefon i komputer instalują klienta Tailscale, a konto Ogarniacza nadal niezależnie egzekwuje rolę Właściciela/Edytora. Konfiguracja Serve z `--bg` jest trwała po restarcie urządzenia i `tailscale up`. Szczegóły: [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) oraz [instalacja na Linux/Raspberry Pi OS](https://tailscale.com/docs/install/linux).

Własną domenę można później dodać przez osobny reverse proxy z prawidłowym TLS. Nie jest potrzebna do obecnego wdrożenia i nie należy w tym celu otwierać portu `8787`.

## Jednorazowa instalacja

Wymagany jest Node.js 24 lub nowszy, Git i Tailscale. Zaloguj się jako `kacper`, umieść repozytorium w `/home/kacper/apps/Ogarniacz`, a następnie:

```bash
cd ~/apps/Ogarniacz
node --version
npm ci
npm run build:production
sudo install -d -m 0750 -o root -g kacper /etc/ogarniacz
sudo install -m 0640 -o root -g kacper deploy/rpi/ogarniacz.env.example /etc/ogarniacz/ogarniacz.env
sudo nano /etc/ogarniacz/ogarniacz.env
sudo install -m 0644 deploy/rpi/ogarniacz.service /etc/systemd/system/ogarniacz.service
sudo systemctl daemon-reload
sudo systemctl enable --now ogarniacz
```

W `/etc/ogarniacz/ogarniacz.env` ustaw długi, losowy `OWNER_BOOTSTRAP_TOKEN`. Utwórz pierwsze konto Właściciela, zapisz jednorazowe kody odzyskiwania poza Raspberry Pi, potem usuń token z env i zrestartuj usługę. Sekretów nie zapisuj w repozytorium.

Zainstaluj Tailscale z oficjalnego pakietu, dołącz Raspberry Pi, telefon i komputer do tego samego tailnetu, po czym uruchom:

```bash
sudo tailscale up
chmod +x scripts/configure-tailscale-rpi.sh
./scripts/configure-tailscale-rpi.sh
```

Skrypt sprawdza lokalny healthcheck, ustawia trwały prywatny reverse proxy HTTPS, odczytuje nazwę MagicDNS i sprawdza healthcheck przez TLS. Nie uruchamia Funnel. Dodaj zwrócony adres HTTPS do `CORS_ALLOWED_ORIGINS` obok `https://localhost` i ustaw go jako `VITE_SYNC_API_URL` dla Androida. Dla PWA używaj tego samego adresu HTTPS.

## Start, healthcheck i logi

Jednostka `ogarniacz.service` startuje automatycznie, czeka na sieć i Tailscale, zapisuje stdout/stderr do journald, restartuje proces po błędzie i ogranicza zapis do katalogu `data/`.

```bash
sudo systemctl status ogarniacz tailscaled
sudo tailscale serve status
journalctl -u ogarniacz -n 100 --no-pager
zdrowy=false
for proba in {1..15}; do
  if curl --silent --fail --max-time 2 http://127.0.0.1:8787/health | node -e 'let dane="";process.stdin.on("data",czesc=>dane+=czesc);process.stdin.on("end",()=>{try{const wynik=JSON.parse(dane);process.exit(wynik.status==="ok"&&wynik.service==="ogarniacz-api"&&wynik.database==="connected"?0:1)}catch{process.exit(1)}})'; then zdrowy=true; break; fi
  sleep 1
done
test "$zdrowy" = true
curl --fail https://NAZWA-URZADZENIA.TAILNET.ts.net/health
```

Po restarcie Raspberry Pi sprawdź `systemctl is-active ogarniacz tailscaled`, `tailscale serve status` oraz oba healthchecki. SQLite pozostaje w `data/ogarniacz.sqlite`; restart usług nie usuwa danych.

## Aktualizacja instancji — rpi-stable

Repozytorium robocze pozostaje na lokalnym `main`, ale aktualizator pobiera wyłącznie
`origin/rpi-stable`. Brak tej gałęzi daje czytelny błąd; nie ma fallbacku do main.
Kanał zatwierdza workflow **Publikuj Ogarniacza** opisany w `ANDROID_RELEASE.md`.
Nie konfiguruj Pi do aktualizowania się po każdym commicie main. Przy pierwszej
migracji lokalny HEAD musi być przodkiem zatwierdzonego rpi-stable.

Jedna ścieżka: `scripts/aktualizuj-rpi.sh check|update|rollback|auto`, z `flock`,
czystym tracked working tree, kontrolą istniejącego targetu i fast-forward only.
`data/`, pliki użytkownika i `/etc/ogarniacz/ogarniacz.env` nie są czyszczone.
API Właściciela z sesją/CSRF pozostaje domyślnie wyłączone (`RPI_UPDATE_ENABLED=1`
włącza panel ręczny). Status zwraca SHA wdrożenia, `originStable`, dostępność i etap.
UI pokazuje **Raspberry / serwer**; numer package.json jest tylko informacyjny.

### Preflight, build i rollback

Przed przełączeniem aktualizator dwukrotnie sprawdza konfigurację i stan obecnego
backendu: istniejący env, HOST=127.0.0.1, port 8787, pełne HTTPS CORS bez wildcardów,
origin https://localhost, zgodność ścieżek bazy i dist, aktywny tailscaled oraz
prywatny Tailscale Serve kierujący HTTPS do http://127.0.0.1:8787.
Log nie wypisuje wartości sekretów. Build odbywa się z dokładnego target SHA w
izolowanym katalogu w data/aktualizacja-rpi. Błąd preflightu/npm/builda nie zmienia
commita, dotychczasowego dist, danych ani działającej usługi.

Po udanym buildzie i końcowym preflighcie stary backend zostaje zatrzymany.
SQLite backup API w Node 24 tworzy spójny snapshot data/ogarniacz.sqlite, również
ze stronami WAL, i sprawdza integralność. Snapshot jest utrwalony w
`data/aktualizacja-rpi/backups/<stary-SHA>-<czas>-<id>.sqlite`; pozostają 3 ostatnie.
Brak snapshotu wznawia stary backend i blokuje przełączenie.

Dopiero potem następuje fast-forward kodu, zamiana gotowego dist/dist-server/
node_modules i start nowego backendu. Stary runtime pozostaje w prywatnym katalogu
runtime-poprzedni. Nieudany restart/healthcheck zatrzymuje usługę, przywraca snapshot
bazy, poprzedni commit i runtime, a następnie uruchamia stary backend. Przed próbą
startu nowego kodu rollback nie przywraca bazy. Ręczny rollback wymaga kompletnego
zapisanego stanu; brak snapshotu lub runtime wymaga interwencji, zamiast ryzyka
uruchomienia starego kodu na zmigrowanej bazie.

Snapshot oznacza powrót danych do momentu przełączenia. Ręczny rollback po dłuższej
pracy nowej wersji cofa również późniejsze zapisy; wykonuj go świadomie. Twarde
przerwanie procesu podczas przełączenia wymaga kontroli stanu i interwencji na Pi.
Statusy checking/downloading/installing/building/restarting/rollback oraz idle/
success/error pozostają. Healthcheck ma dotychczasowy kontrakt i 15 prób.

### Instalacja jednostek i automatyka

Po wdrożeniu kodu na Pi zainstaluj `ogarniacz-update*.service`, nowy timer i sudoers
(zawiera teraz także stałe polecenie stop backendu):

```bash
mkdir -p data/aktualizacja-rpi
install -m 0750 scripts/aktualizuj-rpi.sh data/aktualizacja-rpi/aktualizuj-rpi.sh
install -m 0640 scripts/rpi-bezpieczenstwo.mjs data/aktualizacja-rpi/rpi-bezpieczenstwo.mjs
sudo install -m 0644 deploy/rpi/ogarniacz-update*.service /etc/systemd/system/
sudo install -m 0644 deploy/rpi/ogarniacz-update-auto.timer /etc/systemd/system/
sudo visudo -cf deploy/rpi/ogarniacz-update.sudoers
sudo install -m 0440 deploy/rpi/ogarniacz-update.sudoers /etc/sudoers.d/ogarniacz-update
sudo systemctl daemon-reload
```

Jednostki uruchamiają zachowaną kopię tego samego aktualizatora w data/aktualizacja-rpi.
Po sukcesie jest odświeżana z zatwierdzonego repozytorium. Dzięki temu rollback kodu
sprzed wprowadzenia rpi-stable nie przywraca aktualizowania z main ani nie odbiera
obsługi snapshotów. Nie jest to drugi algorytm aktualizacji.

Env powinien mieć właściciela root:kacper i tryb 0640. Nie jest automatycznie
nadpisywany. W /etc/ogarniacz/ogarniacz.env ustaw `RPI_AUTO_UPDATE=1`, następnie:

```bash
sudo systemctl enable --now ogarniacz-update-auto.timer
```

Timer sprawdza co 30 minut tylko rpi-stable, uruchamia ten sam updater i korzysta
z tej samej blokady flock. Brak flagi lub 0 daje brak działania automatycznego.
Ręczne aktualizacje nadal działają. Wyłączenie: RPI_AUTO_UPDATE=0 lub
`sudo systemctl disable --now ogarniacz-update-auto.timer`.
Wyłącz stare timery i update.sh; deploy-rpi.sh pozostaje drogą pierwszego bootstrapu,
a nie równoległym aktualizatorem produkcyjnym.

Weryfikacja live jest osobnym krokiem: systemd, tailscaled, Serve, prawdziwy env,
uprawnienia sudoers, flock, snapshot/rollback i oba healthchecki na Pi. Lokalne
testy z atrapami systemd/Tailscale nie są dowodem działającej instalacji.

## Migracja live na loopback

Wykonaj na Raspberry Pi po potwierdzeniu, że wszystkie aktywne urządzenia korzystają z HTTPS Tailscale. Polecenia nie zmieniają originów CORS ani adresu w APK.

```bash
sudo cp -a /etc/ogarniacz/ogarniacz.env "/etc/ogarniacz/ogarniacz.env.backup-$(date +%Y%m%d-%H%M%S)"
sudo sed -i 's/^HOST=0\.0\.0\.0$/HOST=127.0.0.1/' /etc/ogarniacz/ogarniacz.env
sudo systemctl restart ogarniacz
curl --fail http://127.0.0.1:8787/health
sudo tailscale serve status
nazwa_dns="$(sudo tailscale status --json | node -e 'let dane="";process.stdin.on("data",czesc=>dane+=czesc);process.stdin.on("end",()=>process.stdout.write(JSON.parse(dane).Self.DNSName.replace(/\.$/,"")))')"
curl --fail "https://${nazwa_dns}/health"
sudo ss -ltnp 'sport = :8787'
```

Ostatnie polecenie musi pokazać `127.0.0.1:8787` (lub `[::1]:8787`), nigdy adres LAN ani `0.0.0.0`. Z innego urządzenia w tym samym LAN potwierdź niedostępność surowego portu:

```bash
curl --fail --connect-timeout 3 http://ADRES_LAN_RASPBERRY:8787/health && exit 1 || true
```

Sukces oznacza, że działa wyłącznie prywatny adres HTTPS z Tailscale Serve. Jeśli lokalny healthcheck lub HTTPS nie przejdzie, przywróć zapisany plik backupu i zdiagnozuj usługę przed kolejną próbą.

## Router i firewall

Nie konfiguruj port forwardingu ani wyjątków firewalla dla `8787`. `HOST=127.0.0.1` blokuje surowy port, a Tailscale Serve oraz reguły dostępu tailnetu są jedyną zewnętrzną drogą do aplikacji.
