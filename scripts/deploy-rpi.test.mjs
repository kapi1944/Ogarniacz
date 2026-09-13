import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const sciezkaSkryptuWdrozenia = new URL('./deploy-rpi.sh', import.meta.url)

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

test('deploy RPi sprawdza tylko śledzone zmiany i wykonuje pełny build', async () => {
  const skrypt = await readFile(sciezkaSkryptuWdrozenia, 'utf8')
  assert.match(skrypt, /git diff --quiet/)
  assert.match(skrypt, /git diff --cached --quiet/)
  assert.doesNotMatch(skrypt, /git status --porcelain/)
  assert.match(skrypt, /git pull --ff-only/)
  assert.match(skrypt, /npm ci/)
  assert.match(skrypt, /npm run build:production/)
})

test('deploy RPi aktualizuje zmienioną jednostkę, zachowuje enable i dopiero potem restartuje', async () => {
  const skrypt = await readFile(sciezkaSkryptuWdrozenia, 'utf8')
  assert.match(skrypt, /sudo cmp --silent "\$plik_jednostki_repo" "\$plik_jednostki_systemowej"/)
  assert.match(skrypt, /sudo install -m 0644 "\$plik_jednostki_repo" "\$plik_jednostki_systemowej"/)
  assert.match(skrypt, /sudo systemctl daemon-reload/)
  assert.ok(skrypt.indexOf('sudo systemctl enable ogarniacz') < skrypt.indexOf('sudo systemctl restart ogarniacz'))
})

test('deploy RPi nie kopiuje env, a brakujące nazwy odczytuje bez ujawniania wartości', async () => {
  const skrypt = await readFile(sciezkaSkryptuWdrozenia, 'utf8')
  assert.match(skrypt, /brakujace_zmienne=\(\)/)
  assert.match(skrypt, /opcjonalne_zmienne=" OWNER_BOOTSTRAP_TOKEN SYNC_USER_ID SYNC_ACCESS_KEY "/)
  assert.match(skrypt, /sudo grep --quiet --extended-regexp/)
  assert.doesNotMatch(skrypt, /install[^\n]+ogarniacz\.env/)
  assert.doesNotMatch(skrypt, /cat[^\n]+plik_env_systemowy/)
})

test('deploy RPi ponawia healthcheck, waliduje kontrakt JSON i pokazuje journal po błędzie', async () => {
  const skrypt = await readFile(sciezkaSkryptuWdrozenia, 'utf8')
  assert.match(skrypt, /liczba_prob_health=15/)
  assert.match(skrypt, /for \(\(numer_proby = 1; numer_proby <= liczba_prob_health; numer_proby\+\+\)\)/)
  assert.match(skrypt, /"\$kod_http" == "200"/)
  assert.match(skrypt, /health\.status !== "ok"/)
  assert.match(skrypt, /health\.service !== "ogarniacz-api"/)
  assert.match(skrypt, /health\.database !== "connected"/)
  assert.match(skrypt, /journalctl -u ogarniacz -n 100 --no-pager/)
})

test('deploy RPi ma poprawną składnię Bash', (t) => {
  const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash'
  if (process.platform === 'win32' && !existsSync(bash)) return t.skip('Brak Git Bash')
  const wynik = spawnSync(bash, ['-n', fileURLToPath(sciezkaSkryptuWdrozenia)], { encoding: 'utf8' })
  assert.equal(wynik.status, 0, wynik.stderr)
})
