import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('workflow wydania wymaga Environment, buduje APK raz i publikuje gotowy artefakt', async () => {
  const workflow = await readFile('.github/workflows/android-release.yml', 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /version_bump:/)
  assert.match(workflow, /options: \[patch, minor, major\]/)
  assert.match(workflow, /environment: android-production/)
  assert.match(workflow, /ANDROID_RELEASE_KEYSTORE_BASE64: \$\{\{ secrets\.ANDROID_RELEASE_KEYSTORE_BASE64 \}\}/)
  assert.match(workflow, /VITE_SYNC_API_URL: \$\{\{ vars\.ANDROID_SYNC_API_URL \}\}/)
  assert.match(workflow, /ANDROID_WEB_OTA_PUBLIC_KEY_PEM: \$\{\{ vars\.ANDROID_WEB_OTA_PUBLIC_KEY_PEM \}\}/)
  assert.match(workflow, /Brak konfiguracji Environment android-production/)
  assert.match(workflow, /VITE_SYNC_API_URL:ANDROID_SYNC_API_URL/)
  assert.match(workflow, /ANDROID_WEB_OTA_PUBLIC_KEY_PEM:ANDROID_WEB_OTA_PUBLIC_KEY_PEM/)
  assert.match(workflow, /printf '%s\\n' "\$ANDROID_WEB_OTA_PUBLIC_KEY_PEM" > android\/web-ota-public-key\.pem/)
  assert.match(workflow, /test -f android\/web-ota-public-key\.pem/)
  assert.match(workflow, /test -s android\/web-ota-public-key\.pem/)
  assert.match(workflow, /grep -q 'BEGIN PUBLIC KEY' android\/web-ota-public-key\.pem/)
  assert.match(workflow, /grep -q 'END PUBLIC KEY' android\/web-ota-public-key\.pem/)
  assert.match(workflow, /tr -d '\[:space:\]:'/)
  assert.match(workflow, /tr '\[:upper:\]' '\[:lower:\]'/)
  assert.match(workflow, /android-release-przygotowanie\.mjs --version-bump/)
  assert.match(workflow, /git diff --cached --quiet/)
  assert.match(workflow, /test -x android\/gradlew \|\| chmod \+x android\/gradlew/)
  assert.equal(workflow.match(/npm run android:release --/g)?.length, 2)
  assert.match(workflow, /npm run android:release -- --publish-existing/)
  assert.ok(
    workflow.indexOf('Sprawdź jednorazową konfigurację środowiska') < workflow.indexOf('Zainstaluj zależności'),
    'preflight konfiguracji musi nastąpić przed buildem',
  )
  assert.ok(
    workflow.indexOf('Opublikuj tylko po przygotowaniu artefaktów') < workflow.indexOf('Sprawdź tag i punkt zgodności Web OTA'),
    'tag zgodności Web OTA jest sprawdzany dopiero po wydaniu APK',
  )
  const skrypt = await readFile('scripts/android.mjs', 'utf8')
  assert.match(skrypt, /verify', '--print-certs'/)
  assert.match(skrypt, /sha256Certyfikatu/)
  assert.doesNotMatch(workflow, /storePassword=UZUPELNIJ|BEGIN PRIVATE KEY/)
})
