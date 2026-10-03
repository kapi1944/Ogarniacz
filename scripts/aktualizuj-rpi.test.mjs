import assert from 'node:assert/strict'
import { execFileSync, spawnSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
const unix = (sciezka) => process.platform === 'win32' ? `/${sciezka[0].toLowerCase()}${sciezka.slice(2).replaceAll('\\', '/')}` : sciezka
const git = (katalog, ...argumenty) => execFileSync('git', argumenty, { cwd: katalog, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

test('rpi-stable, preflight, izolowany build, snapshot i rollback kodu oraz bazy', async () => {
  const katalog = mkdtempSync(join(process.cwd(), '.ogarniacz-rpi-test-'))
  try {
    const zrodlo = join(katalog, 'zrodlo'), origin = join(katalog, 'origin.git'), produkcja = join(katalog, 'produkcja'), narzedzia = join(katalog, 'narzedzia')
    mkdirSync(zrodlo); mkdirSync(narzedzia)
    git(katalog, 'init', '--bare', origin)
    git(zrodlo, 'init', '-b', 'main')
    git(zrodlo, 'config', 'user.email', 'test@example.invalid'); git(zrodlo, 'config', 'user.name', 'Test')
    mkdirSync(join(zrodlo, 'scripts'))
    writeFileSync(join(zrodlo, 'scripts/rpi-bezpieczenstwo.mjs'), readFileSync('scripts/rpi-bezpieczenstwo.mjs'))
    writeFileSync(join(zrodlo, 'package.json'), '{"version":"1.0.0"}\n')
    writeFileSync(join(zrodlo, '.gitignore'), 'data/\ndist/\ndist-server/\nnode_modules/\n')
    writeFileSync(join(zrodlo, 'plik.txt'), 'pierwszy\n')
    git(zrodlo, 'add', '.'); git(zrodlo, 'commit', '-m', 'pierwszy')
    git(zrodlo, 'remote', 'add', 'origin', origin); git(zrodlo, 'push', '-u', 'origin', 'main')
    git(katalog, 'clone', '-b', 'main', origin, produkcja)
    const poprzedni = git(produkcja, 'rev-parse', 'HEAD')
    writeFileSync(join(zrodlo, 'plik.txt'), 'drugi\n'); git(zrodlo, 'add', '.'); git(zrodlo, 'commit', '-m', 'drugi'); git(zrodlo, 'push')
    const cel = git(zrodlo, 'rev-parse', 'HEAD')
    for (const nazwa of ['dist', 'dist-server', 'node_modules', 'data']) mkdirSync(join(produkcja, nazwa))
    writeFileSync(join(produkcja, 'dist/index.html'), 'stary frontend')
    writeFileSync(join(produkcja, 'dist-server/main.js'), 'stary backend')
    const sciezkaBazy = join(produkcja, 'data/ogarniacz.sqlite')
    const baza = new DatabaseSync(sciezkaBazy)
    baza.exec("PRAGMA journal_mode=WAL; CREATE TABLE dane (tekst TEXT); INSERT INTO dane VALUES ('stare dane');")
    baza.close()
    const envPlik = join(katalog, 'ogarniacz.env'), zdarzenia = join(katalog, 'zdarzenia'), stanUslugi = join(katalog, 'usluga')
    const poprawneEnv = 'HOST=127.0.0.1\nCORS_ALLOWED_ORIGINS=https://localhost,https://pi.tailnet.ts.net\nOWNER_BOOTSTRAP_TOKEN=TAJNY-SEKRET\n'
    writeFileSync(envPlik, poprawneEnv); writeFileSync(zdarzenia, ''); writeFileSync(stanUslugi, 'active')
    const skrypt = join(katalog, 'aktualizuj.sh')
    writeFileSync(skrypt, readFileSync('scripts/aktualizuj-rpi.sh', 'utf8').replaceAll('\r\n', '\n')
      .replace('KATALOG=/home/kacper/apps/Ogarniacz', `KATALOG="${unix(produkcja)}"`)
      .replace('PLIK_ENV=/etc/ogarniacz/ogarniacz.env', `PLIK_ENV="${unix(envPlik)}"`).replace('sleep 1', 'sleep 0'))
    const narzedzie = (nazwa, kod) => { const plik = join(narzedzia, nazwa); writeFileSync(plik, `#!/usr/bin/env bash\n${kod}\n`); chmodSync(plik, 0o755) }
    narzedzie('npm', `printf 'build %s\\n' "$1" >> "$ZDARZENIA"
[[ "$AWARIA" == ci && "$1" == ci || "$AWARIA" == build && "$1" == run ]] && exit 1
mkdir -p dist dist-server node_modules
printf nowy > dist/index.html
printf nowy > dist-server/main.js
exit 0`)
    narzedzie('systemctl', `if [[ "$1" == is-active ]]; then
  [[ "\${*: -1}" == tailscaled ]] && { [[ "$AWARIA" != tailscaled ]]; exit; }
  [[ "$(cat "$STAN_USLUGI")" == active ]]; exit
fi
exit 1`)
    narzedzie('sudo', `printf '%s\\n' "$3" >> "$ZDARZENIA"
if [[ "$3" == stop ]]; then echo stopped > "$STAN_USLUGI"; exit 0; fi
if [[ "$3" == restart ]]; then
  [[ "$AWARIA" == restart && "$(git rev-parse HEAD)" == "$CEL_TESTOWY" ]] && exit 1
  if [[ "$(git rev-parse HEAD)" == "$CEL_TESTOWY" ]]; then
    snapshot="$(cat data/aktualizacja-rpi/snapshot)"
    [[ -f "data/aktualizacja-rpi/backups/$snapshot" ]] || exit 1
    node -e "const {DatabaseSync}=require('node:sqlite');const b=new DatabaseSync(process.env.DB_TESTOWA);b.exec('ALTER TABLE dane ADD COLUMN migracja TEXT; PRAGMA user_version=2;');b.close()" || exit 1
  fi
  echo active > "$STAN_USLUGI"; exit 0
fi
exit 1`)
    narzedzie('curl', `[[ "$AWARIA" == stary_health || "$AWARIA" == health && "$(git rev-parse HEAD)" == "$CEL_TESTOWY" ]] && exit 1
printf '{"status":"ok","service":"ogarniacz-api","database":"connected"}\\n'`)
    narzedzie('tailscale', `[[ "$AWARIA" == serve ]] && { echo '{}'; exit 0; }
printf '{"TCP":{"443":{"HTTPS":true}},"Web":{"pi:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8787"}}}}}\\n'`)
    narzedzie('sleep', 'exit 0')
    if (process.platform === 'win32') narzedzie('flock', 'exit 0')
    const env = { ...process.env, NARZEDZIA: unix(narzedzia), SKRYPT: unix(skrypt), ZDARZENIA: unix(zdarzenia), STAN_USLUGI: unix(stanUslugi), CEL_TESTOWY: cel, DB_TESTOWA: sciezkaBazy }
    const uruchom = (akcja, awaria = '') => spawnSync(bash, ['-c', 'export PATH="$NARZEDZIA:$PATH"; exec bash "$SKRYPT" "$AKCJA"'], { env: { ...env, AKCJA: akcja, AWARIA: awaria }, encoding: 'utf8' })
    const udana = (wynik) => assert.equal(wynik.status, 0, `${wynik.stdout}\n${wynik.stderr}`)
    const sprawdzDane = () => { const baza = new DatabaseSync(sciezkaBazy); try { assert.equal(baza.prepare('PRAGMA user_version').get().user_version, 0); assert.equal(baza.prepare('PRAGMA table_info(dane)').all().length, 1); assert.equal(baza.prepare('SELECT tekst FROM dane').get().tekst, 'stare dane') } finally { baza.close() } }
    // Brak stabilnego kanału nie może powodować fallbacku na nowszy main.
    assert.notEqual(uruchom('check').status, 0)
    assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni)
    git(zrodlo, 'push', 'origin', `${poprzedni}:refs/heads/rpi-stable`)
    udana(uruchom('check'))
    if (process.platform !== 'win32') {
      const blokada = spawn('flock', ['-x', join(produkcja, 'data/aktualizacja-rpi/blokada'), 'sh', '-c', 'echo locked; sleep 2'])
      await once(blokada.stdout, 'data')
      const stanPrzed = readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8')
      assert.notEqual(uruchom('update').status, 0)
      assert.equal(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), stanPrzed)
      await once(blokada, 'exit')
    }
    assert.match(readFileSync(join(produkcja, 'data/aktualizacja-rpi/status'), 'utf8'), /Wersja jest aktualna/)
    git(zrodlo, 'push', 'origin', `${cel}:refs/heads/rpi-stable`)
    udana(uruchom('check'))
    writeFileSync(join(produkcja, 'plik.txt'), 'lokalna zmiana\n')
    assert.notEqual(uruchom('update').status, 0); git(produkcja, 'restore', 'plik.txt')
    // Wyłączona automatyka nie buduje ani nie restartuje.
    udana(uruchom('auto')); assert.equal(readFileSync(zdarzenia, 'utf8'), '')
    for (const envZly of [poprawneEnv.replace('127.0.0.1', '0.0.0.0'), poprawneEnv.replace('https://localhost,https://pi.tailnet.ts.net', '*')]) {
      writeFileSync(envPlik, envZly)
      const wynik = uruchom('update')
      assert.notEqual(wynik.status, 0); assert.doesNotMatch(wynik.stdout + wynik.stderr, /TAJNY-SEKRET/)
      assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni)
      assert.equal(readFileSync(zdarzenia, 'utf8'), '')
      sprawdzDane()
    }
    writeFileSync(envPlik, poprawneEnv)
    for (const awaria of ['tailscaled', 'serve', 'stary_health', 'ci', 'build']) {
      writeFileSync(zdarzenia, '')
      const wynik = uruchom('update', awaria)
      assert.notEqual(wynik.status, 0, `${awaria}: ${wynik.stdout}\n${wynik.stderr}`)
      assert.doesNotMatch(readFileSync(zdarzenia, 'utf8'), /stop|restart/)
      assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni)
      assert.equal(readFileSync(join(produkcja, 'dist/index.html'), 'utf8'), 'stary frontend')
      assert.equal(existsSync(join(produkcja, 'data/aktualizacja-rpi/backups')), false)
      sprawdzDane()
    }
    for (const awaria of ['restart', 'health']) {
      const wynik = uruchom('update', awaria)
      assert.notEqual(wynik.status, 0, `${awaria}: ${wynik.stdout}\n${wynik.stderr}`)
      assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni)
      assert.equal(readFileSync(join(produkcja, 'dist/index.html'), 'utf8'), 'stary frontend')
      assert.equal(readFileSync(stanUslugi, 'utf8').trim(), 'active')
      sprawdzDane()
    }
    writeFileSync(envPlik, poprawneEnv + 'RPI_AUTO_UPDATE=1\n')
    udana(uruchom('auto'))
    assert.equal(git(produkcja, 'rev-parse', 'HEAD'), cel)
    assert.equal(readFileSync(join(produkcja, 'dist/index.html'), 'utf8'), 'nowy')
    writeFileSync(zdarzenia, '')
    udana(uruchom('auto')); assert.equal(readFileSync(zdarzenia, 'utf8'), '')
    udana(uruchom('rollback'))
    assert.equal(git(produkcja, 'rev-parse', 'HEAD'), poprzedni); sprawdzDane()
    assert.notEqual(uruchom('rollback').status, 0)
    // Jednostki uruchamiają zachowany updater także po rollbacku starego repo.
    writeFileSync(envPlik, poprawneEnv + 'RPI_AUTO_UPDATE=0\n')
    rmSync(join(produkcja, 'scripts/rpi-bezpieczenstwo.mjs'))
    const zachowany = spawnSync(bash, ['-c', 'export PATH="$NARZEDZIA:$PATH"; exec bash "$ZACHOWANY" auto'], {
      env: { ...env, ZACHOWANY: unix(join(produkcja, 'data/aktualizacja-rpi/aktualizuj-rpi.sh')) }, encoding: 'utf8',
    })
    udana(zachowany)
  } finally { rmSync(katalog, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
})
