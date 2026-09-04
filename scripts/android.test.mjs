import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  obliczKodWersji,
  obliczSha256,
  utworzManifestAktualizacji,
  walidujManifestAktualizacji,
} from './android-wspolne.mjs'

test('oblicza rosnący versionCode z wersji package.json', () => {
  assert.equal(obliczKodWersji('1.0.1'), 1_000_001)
  assert.ok(obliczKodWersji('1.1.0') > obliczKodWersji('1.0.999'))
  assert.throws(() => obliczKodWersji('1.0'), /format X\.Y\.Z/)
})

test('oblicza SHA-256 pliku APK', async () => {
  const katalog = await mkdtemp(join(tmpdir(), 'ogarniacz-android-'))
  try {
    const plik = join(katalog, 'test.apk')
    await writeFile(plik, 'abc')
    assert.equal(await obliczSha256(plik), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  } finally {
    await rm(katalog, { recursive: true, force: true })
  }
})

test('tworzy i waliduje latest.json z względnym adresem APK', async () => {
  const katalog = await mkdtemp(join(tmpdir(), 'ogarniacz-manifest-'))
  try {
    const plikApk = join(katalog, 'Ogarniacz-1.0.1-release.apk')
    const plikManifestu = join(katalog, 'latest.json')
    await writeFile(plikApk, 'apk')
    const manifest = await utworzManifestAktualizacji({
      wersja: '1.0.1',
      sciezkaApk: plikApk,
      opublikowano: new Date('2026-09-04T10:00:00.000Z'),
    })
    await writeFile(plikManifestu, `${JSON.stringify(manifest, null, 2)}\n`)

    const zapisany = JSON.parse(await readFile(plikManifestu, 'utf8'))
    assert.equal(walidujManifestAktualizacji(zapisany).apkUrl, 'Ogarniacz-1.0.1-release.apk')
    assert.equal(zapisany.versionCode, 1_000_001)
  } finally {
    await rm(katalog, { recursive: true, force: true })
  }
})
