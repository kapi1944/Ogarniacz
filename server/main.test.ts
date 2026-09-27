import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { createConnection, createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { test } from 'node:test'

test('SIGTERM zamyka aktywne połączenie i bazę, a drugi sygnał nie zamyka ich ponownie', async () => {
  const rezerwacja = createServer().listen(0, '127.0.0.1')
  await once(rezerwacja, 'listening')
  const adres = rezerwacja.address()
  assert.ok(adres && typeof adres === 'object')
  const port = adres.port
  await new Promise<void>((rozwiaz) => rezerwacja.close(() => rozwiaz()))
  const katalog = await mkdtemp(join(tmpdir(), 'ogarniacz-shutdown-'))
  const proces = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "import('./server/main.ts').then(() => setTimeout(() => { process.emit('SIGTERM'); process.emit('SIGTERM') }, 500))"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATABASE_PATH: join(katalog, 'baza.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let bledy = ''
  proces.stderr.setEncoding('utf8').on('data', (tekst: string) => { bledy += tekst })
  await once(proces.stdout, 'data')
  const polaczenie = createConnection(port, '127.0.0.1')
  try {
    await once(polaczenie, 'connect')
    polaczenie.write('GET /health HTTP/1.1\r\nHost: localhost\r\n')
    const wynik = await Promise.race([
      once(proces, 'exit'),
      new Promise<never>((_, odrzuc) => setTimeout(() => odrzuc(new Error('Shutdown przekroczył 5 sekund.')), 5000)),
    ])
    assert.equal(wynik[0], 0, bledy)
    assert.equal(bledy, '')
    assert.equal(polaczenie.destroyed, true)
  } finally {
    polaczenie.destroy()
    if (proces.exitCode === null) proces.kill()
    await rm(katalog, { recursive: true, force: true })
  }
})
