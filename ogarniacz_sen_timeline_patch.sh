#!/usr/bin/env bash
set -Eeuo pipefail

# Ogarniacz — poprawka osi czasu: kompresja wyłącznie snu + „Dojazd”.
# Uruchamiaj w Git Bash na Windows.
# Domyślne repo: /c/GitHub/Projects/Ogarniacz/Ogarniacz

REPO="${1:-/c/GitHub/Projects/Ogarniacz/Ogarniacz}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${REPO}/.ogarniacz-patch-backup/${STAMP}"

fail() {
  echo >&2
  echo "BŁĄD: $*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "Brak git w PATH."
command -v python >/dev/null 2>&1 || fail "Brak polecenia python w PATH."
command -v node >/dev/null 2>&1 || fail "Brak node w PATH."
command -v npm >/dev/null 2>&1 || fail "Brak npm w PATH."

[[ -d "$REPO" ]] || fail "Nie istnieje katalog: $REPO"
[[ -d "$REPO/.git" ]] || fail "To nie wygląda na repo Git: $REPO"
[[ -f "$REPO/package.json" ]] || fail "Brak package.json w: $REPO"

cd "$REPO"

echo "============================================================"
echo " Ogarniacz — patch osi czasu snu"
echo " Repo: $REPO"
echo "============================================================"
echo

echo "[1/7] Stan Git przed zmianami"
git status --short --branch
BEFORE_HEAD="$(git rev-parse HEAD)"
echo "HEAD: $BEFORE_HEAD"
echo

# Nie niszczymy istniejących zmian. Robimy kopię plików, które patch może dotknąć.
mkdir -p "$BACKUP_DIR"
for f in \
  src/modules/pulpit/OsCzasu.tsx \
  src/modules/pulpit/logikaOsiCzasu.ts \
  src/modules/pulpit/logikaOsiCzasu.test.ts \
  src/styles/glowny.css; do
  if [[ -f "$f" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    cp -p "$f" "$BACKUP_DIR/$f"
  fi
done

git diff > "$BACKUP_DIR/worktree-before.patch" || true
git diff --cached > "$BACKUP_DIR/index-before.patch" || true

echo "Kopia bezpieczeństwa: $BACKUP_DIR"
echo

[[ -f src/modules/pulpit/OsCzasu.tsx ]] || fail "Brak src/modules/pulpit/OsCzasu.tsx. Patch jest przeznaczony dla aktualnej architektury Etapu 3."
[[ -f src/modules/pulpit/logikaOsiCzasu.ts ]] || fail "Brak src/modules/pulpit/logikaOsiCzasu.ts. Patch jest przeznaczony dla aktualnej architektury Etapu 3."

echo "[2/7] Dodaję niezależną skalę doby ze snem 50%"
cat > src/modules/pulpit/skalaSnu.ts <<'EOF'
export const DOMYSLNY_POCZATEK_SNU = "22:30";
export const DOMYSLNY_KONIEC_SNU = "06:30";
export const KOMPRESJA_SNU = 0.5;

export interface UstawieniaSnuOsi {
  poczatek: string;
  koniec: string;
}

export const DOMYSLNE_USTAWIENIA_SNU_OSI: UstawieniaSnuOsi = {
  poczatek: DOMYSLNY_POCZATEK_SNU,
  koniec: DOMYSLNY_KONIEC_SNU,
};

const MINUTY_DOBY = 24 * 60;
const OSTATNIA_MINUTA_DOBY = MINUTY_DOBY - 1;
const KLUCZ_USTAWIEN_SNU = "ogarniacz:pulpit:sen-v1";

function ogranicz(minuty: number): number {
  if (!Number.isFinite(minuty)) return 0;
  return Math.max(0, Math.min(OSTATNIA_MINUTA_DOBY, minuty));
}

export function czasNaMinuty(wartosc: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(wartosc ?? "").trim());
  if (!match) return null;
  const godzina = Number(match[1]);
  const minuta = Number(match[2]);
  if (!Number.isInteger(godzina) || !Number.isInteger(minuta) || godzina < 0 || godzina > 23 || minuta < 0 || minuta > 59) {
    return null;
  }
  return godzina * 60 + minuta;
}

export function normalizujUstawieniaSnuOsi(input: unknown): UstawieniaSnuOsi {
  if (!input || typeof input !== "object") return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  const kandydat = input as Partial<UstawieniaSnuOsi>;
  const poczatek = typeof kandydat.poczatek === "string" && czasNaMinuty(kandydat.poczatek) !== null
    ? kandydat.poczatek
    : DOMYSLNY_POCZATEK_SNU;
  const koniec = typeof kandydat.koniec === "string" && czasNaMinuty(kandydat.koniec) !== null
    ? kandydat.koniec
    : DOMYSLNY_KONIEC_SNU;

  // Zakres o zerowej długości nie ma sensu. Wracamy wtedy do bezpiecznego 22:30–06:30.
  if (poczatek === koniec) return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  return { poczatek, koniec };
}

export function pobierzUstawieniaSnuOsi(): UstawieniaSnuOsi {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  }
  try {
    const surowe = window.localStorage.getItem(KLUCZ_USTAWIEN_SNU);
    return surowe ? normalizujUstawieniaSnuOsi(JSON.parse(surowe)) : { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  } catch {
    return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  }
}

export function zapiszUstawieniaSnuOsi(input: UstawieniaSnuOsi): UstawieniaSnuOsi {
  const ustawienia = normalizujUstawieniaSnuOsi(input);
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(KLUCZ_USTAWIEN_SNU, JSON.stringify(ustawienia));
  }
  return ustawienia;
}

function czyMinutaWSnie(minuta: number, poczatek: number, koniec: number): boolean {
  if (poczatek < koniec) return minuta >= poczatek && minuta < koniec;
  // Typowy sen przez północ, np. 22:30–06:30.
  return minuta >= poczatek || minuta < koniec;
}

function wagaZakresu(doMinuty: number, poczatek: number, koniec: number): number {
  const granica = Math.max(0, Math.min(MINUTY_DOBY, doMinuty));
  let wynik = 0;

  // 1440 iteracji jest wykonywane tylko dla obliczeń pozycji UI i pozostaje pomijalnie małym kosztem.
  // Użycie minutowej całki daje poprawną obsługę zakresów przechodzących przez północ.
  for (let minuta = 0; minuta < granica; minuta += 1) {
    wynik += czyMinutaWSnie(minuta, poczatek, koniec) ? KOMPRESJA_SNU : 1;
  }
  return wynik;
}

function minutyZWejscia(wartosc: unknown): number {
  if (typeof wartosc === "number") return ogranicz(wartosc);
  if (typeof wartosc === "string") return ogranicz(czasNaMinuty(wartosc) ?? 0);
  if (wartosc && typeof wartosc === "object") {
    const obj = wartosc as { minuty?: unknown; minuta?: unknown; godzina?: unknown; czas?: unknown };
    if (typeof obj.minuty === "number") return ogranicz(obj.minuty);
    if (typeof obj.minuta === "number") return ogranicz(obj.minuta);
    if (typeof obj.godzina === "string") return ogranicz(czasNaMinuty(obj.godzina) ?? 0);
    if (typeof obj.czas === "string") return ogranicz(czasNaMinuty(obj.czas) ?? 0);
  }
  return 0;
}

/**
 * Mapuje pełną dobę 00:00–23:59 na 0–100%.
 * TYLKO zaplanowany sen ma wagę 0.5; każda pozostała minuta ma wagę 1.0.
 * Parametry legacy są świadomie ignorowane, aby można było bezpiecznie podmienić
 * wcześniejszy mapper zależny od „aktywnej części dnia”.
 */
export function pozycjaNaOsiZeSnem(wartosc: unknown, ..._legacy: unknown[]): number {
  const ustawienia = pobierzUstawieniaSnuOsi();
  const poczatek = czasNaMinuty(ustawienia.poczatek) ?? czasNaMinuty(DOMYSLNY_POCZATEK_SNU)!;
  const koniec = czasNaMinuty(ustawienia.koniec) ?? czasNaMinuty(DOMYSLNY_KONIEC_SNU)!;
  const minuty = minutyZWejscia(wartosc);

  if (minuty <= 0) return 0;
  if (minuty >= OSTATNIA_MINUTA_DOBY) return 100;

  const calkowitaWaga = wagaZakresu(MINUTY_DOBY, poczatek, koniec);
  const wagaDoPunktu = wagaZakresu(minuty, poczatek, koniec);
  return (wagaDoPunktu / calkowitaWaga) * 100;
}

export function szerokoscPrzedzialuNaOsiZeSnem(od: unknown, do_: unknown, ..._legacy: unknown[]): number {
  return Math.max(0, pozycjaNaOsiZeSnem(do_) - pozycjaNaOsiZeSnem(od));
}

export function zakresSnuNaOsi(): Array<{ od: number; do: number }> {
  const ustawienia = pobierzUstawieniaSnuOsi();
  const poczatek = czasNaMinuty(ustawienia.poczatek) ?? 22 * 60 + 30;
  const koniec = czasNaMinuty(ustawienia.koniec) ?? 6 * 60 + 30;

  if (poczatek < koniec) {
    return [{ od: pozycjaNaOsiZeSnem(poczatek), do: pozycjaNaOsiZeSnem(koniec) }];
  }
  return [
    { od: 0, do: pozycjaNaOsiZeSnem(koniec) },
    { od: pozycjaNaOsiZeSnem(poczatek), do: 100 },
  ];
}
EOF

cat > src/modules/pulpit/KontrolkaSnuOsi.tsx <<'EOF'
import { useState } from "react";
import {
  DOMYSLNE_USTAWIENIA_SNU_OSI,
  pobierzUstawieniaSnuOsi,
  zapiszUstawieniaSnuOsi,
  type UstawieniaSnuOsi,
} from "./skalaSnu";

export function KontrolkaSnuOsi() {
  const [wartosc, ustawWartosc] = useState<UstawieniaSnuOsi>(() => pobierzUstawieniaSnuOsi());

  const zapisz = () => {
    const zapisane = zapiszUstawieniaSnuOsi(wartosc);
    ustawWartosc(zapisane);
    // Pozycje markerów są liczone w komponencie nadrzędnym. Przeładowanie widoku
    // gwarantuje ich jednoczesne przeliczenie po zmianie przedziału snu.
    if (typeof window !== "undefined") window.location.reload();
  };

  const resetuj = () => {
    ustawWartosc({ ...DOMYSLNE_USTAWIENIA_SNU_OSI });
    zapiszUstawieniaSnuOsi(DOMYSLNE_USTAWIENIA_SNU_OSI);
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div className="kontrolka-snu-osi" aria-label="Ustawienia snu na osi czasu">
      <span className="kontrolka-snu-osi__tytul">Sen</span>
      <label>
        <span>od</span>
        <input
          type="time"
          value={wartosc.poczatek}
          onChange={(event) => ustawWartosc((poprzednie) => ({ ...poprzednie, poczatek: event.target.value }))}
          aria-label="Początek snu"
        />
      </label>
      <label>
        <span>do</span>
        <input
          type="time"
          value={wartosc.koniec}
          onChange={(event) => ustawWartosc((poprzednie) => ({ ...poprzednie, koniec: event.target.value }))}
          aria-label="Koniec snu"
        />
      </label>
      <button type="button" className="przycisk drugorzedny" onClick={zapisz}>Zapisz sen</button>
      <button type="button" className="przycisk drugorzedny" onClick={resetuj}>22:30–06:30</button>
      <span className="kontrolka-snu-osi__opis">ten zakres ma 50% normalnej skali</span>
    </div>
  );
}
EOF

cat > src/modules/pulpit/skalaSnu.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
import {
  DOMYSLNE_USTAWIENIA_SNU_OSI,
  KOMPRESJA_SNU,
  czasNaMinuty,
  normalizujUstawieniaSnuOsi,
} from "./skalaSnu";

describe("skala snu osi czasu", () => {
  it("ma domyślny sen 22:30–06:30 i kompresję 50%", () => {
    expect(DOMYSLNE_USTAWIENIA_SNU_OSI).toEqual({ poczatek: "22:30", koniec: "06:30" });
    expect(KOMPRESJA_SNU).toBe(0.5);
  });

  it("rozpoznaje poprawne godziny", () => {
    expect(czasNaMinuty("06:30")).toBe(390);
    expect(czasNaMinuty("22:30")).toBe(1350);
    expect(czasNaMinuty("24:00")).toBeNull();
  });

  it("odrzuca zerowy lub uszkodzony zakres snu", () => {
    expect(normalizujUstawieniaSnuOsi({ poczatek: "10:00", koniec: "10:00" })).toEqual(DOMYSLNE_USTAWIENIA_SNU_OSI);
    expect(normalizujUstawieniaSnuOsi({ poczatek: "xx", koniec: "06:30" })).toEqual(DOMYSLNE_USTAWIENIA_SNU_OSI);
  });
});
EOF

echo "[3/7] Przełączam renderer osi na nową skalę i dodaję edycję snu"
python - <<'PY'
from pathlib import Path
import re

p = Path("src/modules/pulpit/OsCzasu.tsx")
s = p.read_text(encoding="utf-8")
original = s

# 1) Krótsza etykieta dojazdu i poprawiony opis kompresji.
s = s.replace("Dojazd do pracy", "Dojazd")
s = s.replace(
    "Czas poza aktywną częścią dnia jest skompresowany.",
    "Tylko zaplanowany sen jest skompresowany do 50%."
)
s = s.replace(
    "Czas poza aktywną częścią dnia jest skompresowany",
    "Tylko zaplanowany sen jest skompresowany do 50%"
)

# 2) Znajdź import z logiki osi i funkcję mapującą czas -> pozycję.
imports = list(re.finditer(r'import\s*\{(?P<names>[^}]+)\}\s*from\s*[\"\']\./logikaOsiCzasu[\"\'];?', s, re.S))
if not imports:
    raise SystemExit("Nie znaleziono importu z ./logikaOsiCzasu w OsCzasu.tsx — przerywam bez zgadywania.")

m = imports[0]
raw_names = m.group("names")
items = [x.strip() for x in raw_names.split(",") if x.strip()]
# obsługa `x as y`
local_names = []
for item in items:
    parts = re.split(r'\s+as\s+', item)
    local_names.append(parts[-1].strip())

# Najpierw oczywiste nazwy, potem scoring po nazwie i liczbie wywołań.
def score(name: str) -> int:
    lower = name.lower()
    val = len(re.findall(r'\b' + re.escape(name) + r'\s*\(', s))
    if "pozyc" in lower: val += 20
    if "procent" in lower: val += 15
    if "map" in lower and "czas" in lower: val += 14
    if "czas" in lower and "osi" in lower: val += 10
    if "minut" in lower and "osi" in lower: val += 8
    if "szerok" in lower: val -= 20
    if "przedzial" in lower or "przedział" in lower: val -= 8
    return val

candidates = sorted(local_names, key=score, reverse=True)
mapper = candidates[0] if candidates else None
if not mapper or score(mapper) < 10:
    raise SystemExit("Nie udało się jednoznacznie rozpoznać funkcji mapującej pozycję osi. Importy: " + ", ".join(local_names))

# Podmień wywołania tylko w rendererze. Stara logika pozostaje dla kompatybilności/testów legacy.
s, count_mapper = re.subn(r'\b' + re.escape(mapper) + r'\s*\(', 'pozycjaNaOsiZeSnem(', s)
if count_mapper == 0:
    raise SystemExit(f"Rozpoznano mapper {mapper}, ale nie znaleziono jego wywołań.")

# Usuń stary mapper z listy importów, jeżeli nie jest już używany.
# Zachowujemy aliasy i resztę importu.
new_items = []
for item in items:
    local = re.split(r'\s+as\s+', item)[-1].strip()
    if local != mapper:
        new_items.append(item)
replacement_import = 'import { ' + ', '.join(new_items) + ' } from "./logikaOsiCzasu";' if new_items else ''
s = s[:m.start()] + replacement_import + s[m.end():]

# 3) Nowe importy.
# Import mapowania dodamy po ustaleniu, czy potrzebny jest również helper szerokości.
if 'from "./KontrolkaSnuOsi"' not in s and "from './KontrolkaSnuOsi'" not in s:
    s = 'import { KontrolkaSnuOsi } from "./KontrolkaSnuOsi";\n' + s

# 4) Jeżeli renderer korzysta z osobnej funkcji szerokości przedziału z logikaOsiCzasu,
# podmień ją na różnicę pozycji liczoną tą samą skalą snu.
# Robimy to tylko dla jednoznacznych nazw zawierających szerok/width.
width_candidates = [name for name in local_names if name != mapper and ("szerok" in name.lower() or "width" in name.lower())]
used_sleep_width = False
for width in width_candidates:
    before = s
    s, n = re.subn(r'\b' + re.escape(width) + r'\s*\(', 'szerokoscPrzedzialuNaOsiZeSnem(', s)
    if n:
        used_sleep_width = True
        # Usuń z importu pozostałość nazwy. Najprościej osobna korekta listy po wcześniejszej przebudowie.
        pattern = re.compile(r'import\s*\{(?P<names>[^}]+)\}\s*from\s*[\"\']\./logikaOsiCzasu[\"\'];?', re.S)
        mm = pattern.search(s)
        if mm:
            its = [x.strip() for x in mm.group('names').split(',') if x.strip()]
            its2 = [x for x in its if re.split(r'\s+as\s+', x)[-1].strip() != width]
            repl = 'import { ' + ', '.join(its2) + ' } from "./logikaOsiCzasu";' if its2 else ''
            s = s[:mm.start()] + repl + s[mm.end():]

# Dodaj tylko faktycznie używane importy, żeby przejść noUnusedLocals.
if 'from "./skalaSnu"' not in s and "from './skalaSnu'" not in s:
    helpers = ["pozycjaNaOsiZeSnem"]
    if used_sleep_width:
        helpers.append("szerokoscPrzedzialuNaOsiZeSnem")
    s = 'import { ' + ', '.join(helpers) + ' } from "./skalaSnu";\n' + s

# 5) Wstaw kontrolkę snu do głównego JSX tuż po otwarciu pierwszego kontenera zwracanego przez komponent.
if "<KontrolkaSnuOsi" not in s:
    ret = re.search(r'\breturn\s*\(\s*\n?\s*(<(?P<tag>section|div|article)\b[^>]*>)', s)
    if not ret:
        raise SystemExit("Nie udało się znaleźć głównego kontenera JSX w OsCzasu.tsx.")
    insert_at = ret.end(1)
    s = s[:insert_at] + "\n      <KontrolkaSnuOsi />" + s[insert_at:]

if s == original:
    raise SystemExit("OsCzasu.tsx nie został zmieniony — przerywam.")

p.write_text(s, encoding="utf-8", newline="\n")
print(f"  mapper legacy: {mapper} -> pozycjaNaOsiZeSnem ({count_mapper} wywołań)")
PY

echo "[4/7] Zmieniam wszystkie użytkowe etykiety „Dojazd do pracy” w module Pulpitu"
python - <<'PY'
from pathlib import Path

root = Path("src/modules/pulpit")
changed = []
for p in root.rglob("*"):
    if p.suffix not in {".ts", ".tsx", ".css"} or not p.is_file():
        continue
    text = p.read_text(encoding="utf-8")
    new = text.replace("Dojazd do pracy", "Dojazd")
    if new != text:
        p.write_text(new, encoding="utf-8", newline="\n")
        changed.append(str(p))
print("  zmienione:", ", ".join(changed) if changed else "etykieta była już poprawiona")
PY

echo "[5/7] Dodaję lekkie style kontrolki snu"
cat >> src/styles/glowny.css <<'EOF'

/* Oś czasu — ustawienia snu. Tylko ten zakres jest kompresowany do 50%. */
.kontrolka-snu-osi {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--kolor-obramowania, rgba(255, 255, 255, 0.14));
  border-radius: var(--promien-pola, 8px);
  background: rgba(255, 255, 255, 0.025);
  font-size: 0.82rem;
}

.kontrolka-snu-osi__tytul {
  font-weight: 700;
}

.kontrolka-snu-osi label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.kontrolka-snu-osi input[type="time"] {
  min-width: 6.7rem;
}

.kontrolka-snu-osi__opis {
  opacity: 0.72;
}
EOF

echo "[6/7] Kontrola zmian i TypeScript/build"

git diff --check || fail "git diff --check wykrył problem. Oryginały są w $BACKUP_DIR"

has_script() {
  node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "$1"
}

if has_script typecheck; then
  echo "-> npm run typecheck"
  npm run typecheck
fi

if has_script test; then
  echo "-> npm test -- --run (jeżeli runner obsługuje --run)"
  if ! npm test -- --run; then
    echo "Pierwsza forma testu nie przeszła; próbuję zwykłe npm test."
    npm test
  fi
fi

if has_script build; then
  echo "-> npm run build"
  npm run build
fi

if has_script lint; then
  echo "-> npm run lint"
  npm run lint
fi

echo

echo "[7/7] Gotowe"
echo "Zmiany:"
git status --short

echo
echo "Najważniejsze punkty:"
echo "  • kompresja 50% dotyczy wyłącznie snu (domyślnie 22:30–06:30),"
echo "  • godziny poza snem zachowują skalę 1:1,"
echo "  • początek/koniec snu można edytować bez Codexa,"
echo "  • zapis przeładowuje widok i przelicza markery / wskaźnik czasu,"
echo "  • „Dojazd do pracy” zmieniono na „Dojazd”."
echo
echo "Patch NIE wykonuje git commit ani git push."
echo "Kopia bezpieczeństwa: $BACKUP_DIR"
echo
echo "Aby uruchomić aplikację:"
echo "  cd \"$REPO\" && npm run dev"
