import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { numeracjaBety, sprawdzPodpisBety, sprawdzPakietBety, przygotujPodpisBety } from './android-beta.mjs'

test('kolejne przebiegi rosną, ponowienie i przekroczenie limitu są blokowane', () => {
  assert.deepEqual(numeracjaBety(42), { kod: 42, wersja: '1.1.0-beta.42' })
  assert.ok(numeracjaBety(43).kod > numeracjaBety(42).kod)
  for (const numer of [0, -1, 1.5, '01', 2100000001, NaN]) assert.throws(() => numeracjaBety(numer))
  assert.throws(() => numeracjaBety(42, 2))
})
test('podpis wymaga jednego certyfikatu zgodnego z niezależnym przypięciem', () => {
  const podpis = 'Signer #1 certificate SHA-256 digest: ' + 'a'.repeat(64) + '\n'
  assert.equal(sprawdzPodpisBety(podpis, 'a'.repeat(64)), 'a'.repeat(64))
  for (const wynik of ['', podpis + podpis, podpis.replace('a'.repeat(64), 'b'.repeat(64))]) assert.throws(() => sprawdzPodpisBety(wynik, 'a'.repeat(64)))
  assert.throws(() => sprawdzPodpisBety(podpis, undefined))
})
test('APK Stable i downgrade nie przechodzą jako Beta', () => {
  const wynik = "package: name='pl.ogarniacz.app.beta' versionCode='42' versionName='1.1.0-beta.42'"
  sprawdzPakietBety(wynik, { numerBuildu: 42, proba: 1 })
  for (const bledny of [wynik.replace('.app.beta', '.app'), wynik.replace("versionCode='42'", "versionCode='41'"), wynik.replace('beta.42', 'beta.41')]) assert.throws(() => sprawdzPakietBety(bledny, { numerBuildu: 42, proba: 1 }))
})
test('brak sekretów pomija APK i zapisuje stan wymaga konfiguracji', async () => {
  const katalog = await mkdtemp(join(tmpdir(), 'beta-'))
  try {
    const podsumowanie = join(katalog, 'summary')
    await przygotujPodpisBety({ GITHUB_STEP_SUMMARY: podsumowanie })
    assert.match(await readFile(podsumowanie, 'utf8'), /wymaga konfiguracji/)
  } finally { await rm(katalog, { recursive: true }) }
})
