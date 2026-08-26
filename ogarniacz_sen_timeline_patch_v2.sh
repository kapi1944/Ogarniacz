#!/usr/bin/env bash
set -Eeuo pipefail

# Ogarniacz — poprawka osi czasu: kompresja wyłącznie snu + „Dojazd”.
# Wersja 2: nie wymaga Pythona. Używa tylko Git + Node.js + npm.
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
command -v node >/dev/null 2>&1 || fail "Brak node w PATH."
command -v npm >/dev/null 2>&1 || fail "Brak npm w PATH."

[[ -d "$REPO" ]] || fail "Nie istnieje katalog: $REPO"
[[ -d "$REPO/.git" ]] || fail "To nie wygląda na repo Git: $REPO"
[[ -f "$REPO/package.json" ]] || fail "Brak package.json w: $REPO"

cd "$REPO"

echo "============================================================"
echo " Ogarniacz — patch osi czasu snu v2 (bez Pythona)"
echo " Repo: $REPO"
echo "============================================================"
echo

echo "[1/7] Stan Git przed zmianami"
git status --short --branch
BEFORE_HEAD="$(git rev-parse HEAD)"
echo "HEAD: $BEFORE_HEAD"
echo

mkdir -p "$BACKUP_DIR"
for f in \
  src/modules/pulpit/OsCzasu.tsx \
  src/modules/pulpit/logikaOsiCzasu.ts \
  src/modules/pulpit/logikaOsiCzasu.test.ts \
  src/modules/pulpit/skalaSnu.ts \
  src/modules/pulpit/KontrolkaSnuOsi.tsx \
  src/modules/pulpit/skalaSnu.test.ts \
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

echo "[2/7] Tworzę niezależną skalę doby ze snem 50%"
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

  if (
    !Number.isInteger(godzina) ||
    !Number.isInteger(minuta) ||
    godzina < 0 ||
    godzina > 23 ||
    minuta < 0 ||
    minuta > 59
  ) {
    return null;
  }

  return godzina * 60 + minuta;
}

export function normalizujUstawieniaSnuOsi(input: unknown): UstawieniaSnuOsi {
  if (!input || typeof input !== "object") {
    return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  }

  const kandydat = input as Partial<UstawieniaSnuOsi>;

  const poczatek =
    typeof kandydat.poczatek === "string" && czasNaMinuty(kandydat.poczatek) !== null
      ? kandydat.poczatek
      : DOMYSLNY_POCZATEK_SNU;

  const koniec =
    typeof kandydat.koniec === "string" && czasNaMinuty(kandydat.koniec) !== null
      ? kandydat.koniec
      : DOMYSLNY_KONIEC_SNU;

  if (poczatek === koniec) {
    return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  }

  return { poczatek, koniec };
}

export function pobierzUstawieniaSnuOsi(): UstawieniaSnuOsi {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  }

  try {
    const surowe = window.localStorage.getItem(KLUCZ_USTAWIEN_SNU);
    return surowe
      ? normalizujUstawieniaSnuOsi(JSON.parse(surowe))
      : { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
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
  if (poczatek < koniec) {
    return minuta >= poczatek && minuta < koniec;
  }

  return minuta >= poczatek || minuta < koniec;
}

function wagaZakresu(doMinuty: number, poczatek: number, koniec: number): number {
  const granica = Math.max(0, Math.min(MINUTY_DOBY, doMinuty));
  let wynik = 0;

  for (let minuta = 0; minuta < granica; minuta += 1) {
    wynik += czyMinutaWSnie(minuta, poczatek, koniec) ? KOMPRESJA_SNU : 1;
  }

  return wynik;
}

function minutyZWejscia(wartosc: unknown): number {
  if (typeof wartosc === "number") {
    return ogranicz(wartosc);
  }

  if (typeof wartosc === "string") {
    return ogranicz(czasNaMinuty(wartosc) ?? 0);
  }

  if (wartosc && typeof wartosc === "object") {
    const obj = wartosc as {
      minuty?: unknown;
      minuta?: unknown;
      godzina?: unknown;
      czas?: unknown;
    };

    if (typeof obj.minuty === "number") return ogranicz(obj.minuty);
    if (typeof obj.minuta === "number") return ogranicz(obj.minuta);
    if (typeof obj.godzina === "string") return ogranicz(czasNaMinuty(obj.godzina) ?? 0);
    if (typeof obj.czas === "string") return ogranicz(czasNaMinuty(obj.czas) ?? 0);
  }

  return 0;
}

/**
 * Mapuje pełną dobę 00:00–23:59 na 0–100%.
 * Tylko zaplanowany sen ma wagę 0.5; każda pozostała minuta ma wagę 1.0.
 * Dodatkowe argumenty legacy są celowo ignorowane.
 */
export function pozycjaNaOsiZeSnem(wartosc: unknown, ..._legacy: unknown[]): number {
  const ustawienia = pobierzUstawieniaSnuOsi();

  const poczatek =
    czasNaMinuty(ustawienia.poczatek) ??
    czasNaMinuty(DOMYSLNY_POCZATEK_SNU)!;

  const koniec =
    czasNaMinuty(ustawienia.koniec) ??
    czasNaMinuty(DOMYSLNY_KONIEC_SNU)!;

  const minuty = minutyZWejscia(wartosc);

  if (minuty <= 0) return 0;
  if (minuty >= OSTATNIA_MINUTA_DOBY) return 100;

  const calkowitaWaga = wagaZakresu(MINUTY_DOBY, poczatek, koniec);
  const wagaDoPunktu = wagaZakresu(minuty, poczatek, koniec);

  return (wagaDoPunktu / calkowitaWaga) * 100;
}

export function szerokoscPrzedzialuNaOsiZeSnem(
  od: unknown,
  do_: unknown,
  ..._legacy: unknown[]
): number {
  return Math.max(
    0,
    pozycjaNaOsiZeSnem(do_) - pozycjaNaOsiZeSnem(od),
  );
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
  const [wartosc, ustawWartosc] = useState<UstawieniaSnuOsi>(
    () => pobierzUstawieniaSnuOsi(),
  );

  const zapisz = () => {
    const zapisane = zapiszUstawieniaSnuOsi(wartosc);
    ustawWartosc(zapisane);

    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const resetuj = () => {
    const domyslne = { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
    ustawWartosc(domyslne);
    zapiszUstawieniaSnuOsi(domyslne);

    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="kontrolka-snu-osi" aria-label="Ustawienia snu na osi czasu">
      <span className="kontrolka-snu-osi__tytul">Sen</span>

      <label>
        <span>od</span>
        <input
          type="time"
          value={wartosc.poczatek}
          onChange={(event) =>
            ustawWartosc((poprzednie) => ({
              ...poprzednie,
              poczatek: event.target.value,
            }))
          }
          aria-label="Początek snu"
        />
      </label>

      <label>
        <span>do</span>
        <input
          type="time"
          value={wartosc.koniec}
          onChange={(event) =>
            ustawWartosc((poprzednie) => ({
              ...poprzednie,
              koniec: event.target.value,
            }))
          }
          aria-label="Koniec snu"
        />
      </label>

      <button type="button" className="przycisk drugorzedny" onClick={zapisz}>
        Zapisz sen
      </button>

      <button type="button" className="przycisk drugorzedny" onClick={resetuj}>
        22:30–06:30
      </button>

      <span className="kontrolka-snu-osi__opis">
        ten zakres ma 50% normalnej skali
      </span>
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
    expect(DOMYSLNE_USTAWIENIA_SNU_OSI).toEqual({
      poczatek: "22:30",
      koniec: "06:30",
    });
    expect(KOMPRESJA_SNU).toBe(0.5);
  });

  it("rozpoznaje poprawne godziny", () => {
    expect(czasNaMinuty("06:30")).toBe(390);
    expect(czasNaMinuty("22:30")).toBe(1350);
    expect(czasNaMinuty("24:00")).toBeNull();
  });

  it("odrzuca zerowy lub uszkodzony zakres snu", () => {
    expect(
      normalizujUstawieniaSnuOsi({
        poczatek: "10:00",
        koniec: "10:00",
      }),
    ).toEqual(DOMYSLNE_USTAWIENIA_SNU_OSI);

    expect(
      normalizujUstawieniaSnuOsi({
        poczatek: "xx",
        koniec: "06:30",
      }),
    ).toEqual(DOMYSLNE_USTAWIENIA_SNU_OSI);
  });
});
EOF

echo "[3/7] Przełączam renderer osi na nową skalę i dodaję edycję snu"

node <<'NODE'
const fs = require("fs");

const path = "src/modules/pulpit/OsCzasu.tsx";
let s = fs.readFileSync(path, "utf8");
const original = s;

s = s.replaceAll("Dojazd do pracy", "Dojazd");
s = s.replaceAll(
  "Czas poza aktywną częścią dnia jest skompresowany.",
  "Tylko zaplanowany sen jest skompresowany do 50%."
);
s = s.replaceAll(
  "Czas poza aktywną częścią dnia jest skompresowany",
  "Tylko zaplanowany sen jest skompresowany do 50%"
);

// Jeżeli plik był już skutecznie patchowany, nie próbujemy rozpoznawać legacy mappera drugi raz.
const alreadyPatched =
  s.includes("pozycjaNaOsiZeSnem(") &&
  s.includes('from "./skalaSnu"') &&
  s.includes("<KontrolkaSnuOsi");

if (!alreadyPatched) {
  const importRegex =
    /import\s*\{([\s\S]*?)\}\s*from\s*["']\.\/logikaOsiCzasu["'];?/g;

  const imports = [...s.matchAll(importRegex)];

  if (!imports.length) {
    console.error(
      "Nie znaleziono importu z ./logikaOsiCzasu w OsCzasu.tsx — przerywam bez zgadywania."
    );
    process.exit(21);
  }

  const match = imports[0];
  const fullImport = match[0];
  const rawNames = match[1];

  const items = rawNames
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const localName = (item) => item.split(/\s+as\s+/).pop().trim();

  const score = (name) => {
    const lower = name.toLowerCase();
    const callRegex = new RegExp(
      "\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(",
      "g"
    );

    let value = (s.match(callRegex) || []).length;

    if (lower.includes("pozyc")) value += 20;
    if (lower.includes("procent")) value += 15;
    if (lower.includes("map") && lower.includes("czas")) value += 14;
    if (lower.includes("czas") && lower.includes("osi")) value += 10;
    if (lower.includes("minut") && lower.includes("osi")) value += 8;
    if (lower.includes("szerok")) value -= 20;
    if (lower.includes("przedzial") || lower.includes("przedział")) value -= 8;

    return value;
  };

  const localNames = items.map(localName);
  const candidates = [...localNames].sort((a, b) => score(b) - score(a));
  const mapper = candidates[0];

  if (!mapper || score(mapper) < 10) {
    console.error(
      "Nie udało się jednoznacznie rozpoznać funkcji mapującej pozycję osi. Importy: " +
        localNames.join(", ")
    );
    process.exit(22);
  }

  const mapperRegex = new RegExp(
    "\\b" + mapper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(",
    "g"
  );

  let mapperCount = 0;

  s = s.replace(mapperRegex, () => {
    mapperCount += 1;
    return "pozycjaNaOsiZeSnem(";
  });

  if (!mapperCount) {
    console.error(
      `Rozpoznano mapper ${mapper}, ale nie znaleziono jego wywołań.`
    );
    process.exit(23);
  }

  // Przebuduj import legacy bez mapera.
  const newItems = items.filter((item) => localName(item) !== mapper);
  const replacementImport = newItems.length
    ? `import { ${newItems.join(", ")} } from "./logikaOsiCzasu";`
    : "";

  s = s.replace(fullImport, replacementImport);

  // Sprawdź potencjalny helper szerokości.
  let usedSleepWidth = false;

  for (const width of localNames.filter(
    (name) =>
      name !== mapper &&
      (name.toLowerCase().includes("szerok") ||
        name.toLowerCase().includes("width"))
  )) {
    const widthRegex = new RegExp(
      "\\b" + width.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(",
      "g"
    );

    let widthCount = 0;

    s = s.replace(widthRegex, () => {
      widthCount += 1;
      usedSleepWidth = true;
      return "szerokoscPrzedzialuNaOsiZeSnem(";
    });

    if (widthCount) {
      const legacyImportRegex =
        /import\s*\{([\s\S]*?)\}\s*from\s*["']\.\/logikaOsiCzasu["'];?/;
      const mm = s.match(legacyImportRegex);

      if (mm) {
        const currentItems = mm[1]
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

        const kept = currentItems.filter((item) => localName(item) !== width);

        s = s.replace(
          mm[0],
          kept.length
            ? `import { ${kept.join(", ")} } from "./logikaOsiCzasu";`
            : ""
        );
      }
    }
  }

  // Import nowej skali.
  if (!s.includes('from "./skalaSnu"') && !s.includes("from './skalaSnu'")) {
    const helpers = ["pozycjaNaOsiZeSnem"];
    if (usedSleepWidth) helpers.push("szerokoscPrzedzialuNaOsiZeSnem");

    s =
      `import { ${helpers.join(", ")} } from "./skalaSnu";\n` +
      s;
  }

  // Import kontrolki.
  if (
    !s.includes('from "./KontrolkaSnuOsi"') &&
    !s.includes("from './KontrolkaSnuOsi'")
  ) {
    s =
      'import { KontrolkaSnuOsi } from "./KontrolkaSnuOsi";\n' +
      s;
  }

  // Wstaw kontrolkę do głównego JSX.
  if (!s.includes("<KontrolkaSnuOsi")) {
    const returnRegex =
      /\breturn\s*\(\s*\n?\s*(<(?:section|div|article)\b[^>]*>)/;

    const ret = returnRegex.exec(s);

    if (!ret) {
      console.error(
        "Nie udało się znaleźć głównego kontenera JSX w OsCzasu.tsx."
      );
      process.exit(24);
    }

    const insertAt = ret.index + ret[0].length;

    s =
      s.slice(0, insertAt) +
      "\n      <KontrolkaSnuOsi />" +
      s.slice(insertAt);
  }

  console.log(
    `  mapper legacy: ${mapper} -> pozycjaNaOsiZeSnem (${mapperCount} wywołań)`
  );
} else {
  console.log("  OsCzasu.tsx jest już przełączony na skalę snu — pomijam ponowne patchowanie.");
}

if (s === original) {
  console.log("  Brak dodatkowych zmian w OsCzasu.tsx.");
} else {
  fs.writeFileSync(path, s.replace(/\r\n/g, "\n"), "utf8");
}
NODE

echo "[4/7] Zmieniam wszystkie użytkowe etykiety „Dojazd do pracy” w module Pulpitu"

node <<'NODE'
const fs = require("fs");
const path = require("path");

const root = "src/modules/pulpit";
const changed = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;

    const text = fs.readFileSync(full, "utf8");
    const next = text.replaceAll("Dojazd do pracy", "Dojazd");

    if (next !== text) {
      fs.writeFileSync(full, next.replace(/\r\n/g, "\n"), "utf8");
      changed.push(full);
    }
  }
}

walk(root);
console.log(
  "  zmienione:",
  changed.length ? changed.join(", ") : "etykieta była już poprawiona"
);
NODE

echo "[5/7] Dodaję style kontrolki snu"

node <<'NODE'
const fs = require("fs");

const path = "src/styles/glowny.css";
let css = fs.readFileSync(path, "utf8");

const start = "/* === Ogarniacz: kontrolka snu osi czasu === */";
const end = "/* === /Ogarniacz: kontrolka snu osi czasu === */";

const block = `
${start}
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
${end}
`;

const startIndex = css.indexOf(start);
const endIndex = css.indexOf(end);

if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
  const after = endIndex + end.length;
  css = css.slice(0, startIndex) + block.trim() + css.slice(after);
} else {
  css = css.replace(/\s*$/, "\n\n") + block.trim() + "\n";
}

fs.writeFileSync(path, css.replace(/\r\n/g, "\n"), "utf8");
NODE

echo "[6/7] Kontrola zmian i testy"

git diff --check || fail "git diff --check wykrył problem. Oryginały są w $BACKUP_DIR"

has_script() {
  node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "$1"
}

if has_script typecheck; then
  echo "-> npm run typecheck"
  npm run typecheck
fi

if has_script test; then
  echo "-> npm test -- --run"
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
echo
git status --short
echo
echo "Najważniejsze zmiany:"
echo "  • kompresja 50% dotyczy wyłącznie snu,"
echo "  • domyślny sen: 22:30–06:30,"
echo "  • pozostała część doby zachowuje normalną skalę,"
echo "  • początek i koniec snu można zmienić w widoku osi,"
echo "  • „Dojazd do pracy” został skrócony do „Dojazd”."
echo
echo "Patch NIE wykonuje git commit ani git push."
echo "Kopia bezpieczeństwa: $BACKUP_DIR"
echo
echo "Uruchomienie aplikacji:"
echo "  cd \"$REPO\" && npm run dev"
