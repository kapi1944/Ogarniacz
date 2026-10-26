import assert from 'node:assert/strict'
import test from 'node:test'
import { przygotujWydanie, wyznaczNastepnaWersje } from './android-release-przygotowanie.mjs'

test('wyznacza patch, minor i major bez ręcznego versionCode', () => {
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'patch'), '1.0.10')
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'minor'), '1.1.0')
  assert.equal(wyznaczNastepnaWersje('1.0.9', 'major'), '2.0.0')
})

test('domyślny patch prowadzi 1.0.23 → 1.1.0 → 1.1.1 bez zmiany obiektów wejściowych', () => {
  const pakiet = { version: '1.0.23' }
  const lock = { version: '1.0.23', packages: { '': { version: '1.0.23' } } }
  const pierwszy = przygotujWydanie({ pakiet, lock, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.23', wersjaMaTag: true })
  assert.equal(pierwszy.wersja, '1.1.0')
  assert.equal(pierwszy.kodWersji, 1_001_000)
  assert.equal(pakiet.version, '1.0.23')
  assert.equal(lock.version, '1.0.23')
  const kolejny = przygotujWydanie({ pakiet: pierwszy.pakiet, lock: pierwszy.lock, rodzajWersji: 'patch', wersjaOpublikowana: '1.1.0', wersjaMaTag: true })
  assert.equal(kolejny.wersja, '1.1.1')
  assert.equal(kolejny.kodWersji, 1_001_001)
  assert.equal(wyznaczNastepnaWersje('1.1.1', 'minor'), '1.2.0')
  assert.equal(wyznaczNastepnaWersje('1.1.1', 'major'), '2.0.0')
})

test('wznowienie 1.1.0 zachowuje numer, a przygotowane 1.0.24 jest blokowane', () => {
  const opcje = { rodzajWersji: 'patch', wersjaOpublikowana: '1.0.23' }
  const wynik = przygotujWydanie({ ...opcje, pakiet: { version: '1.1.0' }, lock: { version: '1.1.0', packages: { '': { version: '1.1.0' } } } })
  assert.equal(wynik.tryb, 'przygotowane')
  assert.equal(wynik.wersja, '1.1.0')
  assert.throws(() => przygotujWydanie({ ...opcje, pakiet: { version: '1.0.24' }, lock: { version: '1.0.24', packages: { '': { version: '1.0.24' } } } }), /jawnego wznowienia/)
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
test('przyjmuje tylko dokładnie przygotowaną następną wersję bez istniejącego tagu', () => {
  const pakiet = { name: 'ogarniacz-v1', version: '1.0.10' }
  const lock = { version: '1.0.10', packages: { '': { version: '1.0.10' } } }
  const wynik = przygotujWydanie({ pakiet, lock, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.9' })
  assert.equal(wynik.wersja, '1.0.10')
  assert.equal(wynik.kodWersji, 1_000_010)
  assert.equal(wynik.tryb, 'przygotowane')
  assert.throws(() => przygotujWydanie({ pakiet: { version: '1.0.11' }, lock, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.9' }), /jawnego wznowienia/)
  assert.throws(() => przygotujWydanie({ pakiet, lock, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.9', wersjaMaTag: true }), /jawnego wznowienia/)
})
test('opublikowana wersja otrzymuje następny versionCode', () => {
  const wynik = przygotujWydanie({ pakiet: { version: '1.0.10' }, lock: {}, rodzajWersji: 'patch', wersjaOpublikowana: '1.0.10', wersjaMaTag: true })
  assert.equal(wynik.wersja, '1.0.11')
  assert.equal(wynik.tryb, 'nowe')
})
