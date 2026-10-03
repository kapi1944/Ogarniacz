#!/usr/bin/env bash
set -Eeuo pipefail

# Jedyny zapis kanału stabilnego, po weryfikacji wszystkich wymaganych artefaktów.
CEL="${1:?Wymagany zatwierdzony commit}"
[[ "$CEL" =~ ^[0-9a-f]{40}$ ]] || exit 1
git cat-file -e "$CEL^{commit}"
git fetch --no-tags origin main:refs/remotes/origin/main
git merge-base --is-ancestor "$CEL" origin/main
ZDALNY="$(git ls-remote origin refs/heads/rpi-stable | cut -f1)"
if [[ -n "$ZDALNY" ]]; then
  git fetch --no-tags origin rpi-stable:refs/remotes/origin/rpi-stable
  git merge-base --is-ancestor origin/rpi-stable "$CEL" || {
    echo 'rpi-stable nie jest przodkiem zatwierdzanego commita; bez cofania historii.' >&2
    exit 1
  }
fi
# Zwykły push dodatkowo chroni przed równoległym przesunięciem gałęzi.
git push origin "$CEL:refs/heads/rpi-stable"
