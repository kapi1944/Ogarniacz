import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'

test('stary deploy zawsze zatrzymuje się bez poleceń zewnętrznych, także przy istniejącej bazie', () => {
  const katalog = mkdtempSync(join(tmpdir(), 'ogarniacz-deploy-'))
  try {
    mkdirSync(join(katalog, 'data'))
    writeFileSync(join(katalog, 'data/ogarniacz.sqlite'), 'syntetyczne dane')
    for (const flaga of ['0', '1', '']) {
      const kod = `set -euo pipefail\ngit() { exit 92; }; npm() { exit 93; }; sudo() { exit 94; }; systemctl() { exit 95; };\n${readFileSync('scripts/deploy-rpi.sh', 'utf8')}`
      const wynik = spawnSync(bash, ['-c', kod], { cwd: katalog, encoding: 'utf8', env: { ...process.env, RPI_UPDATE_ENABLED: flaga } })
      assert.equal(wynik.status, 1, wynik.stderr)
      assert.match(wynik.stderr, /aktualizuj-rpi.sh.*origin\/rpi-stable/)
      assert.equal(readFileSync(join(katalog, 'data/ogarniacz.sqlite'), 'utf8'), 'syntetyczne dane')
    }
  } finally {
    rmSync(katalog, { recursive: true, force: true })
  }
})

test('stary deploy ma poprawną składnię i nie zawiera pull, builda ani restartu', () => {
  const wynik = spawnSync(bash, ['-n', 'scripts/deploy-rpi.sh'], { encoding: 'utf8' })
  assert.equal(wynik.status, 0, wynik.stderr)
  assert.doesNotMatch(readFileSync('scripts/deploy-rpi.sh', 'utf8'), /git pull|npm ci|npm run|systemctl|exec /)
})
