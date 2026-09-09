import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  odczytajMinNativeVersionCode,
  SCIEZKA_ZGODNOSCI_WEB_OTA,
  utworzTagApkDlaKoduWersji,
} from './web-ota-zgodnosc.mjs'

test('konfiguracja bootstrapowa wymaga APK 1.0.7', async () => {
  const tresc = await readFile(SCIEZKA_ZGODNOSCI_WEB_OTA, 'utf8')
  assert.equal(odczytajMinNativeVersionCode(tresc), 1_000_007)
})

test('punkt zgodnosci wskazuje tag wydanego APK', () => {
  assert.equal(utworzTagApkDlaKoduWersji(1_000_007), 'v1.0.7')
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
  assert.match(workflow, /git diff --name-only -z "\$tag_zgodnego_apk" "\$GITHUB_SHA"/)
  assert.ok(
    workflow.indexOf('refs/tags/$tag_zgodnego_apk') < workflow.indexOf('--wymuszenie'),
    'force_web_ota nie moze omijac wymaganego tagu APK',
  )
})
