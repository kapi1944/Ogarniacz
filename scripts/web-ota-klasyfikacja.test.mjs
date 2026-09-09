import assert from 'node:assert/strict'
import test from 'node:test'
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

test('odrzuca niejednoznaczne zmiany zaleznosci i konfiguracji Capacitor', () => {
  for (const sciezka of ['package.json', 'package-lock.json', 'capacitor.config.ts']) {
    const wynik = sklasyfikujZmianyWebOta([sciezka])
    assert.equal(wynik.czyPublikowac, false, sciezka)
  }
})
