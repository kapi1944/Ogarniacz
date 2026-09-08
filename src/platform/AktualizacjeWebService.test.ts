import { describe, expect, it } from 'vitest'
import { parsujManifestAktualizacjiWeb, utworzDaneDoPodpisuWeb } from './AktualizacjeWebService'

const manifest = {
  bundleVersion: 'dbea095',
  commitSha: 'a'.repeat(40),
  url: 'https://github.com/kapi1944/Ogarniacz/releases/download/web-ota/web-ota.zip',
  sha256: 'b'.repeat(64),
  signature: 'c'.repeat(344),
  minNativeVersionCode: 1_000_006,
  publishedAt: '2026-09-09T10:00:00.000Z',
}

describe('AktualizacjeWebService', () => {
  it('parsuje manifest i tworzy stabilne dane do podpisu', () => {
    const wynik = parsujManifestAktualizacjiWeb(manifest)
    expect(utworzDaneDoPodpisuWeb(wynik)).toBe([
      'ogarniacz-web-ota-v1', 'dbea095', 'a'.repeat(40), manifest.url,
      'b'.repeat(64), '1000006', manifest.publishedAt,
    ].join('\n'))
  })

  it('odrzuca HTTP, błędny commit i brak podpisu', () => {
    expect(() => parsujManifestAktualizacjiWeb({ ...manifest, url: 'http://example.test/web-ota.zip' })).toThrow()
    expect(() => parsujManifestAktualizacjiWeb({ ...manifest, commitSha: 'abc' })).toThrow()
    expect(() => parsujManifestAktualizacjiWeb({ ...manifest, signature: '' })).toThrow()
  })
})
