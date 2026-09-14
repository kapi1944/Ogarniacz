import assert from 'node:assert/strict'
import test from 'node:test'
import { przygotujWydanie, wyznaczNastepnaWersje } from './android-release-przygotowanie.mjs'

test('wyznacza patch, minor i major bez ręcznego versionCode', () => {
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'patch'), '1.0.10')
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'minor'), '1.1.0')
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'major'), '2.0.0')
})

test('aktualizuje package, lock i punkt zgodności Web OTA jedną wersją', () => {
  const wynik = przygotujWydanie({
    pakiet: { name: 'ogarniacz-v1', version: '1.0.9' },
    lock: { name: 'ogarniacz-v1', version: '1.0.9', packages: { '': { version: '1.0.9' } } },
    zgodnosc: { minNativeVersionCode: 1_000_009 },
    rodzajWersji: 'patch',
    wersjaOpublikowana: '1.0.9',
  })
  assert.equal(wynik.wersja, '1.0.10')
  assert.equal(wynik.kodWersji, 1_000_010)
  assert.equal(wynik.pakiet.version, wynik.lock.packages[''].version)
  assert.equal(wynik.zgodnosc.minNativeVersionCode, wynik.kodWersji)
})

test('bazuje na nowszej wersji opublikowanej, gdy checkout jest opóźniony', () => {
  const wynik = przygotujWydanie({
    pakiet: { version: '1.0.9' }, lock: { packages: { '': {} } },
    zgodnosc: { minNativeVersionCode: 1_000_009 }, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.10',
  })
  assert.equal(wynik.wersja, '1.0.11')
  assert.equal(wynik.kodWersji, 1_000_011)
})

test('nie pozwala przygotować wydania bez wzrostu punktu zgodności', () => {
  assert.throws(() => przygotujWydanie({
    pakiet: { version: '1.0.9' }, lock: { packages: { '': {} } },
    zgodnosc: { minNativeVersionCode: 1_000_010 }, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.9',
  }), /większy/)
})
