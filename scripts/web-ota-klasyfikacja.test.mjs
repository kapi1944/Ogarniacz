import assert from 'node:assert/strict'
import test from 'node:test'
import { czyWymuszenieAdministracyjne, sklasyfikujZmianyWebOta } from './web-ota-klasyfikacja.mjs'

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

test('workflow_dispatch bez jawnego force nie omija klasyfikacji', () => {
  assert.equal(czyWymuszenieAdministracyjne('workflow_dispatch', 'false'), false)
  assert.equal(czyWymuszenieAdministracyjne('workflow_dispatch', ''), false)
})

test('force dziala tylko dla swiadomego workflow_dispatch', () => {
  assert.equal(czyWymuszenieAdministracyjne('workflow_dispatch', 'true'), true)
  assert.equal(czyWymuszenieAdministracyjne('push', 'true'), false)
})

test('odrzuca niejednoznaczne zmiany zaleznosci i konfiguracji Capacitor', () => {
  for (const sciezka of ['package.json', 'package-lock.json', 'capacitor.config.ts']) {
    const wynik = sklasyfikujZmianyWebOta([sciezka])
    assert.equal(wynik.czyPublikowac, false, sciezka)
  }
})
