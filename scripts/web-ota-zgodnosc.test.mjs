import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import {
  odczytajMinNativeVersionCode,
  SCIEZKA_ZGODNOSCI_WEB_OTA,
  utworzTagApkDlaKoduWersji,
  wczytajMinNativeVersionCode,
} from './web-ota-zgodnosc.mjs'

test('konfiguracja zgodnosci udostepnia biezacy kontrolowany kod APK', async () => {
  const tresc = await readFile(SCIEZKA_ZGODNOSCI_WEB_OTA, 'utf8')
  const minNativeVersionCode = odczytajMinNativeVersionCode(tresc)
  assert.equal(minNativeVersionCode, await wczytajMinNativeVersionCode())
  assert.ok(minNativeVersionCode > 0)
})

test('punkt zgodnosci wskazuje tag wydanego APK', () => {
  assert.equal(utworzTagApkDlaKoduWersji(1_000_008), 'v1.0.8')
})

test('generator i workflow nie maja drugiego zrodla minNativeVersionCode', async () => {
  const [generator, workflow] = await Promise.all([
    readFile('scripts/web-ota-manifest.mjs', 'utf8'),
    readFile('.github/workflows/web-ota.yml', 'utf8'),
  ])
  assert.match(generator, /wczytajMinNativeVersionCode/)
  assert.doesNotMatch(generator, /package\.json|min-native-version-code/)
  assert.match(workflow, /config\/web-ota-compatibility\.json/)
  assert.doesNotMatch(workflow, /min_native_version_code|github\.event\.before/)
  assert.match(workflow, /workflow_run:/)
  assert.match(workflow, /workflows: \[CI\]/)
  assert.match(workflow, /github\.event\.workflow_run\.head_sha \|\| github\.sha/)
  assert.match(workflow, /actions\/workflows\/ci\.yml\/runs\?head_sha=\$COMMIT_CI/)
  assert.match(workflow, /git diff --name-only -z "\$tag_zgodnego_apk" "\$commit_ci"/)
  assert.match(workflow, /commit_bundla="\$\(git rev-list -n 1 "\$tag_zgodnego_apk"\)"/)
  assert.match(workflow, /--commit-sha "\$\{\{ needs\.ocena\.outputs\.commit_bundla \}\}"/)
  assert.doesNotMatch(workflow, /force_web_ota|--wymuszenie/)
  assert.match(workflow, /VITE_SYNC_API_URL: ''/)
  assert.match(workflow, /Zweryfikuj lokalny ZIP i manifest/)
  assert.match(workflow, /Pobierz i zweryfikuj ZIP przed publikacja manifestu/)
  assert.match(workflow, /name: Pobierz repozytorium\s+uses: actions\/checkout@v4\s+with:\s+ref: \$\{\{ needs\.ocena\.outputs\.commit_bundla \}\}/)
})

test('bramka publikacji wymaga publicznego APK odpowiadającego punktowi zgodności', async () => {
  const workflow = await readFile('.github/workflows/web-ota.yml', 'utf8')
  const kod = workflow.match(/node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n\s*NODE/)?.[1]
  assert.ok(kod, 'Brak wykonywalnej bramki wydanego APK')
  const manifest = { versionName: '1.0.13', versionCode: 1000013, apkUrl: 'Ogarniacz-1.0.13-release.apk', sha256: 'a'.repeat(64), size: 123 }
  const wydanie = { draft: false, prerelease: false, assets: [
    { name: 'latest.json', browser_download_url: 'https://example.test/latest.json' },
    { name: manifest.apkUrl, size: manifest.size },
  ] }
  const przypadki = [
    { nazwa: 'publiczne zgodne APK', wydanie, manifest, poprawny: true },
    { nazwa: 'tag z draftem', wydanie: { ...wydanie, draft: true }, manifest },
    { nazwa: 'prerelease', wydanie: { ...wydanie, prerelease: true }, manifest },
    { nazwa: 'brak APK', wydanie: { ...wydanie, assets: wydanie.assets.slice(0, 1) }, manifest },
    { nazwa: 'brak manifestu', wydanie: { ...wydanie, assets: wydanie.assets.slice(1) }, manifest },
    { nazwa: 'inne APK', wydanie, manifest: { ...manifest, versionName: '1.0.12', versionCode: 1000012 } },
    { nazwa: 'niepełny upload', wydanie, manifest: { ...manifest, size: 124 } },
    { nazwa: 'manifest niedostępny publicznie', wydanie, manifest, niedostepny: true },
  ]
  for (const przypadek of przypadki) {
    const przygotowanie = `globalThis.fetch = async () => ({ ok: ${!przypadek.niedostepny}, json: async () => (${JSON.stringify(przypadek.manifest)}) });\n`
    const wynik = spawnSync(process.execPath, ['--input-type=module', '--eval', przygotowanie + kod], {
      encoding: 'utf8',
      env: { ...process.env, WYDANIE_APK: JSON.stringify(przypadek.wydanie), KOD_APK: '1000013' },
    })
    assert.equal(wynik.status === 0, Boolean(przypadek.poprawny), `${przypadek.nazwa}: ${wynik.stderr}`)
  }
})
