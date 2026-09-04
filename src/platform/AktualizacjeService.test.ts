import { describe, expect, it } from 'vitest'
import { czyNowszaWersja, obliczKodWersji, parsujManifestAktualizacji } from './AktualizacjeService'

const poprawnyManifest = {
  version: '1.0.1',
  versionCode: 1_000_001,
  apkUrl: 'Ogarniacz-1.0.1-release.apk',
  sha256: 'a'.repeat(64),
  publishedAt: '2026-09-04T10:00:00.000Z',
}

describe('AktualizacjeService', () => {
  it('parsuje spójny manifest i porównuje versionCode', () => {
    const manifest = parsujManifestAktualizacji(poprawnyManifest)
    expect(czyNowszaWersja(manifest, 1_000_000)).toBe(true)
    expect(czyNowszaWersja(manifest, 1_000_001)).toBe(false)
    expect(obliczKodWersji('2.3.4')).toBe(2_003_004)
  })

  it('odrzuca niespójny versionCode i błędny SHA-256', () => {
    expect(() => parsujManifestAktualizacji({ ...poprawnyManifest, versionCode: 2 })).toThrow('niespójny')
    expect(() => parsujManifestAktualizacji({ ...poprawnyManifest, sha256: '1234' })).toThrow('nieprawidłowy manifest')
  })
})
