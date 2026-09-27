import { strict as assert } from 'node:assert'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
const unix = (sciezka) => process.platform === 'win32' ? `/${sciezka[0].toLowerCase()}${sciezka.slice(2).replaceAll('\\', '/')}` : sciezka
const git = (katalog, ...argumenty) => execFileSync('git', argumenty, { cwd: katalog, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

test('skrypt wykrywa nowy commit, chroni lokalne zmiany i przywraca commit po błędzie builda', () => {
  const katalog = mkdtempSync(join(process.cwd(), '.ogarniacz-rpi-test-'))
  try {
    const zrodlo = join(katalog, 'zrodlo')
    const origin = join(katalog, 'origin.git')
    const produkcja = join(katalog, 'produkcja')
    const narzedzia = join(katalog, 'narzedzia')
    mkdirSync(zrodlo)
    mkdirSync(narzedzia)
    git(katalog, 'init', '--bare', origin)
    git(zrodlo, 'init', '-b', 'main')
    git(zrodlo, 'config', 'user.email', 'test@example.invalid')
    git(zrodlo, 'config', 'user.name', 'Test')
    writeFileSync(join(zrodlo, 'package.json'), '{"version":"1.0.0"}\n')
    writeFileSync(join(zrodlo, 'plik.txt'), 'pierwszy\n')
    git(zrodlo, 'add', '.')
    git(zrodlo, 'commit', '-m', 'pierwszy')
    git(zrodlo, 'remote', 'add', 'origin', origin)
    git(zrodlo, 'push', '-u', 'origin', 'main')
    git(katalog, 'clone', '-b', 'main', origin, produkcja)
    const poprzedni = git(produkcja, 'rev-parse', 'HEAD')
    writeFileSync(join(zrodlo, 'plik.txt'), 'drugi\n')
    git(zrodlo, 'add', '.')
    git(zrodlo, 'commit', '-m', 'drugi')
    git(zrodlo, 'push')
    const cel = git(zrodlo, 'rev-parse', 'HEAD')
    const skrypt = join(katalog, 'aktualizuj.sh')
    writeFileSync(skrypt, readFileSync(resolve('scripts/aktualizuj-rpi.sh'), 'utf8').replace('KATALOG=/home/kacper/apps/Ogarniacz', `KATALOG="${unix(produkcja)}"`))
    writeFileSync(join(narzedzia, 'npm'), '#!/usr/bin/env bash\nif [[ "$1" == run && "$(git rev-parse HEAD)" == "$CEL_TESTOWY" ]]; then exit 1; fi\nexit 0\n')
    writeFileSync(join(narzedzia, 'sudo'), '#!/usr/bin/env bash\nexit 1\n')
    if (process.platform === 'win32') writeFileSync(join(narzedzia, 'flock'), '#!/usr/bin/env bash\nexit 0\n')
    const env = { ...process.env, PATH: `${unix(narzedzia)}:${process.env.PATH}`, CEL_TESTOWY: cel }
    const uruchom = (akcja) => spawnSync(bash, [unix(skrypt), akcja], { env, encoding: 'utf8' })
    const sprawdzenie = uruchom('check')
    assert.equal(sprawdzenie.status, 0, `${sprawdzenie.stdout}\n${sprawdzenie.stderr}`)
    assert.ok(existsSync(join(produkcja, 'data/aktualizacja-rpi/status')), `${sprawdzenie.stdout}\n${sprawdzenie.stderr}`)
    assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), /idle\|Dostępna jest nowsza wersja/)
    writeFileSync(join(produkcja, 'plik.txt'), 'lokalna zmiana\n')
    assert.notEqual(uruchom('update').status, 0)
    assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni)
    assert.equal(readFileSync(join(produkcja, 'plik.txt'), 'utf8'), 'lokalna zmiana\n')
    git(produkcja, 'restore', 'plik.txt')
    assert.notEqual(uruchom('update').status, 0)
    assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni)
    assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), /error\|Rollback zbudowany, ale healthcheck nadal nie przechodzi/)
  } finally {
    rmSync(katalog, { recursive: true, force: true })
  }
})
