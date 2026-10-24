#!/usr/bin/env python3
"""Ogarniacz stage 1: conservative, explicit edits; run from the repository root.

Does not push, publish, deploy, read secret env files, or access user databases.
Use only against the reviewed 2026-10-23 baseline; abort on conflicts.
"""
from pathlib import Path
import sys
import subprocess

ROOT = Path.cwd()
BUNDLE = Path(__file__).resolve().parent
EXPECTED_HEAD = "d17897925b1b9bcc9f7fec170c11a1379b187ec0"
EXPECTED_BLOBS = {
    "src/services/KontrolaAktualizacjiAplikacji.ts": "240bb05f2c67ce3fac219fe17cee87e58675ebe8",
    "src/services/KontrolaAktualizacjiAplikacji.test.ts": "11a6346063be9e8049757543b29ab533a8c3b7fd",
    "docs/SMOKE_ANDROID_WEB_RASPBERRY.md": "1add5810a62839e9214cf8d02642da61a954e40b",
    "docs/ANDROID_RELEASE.md": "c87353a153ad40d7028a6b23b83196d941529aef",
    "docs/SECURITY.md": "01d3dcd976e0790628a849876bb62faef6cf2e38",
    "AGENTS.md": "ed3ce57726b27a8b683409fcbbac3318363bc0cd",
    "docs/ROADMAP.md": "aa1d59687528faffff01f0dd9ac9211b84870645",
    "docs/OPEN_DECISIONS.md": "a5e651e599e14e86f3a0e6e929368161844cb4f5",
}


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


if git("rev-parse", "HEAD") != EXPECTED_HEAD:
    raise RuntimeError("HEAD repozytorium nie jest zgodny z punktem odniesienia. Codex powinien przygotować scaloną zmianę dla aktualnego main.")
if git("status", "--porcelain", "--untracked-files=no"):
    raise RuntimeError("Drzewo robocze ma lokalne zmiany. Nie nadpisuję żadnego pliku.")
for expected_path, expected_sha in EXPECTED_BLOBS.items():
    if git("rev-parse", f"HEAD:{expected_path}") != expected_sha:
        raise RuntimeError(f"Zmieniony plik w bazowym commicie: {expected_path}. Przerwij i porównaj.")


def replace_once(path: str, before: str, after: str):
    target = ROOT / path
    text = target.read_text(encoding="utf-8-sig")
    if text.count(before) != 1:
        raise RuntimeError(f"Nieoczekiwany stan {path}: wzorzec znaleziono {text.count(before)} razy. Przerwij i porównaj ręcznie.")
    return path, text.replace(before, after)

changes = []
changes.append(replace_once(
    "src/services/KontrolaAktualizacjiAplikacji.ts",
    "zapiszStan({ bladApk, sprawdzono: true })",
    "zapiszStan({ wynikApk: undefined, bladApk, sprawdzono: true })",
))

new_test = '''\nit('po błędzie ponownej kontroli usuwa nieaktualny wynik APK i odzyskuje stan po sukcesie', async () => {
  const kontrola = await import('./KontrolaAktualizacjiAplikacji')
  sprawdzApk.mockResolvedValueOnce({ czyNowsza: true }).mockRejectedValueOnce(new Error('brak sieci'))
    .mockResolvedValueOnce({ czyNowsza: false })
  await kontrola.sprawdzAktualizacjeApk()
  expect(kontrola.pobierzStanKontroliAktualizacji().wynikApk?.czyNowsza).toBe(true)
  await expect(kontrola.sprawdzAktualizacjeApk()).rejects.toThrow('brak sieci')
  expect(kontrola.pobierzStanKontroliAktualizacji()).toMatchObject({
    wynikApk: undefined, bladApk: 'brak sieci', sprawdzono: true,
  })
  await kontrola.sprawdzAktualizacjeApk()
  expect(kontrola.pobierzStanKontroliAktualizacji()).toMatchObject({
    wynikApk: { czyNowsza: false }, bladApk: undefined, sprawdzono: true,
  })
})
'''
test_file = "src/services/KontrolaAktualizacjiAplikacji.test.ts"
original_test = (ROOT / test_file).read_text(encoding="utf-8-sig")
if "po błędzie ponownej kontroli usuwa nieaktualny wynik APK" in original_test:
    raise RuntimeError("Test już istnieje, nie modyfikuj go po raz drugi.")
if "sprawdza przy każdym starcie mimo zapisanej kontroli" not in original_test:
    raise RuntimeError("Testy zmieniły się od czasu przygotowania. Zweryfikuj ręcznie.")
changes.append((test_file, original_test.rstrip() + "\n" + new_test))

smoke_file = "docs/SMOKE_ANDROID_WEB_RASPBERRY.md"
smoke = (ROOT / smoke_file).read_text(encoding="utf-8-sig")
start = smoke.find("## 9. Web OTA na Samsungu")
end = smoke.find("## 10. Sprawdzenie nowego APK")
if start == -1 or end <= start:
    raise RuntimeError("Nie znaleziono historycznego testu Web OTA. Zweryfikuj aktualną dokumentację.")
smoke = smoke[:start] + smoke[end:].replace("## 10. Sprawdzenie nowego APK", "## 9. Sprawdzenie nowego APK", 1)
smoke = smoke.replace("Jeżeli dla Raspberry, Web OTA albo APK nie ma nowszej wersji", "Web OTA jest wycofane i nie jest testowane. Jeżeli dla Raspberry albo APK nie ma nowszej wersji")
smoke = smoke.replace("każdy dostępny kanał aktualizacji przechodzi odpowiedni punkt 8–10", "każdy dostępny kanał aktualizacji przechodzi odpowiedni punkt 8–9")
changes.append((smoke_file, smoke))

release_file = "docs/ANDROID_RELEASE.md"
release = (ROOT / release_file).read_text(encoding="utf-8-sig")
marker = "## TEST A — Samsung 1.0.13 → 1.0.14"
if release.count(marker) != 1:
    raise RuntimeError("Nieaktualny układ ANDROID_RELEASE.md")
release = release.replace(marker, """## Historyczne scenariusze testowe instalatora APK

Poniższe testy A/B dokumentują starszą ścieżkę regresji 1.0.13–1.0.15+. Nie są aktualnym planem wydania ani potwierdzeniem testów na fizycznym Samsungu. Dla bieżącej wersji zastosuj punkt 9 z [SMOKE_ANDROID_WEB_RASPBERRY.md](SMOKE_ANDROID_WEB_RASPBERRY.md): odczyt faktycznego versionCode i przejście tylko do autoryzowanego, opublikowanego wyższego kodu.

""" + marker)
changes.append((release_file, release))

security_file = "docs/SECURITY.md"
security = (ROOT / security_file).read_text(encoding="utf-8-sig")
marker = "## Nigdy nie rób"
if security.count(marker) != 1:
    raise RuntimeError("Nieaktualny układ SECURITY.md")
security = security.replace(marker, """## Historyczny eksport w publicznym repozytorium (do decyzji właściciela)

Commit `901c3627` zawierał plik o nazwie `ogarniacz-przed-migracja.json`. Commit `cb6198f` usunął go ze śledzonych plików, a `.gitignore` ogranicza ryzyko ponownego przypadkowego dodania. **Nie oznacza to usunięcia danych z historii ani cudzych klonów.**

Nie odczytuj, nie publikuj i nie wklejaj zawartości historycznego eksportu do logów, zgłoszeń, AI ani raportów. Właściciel powinien lokalnie ocenić jego charakter i zakres (w tym ewentualne sekrety), a następnie podjąć decyzję o konieczności rotacji, usunięcia historii według kontrolowanej procedury oraz poinformowaniu osób mających dostęp. Historia Git jest publiczna: samo usunięcie pliku w nowym commicie nie usuwa ekspozycji. Przepisywanie historii / force-push wymaga osobnej zgody i planu dla wszystkich kopii repozytorium.

""" + marker)
changes.append((security_file, security))

agents_file = "AGENTS.md"
agents = (ROOT / agents_file).read_text(encoding="utf-8-sig")
old = "`docs/web-ota.md` — OTA i release webowy"
new = "`docs/ANDROID_RELEASE.md` — aktualne wydania APK i rpi-stable; `docs/web-ota.md` — dokumentacja historyczna wycofanego Web OTA"
if agents.count(old) != 1:
    raise RuntimeError("Nieaktualny układ AGENTS.md")
changes.append((agents_file, agents.replace(old, new)))

for p in ["docs/ROADMAP.md", "docs/OPEN_DECISIONS.md"]:
    current = (ROOT / p).read_text(encoding="utf-8-sig")
    expected = "# Roadmapa po Ogarniaczu v1" if "ROADMAP" in p else "# Otwarte decyzje"
    if not current.startswith(expected):
        raise RuntimeError(f"Nieoczekiwany nowy dokument {p}; nie nadpisuj!")
    changes.append((p, (BUNDLE / p).read_text(encoding="utf-8")))

new_doc = "docs/ETAP_1_WERYFIKACJA_2026-10-23.md"
if (ROOT / new_doc).exists():
    raise RuntimeError(f"{new_doc} już istnieje; porównaj zmiany.")
changes.append((new_doc, (BUNDLE / new_doc).read_text(encoding="utf-8")))

print(f"Zweryfikowano {len(changes)} modyfikacji. Zapisuję bez wdrażania produkcyjnego...")
for path, content in changes:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    raw = target.read_bytes() if target.exists() else b""
    prefix = "\ufeff" if raw.startswith(b"\xef\xbb\xbf") else ""
    newline = "\r\n" if b"\r\n" in raw else "\n"
    normalized = content.replace("\r\n", "\n").replace("\n", newline)
    target.write_bytes((prefix + normalized).encode("utf-8"))
    print("OK:", path)
print("Gotowe. Uruchom testy celowane, lint, typecheck, build i git diff --check. Nie publikuj automatycznie.")
