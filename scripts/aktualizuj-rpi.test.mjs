import { strict as assert } from 'node:assert'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
const unix = (sciezka) => process.platform === 'win32' ? `/${sciezka[0].toLowerCase()}${sciezka.slice(2).replaceAll('\\', '/')}` : sciezka
const git = (katalog, ...argumenty) => execFileSync('git', argumenty, { cwd: katalog, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

test('skrypt wykrywa nowy commit, chroni lokalne zmiany i przywraca commit po awarii', async () => {
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
    writeFileSync(skrypt, readFileSync(resolve('scripts/aktualizuj-rpi.sh'), 'utf8').replace('KATALOG=/home/kacper/apps/Ogarniacz', `KATALOG="${unix(produkcja)}"`).replace('sleep 1', 'sleep 0'))
    writeFileSync(join(narzedzia, 'npm'), '#!/usr/bin/env bash\nif [[ "$(git rev-parse HEAD)" == "$CEL_TESTOWY" ]]; then\n  [[ "$AWARIA" == ci && "$1" == ci || "$AWARIA" == build && "$1" == run ]] && exit 1\nfi\nexit 0\n')
    writeFileSync(join(narzedzia, 'sudo'), '#!/usr/bin/env bash\n[[ "$AWARIA" == restart && "$(git rev-parse HEAD)" == "$CEL_TESTOWY" ]] && exit 1\nexit 0\n')
    writeFileSync(join(narzedzia, 'curl'), '#!/usr/bin/env bash\n[[ "$AWARIA" == health && "$(git rev-parse HEAD)" == "$CEL_TESTOWY" ]] && exit 1\nprintf \'{"status":"ok","service":"ogarniacz-api","database":"connected"}\\n\'\n')
    writeFileSync(join(narzedzia, 'sleep'), '#!/usr/bin/env bash\nexit 0\n')
    if (process.platform === 'win32') writeFileSync(join(narzedzia, 'flock'), '#!/usr/bin/env bash\nexit 0\n')
    const env = { ...process.env, NARZEDZIA_TESTOWE: unix(narzedzia), SKRYPT_TESTOWY: unix(skrypt), CEL_TESTOWY: cel }
    const probaCurl = spawnSync(bash, ['-c', 'export PATH="$NARZEDZIA_TESTOWE:$PATH"; command -v curl; curl --silent --fail --max-time 2 http://127.0.0.1:8787/health'], { env, encoding: 'utf8' })
    assert.equal(probaCurl.status, 0, `${probaCurl.stdout}\n${probaCurl.stderr}`)
    const uruchom = (akcja, awaria = '') => spawnSync(bash, ['-c', 'export PATH="$NARZEDZIA_TESTOWE:$PATH"; exec /usr/bin/bash "$SKRYPT_TESTOWY" "$AKCJA_TESTOWA"'], { env: { ...env, AWARIA: awaria, AKCJA_TESTOWA: akcja }, encoding: 'utf8' })
    const sprawdzenie = uruchom('check')
    assert.equal(sprawdzenie.status, 0, `${sprawdzenie.stdout}\n${sprawdzenie.stderr}`)
    assert.ok(existsSync(join(produkcja, 'data/aktualizacja-rpi/status')), `${sprawdzenie.stdout}\n${sprawdzenie.stderr}`)
    assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), /idle\|Dostępna jest nowsza wersja/)
    if (process.platform !== 'win32') {
      const blokada = spawn('flock', ['-x', join(produkcja, 'data/aktualizacja-rpi/blokada'), 'sh', '-c', 'echo locked; sleep 2'])
      await once(blokada.stdout, 'data')
      const stanPrzed = readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8')
      assert.notEqual(uruchom('update').status, 0)
      assert.equal(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), stanPrzed)
      await once(blokada, 'exit')
    }
    writeFileSync(join(produkcja, 'plik.txt'), 'lokalna zmiana\n')
    assert.notEqual(uruchom('update').status, 0)
    assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni)
    assert.equal(readFileSync(join(produkcja, 'plik.txt'), 'utf8'), 'lokalna zmiana\n')
    git(produkcja, 'restore', 'plik.txt')
    const aktualizacja = uruchom('update')
    assert.equal(aktualizacja.status, 0, `${aktualizacja.stdout}\n${aktualizacja.stderr}\n${readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8')}`)
    assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), /success\|Aktualizacja zakończona/)
    assert.equal(git(produkcja, 'rev-parse', 'HEAD'), cel)
    assert.equal(uruchom('check').status, 0)
    assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), /idle\|Wersja jest aktualna/)
    assert.equal(uruchom('rollback').status, 0)
    assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni)
    assert.notEqual(uruchom('rollback').status, 0)
    for (const [awaria, komunikat] of [['ci', 'Instalacja zależności npm ci'], ['build', 'Build produkcyjny'], ['restart', 'Restart ogarniacz.service'], ['health', 'Healthcheck nie wrócił']]) {
      assert.notEqual(uruchom('update', awaria).status, 0, awaria)
      assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni, awaria)
      assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), new RegExp(`^error\\|${komunikat}.*Przywrócono poprzednią wersję`), awaria)
    }
    const para = join(produkcja, 'data/aktualizacja-rpi/poprzedni')
    writeFileSync(para, `${poprzedni}\n${cel}\n${cel}\n`)
    assert.notEqual(uruchom('rollback').status, 0)
    assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), /error\|Niepoprawny zapis rollbacku/)
    writeFileSync(join(produkcja, 'plik.txt'), 'rozbieżny commit\n')
    git(produkcja, 'add', 'plik.txt')
    git(produkcja, 'config', 'user.email', 'test@example.invalid')
    git(produkcja, 'config', 'user.name', 'Test')
    git(produkcja, 'commit', '-m', 'rozbieżny')
    assert.notEqual(uruchom('update').status, 0)
    assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), /error\|origin\/main nie jest następcą/)
  } finally {
    rmSync(katalog, { recursive: true, force: true })
  }
})
