import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { sprawdzKonfiguracje, sprawdzServe, wykonajSnapshot, przywrocSnapshot } from './rpi-bezpieczenstwo.mjs'

const poprawna = 'HOST=127.0.0.1\nCORS_ALLOWED_ORIGINS=https://localhost,https://ogarniacz.tailnet.ts.net\n'
test('preflight wymaga loopback, dokładnych HTTPS i originu Capacitor', () => {
  assert.doesNotThrow(() => sprawdzKonfiguracje(poprawna, '/aplikacja'))
  for (const cors of ['*', 'https://*.example.test', 'http://localhost', 'https://example.test/path', 'https://example.test/', 'https://example.test', '']) {
    assert.throws(() => sprawdzKonfiguracje(`HOST=127.0.0.1\nCORS_ALLOWED_ORIGINS=${cors}`, '/aplikacja'), /Preflight/)
  }
  assert.throws(() => sprawdzKonfiguracje(poprawna.replace('127.0.0.1', '0.0.0.0'), '/aplikacja'), /HOST/)
  assert.throws(() => sprawdzKonfiguracje(poprawna + 'DATABASE_PATH=/inna.sqlite', '/aplikacja'), /DATABASE_PATH/)
})
test('Serve musi kierować HTTPS na loopback i nie udostępniać Funnel', () => {
  const konfiguracja = { TCP: { 443: { HTTPS: true } }, Web: { 'pi:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:8787' } } } } }
  assert.doesNotThrow(() => sprawdzServe(JSON.stringify(konfiguracja)))
  assert.throws(() => sprawdzServe('{}'), /Serve/)
  assert.throws(() => sprawdzServe(JSON.stringify({ ...konfiguracja, AllowFunnel: { 'pi:443': true } })), /Serve/)
  assert.throws(() => sprawdzServe(JSON.stringify(konfiguracja).replace('127.0.0.1', '192.168.1.2')), /Serve/)
})
test('CLI błędu nie ujawnia wejściowych sekretów', () => {
  const wynik = spawnSync(process.execPath, ['scripts/rpi-bezpieczenstwo.mjs', 'preflight', '.', 'nieistniejacy-SEKRET'], { input: 'SEKRET', encoding: 'utf8' })
  assert.equal(wynik.status, 1)
  assert.doesNotMatch(wynik.stdout + wynik.stderr, /SEKRET/)
})
test('snapshot uwzględnia WAL, rollback cofa migrację, retencja ogranicza kopie do 3', async () => {
  const katalog = mkdtempSync(join(tmpdir(), 'ogarniacz-sqlite-'))
  mkdirSync(join(katalog, 'data'))
  const sciezka = join(katalog, 'data/ogarniacz.sqlite')
  let baza = new DatabaseSync(sciezka)
  try {
    baza.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE dane (tekst TEXT); INSERT INTO dane VALUES (\'zapis WAL\');')
    assert.ok(existsSync(`${sciezka}-wal`))
    const kopia = await wykonajSnapshot(katalog, 'a'.repeat(40))
    baza.exec('ALTER TABLE dane ADD COLUMN migracja TEXT; INSERT INTO dane (tekst) VALUES (\'nowy zapis\'); PRAGMA user_version=2;')
    baza.close()
    await przywrocSnapshot(katalog, kopia)
    baza = new DatabaseSync(sciezka)
    assert.equal(baza.prepare('SELECT tekst FROM dane').all().length, 1)
    assert.equal(baza.prepare('SELECT tekst FROM dane').get().tekst, 'zapis WAL')
    assert.equal(baza.prepare('PRAGMA table_info(dane)').all().length, 1)
    assert.equal(baza.prepare('PRAGMA user_version').get().user_version, 0)
    for (let proba = 0; proba < 4; proba++) await wykonajSnapshot(katalog, 'b'.repeat(40))
    assert.equal(readdirSync(join(katalog, 'data/aktualizacja-rpi/backups')).length, 3)
  } finally { baza.close(); rmSync(katalog, { recursive: true, force: true }) }
})
