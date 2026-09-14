import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { obliczOdciskKluczaPublicznego, utworzPodpisanyManifest } from './web-ota-manifest.mjs'
import { zweryfikujArtefaktWebOta } from './web-ota-weryfikacja.mjs'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 })
const kluczPrywatnyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const odcisk = obliczOdciskKluczaPublicznego(kluczPrywatnyPem)

test('weryfikuje SHA, podpis, commit i zgodnosc APK lokalnego artefaktu', async (t) => {
  const katalog = await mkdtemp(join(tmpdir(), 'ogarniacz-web-ota-'))
  t.after(() => rm(katalog, { recursive: true, force: true }))
  const plikZip = join(katalog, 'web-ota.zip')
  const plikManifestu = join(katalog, 'web-ota.json')
  const commitSha = 'a'.repeat(40)
  await writeFile(plikZip, 'testowy bundle')
  const manifest = utworzPodpisanyManifest({
    bundleVersion: 'abc1234', commitSha,
    url: 'https://github.com/kapi1944/Ogarniacz/releases/download/web-ota/web-ota.zip',
    sha256: 'e522a5d0ec83dfc5d454dc37001a0761f340a67857accaa421ca676c4ae79c6a',
    minNativeVersionCode: 1_000_009,
    publishedAt: '2026-09-14T12:00:00.000Z',
    kluczPrywatnyPem,
    oczekiwanyOdciskKlucza: odcisk,
  })
  await writeFile(plikManifestu, JSON.stringify(manifest))

  const wynik = await zweryfikujArtefaktWebOta({ plikZip, plikManifestu, commitSha, kluczPrywatnyPem, oczekiwanyOdciskKlucza: odcisk })
  assert.equal(wynik.commitSha, commitSha)
})

test('odrzuca manifest wskazujacy inny commit', async (t) => {
  const katalog = await mkdtemp(join(tmpdir(), 'ogarniacz-web-ota-'))
  t.after(() => rm(katalog, { recursive: true, force: true }))
  const plikZip = join(katalog, 'web-ota.zip')
  const plikManifestu = join(katalog, 'web-ota.json')
  await writeFile(plikZip, 'testowy bundle')
  const manifest = utworzPodpisanyManifest({
    bundleVersion: 'abc1234', commitSha: 'b'.repeat(40),
    url: 'https://github.com/kapi1944/Ogarniacz/releases/download/web-ota/web-ota.zip',
    sha256: 'e522a5d0ec83dfc5d454dc37001a0761f340a67857accaa421ca676c4ae79c6a',
    minNativeVersionCode: 1_000_009,
    publishedAt: '2026-09-14T12:00:00.000Z',
    kluczPrywatnyPem,
    oczekiwanyOdciskKlucza: odcisk,
  })
  await writeFile(plikManifestu, JSON.stringify(manifest))
  await assert.rejects(
    zweryfikujArtefaktWebOta({ plikZip, plikManifestu, commitSha: 'a'.repeat(40), kluczPrywatnyPem, oczekiwanyOdciskKlucza: odcisk }),
    /commit SHA/,
  )
})
