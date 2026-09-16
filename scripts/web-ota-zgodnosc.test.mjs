import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
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
})
