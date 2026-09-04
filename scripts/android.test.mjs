import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  obliczKodWersji,
  obliczSha256,
  czyZgodnyJdk,
  parsujUrzadzeniaAdb,
  utworzManifestAktualizacji,
  walidujManifestAktualizacji,
  wybierzUrzadzenieAdb,
} from './android-wspolne.mjs'

test('oblicza rosnący versionCode z wersji package.json', () => {
  assert.equal(obliczKodWersji('1.0.1'), 1_000_001)
  assert.ok(obliczKodWersji('1.1.0') > obliczKodWersji('1.0.999'))
  assert.throws(() => obliczKodWersji('1.0'), /format X\.Y\.Z/)
})

test('akceptuje dokładnie JDK wymagane przez toolchain Capacitor', () => {
  assert.equal(czyZgodnyJdk(21, 21), true)
  assert.equal(czyZgodnyJdk(17, 21), false)
  assert.equal(czyZgodnyJdk(25, 21), false)
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

test('pozwala skonfigurować bazowy adres manifestu bez wiązania z dostawcą', async () => {
  const katalog = await mkdtemp(join(tmpdir(), 'ogarniacz-adres-'))
  try {
    const plikApk = join(katalog, 'Ogarniacz-1.0.1-release.apk')
    await writeFile(plikApk, 'apk')
    const manifest = await utworzManifestAktualizacji({
      wersja: '1.0.1',
      sciezkaApk: plikApk,
      bazowyAdres: 'https://ogarniacz.local/updates',
    })
    assert.equal(manifest.apkUrl, 'https://ogarniacz.local/updates/Ogarniacz-1.0.1-release.apk')
  } finally {
    await rm(katalog, { recursive: true, force: true })
  }
})

test('rozpoznaje USB i Wi-Fi oraz wymaga wyboru przy wielu urządzeniach', () => {
  const urzadzenia = parsujUrzadzeniaAdb(`List of devices attached
R5CT123456A device product:dm3q model:SM_S918B device:dm3q usb:1-2 transport_id:1
192.168.1.20:37141 device product:dm3q model:SM_S918B device:dm3q transport_id:2
`)
  assert.equal(urzadzenia[0].transport, 'USB')
  assert.equal(urzadzenia[1].transport, 'Wi-Fi')
  assert.throws(() => wybierzUrzadzenieAdb(urzadzenia), /więcej niż jedno/)
  assert.equal(wybierzUrzadzenieAdb(urzadzenia, '192.168.1.20:37141').serial, '192.168.1.20:37141')
})

test('zgłasza status unauthorized i offline bez wyboru starego APK', () => {
  const nieautoryzowane = parsujUrzadzeniaAdb('List of devices attached\nABC unauthorized transport_id:1\n')
  const offline = parsujUrzadzeniaAdb('List of devices attached\n192.168.1.20:37141 offline transport_id:2\n')
  assert.throws(() => wybierzUrzadzenieAdb(nieautoryzowane), /unauthorized/)
  assert.throws(() => wybierzUrzadzenieAdb(offline), /offline/)
})
