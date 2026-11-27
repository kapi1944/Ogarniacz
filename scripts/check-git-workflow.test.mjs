import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempDisposableSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const skrypt = fileURLToPath(new URL('./check-git-workflow.mjs', import.meta.url))

function utworzRepozytorium(kontekst) {
  const tymczasowe = mkdtempDisposableSync(join(tmpdir(), 'ogarniacz-git-'))
  kontekst.after(() => tymczasowe.remove())
  const katalog = tymczasowe.path
  const srodowisko = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(katalog, 'nieistniejaca-konfiguracja'),
    GIT_TERMINAL_PROMPT: '0',
  }
  const git = (...argumenty) => execFileSync('git', argumenty, {
    cwd: katalog, env: srodowisko, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  git('init', '--initial-branch=main', '--template=')
  git('config', 'user.name', 'Test Ogarniacza')
  git('config', 'user.email', 'test@ogarniacz.invalid')
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(katalog, 'dane.txt'), 'stan początkowy\n')
  git('add', 'dane.txt')
  git('commit', '-m', 'Początek')
  git('remote', 'add', 'origin', join(katalog, 'niedostepne-origin'))
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  git('branch', '--set-upstream-to=origin/main')

  return {
    katalog,
    git,
    uruchom: (miejsce = katalog, ...argumenty) => spawnSync(process.execPath, [skrypt, ...argumenty], {
      cwd: miejsce, env: srodowisko, encoding: 'utf8',
    }),
  }
}

test('czysty main jest zsynchronizowany z origin', (kontekst) => {
  const { katalog, uruchom } = utworzRepozytorium(kontekst)
  const wynik = uruchom(katalog, '--nowe-zadanie')
  assert.equal(wynik.status, 0)
  assert.match(wynik.stdout, /Gałąź: main/)
  assert.match(wynik.stdout, /origin\/main \(\+0 -0, ahead\/behind\)/)
  assert.equal(wynik.stderr, '')
})

test('nowa gałąź z aktualnego main jest poprawna bez upstreamu', (kontekst) => {
  const { katalog, git, uruchom } = utworzRepozytorium(kontekst)
  git('switch', '--no-track', '-c', 'feat/nowa', 'origin/main')
  const wynik = uruchom(katalog, '--nowe-zadanie')
  assert.equal(wynik.status, 0)
  assert.match(wynik.stdout, /Upstream: nieustawiony/)
  assert.match(wynik.stdout, /0 ahead, 0 behind/)
  assert.equal(wynik.stderr, '')
})

test('rozbieżna baza i upstream wywołują ostrzeżenia bez zmiany referencji', (kontekst) => {
  const { katalog, git, uruchom } = utworzRepozytorium(kontekst)
  git('branch', 'feat/stara', 'origin/main')
  git('commit', '--allow-empty', '-m', 'Nowsza baza')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  git('update-ref', 'refs/remotes/origin/feat/stara', 'HEAD')
  git('switch', 'feat/stara')
  git('branch', '--set-upstream-to=origin/feat/stara')
  git('commit', '--allow-empty', '-m', 'Istniejąca praca')
  const przed = git('show-ref')
  const wynik = uruchom(katalog, '--nowe-zadanie')
  assert.equal(wynik.status, 0)
  assert.match(wynik.stdout, /origin\/feat\/stara \(\+1 -1, ahead\/behind\)/)
  assert.match(wynik.stdout, /1 ahead, 1 behind/)
  assert.match(wynik.stderr, /do tyłu względem upstreamu/)
  assert.match(wynik.stderr, /Nowe niezależne zadanie zacznij/)
  assert.equal(git('show-ref'), przed)
  assert.equal(git('branch', '--show-current'), 'feat/stara')
})

test('zmiany staged, unstaged i nieśledzone pozostają w katalogu i indeksie', (kontekst) => {
  const { katalog, git, uruchom } = utworzRepozytorium(kontekst)
  const plik = join(katalog, 'dane.txt')
  const niesledzony = join(katalog, 'lokalne.txt')
  writeFileSync(plik, 'staged\n')
  git('add', 'dane.txt')
  writeFileSync(plik, 'unstaged\n')
  writeFileSync(niesledzony, 'lokalne\n')
  const indeks = join(katalog, '.git', 'index')
  const stanIndeksu = readFileSync(indeks)
  const wynik = uruchom()
  assert.equal(wynik.status, 0)
  assert.match(wynik.stderr, /niezacommitowane zmiany/)
  assert.equal(readFileSync(plik, 'utf8'), 'unstaged\n')
  assert.equal(readFileSync(niesledzony, 'utf8'), 'lokalne\n')
  assert.deepEqual(readFileSync(indeks), stanIndeksu)
})

test('detached HEAD jest rozpoznany, a commit pozostaje ten sam', (kontekst) => {
  const { git, uruchom } = utworzRepozytorium(kontekst)
  const sha = git('rev-parse', 'HEAD')
  git('switch', '--detach', sha)
  const wynik = uruchom()
  assert.equal(wynik.status, 0)
  assert.match(wynik.stderr, /Detached HEAD/)
  assert.equal(git('rev-parse', 'HEAD'), sha)
  assert.equal(git('branch', '--show-current'), '')
})

test('niedostępny origin pozwala porównać zapisane referencje offline', (kontekst) => {
  const { katalog, git, uruchom } = utworzRepozytorium(kontekst)
  assert.equal(existsSync(git('remote', 'get-url', 'origin')), false)
  const wynik = uruchom()
  assert.equal(wynik.status, 0)
  assert.match(wynik.stdout, /danych lokalnych/)
  assert.match(wynik.stdout, /0 ahead, 0 behind/)
  assert.equal(wynik.stderr, '')
  git('update-ref', '-d', 'refs/remotes/origin/main')
  const bezBazy = uruchom()
  assert.equal(bezBazy.status, 0)
  assert.match(bezBazy.stderr, /Brak lokalnej referencji origin\/main/)
  assert.equal(existsSync(join(katalog, '.git', 'FETCH_HEAD')), false)
})

test('kontrola powiązanego worktree zachowuje oba katalogi i gałęzie', (kontekst) => {
  const { katalog, git, uruchom } = utworzRepozytorium(kontekst)
  const worktree = join(katalog, 'powiazane')
  git('worktree', 'add', '-b', 'feat/powiazana', worktree, 'origin/main')
  const stan = git('worktree', 'list', '--porcelain')
  const wynik = uruchom(worktree)
  assert.equal(wynik.status, 0)
  assert.match(wynik.stdout, /Worktree: .+ \(powiązane\)/)
  assert.match(wynik.stdout, /Gałąź: feat\/powiazana/)
  assert.equal(wynik.stderr, '')
  assert.equal(git('worktree', 'list', '--porcelain'), stan)
  assert.equal(git('branch', '--show-current'), 'main')
})

test('kontynuacja pracy na własnych commitach jest poprawna', (kontekst) => {
  const { katalog, git, uruchom } = utworzRepozytorium(kontekst)
  git('switch', '-c', 'feat/w-toku', 'origin/main')
  git('commit', '--allow-empty', '-m', 'Commity bieżącego zadania')
  const wynik = uruchom()
  assert.equal(wynik.status, 0)
  assert.match(wynik.stdout, /1 ahead, 0 behind/)
  assert.equal(wynik.stderr, '')
  const nowe = uruchom(katalog, '--nowe-zadanie')
  assert.equal(nowe.status, 0)
  assert.match(nowe.stderr, /Nowe niezależne zadanie zacznij/)
})

test('wywołanie poza repozytorium zgłasza błąd', (kontekst) => {
  const tymczasowe = mkdtempDisposableSync(join(tmpdir(), 'ogarniacz-poza-git-'))
  kontekst.after(() => tymczasowe.remove())
  const wynik = spawnSync(process.execPath, [skrypt], { cwd: tymczasowe.path, encoding: 'utf8' })
  assert.equal(wynik.status, 1)
  assert.match(wynik.stderr, /^Błąd:/)
})
