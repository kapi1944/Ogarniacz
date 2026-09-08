import assert from ''node:assert/strict''
import { generateKeyPairSync, verify } from ''node:crypto''
import test from ''node:test''
import {
  obliczOdciskKluczaPublicznego,
  utworzDaneDoPodpisuWeb,
  utworzPodpisanyManifest,
} from ''./web-ota-manifest.mjs''

const { privateKey, publicKey } = generateKeyPairSync(''rsa'', { modulusLength: 3072 })
const kluczPrywatnyPem = privateKey.export({ type: ''pkcs8'', format: ''pem'' })
const daneBazowe = {
  bundleVersion: ''abc1234'',
  commitSha: ''a''.repeat(40),
  url: ''https://github.com/kapi1944/Ogarniacz/releases/download/web-ota/web-ota.zip'',
  sha256: ''b''.repeat(64),
  minNativeVersionCode: 1_000_006,
  publishedAt: ''2026-09-09T10:00:00.000Z'',
  kluczPrywatnyPem,
  oczekiwanyOdciskKlucza: obliczOdciskKluczaPublicznego(kluczPrywatnyPem),
}

test(''tworzy manifest zgodny z podpisem weryfikowanym przez APK'', () => {
  const manifest = utworzPodpisanyManifest(daneBazowe)
  const { signature, ...manifestBezPodpisu } = manifest
  assert.equal(
    verify(''RSA-SHA256'', Buffer.from(utworzDaneDoPodpisuWeb(manifestBezPodpisu)), publicKey, Buffer.from(signature, ''base64'')),
    true,
  )
})

test(''odrzuca klucz niezgodny z kluczem publicznym APK'', () => {
  assert.throws(
    () => utworzPodpisanyManifest({ ...daneBazowe, oczekiwanyOdciskKlucza: ''0''.repeat(64) }),
    /nie odpowiada publicznemu kluczowi/,
  )
})

test(''odrzuca kanal releases latest'', () => {
  assert.throws(
    () => utworzPodpisanyManifest({ ...daneBazowe, url: ''https://github.com/kapi1944/Ogarniacz/releases/latest/download/web-ota.zip'' }),
    /osobnego kanalu/,
  )
})
