import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('produkcyjny serwer RPi jest dostępny tylko przez loopback i utwardzony przez systemd', async () => {
  const env = await readFile(new URL('../deploy/rpi/ogarniacz.env.example', import.meta.url), 'utf8')
  const usluga = await readFile(new URL('../deploy/rpi/ogarniacz.service', import.meta.url), 'utf8')
  assert.match(env, /^HOST=127\.0\.0\.1$/m)
  assert.doesNotMatch(env, /^SYNC_ACCESS_KEY=.+$/m)
  assert.match(usluga, /^NoNewPrivileges=true$/m)
  assert.match(usluga, /^ProtectSystem=strict$/m)
  assert.match(usluga, /^ReadWritePaths=\/home\/kacper\/apps\/Ogarniacz\/data$/m)
})

test('konfigurator wystawia wyłącznie prywatne HTTPS Tailscale Serve i sprawdza healthcheck', async () => {
  const skrypt = await readFile(new URL('./configure-tailscale-rpi.sh', import.meta.url), 'utf8')
  assert.match(skrypt, /tailscale serve --bg 8787/)
  assert.doesNotMatch(skrypt, /tailscale funnel/)
  assert.match(skrypt, /http:\/\/127\.0\.0\.1:8787\/health/)
  assert.match(skrypt, /https:\/\/\$\{nazwa_dns\}/)
})
