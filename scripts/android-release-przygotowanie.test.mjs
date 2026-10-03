import assert from 'node:assert/strict'
import test from 'node:test'
import { przygotujWydanie, wyznaczNastepnaWersje } from './android-release-przygotowanie.mjs'

test('wyznacza patch, minor i major bez ręcznego versionCode', () => {
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'patch'), '1.0.10')
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'minor'), '1.1.0')
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'major'), '2.0.0')
})
test('aktualizuje tylko package i lock, bez zgodności Web OTA', () => {
  const wynik = przygotujWydanie({
    pakiet: { name: 'ogarniacz-v1', version: '1.0.9' },
    lock: { version: '1.0.9', packages: { '': { version: '1.0.9' } } },
    rodzajWersji: 'patch', wersjaOpublikowana: '1.0.9',
  })
  assert.equal(wynik.wersja, '1.0.10')
  assert.equal(wynik.kodWersji, 1_000_010)
  assert.equal(wynik.pakiet.version, wynik.lock.packages[''].version)
  assert.equal(wynik.zgodnosc, undefined)
})
test('bazuje na nowszej wersji opublikowanej', () => {
  const wynik = przygotujWydanie({ pakiet: { version: '1.0.9' }, lock: {}, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.10' })
  assert.equal(wynik.wersja, '1.0.11')
})
test('nieopublikowana wersja wymaga jawnego wznowienia bez kolejnego bumpa', () => {
  assert.throws(() => przygotujWydanie({ pakiet: { version: '1.0.10' }, lock: {}, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.9' }), /jawnego wznowienia/)
})
test('opublikowana wersja otrzymuje następny versionCode', () => {
  const wynik = przygotujWydanie({ pakiet: { version: '1.0.10' }, lock: {}, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.10', wersjaMaTag: true })
  assert.equal(wynik.wersja, '1.0.11')
  assert.equal(wynik.tryb, 'nowe')
})
