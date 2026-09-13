# Raspberry Pi — prywatne wdrożenie HTTPS

## Architektura

Istniejący proces Node.js obsługuje build Reacta, konta, synchronizację, Echo i `GET /health` na porcie `8787`. Docelowo `HOST=127.0.0.1` ogranicza proces do loopbacku, a Tailscale Serve przekazuje prywatny adres `https://<urządzenie>.<tailnet>.ts.net` i automatycznie zapewnia certyfikat TLS. Dostęp mają tylko urządzenia dopuszczone do tailnetu; nie używamy publicznego Tailscale Funnel ani port forwardingu.

Przejściowo, dopóki APK 1.0.8 używa `http://192.168.0.116:8787`, działająca instancja zachowuje `HOST=0.0.0.0` i dostęp z zaufanego LAN. Aktualizacja skryptem nie zmienia tej wartości. Migracja telefonu do Tailscale/HTTPS i późniejsze przełączenie na loopback są osobnym etapem.

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

W `/etc/ogarniacz/ogarniacz.env` ustaw długi, losowy `OWNER_BOOTSTRAP_TOKEN`. Utwórz pierwsze konto Właściciela, zapisz jednorazowe kody odzyskiwania poza Raspberry Pi, potem usuń token z env i zrestartuj usługę. `SYNC_ACCESS_KEY` pozostaw pusty; jest potrzebny tylko przejściowo dla starego APK 1.0.7, dopóki urządzenie nie zaloguje się na konto. Sekretów nie zapisuj w repozytorium.

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
curl --fail http://127.0.0.1:8787/health
curl --fail https://NAZWA-URZADZENIA.TAILNET.ts.net/health
```

Po restarcie Raspberry Pi sprawdź `systemctl is-active ogarniacz tailscaled`, `tailscale serve status` oraz oba healthchecki. SQLite pozostaje w `data/ogarniacz.sqlite`; restart usług nie usuwa danych.

## Aktualizacja instancji

```bash
cd ~/apps/Ogarniacz
chmod +x scripts/deploy-rpi.sh
./scripts/deploy-rpi.sh
```

Skrypt zatrzymuje się wyłącznie przy zmianach w śledzonych plikach Git; ignorowane dane lokalne, w tym `data/`, nie blokują aktualizacji. Następnie używa `git pull --ff-only`, wykonuje `npm ci` i produkcyjny build frontendu oraz serwera.

Przed restartem porównuje `deploy/rpi/ogarniacz.service` z `/etc/systemd/system/ogarniacz.service`. Zmienioną jednostkę instaluje z trybem `0644`, wykonuje `systemctl daemon-reload`, zapewnia `systemctl enable ogarniacz` i restartuje usługę. Healthcheck jest ponawiany maksymalnie 15 razy co sekundę. Sukces wymaga HTTP 200 oraz JSON-u z `status: ok`, `service: ogarniacz-api` i `database: connected`; po niepowodzeniu skrypt pokazuje ostatnie 100 wpisów `journalctl -u ogarniacz`.

`/etc/ogarniacz/ogarniacz.env` nigdy nie jest tworzony ani nadpisywany podczas aktualizacji. Skrypt porównuje jedynie nazwy wymaganych wpisów z plikiem przykładowym i ostrzega o brakujących nazwach bez wypisywania wartości. `OWNER_BOOTSTRAP_TOKEN`, `SYNC_USER_ID` i `SYNC_ACCESS_KEY` pozostają opcjonalne i nie wywołują ostrzeżenia. Nowe wymagane wartości trzeba uzupełnić ręcznie. Skrypt nie wykonuje resetu Git, nie usuwa `data/ogarniacz.sqlite`, konfiguracji kont ani Tailscale.

Obecne APK 1.0.8 łączy się bezpośrednio z `http://192.168.0.116:8787`, dlatego na działającej instancji pozostaw dotychczasowe `HOST=0.0.0.0`, dopóki telefon nie zostanie osobno zmigrowany do Tailscale/HTTPS. `deploy-rpi.sh` nie zmienia `HOST` ani żadnej innej wartości w live env. Wartość `HOST=127.0.0.1` z przykładu dotyczy docelowej konfiguracji dostępnej wyłącznie przez Tailscale Serve.

## Router i firewall

Nie konfiguruj port forwardingu i nie udostępniaj `8787` poza zaufanym LAN. Podczas przejściowego `HOST=0.0.0.0` ogranicz port regułami firewalla do sieci lokalnej wymaganej przez APK 1.0.8. Po migracji telefonu ustawienie `HOST=127.0.0.1` zablokuje surowy port, a Tailscale Serve oraz reguły dostępu tailnetu staną się jedyną zewnętrzną drogą do aplikacji.
