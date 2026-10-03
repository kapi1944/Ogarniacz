#!/usr/bin/env bash
set -Eeuo pipefail

KATALOG=/home/kacper/apps/Ogarniacz
KATALOG_STANU="$KATALOG/data/aktualizacja-rpi"
PLIK_ENV=/etc/ogarniacz/ogarniacz.env
mkdir -p "$KATALOG_STANU"
exec 9>"$KATALOG_STANU/blokada"
if ! flock -n 9; then exit 1; fi
cd "$KATALOG"
# Helper pozostaje dostępny także po przywróceniu commita sprzed tej migracji.
if [[ "${BASH_SOURCE[0]}" != "$KATALOG_STANU/aktualizuj-rpi.sh" ]]; then
  cp "$KATALOG/scripts/rpi-bezpieczenstwo.mjs" "$KATALOG_STANU/rpi-bezpieczenstwo.mjs"
  cp "${BASH_SOURCE[0]}" "$KATALOG_STANU/aktualizuj-rpi.sh"
fi
POMOCNIK="$KATALOG_STANU/rpi-bezpieczenstwo.mjs"
KATALOG_BUILD=''
WYMAGA_ROLLBACK=0
URUCHOMIONO_NOWY=0
KATALOG_ZAPASU="$KATALOG_STANU/runtime-poprzedni"

zapisz_stan() {
  printf '%s|%s|%s|%s\n' "$1" "$2" "${3:-}" "${4:-}" > "$KATALOG_STANU/status.tmp"
  mv -f "$KATALOG_STANU/status.tmp" "$KATALOG_STANU/status"
  printf 'Aktualizacja Raspberry: %s — %s\n' "$1" "$2"
}

blad() {
  zapisz_stan error "$1" "${CEL:-}" blad
  exit 1
}

czyste_repo() {
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || blad 'Śledzone pliki mają lokalne zmiany; aktualizacja zatrzymana.'
  [[ "$(git branch --show-current)" == main ]] || blad 'Repozytorium musi być na gałęzi main.'
}

zdrowy() {
  curl --silent --fail --max-time 2 http://127.0.0.1:8787/health | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const x=JSON.parse(s);process.exit(x.status==="ok"&&x.service==="ogarniacz-api"&&x.database==="connected"?0:1)}catch{process.exit(1)}})'
}

preflight() {
  czyste_repo
  git cat-file -e "$CEL^{commit}" || { POWOD='Commit docelowy nie istnieje.'; return 1; }
  [[ -f "$PLIK_ENV" ]] || { POWOD='Brak /etc/ogarniacz/ogarniacz.env.'; return 1; }
  systemctl is-active --quiet tailscaled || { POWOD='Usługa tailscaled nie działa.'; return 1; }
  if ! tailscale serve status --json 2>/dev/null | node "$POMOCNIK" preflight "$KATALOG" "$PLIK_ENV" 2>/dev/null; then
    POWOD='Preflight HOST/CORS, ścieżek danych lub Tailscale Serve nie przeszedł.'; return 1
  fi
  [[ -f "$KATALOG/dist/index.html" && -f "$KATALOG/dist-server/main.js" && -d "$KATALOG/node_modules" ]] || { POWOD='Obecny runtime jest niekompletny.'; return 1; }
  zdrowy || { POWOD='Obecny backend nie jest zdrowy; aktualizacja zatrzymana.'; return 1; }
}

zbuduj() {
  KATALOG_BUILD="$(mktemp -d "$KATALOG_STANU/build.XXXXXX")" || return 1
  git archive "$CEL" | tar -x -C "$KATALOG_BUILD" || { POWOD='Nie udało się przygotować commita do builda.'; return 1; }
  zapisz_stan installing 'Instalowanie zależności w katalogu przygotowawczym.' "$CEL"
  (cd "$KATALOG_BUILD" && npm ci --silent) >/dev/null 2>&1 || { POWOD='Instalacja zależności npm ci nie przeszła.'; return 1; }
  zapisz_stan building 'Budowanie aplikacji w katalogu przygotowawczym.' "$CEL"
  (cd "$KATALOG_BUILD" && GITHUB_SHA="$CEL" npm run build:production --silent) >/dev/null 2>&1 || { POWOD='Build produkcyjny nie przeszedł.'; return 1; }
  [[ -f "$KATALOG_BUILD/dist/index.html" && -f "$KATALOG_BUILD/dist-server/main.js" && -d "$KATALOG_BUILD/node_modules" ]] || { POWOD='Build nie przygotował kompletnego runtime.'; return 1; }
}

restart_i_zdrowie() {
  zapisz_stan restarting 'Restart usługi i kontrola healthchecku.' "${CEL:-}"
  sudo -n /usr/bin/systemctl restart ogarniacz.service || { POWOD='Restart ogarniacz.service nie przeszedł.'; return 1; }
  for ((proba=1; proba<=15; proba++)); do
    if zdrowy; then return 0; fi
    sleep 1
  done
  POWOD='Healthcheck nie wrócił po restarcie.'
  return 1
}

cofnij() {
  zapisz_stan rollback 'Przywracanie poprzedniego commita, runtime i snapshotu.' "${CEL:-}"
  czyste_repo
  [[ "$(git rev-parse HEAD)" == "$CEL" || "$(git rev-parse HEAD)" == "$POPRZEDNI" ]] || blad 'HEAD zmienił się; rollback wymaga interwencji.'
  sudo -n /usr/bin/systemctl stop ogarniacz.service || blad 'Nie udało się zatrzymać backendu do rollbacku.'
  systemctl is-active --quiet ogarniacz.service && blad 'Backend nadal działa; baza nie została przywrócona.'
  if [[ "$URUCHOMIONO_NOWY" == 1 ]]; then
    [[ -f "$KATALOG_STANU/snapshot" ]] || blad 'Brak snapshotu rollbacku; wymagana interwencja.'
    SNAPSHOT="$(cat "$KATALOG_STANU/snapshot")"
    [[ "$SNAPSHOT" == "$POPRZEDNI"-*.sqlite ]] || blad 'Snapshot nie odpowiada poprzedniemu commitowi.'
    node "$POMOCNIK" restore "$KATALOG" "$SNAPSHOT" >/dev/null 2>&1 || blad 'Nie udało się przywrócić snapshotu; backend pozostaje zatrzymany.'
  fi
  git reset --keep "$POPRZEDNI" >/dev/null 2>&1 || blad 'Rollback zatrzymany przez lokalne pliki.'
  for katalog in dist dist-server node_modules; do
    if [[ -d "$KATALOG_ZAPASU/$katalog" ]]; then
      rm -rf "$KATALOG/$katalog"
      mv "$KATALOG_ZAPASU/$katalog" "$KATALOG/$katalog" || blad 'Nie udało się przywrócić runtime; wymagana interwencja.'
    fi
  done
  restart_i_zdrowie || blad "Rollback przywrócił kod i bazę, ale $POWOD Wymagana interwencja administratora."
  WYMAGA_ROLLBACK=0
  rm -f "$KATALOG_STANU/uruchomiono"
  zapisz_stan success 'Przywrócono poprzednią wersję.' "$CEL"
}

awaria() {
  trap - ERR
  if [[ "$WYMAGA_ROLLBACK" == 1 ]]; then cofnij; fi
  blad 'Nieoczekiwany błąd aktualizatora.'
}
trap awaria ERR
trap 'if [[ -n "$KATALOG_BUILD" ]]; then rm -rf "$KATALOG_BUILD"; fi' EXIT

case "${1:-}" in
  auto|check|update)
    AKCJA="$1"
    if [[ "$AKCJA" == auto ]]; then
      if node "$POMOCNIK" auto "$KATALOG" "$PLIK_ENV" 2>/dev/null; then AKCJA=update
      else
        KOD=$?
        [[ "$KOD" == 2 ]] && exit 0
        blad 'Nie udało się odczytać konfiguracji automatycznych aktualizacji.'
      fi
    fi
    zapisz_stan checking 'Sprawdzanie repozytorium.'
    czyste_repo
    POPRZEDNI="$(git rev-parse --verify HEAD)"
    zapisz_stan downloading/fetching 'Pobieranie origin/rpi-stable.'
    git fetch --no-tags origin rpi-stable:refs/remotes/origin/rpi-stable >/dev/null 2>&1 || blad 'Brak lub niedostępny rpi-stable; main nie jest kanałem aktualizacji.'
    CEL="$(git rev-parse --verify refs/remotes/origin/rpi-stable)"
    git merge-base --is-ancestor "$POPRZEDNI" "$CEL" || blad 'origin/rpi-stable nie jest następcą aktualnego commita.'
    czyste_repo
    if [[ "$AKCJA" == check ]]; then
      if [[ "$POPRZEDNI" == "$CEL" ]]; then zapisz_stan idle 'Wersja jest aktualna.' "$CEL"; else zapisz_stan idle 'Dostępna jest nowsza wersja.' "$CEL"; fi
      exit 0
    fi
    [[ "$POPRZEDNI" != "$CEL" ]] || { zapisz_stan success 'Wersja jest już aktualna.' "$CEL"; exit 0; }
    preflight || blad "$POWOD"
    zbuduj || blad "$POWOD Poprzedni runtime nadal działa."
    preflight || blad "$POWOD Poprzedni runtime nadal działa."
    [[ "$(git rev-parse HEAD)" == "$POPRZEDNI" ]] || blad 'HEAD zmienił się podczas builda.'
    printf '%s\n%s\n' "$POPRZEDNI" "$CEL" > "$KATALOG_STANU/poprzedni.tmp"
    mv -f "$KATALOG_STANU/poprzedni.tmp" "$KATALOG_STANU/poprzedni"
    rm -f "$KATALOG_STANU/uruchomiono"
    rm -rf "$KATALOG_ZAPASU"
    mkdir -p "$KATALOG_ZAPASU"
    # Od tego miejsca stary backend jest zatrzymany: snapshot nie traci ostatnich zapisów WAL.
    sudo -n /usr/bin/systemctl stop ogarniacz.service || blad 'Nie udało się zatrzymać backendu przed snapshotem.'
    systemctl is-active --quiet ogarniacz.service && blad 'Backend nadal działa; przełączenie zatrzymane.'
    WYMAGA_ROLLBACK=1
    if ! SNAPSHOT="$(node "$POMOCNIK" backup "$KATALOG" "$POPRZEDNI" 2>/dev/null)"; then
      restart_i_zdrowie || blad 'Snapshot nie powstał i nie udało się wznowić poprzedniego backendu.'
      blad 'Snapshot nie powstał; poprzedni runtime pozostaje aktywny.'
    fi
    printf '%s\n' "$SNAPSHOT" > "$KATALOG_STANU/snapshot.tmp"
    mv -f "$KATALOG_STANU/snapshot.tmp" "$KATALOG_STANU/snapshot"
    git merge --ff-only --quiet "$CEL" >/dev/null 2>&1 || { cofnij; blad 'Scalenie zatrzymane; przywrócono poprzedni runtime.'; }
    for katalog in dist dist-server node_modules; do
      [[ ! -d "$KATALOG/$katalog" ]] || mv "$KATALOG/$katalog" "$KATALOG_ZAPASU/$katalog"
      mv "$KATALOG_BUILD/$katalog" "$KATALOG/$katalog"
    done
    printf '%s\n' "$CEL" > "$KATALOG_STANU/uruchomiono"
    URUCHOMIONO_NOWY=1
    if ! restart_i_zdrowie; then
      POWOD_AKTUALIZACJI="$POWOD"
      cofnij
      blad "$POWOD_AKTUALIZACJI Przywrócono poprzednią wersję i bazę."
    fi
    WYMAGA_ROLLBACK=0
    if [[ -f "$KATALOG/scripts/aktualizuj-rpi.sh" ]]; then
      cp "$KATALOG/scripts/aktualizuj-rpi.sh" "$KATALOG_STANU/aktualizuj-rpi.sh.tmp"
      mv -f "$KATALOG_STANU/aktualizuj-rpi.sh.tmp" "$KATALOG_STANU/aktualizuj-rpi.sh"
      cp "$KATALOG/scripts/rpi-bezpieczenstwo.mjs" "$POMOCNIK"
    fi
    zapisz_stan success 'Aktualizacja zakończona.' "$CEL"
    ;;
  rollback)
    [[ -f "$KATALOG_STANU/poprzedni" ]] || blad 'Brak zapisanego poprzedniego commita.'
    mapfile -t COMMITY < "$KATALOG_STANU/poprzedni"
    POPRZEDNI="${COMMITY[0]:-}"
    CEL="${COMMITY[1]:-}"
    [[ "${#COMMITY[@]}" == 2 && "$POPRZEDNI" =~ ^[0-9a-f]{40}$ && "$CEL" =~ ^[0-9a-f]{40}$ && "$POPRZEDNI" != "$CEL" ]] || blad 'Niepoprawny zapis rollbacku.'
    git cat-file -e "$POPRZEDNI^{commit}" && git cat-file -e "$CEL^{commit}" || blad 'Commity rollbacku nie istnieją.'
    git merge-base --is-ancestor "$POPRZEDNI" "$CEL" || blad 'Commity rollbacku nie tworzą poprawnej pary.'
    [[ "$(git rev-parse HEAD)" == "$CEL" ]] || blad 'HEAD zmienił się; rollback wymaga interwencji.'
    [[ -f "$KATALOG_STANU/uruchomiono" && "$(cat "$KATALOG_STANU/uruchomiono")" == "$CEL" && -f "$KATALOG_STANU/snapshot" && -f "$KATALOG_ZAPASU/dist-server/main.js" && -f "$KATALOG_ZAPASU/dist/index.html" && -d "$KATALOG_ZAPASU/node_modules" ]] || blad 'Brak kompletnego stanu bezpiecznego rollbacku.'
    URUCHOMIONO_NOWY=1
    cofnij
    ;;
  *) blad 'Nieznana operacja aktualizatora.' ;;
esac
