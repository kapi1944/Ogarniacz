import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sklasyfikujZmianyWebOta } from './web-ota-klasyfikacja.mjs'

test('dopuszcza zmiany obejmujace wylacznie web', () => {
  const wynik = sklasyfikujZmianyWebOta([
    'src/App.tsx',
    'src/styles.css',
    'public/ikona-192.png',
    'index.html',
  ])
  assert.equal(wynik.czyPublikowac, true)
})

test('odrzuca zmiany natywne Androida', () => {
  const wynik = sklasyfikujZmianyWebOta(['src/App.tsx', 'android/app/src/main/AndroidManifest.xml'])
  assert.equal(wynik.czyPublikowac, false)
  assert.match(wynik.powod, /AndroidManifest\.xml/)
})

test('odrzuca natywny commit przykryty pozniejszym commitem web-only', () => {
  const wynik = sklasyfikujZmianyWebOta([
    'android/app/src/main/java/pl/ogarniacz/app/MainActivity.java',
    'src/styles.css',
  ])
  assert.equal(wynik.czyPublikowac, false)
})

test('dopuszcza web-only po ustawieniu nowego zgodnego punktu APK', () => {
  const wynik = sklasyfikujZmianyWebOta(['src/styles.css'])
  assert.equal(wynik.czyPublikowac, true)
})

test('odrzuca niejednoznaczne zmiany zaleznosci i konfiguracji Capacitor', () => {
  for (const sciezka of [
    'package.json', 'package-lock.json', 'capacitor.config.ts',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/res/xml/network_security_config.xml',
    'android/app/src/main/java/pl/ogarniacz/app/AktualizacjePlugin.java',
    'android/app/build.gradle', 'scripts/android.mjs',
    'src/platform/AktualizacjeWebService.ts',
    'src/services/RuntimeConfigService.ts',
    'src/services/KontrolaAktualizacjiAplikacji.ts',
    'src/app/PotwierdzenieGotowosciBundle.tsx',
  ]) {
    const wynik = sklasyfikujZmianyWebOta([sciezka])
    assert.equal(wynik.czyPublikowac, false, sciezka)
  }
})

test('odrzuca dodanie kamery lub ML Kit wymagajace cap sync', () => {
  for (const sciezka of ['package.json', 'package-lock.json', 'android/app/build.gradle']) {
    const wynik = sklasyfikujZmianyWebOta(['src/modules/zdrowie/WidokiZdrowia.tsx', sciezka])
    assert.equal(wynik.czyPublikowac, false, sciezka)
    assert.match(wynik.powod, new RegExp(sciezka.replaceAll('.', '\\.')))
  }
})

test('ocena historii od tagu dopuszcza web-only i wykrywa przeniesiony plik natywny', () => {
  const katalog = mkdtempSync(join(tmpdir(), 'ogarniacz-web-ota-'))
  const git = (...argumenty) => execFileSync('git', argumenty, { cwd: katalog, encoding: 'utf8' }).trim()
  try {
    git('init', '-b', 'main')
    git('config', 'user.email', 'test@example.invalid')
    git('config', 'user.name', 'Test')
    git('config', 'core.autocrlf', 'false')
    mkdirSync(join(katalog, 'src'))
    mkdirSync(join(katalog, 'android'))
    writeFileSync(join(katalog, 'src', 'widok.tsx'), 'export const a = 1\n')
    writeFileSync(join(katalog, 'android', 'AndroidManifest.xml'), '<manifest/>\n')
    git('add', '.')
    git('commit', '-m', 'baza APK')
    git('tag', 'v1.0.13')
    writeFileSync(join(katalog, 'src', 'widok.tsx'), 'export const a = 2\n')
    git('add', '.')
    git('commit', '-m', 'web')
    const sciezki = () => git('log', '--no-renames', '--format=', '--name-only', '-z', 'v1.0.13..HEAD').split('\0')
    assert.equal(sklasyfikujZmianyWebOta(sciezki()).czyPublikowac, true)
    git('config', 'diff.renames', 'true')
    git('mv', 'android/AndroidManifest.xml', 'src/przeniesiony.ts')
    git('commit', '-m', 'przeniesienie native do web')
    assert.equal(sklasyfikujZmianyWebOta(sciezki()).czyPublikowac, false)
    git('mv', 'src/przeniesiony.ts', 'android/AndroidManifest.xml')
    git('commit', '-m', 'cofnięcie przeniesienia')
    assert.equal(sklasyfikujZmianyWebOta(sciezki()).czyPublikowac, false)
  } finally { rmSync(katalog, { recursive: true, force: true }) }
})
