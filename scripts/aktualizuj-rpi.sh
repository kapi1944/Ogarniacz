#!/usr/bin/env bash
set -Eeuo pipefail

KATALOG=/home/kacper/apps/Ogarniacz
KATALOG_STANU="$KATALOG/data/aktualizacja-rpi"
mkdir -p "$KATALOG_STANU"
exec 9>"$KATALOG_STANU/blokada"
if ! flock -n 9; then exit 0; fi
cd "$KATALOG"

zapisz_stan() {
  printf '%s|%s|%s|%s\n' "$1" "$2" "${3:-}" "${4:-}" > "$KATALOG_STANU/status.tmp"
  mv -f "$KATALOG_STANU/status.tmp" "$KATALOG_STANU/status"
  printf 'Aktualizacja Raspberry: %s — %s\n' "$1" "$2"
}

blad() {
  zapisz_stan error "$1" "${CEL:-}" blad
  exit 1
}
trap 'blad "Nieoczekiwany błąd aktualizatora."' ERR

czyste_repo() {
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || blad 'Śledzone pliki mają lokalne zmiany; aktualizacja zatrzymana.'
  [[ "$(git branch --show-current)" == main ]] || blad 'Repozytorium musi być na gałęzi main.'
}

zbuduj() {
  zapisz_stan installing 'Instalowanie zależności.' "${CEL:-}"
  npm ci --silent >/dev/null 2>&1 || return 1
  zapisz_stan building 'Budowanie aplikacji.' "${CEL:-}"
  npm run build:production --silent >/dev/null 2>&1
}

restart_i_zdrowie() {
  zapisz_stan restarting 'Restart usługi i kontrola healthchecku.' "${CEL:-}"
  sudo -n /usr/bin/systemctl restart ogarniacz.service || return 1
  for ((proba=1; proba<=15; proba++)); do
    if curl --silent --fail --max-time 2 http://127.0.0.1:8787/health | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const x=JSON.parse(s);process.exit(x.status==="ok"&&x.service==="ogarniacz-api"&&x.database==="connected"?0:1)}catch{process.exit(1)}})' ; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cofnij() {
  zapisz_stan rollback 'Przywracanie poprzedniego commita i builda.' "${CEL:-}"
  czyste_repo
  [[ "$(git rev-parse HEAD)" == "$CEL" ]] || blad 'HEAD zmienił się po aktualizacji; rollback wymaga interwencji.'
  git reset --keep "$POPRZEDNI" >/dev/null 2>&1 || blad 'Rollback zatrzymany przez lokalne pliki; wymagana interwencja.'
  zbuduj || blad 'Rollback przywrócił commit, ale build nie przeszedł.'
  restart_i_zdrowie || blad 'Rollback zbudowany, ale healthcheck nadal nie przechodzi.'
  zapisz_stan success 'Przywrócono poprzednią wersję.' "$CEL"
}

case "${1:-}" in
  check|update)
    zapisz_stan checking 'Sprawdzanie repozytorium.'
    czyste_repo
    POPRZEDNI="$(git rev-parse --verify HEAD)"
    zapisz_stan downloading/fetching 'Pobieranie origin/main.'
    git fetch --no-tags origin main:refs/remotes/origin/main >/dev/null 2>&1 || blad 'Nie udało się pobrać origin/main.'
    CEL="$(git rev-parse --verify refs/remotes/origin/main)"
    git merge-base --is-ancestor "$POPRZEDNI" "$CEL" || blad 'origin/main nie jest następcą aktualnego commita.'
    czyste_repo
    if [[ "$1" == check ]]; then
      if [[ "$POPRZEDNI" == "$CEL" ]]; then zapisz_stan idle 'Wersja jest aktualna.' "$CEL"; else zapisz_stan idle 'Dostępna jest nowsza wersja.' "$CEL"; fi
      exit 0
    fi
    [[ "$POPRZEDNI" != "$CEL" ]] || { zapisz_stan success 'Wersja jest już aktualna.' "$CEL"; exit 0; }
    printf '%s\n%s\n' "$POPRZEDNI" "$CEL" > "$KATALOG_STANU/poprzedni.tmp"
    mv -f "$KATALOG_STANU/poprzedni.tmp" "$KATALOG_STANU/poprzedni"
    git merge --ff-only --quiet "$CEL" >/dev/null 2>&1 || blad 'Scalenie zatrzymane; lokalne pliki mogą kolidować z origin/main.'
    if ! zbuduj; then
      cofnij
      blad 'Build nowej wersji nie przeszedł; przywrócono poprzednią wersję.'
    fi
    if ! restart_i_zdrowie; then
      cofnij
      blad 'Healthcheck nowej wersji nie przeszedł; przywrócono poprzednią wersję.'
    fi
    zapisz_stan success 'Aktualizacja zakończona.' "$CEL"
    ;;
  rollback)
    [[ -f "$KATALOG_STANU/poprzedni" ]] || blad 'Brak zapisanego poprzedniego commita.'
    mapfile -t COMMITY < "$KATALOG_STANU/poprzedni"
    POPRZEDNI="${COMMITY[0]:-}"
    CEL="${COMMITY[1]:-}"
    [[ "$POPRZEDNI" =~ ^[0-9a-f]{40}$ && "$CEL" =~ ^[0-9a-f]{40}$ ]] || blad 'Niepoprawny zapis rollbacku.'
    cofnij
    ;;
  *) blad 'Nieznana operacja aktualizatora.' ;;
esac
