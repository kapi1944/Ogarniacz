import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import procesPotomny from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { resolve } from 'node:path'
import { odczytajMetadaneBuildu } from './metadane-buildu.ts'

afterEach(() => { mock.restoreAll(); syncBuiltinESMExports() })
const katalog = resolve('projekt-testowy')
const sha = 'a'.repeat(40)

function podstawGit(odpowiedzi) {
  const wykonaj = mock.method(procesPotomny, 'execFileSync', () => {
    if (!odpowiedzi.length) throw new Error('Brak Git')
    return odpowiedzi.shift()
  })
  syncBuiltinESMExports()
  return wykonaj
}

test('HEAD własnego checkoutu ma pierwszeństwo przed SHA ze środowiska', () => {
  podstawGit([katalog, sha, ''])
  const metadane = odczytajMetadaneBuildu(katalog, { GITHUB_SHA: 'b'.repeat(40) })
  assert.equal(metadane.sha, sha)
  assert.equal(metadane.zmodyfikowany, false)
  assert.ok(!Number.isNaN(Date.parse(metadane.data)))
})

test('lokalnie zmieniony build nie udaje czystego commita', () => {
  podstawGit([katalog, sha, ' M src/app.tsx'])
  assert.equal(odczytajMetadaneBuildu(katalog, {}).zmodyfikowany, true)
})

test('archiwum Raspberry nie dziedziczy HEAD nadrzędnego repo', () => {
  const wykonaj = podstawGit([resolve('inny-projekt')])
  const metadane = odczytajMetadaneBuildu(katalog, { GITHUB_SHA: sha })
  assert.equal(metadane.sha, sha)
  assert.equal(metadane.zmodyfikowany, null)
  assert.equal(wykonaj.mock.callCount(), 1)
})

test('brak metadanych lub skrócony SHA nie daje zmyślonego commita', () => {
  podstawGit([])
  assert.equal(odczytajMetadaneBuildu(katalog, {}).sha, null)
  assert.equal(odczytajMetadaneBuildu(katalog, { GITHUB_SHA: 'abcdef0' }).sha, null)
})
