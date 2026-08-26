#!/usr/bin/env bash
set -Eeuo pipefail

PATCH_ID="OGARNIACZ_URLOPY_SWIETA_PL_2026_08"
REPO="/c/GitHub/Projects/Ogarniacz/Ogarniacz"

echo "============================================================"
echo " Ogarniacz — Grafik: urlopy + polskie święta"
echo " Patch: ${PATCH_ID}"
echo " Repo:  ${REPO}"
echo "============================================================"

if [[ ! -d "${REPO}/.git" ]]; then
  echo "BŁĄD: Nie znaleziono repozytorium Git w ${REPO}"
  echo 'Oczekiwana lokalizacja Windows: C:\GitHub\Projects\Ogarniacz\Ogarniacz'
  exit 1
fi

cd "${REPO}"

WYMAGANE_PLIKI=(
  "src/domain/typy.ts"
  "src/data/BazaOgarniacza.ts"
  "src/services/PlanerService.ts"
  "src/services/PlanerService.test.ts"
  "src/modules/czas/WidokiCzasu.tsx"
  "src/styles/glowny.css"
)

for plik in "${WYMAGANE_PLIKI[@]}"; do
  if [[ ! -f "${plik}" ]]; then
    echo "BŁĄD: Brakuje wymaganego pliku: ${plik}"
    exit 1
  fi
done

if command -v python >/dev/null 2>&1; then
  PYTHON=(python)
elif command -v python3 >/dev/null 2>&1; then
  PYTHON=(python3)
elif command -v py >/dev/null 2>&1; then
  PYTHON=(py -3)
else
  echo "BŁĄD: Wymagany jest Python 3 dostępny w Git Bash."
  echo "Patch nie korzysta z Codexa ani zewnętrznego API."
  exit 1
fi

STEMPEL="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR=".patch-backups/${PATCH_ID}_${STEMPEL}"
mkdir -p "${BACKUP_DIR}"

echo
echo "== Stan Git przed zmianami =="
git --no-pager status --short --branch || true

echo
echo "== Kopia bezpieczeństwa =="
for plik in "${WYMAGANE_PLIKI[@]}"; do
  mkdir -p "${BACKUP_DIR}/$(dirname "${plik}")"
  cp -p "${plik}" "${BACKUP_DIR}/${plik}"
done
echo "Backup: ${REPO}/${BACKUP_DIR}"

"${PYTHON[@]}" - "${PATCH_ID}" <<'PY'
from __future__ import annotations

from pathlib import Path
import re
import sys

PATCH_ID = sys.argv[1]
ROOT = Path.cwd()

def p(rel: str) -> Path:
    return ROOT / rel

def read(rel: str) -> str:
    return p(rel).read_text(encoding="utf-8")

def write(rel: str, content: str) -> None:
    p(rel).parent.mkdir(parents=True, exist_ok=True)
    p(rel).write_text(content, encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: oczekiwano 1 kotwicy, znaleziono {count}")
    return text.replace(old, new, 1)

def insert_after_match(text: str, pattern: str, addition: str, label: str) -> str:
    match = re.search(pattern, text, flags=re.S)
    if not match:
        raise RuntimeError(f"{label}: nie znaleziono kotwicy")
    return text[:match.end()] + addition + text[match.end():]

print("== 1/6 Model danych: Urlop ==")

typy_rel = "src/domain/typy.ts"
typy = read(typy_rel)

if "export interface Urlop extends EncjaBazowa" not in typy:
    model_urlopu = r'''
export type TypUrlopu =
  | 'wypoczynkowy'
  | 'na_zadanie'
  | 'bezplatny'
  | 'okolicznosciowy'
  | 'opieka'
  | 'chorobowe'
  | 'inny'

export type StatusUrlopu = 'planowany' | 'potwierdzony' | 'anulowany'

export interface Urlop extends EncjaBazowa {
  dataOd: string
  dataDo: string
  typ: TypUrlopu
  status: StatusUrlopu
  opis?: string
}
'''
    typy = insert_after_match(
        typy,
        r"export interface WyjatekGrafiku extends EncjaBazowa \{.*?\n\}\n",
        "\n" + model_urlopu,
        "typy.ts / Urlop",
    )

if "  urlopy: Urlop\n" not in typy:
    typy = replace_once(
        typy,
        "  wyjatkiGrafiku: WyjatekGrafiku\n",
        "  wyjatkiGrafiku: WyjatekGrafiku\n  urlopy: Urlop\n",
        "typy.ts / MapaTabel.urlopy",
    )

write(typy_rel, typy)

print("== 2/6 Migracja Dexie ==")

baza_rel = "src/data/BazaOgarniacza.ts"
baza = read(baza_rel)

if "  'urlopy',\n" not in baza:
    baza = replace_once(
        baza,
        "  'wyjatkiGrafiku',\n",
        "  'wyjatkiGrafiku',\n  'urlopy',\n",
        "BazaOgarniacza.ts / nazwyTabel",
    )

schema_urlopow = "urlopy: 'id, dataOd, dataDo, typ, status, updatedAt, usunietoAt'"
if schema_urlopow not in baza:
    wersje = [int(v) for v in re.findall(r"this\.version\((\d+)\)", baza)]
    if not wersje:
        raise RuntimeError("BazaOgarniacza.ts: nie znaleziono wersji Dexie")
    nowa_wersja = max(wersje) + 1

    # Zachowujemy historyczny schemat v2 bez zmian. Nowa wersja rozszerza
    # ostatni znany pełny schemat o tabelę urlopów.
    nowy_fragment = (
        f"\n\n    this.version({nowa_wersja}).stores({{\n"
        "      ...schematPelny,\n"
        f"      {schema_urlopow},\n"
        "    }})"
    )
    kotwica = "\n  }\n\n  tabela<K extends NazwaTabeli>"
    if kotwica not in baza:
        raise RuntimeError("BazaOgarniacza.ts: nie znaleziono końca konstruktora")
    baza = baza.replace(kotwica, nowy_fragment + kotwica, 1)
    print(f"  + dodano wersję Dexie {nowa_wersja}")

write(baza_rel, baza)

print("== 3/6 Serwisy świąt i urlopów ==")

swieta = r'''// OGARNIACZ_URLOPY_SWIETA_PL_2026_08
// Ustawowe dni wolne od pracy w Polsce.
// Święta ruchome są wyliczane lokalnie i deterministycznie.

export interface PolskieSwieto {
  data: string
  nazwa: string
  ruchome: boolean
}

function iso(rok: number, miesiac: number, dzien: number): string {
  return `${rok}-${String(miesiac).padStart(2, '0')}-${String(dzien).padStart(2, '0')}`
}

function dodajDni(dataIso: string, dni: number): string {
  const [rok, miesiac, dzien] = dataIso.split('-').map(Number)
  const data = new Date(Date.UTC(rok, miesiac - 1, dzien + dni))
  return iso(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate())
}

export function dataWielkanocy(rok: number): string {
  // Algorytm Meeusa/Jonesa/Butchera dla kalendarza gregoriańskiego.
  const a = rok % 19
  const b = Math.floor(rok / 100)
  const c = rok % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const miesiac = Math.floor((h + l - 7 * m + 114) / 31)
  const dzien = ((h + l - 7 * m + 114) % 31) + 1
  return iso(rok, miesiac, dzien)
}

export function pobierzPolskieSwieta(rok: number): PolskieSwieto[] {
  const wielkanoc = dataWielkanocy(rok)

  const wynik: PolskieSwieto[] = [
    { data: iso(rok, 1, 1), nazwa: 'Nowy Rok', ruchome: false },
    { data: iso(rok, 1, 6), nazwa: 'Święto Trzech Króli', ruchome: false },
    { data: wielkanoc, nazwa: 'Niedziela Wielkanocna', ruchome: true },
    { data: dodajDni(wielkanoc, 1), nazwa: 'Poniedziałek Wielkanocny', ruchome: true },
    { data: iso(rok, 5, 1), nazwa: 'Święto Pracy', ruchome: false },
    { data: iso(rok, 5, 3), nazwa: 'Święto Konstytucji 3 Maja', ruchome: false },
    { data: dodajDni(wielkanoc, 49), nazwa: 'Zesłanie Ducha Świętego (Zielone Świątki)', ruchome: true },
    { data: dodajDni(wielkanoc, 60), nazwa: 'Boże Ciało', ruchome: true },
    { data: iso(rok, 8, 15), nazwa: 'Wniebowzięcie NMP / Święto Wojska Polskiego', ruchome: false },
    { data: iso(rok, 11, 1), nazwa: 'Wszystkich Świętych', ruchome: false },
    { data: iso(rok, 11, 11), nazwa: 'Narodowe Święto Niepodległości', ruchome: false },
    { data: iso(rok, 12, 25), nazwa: 'Boże Narodzenie', ruchome: false },
    { data: iso(rok, 12, 26), nazwa: 'Drugi dzień Bożego Narodzenia', ruchome: false },
  ]

  // Od 2025 r. 24 grudnia (Wigilia) jest ustawowym dniem wolnym.
  if (rok >= 2025) {
    wynik.push({ data: iso(rok, 12, 24), nazwa: 'Wigilia Bożego Narodzenia', ruchome: false })
  }

  return wynik.sort((a, b) => a.data.localeCompare(b.data))
}

export function pobierzPolskieSwieto(data: string): PolskieSwieto | undefined {
  const rok = Number(data.slice(0, 4))
  if (!Number.isInteger(rok)) return undefined
  return pobierzPolskieSwieta(rok).find((swieto) => swieto.data === data)
}

export function czyPolskieSwieto(data: string): boolean {
  return Boolean(pobierzPolskieSwieto(data))
}
'''
write("src/services/PolskieSwietaService.ts", swieta)

urlopy = r'''// OGARNIACZ_URLOPY_SWIETA_PL_2026_08
import type { Urlop } from '../domain/typy'

export const ETYKIETY_TYPOW_URLOPU: Record<Urlop['typ'], string> = {
  wypoczynkowy: 'Urlop wypoczynkowy',
  na_zadanie: 'Urlop na żądanie',
  bezplatny: 'Urlop bezpłatny',
  okolicznosciowy: 'Urlop okolicznościowy',
  opieka: 'Opieka / zwolnienie opiekuńcze',
  chorobowe: 'Chorobowe / L4',
  inny: 'Inny dzień wolny',
}

export const ETYKIETY_STATUSOW_URLOPU: Record<Urlop['status'], string> = {
  planowany: 'Planowany',
  potwierdzony: 'Potwierdzony',
  anulowany: 'Anulowany',
}

export function czyDataWUrlopie(urlop: Urlop, data: string): boolean {
  return urlop.status !== 'anulowany' && urlop.dataOd <= data && data <= urlop.dataDo
}

export function urlopyDnia(urlopy: Urlop[], data: string): Urlop[] {
  return urlopy.filter((urlop) => czyDataWUrlopie(urlop, data))
}

export function czyZakresySieNakladaja(
  a: Pick<Urlop, 'dataOd' | 'dataDo'>,
  b: Pick<Urlop, 'dataOd' | 'dataDo'>,
): boolean {
  return a.dataOd <= b.dataDo && b.dataOd <= a.dataDo
}
'''
write("src/services/UrlopyService.ts", urlopy)

test_kalendarza = r'''import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Urlop } from '../domain/typy'
import { czyPolskieSwieto, dataWielkanocy, pobierzPolskieSwieto } from './PolskieSwietaService'
import { czyDataWUrlopie, czyZakresySieNakladaja } from './UrlopyService'

describe('polskie święta', () => {
  it('wylicza święta ruchome dla 2026 roku', () => {
    expect(dataWielkanocy(2026)).toBe('2026-04-05')
    expect(pobierzPolskieSwieto('2026-04-06')?.nazwa).toBe('Poniedziałek Wielkanocny')
    expect(pobierzPolskieSwieto('2026-05-24')?.nazwa).toContain('Zielone Świątki')
    expect(pobierzPolskieSwieto('2026-06-04')?.nazwa).toBe('Boże Ciało')
  })

  it('uwzględnia Wigilię od 2025 roku', () => {
    expect(czyPolskieSwieto('2024-12-24')).toBe(false)
    expect(pobierzPolskieSwieto('2026-12-24')?.nazwa).toBe('Wigilia Bożego Narodzenia')
  })

  it('używa polskich nazw świąt', () => {
    expect(pobierzPolskieSwieto('2026-11-11')?.nazwa).toBe('Narodowe Święto Niepodległości')
  })
})

describe('urlopy', () => {
  const urlop: Urlop = {
    ...utworzMetadane('urlop-test'),
    dataOd: '2026-08-17',
    dataDo: '2026-08-21',
    typ: 'wypoczynkowy',
    status: 'potwierdzony',
    opis: 'Test',
  }

  it('rozpoznaje datę w zakresie urlopu', () => {
    expect(czyDataWUrlopie(urlop, '2026-08-19')).toBe(true)
    expect(czyDataWUrlopie(urlop, '2026-08-22')).toBe(false)
  })

  it('ignoruje urlop anulowany', () => {
    expect(czyDataWUrlopie({ ...urlop, status: 'anulowany' }, '2026-08-19')).toBe(false)
  })

  it('wykrywa nakładające się zakresy', () => {
    expect(czyZakresySieNakladaja(urlop, { dataOd: '2026-08-21', dataDo: '2026-08-25' })).toBe(true)
    expect(czyZakresySieNakladaja(urlop, { dataOd: '2026-08-22', dataDo: '2026-08-25' })).toBe(false)
  })
})
'''
write("src/services/KalendarzPracyService.test.ts", test_kalendarza)

print("== 4/6 Integracja z Planerem ==")

planer_rel = "src/services/PlanerService.ts"
planer = read(planer_rel)

old_import = "import type { BlokCzasu, GrafikPracy, Nawyk, Wizyta, WyjatekGrafiku, Zadanie } from '../domain/typy'"
if old_import in planer:
    planer = planer.replace(
        old_import,
        "import type { BlokCzasu, GrafikPracy, Nawyk, Urlop, Wizyta, WyjatekGrafiku, Zadanie } from '../domain/typy'",
        1,
    )
elif "Urlop" not in planer.splitlines()[2]:
    raise RuntimeError("PlanerService.ts: nie rozpoznano importu typów")

if "from './PolskieSwietaService'" not in planer:
    planer = replace_once(
        planer,
        "import { czyNawykNaDzien } from './NawykiService'\n",
        "import { czyNawykNaDzien } from './NawykiService'\n"
        "import { czyPolskieSwieto } from './PolskieSwietaService'\n"
        "import { czyDataWUrlopie } from './UrlopyService'\n",
        "PlanerService.ts / serwisy kalendarza",
    )

if "  urlopy: Urlop[]\n" not in planer:
    planer = replace_once(
        planer,
        "  wyjatkiGrafiku: WyjatekGrafiku[]\n",
        "  wyjatkiGrafiku: WyjatekGrafiku[]\n  urlopy: Urlop[]\n",
        "PlanerService.ts / urlopy",
    )

if "dane.urlopy.some((urlop) => czyDataWUrlopie(urlop, dane.data))" not in planer:
    linia_wyjatku = (
        "  if (wyjatek) return wyjatek.pracuje && wyjatek.od && wyjatek.do "
        "? { od: naMinuty(wyjatek.od), do: naMinuty(wyjatek.do) } : undefined\n"
    )
    if linia_wyjatku not in planer:
        raise RuntimeError("PlanerService.ts: nie znaleziono logiki pierwszeństwa wyjątku")
    planer = planer.replace(
        linia_wyjatku,
        linia_wyjatku
        + "  if (czyPolskieSwieto(dane.data) || dane.urlopy.some((urlop) => czyDataWUrlopie(urlop, dane.data))) return undefined\n",
        1,
    )

write(planer_rel, planer)

planer_test_rel = "src/services/PlanerService.test.ts"
planer_test = read(planer_test_rel)
if "urlopy: []" not in planer_test:
    planer_test = replace_once(
        planer_test,
        "grafik, wyjatkiGrafiku: [], ...zmiany",
        "grafik, wyjatkiGrafiku: [], urlopy: [], ...zmiany",
        "PlanerService.test.ts / urlopy",
    )

if "traktuje urlop jako dzień bez bloku pracy" not in planer_test:
    testy_integracyjne = r'''

  it('traktuje urlop jako dzień bez bloku pracy', () => {
    const wynik = zaproponujPlan(dane({
      odGodziny: '09:00',
      urlopy: [{
        ...utworzMetadane('urlop-planer'),
        dataOd: data,
        dataDo: data,
        typ: 'wypoczynkowy',
        status: 'potwierdzony',
      }],
    }))
    expect(wynik.propozycje.find((blok) => blok.typ === 'zadanie')?.poczatek).toBe(`${data}T09:00:00`)
  })

  it('traktuje polskie święto jako dzień bez standardowej pracy', () => {
    const dataSwieta = '2026-11-11'
    const wynik = zaproponujPlan(dane({
      data: dataSwieta,
      odGodziny: '09:00',
      grafik: [{ ...utworzMetadane('grafik-3'), dzienTygodnia: 3, aktywny: true, od: '08:00', do: '16:00' }],
    }))
    expect(wynik.propozycje.find((blok) => blok.typ === 'zadanie')?.poczatek).toBe(`${dataSwieta}T09:00:00`)
  })
'''
    koniec_describe = planer_test.rfind("\n})")
    if koniec_describe < 0:
        raise RuntimeError("PlanerService.test.ts: nie znaleziono końca describe")
    planer_test = planer_test[:koniec_describe] + testy_integracyjne + planer_test[koniec_describe:]

write(planer_test_rel, planer_test)

print("== 5/6 Kalendarz i formularz urlopów w Grafiku ==")

widok_rel = "src/modules/czas/WidokiCzasu.tsx"
widok = read(widok_rel)

if "eachDayOfInterval" not in widok:
    widok = replace_once(
        widok,
        "import { format } from 'date-fns'\n",
        "import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns'\n"
        "import { pl } from 'date-fns/locale'\n",
        "WidokiCzasu.tsx / date-fns",
    )

if "CalendarDays" not in widok:
    widok = replace_once(
        widok,
        "import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'\n",
        "import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2, X } from 'lucide-react'\n",
        "WidokiCzasu.tsx / ikony",
    )

old_type_import = "import type { BlokCzasu, GrafikPracy, WyjatekGrafiku } from '../../domain/typy'\n"
if old_type_import in widok:
    widok = widok.replace(
        old_type_import,
        "import type { BlokCzasu, GrafikPracy, Urlop, WyjatekGrafiku } from '../../domain/typy'\n",
        1,
    )
elif "Urlop" not in widok:
    raise RuntimeError("WidokiCzasu.tsx: nie rozpoznano importu typów")

if "from '../../services/PolskieSwietaService'" not in widok:
    widok = replace_once(
        widok,
        "import { zaproponujPlan, type WynikPlanera } from '../../services/PlanerService'\n",
        "import { zaproponujPlan, type WynikPlanera } from '../../services/PlanerService'\n"
        "import { pobierzPolskieSwieto } from '../../services/PolskieSwietaService'\n"
        "import { czyZakresySieNakladaja, ETYKIETY_STATUSOW_URLOPU, ETYKIETY_TYPOW_URLOPU, urlopyDnia } from '../../services/UrlopyService'\n",
        "WidokiCzasu.tsx / serwisy",
    )

if "const { dane: urlopy } = useRepozytorium('urlopy')" not in widok:
    widok = replace_once(
        widok,
        "  const { dane: wyjatki } = useRepozytorium('wyjatkiGrafiku')\n",
        "  const { dane: wyjatki } = useRepozytorium('wyjatkiGrafiku')\n"
        "  const { dane: urlopy } = useRepozytorium('urlopy')\n",
        "WidokiCzasu.tsx / Planer repo urlopów",
    )

if "wyjatkiGrafiku: wyjatki, urlopy, odGodziny" not in widok:
    widok = replace_once(
        widok,
        "wyjatkiGrafiku: wyjatki, odGodziny",
        "wyjatkiGrafiku: wyjatki, urlopy, odGodziny",
        "WidokiCzasu.tsx / Planer dane urlopów",
    )

if "function SekcjaKalendarzaGrafiku()" not in widok:
    komponent = r'''
const dniKalendarza = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz']

function SekcjaKalendarzaGrafiku() {
  const { dane: grafik } = useRepozytorium('grafikPracy')
  const { dane: wyjatki } = useRepozytorium('wyjatkiGrafiku')
  const { dane: urlopy, repozytorium: repoUrlopow } = useRepozytorium('urlopy')
  const [miesiac, ustawMiesiac] = useState(() => startOfMonth(new Date()))
  const dzisiaj = dzisiajIso()
  const [formularz, ustawFormularz] = useState<{
    dataOd: string
    dataDo: string
    typ: Urlop['typ']
    status: Urlop['status']
    opis: string
  }>({
    dataOd: dzisiaj,
    dataDo: dzisiaj,
    typ: 'wypoczynkowy',
    status: 'potwierdzony',
    opis: '',
  })
  const [bladUrlopu, ustawBladUrlopu] = useState('')
  const [sukcesUrlopu, ustawSukcesUrlopu] = useState('')

  const zakresKalendarza = {
    start: startOfWeek(startOfMonth(miesiac), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(miesiac), { weekStartsOn: 1 }),
  }
  const datyKalendarza = eachDayOfInterval(zakresKalendarza)
  const posortowaneUrlopy = [...urlopy].sort((a, b) => b.dataOd.localeCompare(a.dataOd))

  const dodajUrlop = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    ustawBladUrlopu('')
    ustawSukcesUrlopu('')

    if (!formularz.dataOd || !formularz.dataDo) {
      ustawBladUrlopu('Podaj początek i koniec urlopu.')
      return
    }
    if (formularz.dataDo < formularz.dataOd) {
      ustawBladUrlopu('Koniec urlopu nie może być wcześniejszy niż początek.')
      return
    }

    const kolizja = urlopy.find((urlop) =>
      urlop.status !== 'anulowany'
      && czyZakresySieNakladaja(urlop, formularz),
    )
    if (kolizja) {
      ustawBladUrlopu(`Zakres nakłada się na istniejący wpis: ${ETYKIETY_TYPOW_URLOPU[kolizja.typ]} (${kolizja.dataOd}–${kolizja.dataDo}).`)
      return
    }

    const nowyUrlop: Urlop = {
      ...utworzMetadane(),
      dataOd: formularz.dataOd,
      dataDo: formularz.dataDo,
      typ: formularz.typ,
      status: formularz.status,
      opis: formularz.opis.trim() || undefined,
    }
    await repoUrlopow.zapisz(nowyUrlop)
    ustawMiesiac(startOfMonth(parseISO(formularz.dataOd)))
    ustawSukcesUrlopu('Urlop został zapisany i oznaczony w kalendarzu.')
    ustawFormularz({
      dataOd: formularz.dataDo,
      dataDo: formularz.dataDo,
      typ: 'wypoczynkowy',
      status: 'potwierdzony',
      opis: '',
    })
  }

  return <section className="sekcja-kalendarza-grafiku">
    <Karta klasa="kalendarz-grafiku">
      <div className="naglowek-karty kalendarz-grafiku__naglowek">
        <div>
          <h2><CalendarDays aria-hidden="true" /> Kalendarz pracy</h2>
          <p>Święta ustawowe i zapisane urlopy wyłączają standardowy grafik. Jawny wyjątek dla konkretnej daty ma pierwszeństwo.</p>
        </div>
        <div className="kalendarz-grafiku__nawigacja">
          <button type="button" className="przycisk-ikona" title="Poprzedni miesiąc" onClick={() => ustawMiesiac((data) => subMonths(data, 1))}><ChevronLeft aria-hidden="true" /></button>
          <strong>{format(miesiac, 'LLLL yyyy', { locale: pl })}</strong>
          <button type="button" className="przycisk-ikona" title="Następny miesiąc" onClick={() => ustawMiesiac((data) => addMonths(data, 1))}><ChevronRight aria-hidden="true" /></button>
          <button type="button" className="przycisk przycisk--drugorzedny przycisk--maly" onClick={() => ustawMiesiac(startOfMonth(new Date()))}>Dzisiaj</button>
        </div>
      </div>

      <div className="kalendarz-grafiku__legenda" aria-label="Legenda kalendarza">
        <span><i className="legenda-kalendarza legenda-kalendarza--swieto" />Święto</span>
        <span><i className="legenda-kalendarza legenda-kalendarza--urlop" />Urlop / wolne</span>
        <span><i className="legenda-kalendarza legenda-kalendarza--wyjatek" />Wyjątek grafiku</span>
      </div>

      <div className="kalendarz-grafiku__scroll">
        <div className="kalendarz-grafiku__dni-tygodnia">
          {dniKalendarza.map((dzien) => <span key={dzien}>{dzien}</span>)}
        </div>
        <div className="kalendarz-grafiku__siatka">
          {datyKalendarza.map((dzien) => {
            const data = format(dzien, 'yyyy-MM-dd')
            const swieto = pobierzPolskieSwieto(data)
            const urlopyTegoDnia = urlopyDnia(urlopy, data)
            const wyjatek = wyjatki.find((element) => element.data === data)
            const standard = grafik.find((element) => element.dzienTygodnia === getDay(dzien) && element.aktywny)
            const wolneSystemowo = !wyjatek && (Boolean(swieto) || urlopyTegoDnia.length > 0)
            const pracuje = wyjatek ? wyjatek.pracuje : !wolneSystemowo && Boolean(standard)
            const godziny = wyjatek
              ? (wyjatek.pracuje ? `${wyjatek.od ?? ''}–${wyjatek.do ?? ''}` : 'Wolne')
              : (pracuje && standard ? `${standard.od}–${standard.do}` : 'Wolne')

            return <article
              key={data}
              className={[
                'kalendarz-grafiku__dzien',
                !isSameMonth(dzien, miesiac) ? 'kalendarz-grafiku__dzien--poza' : '',
                data === dzisiaj ? 'kalendarz-grafiku__dzien--dzisiaj' : '',
                swieto ? 'kalendarz-grafiku__dzien--swieto' : '',
                urlopyTegoDnia.length ? 'kalendarz-grafiku__dzien--urlop' : '',
              ].filter(Boolean).join(' ')}
              aria-label={`${data}: ${godziny}${swieto ? `, ${swieto.nazwa}` : ''}`}
            >
              <div className="kalendarz-grafiku__data">
                <strong>{format(dzien, 'd')}</strong>
                <small>{godziny}</small>
              </div>
              <div className="kalendarz-grafiku__zdarzenia">
                {swieto && <span className="kalendarz-grafiku__znacznik kalendarz-grafiku__znacznik--swieto">{swieto.nazwa}</span>}
                {urlopyTegoDnia.map((urlop) => <span className="kalendarz-grafiku__znacznik kalendarz-grafiku__znacznik--urlop" key={urlop.id}>{ETYKIETY_TYPOW_URLOPU[urlop.typ]}</span>)}
                {wyjatek && <span className="kalendarz-grafiku__znacznik kalendarz-grafiku__znacznik--wyjatek">{wyjatek.pracuje ? 'Wyjątek: praca' : 'Wyjątek: wolne'}</span>}
              </div>
            </article>
          })}
        </div>
      </div>
    </Karta>

    <section className="siatka-dwie-kolumny">
      <Karta>
        <h2>Dodaj urlop / dzień wolny</h2>
        <p className="tekst-pomocniczy">Urlopy są osobnym modelem z zakresem dat, rodzajem i statusem — niezależnie od pojedynczych wyjątków grafiku.</p>
        {bladUrlopu && <Komunikat typ="blad">{bladUrlopu}</Komunikat>}
        {sukcesUrlopu && <Komunikat typ="sukces">{sukcesUrlopu}</Komunikat>}
        <form className="formularz" onSubmit={dodajUrlop}>
          <label className="pole"><span>Od *</span><input type="date" required value={formularz.dataOd} onChange={(e) => ustawFormularz({ ...formularz, dataOd: e.target.value, dataDo: formularz.dataDo < e.target.value ? e.target.value : formularz.dataDo })} /></label>
          <label className="pole"><span>Do *</span><input type="date" required min={formularz.dataOd} value={formularz.dataDo} onChange={(e) => ustawFormularz({ ...formularz, dataDo: e.target.value })} /></label>
          <label className="pole"><span>Rodzaj</span><select value={formularz.typ} onChange={(e) => ustawFormularz({ ...formularz, typ: e.target.value as Urlop['typ'] })}>{Object.entries(ETYKIETY_TYPOW_URLOPU).map(([wartosc, etykieta]) => <option value={wartosc} key={wartosc}>{etykieta}</option>)}</select></label>
          <label className="pole"><span>Status</span><select value={formularz.status} onChange={(e) => ustawFormularz({ ...formularz, status: e.target.value as Urlop['status'] })}>{Object.entries(ETYKIETY_STATUSOW_URLOPU).map(([wartosc, etykieta]) => <option value={wartosc} key={wartosc}>{etykieta}</option>)}</select></label>
          <label className="pole pole--pelne"><span>Opis</span><input value={formularz.opis} onChange={(e) => ustawFormularz({ ...formularz, opis: e.target.value })} placeholder="np. wyjazd, urlop wakacyjny, odbiór dnia wolnego" /></label>
          <button type="submit" className="przycisk przycisk--glowny pole--pelne"><Plus aria-hidden="true" />Dodaj urlop</button>
        </form>
      </Karta>

      <Karta>
        <h2>Urlopy i dni wolne</h2>
        {posortowaneUrlopy.length === 0
          ? <PustyStan tytul="Brak zapisanych urlopów" opis="Dodaj zakres, aby pojawił się w kalendarzu Grafiku." />
          : <div className="lista-urlopow">{posortowaneUrlopy.map((urlop) => <div className="lista-urlopow__wiersz" key={urlop.id}>
            <div>
              <strong>{ETYKIETY_TYPOW_URLOPU[urlop.typ]}</strong>
              <small>{format(parseISO(urlop.dataOd), 'd MMM yyyy', { locale: pl })} – {format(parseISO(urlop.dataDo), 'd MMM yyyy', { locale: pl })}{urlop.opis ? ` · ${urlop.opis}` : ''}</small>
            </div>
            <select aria-label={`Status urlopu ${urlop.dataOd}–${urlop.dataDo}`} value={urlop.status} onChange={(e) => repoUrlopow.zapisz({ ...urlop, status: e.target.value as Urlop['status'], updatedAt: terazIso() })}>
              {Object.entries(ETYKIETY_STATUSOW_URLOPU).map(([wartosc, etykieta]) => <option value={wartosc} key={wartosc}>{etykieta}</option>)}
            </select>
            <button type="button" className="przycisk-ikona przycisk-ikona--niebezpieczny" title="Usuń urlop" onClick={() => repoUrlopow.usun(urlop.id)}><Trash2 aria-hidden="true" /></button>
          </div>)}</div>}
      </Karta>
    </section>
  </section>
}

'''
    widok = replace_once(
        widok,
        "export function WidokGrafiku() {",
        komponent + "export function WidokGrafiku() {",
        "WidokiCzasu.tsx / SekcjaKalendarzaGrafiku",
    )

if "<SekcjaKalendarzaGrafiku />" not in widok:
    stary_naglowek = (
        '    <NaglowekWidoku tytul="Grafik pracy" opis="Stałe godziny tygodnia i wyjątki dla konkretnych dat. '
        'Planer traktuje pracę jako ograniczenie." />\n'
        '    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}\n'
    )
    nowy_naglowek = (
        '    <NaglowekWidoku tytul="Grafik pracy" opis="Stałe godziny tygodnia, kalendarz, urlopy, polskie święta '
        'i wyjątki dla konkretnych dat. Planer traktuje rzeczywisty grafik pracy jako ograniczenie." />\n'
        '    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}\n'
        '    <SekcjaKalendarzaGrafiku />\n'
    )
    widok = replace_once(
        widok,
        stary_naglowek,
        nowy_naglowek,
        "WidokiCzasu.tsx / osadzenie kalendarza",
    )

write(widok_rel, widok)

print("== 6/6 Style ==")

css_rel = "src/styles/glowny.css"
css = read(css_rel)
marker = f"/* {PATCH_ID} */"

if marker not in css:
    css += r'''

/* OGARNIACZ_URLOPY_SWIETA_PL_2026_08 */
.sekcja-kalendarza-grafiku { display: grid; gap: 16px; }
.kalendarz-grafiku__naglowek { align-items: center; }
.kalendarz-grafiku__naglowek h2 svg { color: var(--akcent); }
.kalendarz-grafiku__nawigacja { display: flex; align-items: center; gap: 7px; }
.kalendarz-grafiku__nawigacja > strong { min-width: 150px; text-align: center; text-transform: capitalize; }
.kalendarz-grafiku__legenda { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; margin: 6px 0 12px; color: var(--tekst-2); font-size: .75rem; }
.kalendarz-grafiku__legenda span { display: inline-flex; align-items: center; gap: 6px; }
.legenda-kalendarza { width: 10px; height: 10px; border: 1px solid var(--obramowanie-mocne); border-radius: 999px; }
.legenda-kalendarza--swieto { background: var(--blad-tlo); border-color: color-mix(in srgb, var(--blad) 55%, var(--obramowanie)); }
.legenda-kalendarza--urlop { background: var(--sukces-tlo); border-color: color-mix(in srgb, var(--sukces) 55%, var(--obramowanie)); }
.legenda-kalendarza--wyjatek { background: var(--informacja-tlo); border-color: color-mix(in srgb, var(--informacja) 55%, var(--obramowanie)); }
.kalendarz-grafiku__scroll { min-width: 0; overflow-x: auto; padding-bottom: 2px; }
.kalendarz-grafiku__dni-tygodnia,
.kalendarz-grafiku__siatka { display: grid; min-width: 840px; grid-template-columns: repeat(7, minmax(0, 1fr)); }
.kalendarz-grafiku__dni-tygodnia { color: var(--tekst-2); background: var(--panel-2); border: 1px solid var(--obramowanie); border-bottom: 0; border-radius: var(--promien-pola) var(--promien-pola) 0 0; }
.kalendarz-grafiku__dni-tygodnia span { padding: 7px 9px; text-align: center; font-size: .7rem; font-weight: 760; letter-spacing: .04em; text-transform: uppercase; }
.kalendarz-grafiku__siatka { border-top: 1px solid var(--obramowanie); border-left: 1px solid var(--obramowanie); }
.kalendarz-grafiku__dzien { min-height: 118px; padding: 8px; background: var(--panel); border-right: 1px solid var(--obramowanie); border-bottom: 1px solid var(--obramowanie); }
.kalendarz-grafiku__dzien--poza { opacity: .46; background: var(--panel-2); }
.kalendarz-grafiku__dzien--dzisiaj { box-shadow: inset 0 0 0 2px var(--akcent); }
.kalendarz-grafiku__dzien--swieto { background: color-mix(in srgb, var(--blad-tlo) 42%, var(--panel)); }
.kalendarz-grafiku__dzien--urlop { background: color-mix(in srgb, var(--sukces-tlo) 48%, var(--panel)); }
.kalendarz-grafiku__dzien--swieto.kalendarz-grafiku__dzien--urlop {
  background: linear-gradient(145deg, color-mix(in srgb, var(--blad-tlo) 58%, var(--panel)), color-mix(in srgb, var(--sukces-tlo) 58%, var(--panel)));
}
.kalendarz-grafiku__data { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-bottom: 7px; }
.kalendarz-grafiku__data strong { font-size: .86rem; }
.kalendarz-grafiku__data small { color: var(--tekst-2); font-size: .65rem; }
.kalendarz-grafiku__zdarzenia { display: grid; gap: 4px; }
.kalendarz-grafiku__znacznik { display: block; padding: 3px 5px; overflow: hidden; border: 1px solid var(--obramowanie); border-radius: 5px; font-size: .64rem; font-weight: 680; line-height: 1.25; text-overflow: ellipsis; }
.kalendarz-grafiku__znacznik--swieto { color: var(--blad); background: var(--blad-tlo); border-color: color-mix(in srgb, var(--blad) 30%, var(--obramowanie)); }
.kalendarz-grafiku__znacznik--urlop { color: var(--sukces); background: var(--sukces-tlo); border-color: color-mix(in srgb, var(--sukces) 30%, var(--obramowanie)); }
.kalendarz-grafiku__znacznik--wyjatek { color: var(--informacja); background: var(--informacja-tlo); border-color: color-mix(in srgb, var(--informacja) 30%, var(--obramowanie)); }
.lista-urlopow { display: grid; gap: 7px; }
.lista-urlopow__wiersz { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 9px; padding: 9px 0; border-bottom: 1px solid var(--obramowanie); }
.lista-urlopow__wiersz:last-child { border-bottom: 0; }
.lista-urlopow__wiersz > div { min-width: 0; display: grid; gap: 2px; }
.lista-urlopow__wiersz small { color: var(--tekst-2); font-size: .76rem; }
.lista-urlopow__wiersz select { min-width: 122px; }

@media (max-width: 760px) {
  .kalendarz-grafiku__naglowek { display: grid; }
  .kalendarz-grafiku__nawigacja { width: 100%; flex-wrap: wrap; }
  .kalendarz-grafiku__nawigacja > strong { min-width: 120px; }
  .lista-urlopow__wiersz { grid-template-columns: minmax(0, 1fr) auto; }
  .lista-urlopow__wiersz select { grid-column: 1 / -1; width: 100%; }
}
'''

write(css_rel, css)

print("== Kontrola kompletności ==")

kontrole = {
    "model Urlop": "export interface Urlop extends EncjaBazowa" in read("src/domain/typy.ts"),
    "MapaTabel.urlopy": "  urlopy: Urlop\n" in read("src/domain/typy.ts"),
    "Dexie urlopy": schema_urlopow in read("src/data/BazaOgarniacza.ts"),
    "serwis świąt": p("src/services/PolskieSwietaService.ts").exists(),
    "serwis urlopów": p("src/services/UrlopyService.ts").exists(),
    "kalendarz": "function SekcjaKalendarzaGrafiku()" in read("src/modules/czas/WidokiCzasu.tsx"),
    "Planer": "  urlopy: Urlop[]\n" in read("src/services/PlanerService.ts"),
    "CSS": PATCH_ID in read("src/styles/glowny.css"),
}
braki = [nazwa for nazwa, ok in kontrole.items() if not ok]
if braki:
    raise RuntimeError("Niekompletny patch: " + ", ".join(braki))

for nazwa in kontrole:
    print(f"  OK: {nazwa}")
PY

echo
echo "== Walidacja TypeScript / testy / build =="

if [[ ! -d node_modules ]]; then
  echo "Brak node_modules — uruchamiam npm ci..."
  npm ci
fi

npm run typecheck
npm test
npm run build

echo
echo "============================================================"
echo " PATCH ZASTOSOWANY POMYŚLNIE"
echo "============================================================"
echo
echo "Dodano:"
echo "  - osobny model i tabelę Dexie: urlopy"
echo "  - zakres Od/Do, rodzaj, status i opis urlopu"
echo "  - miesięczny kalendarz w module Grafik"
echo "  - polskie święta stałe i ruchome z polskimi nazwami"
echo "  - Wigilię 24 grudnia jako ustawowy dzień wolny od 2025 r."
echo "  - oznaczenia świąt, urlopów i wyjątków w kalendarzu"
echo "  - pierwszeństwo ręcznego wyjątku nad świętem/urlopem"
echo "  - integrację z Planerem"
echo "  - testy świąt i logiki urlopów"
echo
echo "Backup:"
echo "  ${REPO}/${BACKUP_DIR}"
echo
echo "Stan Git po patchu:"
git --no-pager status --short
echo
echo "Uruchom aplikację:"
echo "  npm run dev"
