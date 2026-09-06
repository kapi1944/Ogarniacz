# Raspberry Pi — wdrożenie produkcyjne

## Architektura

Jeden proces Node.js obsługuje na porcie `8787` build Reacta z `dist/`, fallback tras SPA oraz istniejące API:

- `GET /health` i `GET /api/health` — healthcheck;
- `GET`/`POST /api/sync/changes` — trwała synchronizacja SQLite;
- `POST /api/echo/message` — istniejący endpoint Echo;
- pozostałe `GET`/`HEAD` — pliki `dist/`; nieistniejące trasy klienckie dostają `index.html`.

Serwer wiąże się z `0.0.0.0`. Port pozostaje `8787`, bo taki adres jest już centralnie zbudowany w Androidzie jako `VITE_SYNC_API_URL=http://192.168.0.116:8787`. Nie używaj Vite ani portu `5173` w produkcji.

Aktualizacje Androida nie są serwowane przez Raspberry Pi: build Androida odczytuje `VITE_ANDROID_UPDATE_MANIFEST_URL`, obecnie wskazujący HTTPS GitHub Releases. Ten mechanizm pozostaje bez zmian.

## Jednorazowa instalacja na Raspberry Pi

Wymagany jest Node.js 24 lub nowszy (`node:sqlite` jest używane przez API) oraz Git. Zaloguj się jako `kacper`, umieść repozytorium w `/home/kacper/apps/Ogarniacz`, a następnie wykonaj:

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

W `/etc/ogarniacz/ogarniacz.env` ustaw prawdziwy, istniejący `SYNC_ACCESS_KEY`, identyczny z kluczem zbudowanym w aplikacji Android. Nie zapisuj tego sekretu w repozytorium. Domyślna usługa zakłada globalnie zainstalowany Node widoczny w `/usr/local/bin` albo `/usr/bin`; jeśli `command -v node` zwróci inną lokalizację, zainstaluj Node globalnie albo popraw wyłącznie `Environment=PATH` w jednostce przed jej instalacją.

Po zmianie adresu LAN zmień tylko centralne wartości: `VITE_SYNC_API_URL` przed kolejnym buildem Androida oraz `CORS_ALLOWED_ORIGINS` na Raspberry Pi. Obecnie oba zachowują `192.168.0.116:8787`.

## Sterowanie i testy na Raspberry Pi

```bash
sudo systemctl start ogarniacz
sudo systemctl stop ogarniacz
sudo systemctl restart ogarniacz
sudo systemctl status ogarniacz
journalctl -u ogarniacz -f
curl --fail http://127.0.0.1:8787/health
curl --fail http://192.168.0.116:8787/health
curl --fail http://192.168.0.116:8787/dzisiaj
```

Test restartu procesu wykonaj bez rebootu: `sudo systemctl restart ogarniacz`, a potem oba healthchecki. Test po restarcie Raspberry: `sudo reboot`; po ponownym połączeniu sprawdź `systemctl is-active ogarniacz` i healthcheck. SQLite pozostaje w `data/ogarniacz.sqlite`; restart usługi nie usuwa danych.

## Aktualizacja instancji

```bash
cd ~/apps/Ogarniacz
chmod +x scripts/deploy-rpi.sh
./scripts/deploy-rpi.sh
```

Skrypt przerywa działanie przy błędzie lub lokalnych zmianach, używa wyłącznie `git pull --ff-only`, instaluje zależności, buduje frontend i serwer, restartuje usługę oraz sprawdza `/health`. Nie wykonuje resetu Git ani nie usuwa danych SQLite.

## LAN, firewall i stały adres

Najbezpieczniej utworzyć rezerwację DHCP w routerze. Na Raspberry odczytaj MAC Wi-Fi:

```bash
cat /sys/class/net/wlan0/address
ip link show wlan0
```

W panelu routera dodaj rezerwację DHCP dla odczytanego MAC: adres `192.168.0.116`, nazwa np. `ogarniacz-rpi`. Router zwykle wymaga MAC, wybranego adresu, opcjonalnie nazwy urządzenia i zapisania konfiguracji. Nie ustawiaj ręcznie bramy, maski ani DNS bez uprzedniego rozpoznania zarządcy sieci.

Najpierw rozpoznaj sieć i firewall, bez zmieniania konfiguracji:

```bash
systemctl is-active NetworkManager
systemctl is-active dhcpcd
systemctl is-active systemd-networkd
sudo ufw status verbose
sudo nft list ruleset
sudo iptables -S
```

Jeśli aktywny firewall blokuje `8787`, otwórz wyłącznie LAN. Dla UFW przykładowo: `sudo ufw allow from 192.168.0.0/24 to any port 8787 proto tcp`. Dla innej maski dostosuj podsieć do faktycznej konfiguracji. Nie konfiguruj port forwarding ani dostępu WAN.