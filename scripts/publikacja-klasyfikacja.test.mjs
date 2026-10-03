import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { klasyfikujZmiany, klasyfikujOdPunktow } from './publikacja-klasyfikacja.mjs'

for (const plik of ['src/main.tsx', 'public/logo.svg', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'capacitor.config.ts', '.env.production', 'nieznany-runtime.conf']) {
  test(`wspólny lub niejednoznaczny runtime: ${plik}`, () => assert.deepEqual(klasyfikujZmiany([plik]), { android: true, raspberry: true }))
}
for (const plik of ['android/app/build.gradle', 'config/android-release.json', 'scripts/android.mjs']) {
  test(`tylko Android: ${plik}`, () => assert.deepEqual(klasyfikujZmiany([plik]), { android: true, raspberry: false }))
}
for (const plik of ['server/main.ts', 'deploy/rpi/ogarniacz.service', 'scripts/rpi-bezpieczenstwo.mjs', 'scripts/aktualizuj-rpi.sh', 'tsconfig.server.json']) {
  test(`tylko Raspberry: ${plik}`, () => assert.deepEqual(klasyfikujZmiany([plik]), { android: false, raspberry: true }))
}
test('dokumentacja, testy i jawne metadane nie tworzą pustych wydań', () => {
  assert.deepEqual(klasyfikujZmiany(['docs/ANDROID.md', 'README.md', 'AGENTS.md', 'src/testy/setup.ts', 'server/serwer.test.ts', 'scripts/rpi.test.mjs', 'android/app/src/test/java/Test.java', '.editorconfig']), { android: false, raspberry: false })
})
test('osobne punkty odniesienia nie gubią zaległych zmian żadnego kanału', () => {
  const wynik = klasyfikujOdPunktow({ android: 'apk', raspberry: 'stable', cel: 'cel' }, (...argumenty) => {
    if (argumenty[0] !== 'log') return ''
    return argumenty.at(-1) === 'apk..cel' ? 'server/main.ts\0' : 'src/main.tsx\0'
  })
  assert.deepEqual(wynik, { android: false, raspberry: true })
})
test('brak baz wymaga pierwszego zatwierdzenia, rozbieżna historia blokuje publikację', () => {
  assert.deepEqual(klasyfikujOdPunktow({ cel: 'cel' }, () => ''), { android: true, raspberry: true })
  assert.throws(() => klasyfikujOdPunktow({ cel: 'cel', android: 'baza' }, (...argumenty) => {
    if (argumenty[0] === 'merge-base') throw new Error('rozbieżna historia')
    return ''
  }), /rozbieżna/)
})

test('zatwierdzenie tworzy rpi-stable, przesuwa go do finalnego commita i odrzuca cofnięcie', () => {
  const katalog = mkdtempSync(join(process.cwd(), '.ogarniacz-publikacja-test-'))
  const git = (...argumenty) => execFileSync('git', argumenty, { cwd: katalog, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    const origin = join(katalog, 'origin.git')
    git('init', '--bare', origin)
    git('init', '-b', 'main')
    git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test')
    writeFileSync(join(katalog, 'plik'), 'pierwszy')
    git('add', 'plik'); git('commit', '-m', 'pierwszy')
    const pierwszy = git('rev-parse', 'HEAD')
    writeFileSync(join(katalog, 'plik'), 'finalny commit wersji')
    git('add', 'plik'); git('commit', '-m', 'wersja')
    const finalny = git('rev-parse', 'HEAD')
    git('remote', 'add', 'origin', origin); git('push', 'origin', 'main')
    const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
    const skrypt = resolve('scripts/publikacja-rpi-stable.sh').replaceAll('\\', '/')
    const zatwierdz = (commit) => spawnSync(bash, [skrypt, commit], { cwd: katalog, encoding: 'utf8' })
    assert.equal(zatwierdz(pierwszy).status, 0)
    const wynik = zatwierdz(finalny)
    assert.equal(wynik.status, 0, wynik.stderr)
    assert.ok(git('ls-remote', 'origin', 'refs/heads/rpi-stable').startsWith(finalny))
    assert.notEqual(zatwierdz(pierwszy).status, 0)
    assert.ok(git('ls-remote', 'origin', 'refs/heads/rpi-stable').startsWith(finalny))
  } finally { rmSync(katalog, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
})
