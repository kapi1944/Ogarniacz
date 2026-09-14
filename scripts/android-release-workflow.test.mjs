import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('workflow wydania wymaga Environment, buduje przed publikacją i nie zapisuje sekretów', async () => {
  const workflow = await readFile('.github/workflows/android-release.yml', 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /version_bump:/)
  assert.match(workflow, /options: \[patch, minor, major\]/)
  assert.match(workflow, /environment: android-production/)
  assert.match(workflow, /ANDROID_RELEASE_KEYSTORE_BASE64: \$\{\{ secrets\.ANDROID_RELEASE_KEYSTORE_BASE64 \}\}/)
  assert.match(workflow, /VITE_SYNC_API_URL: \$\{\{ vars\.ANDROID_SYNC_API_URL \}\}/)
  assert.match(workflow, /Brak konfiguracji Environment android-production/)
  assert.match(workflow, /VITE_SYNC_API_URL:ANDROID_SYNC_API_URL/)
  assert.match(workflow, /android-release-przygotowanie\.mjs --version-bump/)
  assert.match(workflow, /npm run android:release --/)
  assert.ok(
    workflow.indexOf('Sprawdź jednorazową konfigurację środowiska') < workflow.indexOf('Zainstaluj zależności'),
    'preflight konfiguracji musi nastąpić przed buildem',
  )
  assert.ok(
    workflow.indexOf('Zbuduj, podpisz, zweryfikuj i opublikuj') < workflow.indexOf('Sprawdź tag i punkt zgodności Web OTA'),
    'tag zgodności Web OTA jest sprawdzany dopiero po wydaniu APK',
  )
  assert.doesNotMatch(workflow, /storePassword=UZUPELNIJ|BEGIN PRIVATE KEY/)
})
