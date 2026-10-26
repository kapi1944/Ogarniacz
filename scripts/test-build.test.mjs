import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  nazwaTagu, odczytajKontekst, opublikujBete, przygotujArtefakty, sprawdzArchiwum,
  sprawdzAssety, sprawdzBramke, sprawdzBrakPublikacji, sprawdzListeArchiwum,
  utworzApi, wybierzCi, zweryfikujPliki,
} from './test-build.mjs'
import { parsujManifestTestowy, utworzUslugeAktualizacjiTestowych } from '../src/platform/AktualizacjeTestoweService.ts'

const sha = 'a'.repeat(40)
const kontekst = { sha, numerBuildu: 42, runId: 300, proba: 1 }
const srodowisko = { GITHUB_SHA: sha, GITHUB_REPOSITORY: 'kapi1944/Ogarniacz', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_NUMBER: '42', GITHUB_RUN_ID: '300', GITHUB_RUN_ATTEMPT: '1' }
const bramka = { ciRunId: 200, opis: 'Rzeczywisty opis zmian z commita.' }
const przebiegCi = { id: 200, run_number: 100, run_attempt: 1, head_sha: sha, head_branch: 'main', path: '.github/workflows/ci.yml', event: 'push', status: 'completed', conclusion: 'success', repository: { full_name: 'kapi1944/Ogarniacz' } }
const przebiegBuildu = { ...przebiegCi, id: 300, run_number: 42, event: 'workflow_dispatch', path: '.github/workflows/test-build.yml', status: 'in_progress', conclusion: null }
const commit = { sha, commit: { message: bramka.opis, committer: { date: '2026-10-26T10:00:00Z' } } }
const gitTestowy = (polecenie) => polecenie === 'status' ? '' : polecenie === 'ls-remote' ? `${sha}\trefs/heads/main` : sha

test('kontekst dopuszcza tylko rzeczywiste identyfikatory pierwszego ręcznego przebiegu main', () => {
  assert.deepEqual(odczytajKontekst(srodowisko), kontekst)
  assert.equal(nazwaTagu(kontekst), `beta-42-${sha}`)
  for (const zmiana of [
    { GITHUB_REF: 'refs/heads/rpi-stable' }, { GITHUB_REPOSITORY: 'obcy/Ogarniacz' },
    { GITHUB_EVENT_NAME: 'push' }, { GITHUB_SHA: 'abc123' }, { GITHUB_RUN_NUMBER: '0' },
    { GITHUB_RUN_NUMBER: '42.1' }, { GITHUB_RUN_ID: '' }, { GITHUB_RUN_ATTEMPT: '2' },
  ]) assert.throws(() => odczytajKontekst({ ...srodowisko, ...zmiana }))
})

test('CI: wybiera najnowszy zgodny przebieg i nie maskuje błędu starszym zielonym', () => {
  assert.equal(wybierzCi([przebiegCi], kontekst), 200)
  for (const dane of [{ conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'queued' }, { status: 'in_progress', conclusion: null }]) {
    assert.throws(() => wybierzCi([przebiegCi, { ...przebiegCi, id: 201, ...dane }], kontekst), /najnowszego CI/)
    assert.throws(() => wybierzCi([przebiegCi, { ...przebiegCi, run_attempt: 2, ...dane }], kontekst), /najnowszego CI/)
  }
  for (const dane of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'rpi-stable' }, { event: 'pull_request' }, { path: '.github/workflows/inny.yml' }, { repository: { full_name: 'obcy/Ogarniacz' } }]) {
    assert.throws(() => wybierzCi([{ ...przebiegCi, ...dane }], kontekst))
  }
  assert.throws(() => wybierzCi([], kontekst))
})

function apiBramki(zmiany = {}) {
  return async (sciezka) => {
    if (sciezka === '/commits/main') return zmiany.commit ?? commit
    if (sciezka === '/actions/runs/300') return zmiany.build ?? przebiegBuildu
    if (sciezka.startsWith('/actions/workflows/ci.yml/runs?')) return { workflow_runs: zmiany.ci ?? [przebiegCi] }
    throw new Error('Nieoczekiwany odczyt')
  }
}

test('bramka sprawdza dokładne źródła, zdalny main i niezależne CI bez fałszowania własnego sukcesu', async () => {
  assert.deepEqual(await sprawdzBramke(kontekst, apiBramki(), gitTestowy), bramka)
  await assert.rejects(sprawdzBramke(kontekst, apiBramki(), (polecenie) => polecenie === 'rev-parse' ? 'b'.repeat(40) : gitTestowy(polecenie)), /SHA checkoutu/)
  await assert.rejects(sprawdzBramke(kontekst, apiBramki(), (polecenie) => polecenie === 'status' ? ' M plik' : gitTestowy(polecenie)), /lokalne zmiany/)
  await assert.rejects(sprawdzBramke(kontekst, apiBramki(), (polecenie) => polecenie === 'ls-remote' ? 'b'.repeat(40) : gitTestowy(polecenie)), /origin\/main zmienił/)
  await assert.rejects(sprawdzBramke(kontekst, apiBramki({ commit: { ...commit, sha: 'b'.repeat(40) } }), gitTestowy), /main zmienił/)
  await assert.rejects(sprawdzBramke(kontekst, apiBramki({ build: { ...przebiegBuildu, run_attempt: 2 } }), gitTestowy), /pochodzenie/)
  await assert.rejects(sprawdzBramke(kontekst, apiBramki({ ci: [] }), gitTestowy), /CI/)
})

test('duplikat taga albo wydania blokuje dalsze operacje, również draft', async () => {
  await sprawdzBrakPublikacji(kontekst, async () => undefined)
  await assert.rejects(sprawdzBrakPublikacji(kontekst, async () => ({ ref: 'istnieje' })), /Tag Beta już istnieje/)
  await assert.rejects(sprawdzBrakPublikacji(kontekst, async (sciezka) => sciezka.startsWith('/releases/') ? { draft: true } : undefined), /Wydanie tego przebiegu/)
})

async function zeZbudowanymiPlikami(operacja) {
  const katalog = await mkdtemp(join(tmpdir(), 'og-beta-'))
  const wyjscie = join(katalog, 'wynik')
  try {
    await mkdir(join(katalog, 'dist/assets'), { recursive: true })
    await mkdir(join(katalog, 'dist-server'))
    for (const plik of ['index.html', 'sw.js', 'manifest.webmanifest', 'powiadomienia-sw.js']) await writeFile(join(katalog, 'dist', plik), 'wynik buildu')
    await writeFile(join(katalog, 'dist/assets/index-test.js'), `const metadane = {sha: '${sha}'};`)
    await writeFile(join(katalog, 'dist-server/main.js'), 'console.log("backend");')
    for (const plik of ['package.json', 'package-lock.json']) await writeFile(join(katalog, plik), '{"version":"1.0.23"}')
    // Pliki istnieją obok buildów, ale nigdy nie wchodzą do paczek.
    await mkdir(join(katalog, 'data'))
    await writeFile(join(katalog, '.env'), 'SEKRET_TESTOWY=nie-publikuj')
    await writeFile(join(katalog, 'data/uzytkownicy.sqlite'), 'dane użytkownika')
    const manifest = await przygotujArtefakty(kontekst, bramka, katalog, wyjscie, gitTestowy)
    await operacja({ katalog, wyjscie, manifest, zestaw: await zweryfikujPliki(kontekst, wyjscie) })
  } finally { await rm(katalog, { recursive: true, force: true }) }
}

test('rzeczywiste tar.gz Web/Raspberry zawierają komplet i pełny SHA, bez sekretów, baz i Androida', async () => {
  await zeZbudowanymiPlikami(async ({ wyjscie, manifest, zestaw }) => {
    assert.deepEqual(parsujManifestTestowy(manifest), manifest)
    assert.equal(manifest.wersja, '1.1.0-beta.42')
    assert.deepEqual(manifest.artefakty.map((artefakt) => artefakt.platforma), ['web', 'raspberry'])
    const json = zestaw.tresc.match(/^```json\n([\s\S]*)\n```$/)[1]
    assert.equal(json + '\n', await readFile(join(wyjscie, 'manifest-testowy.json'), 'utf8'))
    for (const artefakt of manifest.artefakty) {
      const pliki = sprawdzArchiwum(join(wyjscie, artefakt.nazwa), artefakt.platforma, kontekst)
      assert.ok(pliki.every((plik) => !/\.env|sqlite|node_modules|android|data\//.test(plik)))
    }
  })
})

test('allowlista odrzuca sekrety, dane, dowiązania ścieżek i niekompletne buildy', () => {
  const pliki = ['index.html', 'sw.js', 'manifest.webmanifest', 'powiadomienia-sw.js', 'metadane-testowe.json', 'assets/index-a.js']
  for (const plik of ['.env', '.env.example', 'dane.sqlite', 'data/uzytkownicy.json', 'backup.json', 'klucz.pem', 'podpis.jks', '../index.html', '/index.html', 'assets/.sekret.js', 'assets/dane.json', 'dist-server/main.js']) {
    assert.throws(() => sprawdzListeArchiwum([...pliki, plik], 'web'), /Niedozwolony/)
  }
  assert.throws(() => sprawdzListeArchiwum(pliki.slice(1), 'web'), /Niekompletne/)
  assert.throws(() => sprawdzListeArchiwum([...pliki, 'index.html'], 'web'), /powtórzone/)
})

test('manifest: odrzucenie innego SHA, numeracji, braku pliku, rozmiaru i hasha', async () => {
  await zeZbudowanymiPlikami(async ({ wyjscie, manifest }) => {
    const sciezka = join(wyjscie, 'manifest-testowy.json')
    for (const dane of [{ sha: 'b'.repeat(40) }, { wersja: '1.1.0' }, { wersja: '1.1.0-beta.43' }, { runId: 301 }, { numerBuildu: 43 }]) {
      await writeFile(sciezka, JSON.stringify({ ...manifest, ...dane }))
      await assert.rejects(zweryfikujPliki(kontekst, wyjscie))
    }
    for (const zmiana of [{ rozmiar: 1 }, { sha256: 'f'.repeat(64) }]) {
      await writeFile(sciezka, JSON.stringify({ ...manifest, artefakty: [{ ...manifest.artefakty[0], ...zmiana }, manifest.artefakty[1]] }))
      await assert.rejects(zweryfikujPliki(kontekst, wyjscie), /rozmiar lub SHA-256/)
    }
    await writeFile(sciezka, JSON.stringify(manifest))
    await rm(join(wyjscie, manifest.artefakty[0].nazwa))
    await assert.rejects(zweryfikujPliki(kontekst, wyjscie), /ENOENT/)
  })
})

test('uszkodzone archiwum jest odrzucane nawet przy zgodnym przeliczonym hashu manifestu', async () => {
  await zeZbudowanymiPlikami(async ({ wyjscie, manifest }) => {
    const bajty = Buffer.from('to nie jest tar.gz')
    await writeFile(join(wyjscie, manifest.artefakty[0].nazwa), bajty)
    manifest.artefakty[0].rozmiar = bajty.length
    manifest.artefakty[0].sha256 = createHash('sha256').update(bajty).digest('hex')
    await writeFile(join(wyjscie, 'manifest-testowy.json'), JSON.stringify(manifest))
    await assert.rejects(zweryfikujPliki(kontekst, wyjscie))
  })
})

test('archiwum z pochodzeniem innego SHA jest odrzucane', async () => {
  await zeZbudowanymiPlikami(async ({ wyjscie, manifest }) => {
    assert.throws(() => sprawdzArchiwum(join(wyjscie, manifest.artefakty[0].nazwa), 'web', { ...kontekst, sha: 'b'.repeat(40) }), /źródeł w archiwum/)
  })
})

function przygotujApiPublikacji(zestaw, ustawienia = {}) {
  const wywolania = []
  const tag = nazwaTagu(kontekst)
  const wydanie = { id: 900, tag_name: tag, body: zestaw.tresc, draft: true, prerelease: true, html_url: `https://github.com/kapi1944/Ogarniacz/releases/tag/${tag}`, assets: [] }
  const api = async (sciezka, opcje = {}) => {
    wywolania.push({ sciezka, ...opcje })
    if (sciezka === `/git/ref/tags/${tag}`) return opcje.publiczne ? { object: { type: 'commit', sha } } : undefined
    if (sciezka === `/releases/tags/${tag}`) return opcje.publiczne ? wydanie : undefined
    if (sciezka === '/git/refs') { if (ustawienia.kolizjaTagu) throw new Error('HTTP 422 istniejący tag'); return {} }
    if (sciezka === '/releases') { Object.assign(wydanie, opcje.dane); return wydanie }
    if (sciezka.startsWith('https://uploads.github.com/')) {
      const nazwa = new URL(sciezka).searchParams.get('name')
      wydanie.assets.push({ name: nazwa, size: opcje.bajty.length, digest: ustawienia.brakDigest ? null : `sha256:${createHash('sha256').update(opcje.bajty).digest('hex')}`, state: 'uploaded' })
      return {}
    }
    if (sciezka === '/releases/900') {
      if (opcje.metoda === 'PATCH') Object.assign(wydanie, opcje.dane)
      return wydanie
    }
    throw new Error(`Nieoczekiwana operacja ${sciezka}`)
  }
  return { api, wywolania, wydanie }
}

test('publikacja tworzy nieprzesuwany tag, kompletny draft i sprawdza anonimowe metadane', async () => {
  await zeZbudowanymiPlikami(async ({ zestaw }) => {
    const { api, wywolania, wydanie } = przygotujApiPublikacji(zestaw)
    assert.equal(await opublikujBete(kontekst, zestaw, api, async () => bramka), wydanie.html_url)
    assert.equal(wydanie.draft, false)
    assert.equal(wydanie.make_latest, 'false')
    const tworzenie = wywolania.find((wywolanie) => wywolanie.sciezka === '/releases')
    assert.deepEqual(tworzenie.dane, { tag_name: nazwaTagu(kontekst), target_commitish: sha, name: 'Ogarniacz 1.1.0-beta.42', body: zestaw.tresc, draft: true, prerelease: true, make_latest: 'false' })
    assert.equal(wywolania.filter((wywolanie) => wywolanie.sciezka.startsWith('https://uploads.github.com/')).length, 3)
    assert.ok(wywolania.findIndex((wywolanie) => wywolanie.metoda === 'PATCH') > wywolania.findLastIndex((wywolanie) => wywolanie.sciezka.startsWith('https://uploads.github.com/')))
    assert.equal(wywolania.filter((wywolanie) => wywolanie.publiczne).length, 2)
  })
})

test('zmiana main/CI przed upublicznieniem, kolizja tagu i brak digest nie tworzą publicznej Bety', async () => {
  await zeZbudowanymiPlikami(async ({ zestaw }) => {
    for (const ustawienia of [{ brakDigest: true }, { kolizjaTagu: true }, { zmianaMain: true }, { zmianaCi: true }]) {
      const { api, wydanie, wywolania } = przygotujApiPublikacji(zestaw, ustawienia)
      let bramki = 0
      await assert.rejects(opublikujBete(kontekst, zestaw, api, async () => {
        if (++bramki > 1 && ustawienia.zmianaMain) throw new Error('main zmienił się')
        return ustawienia.zmianaCi && bramki > 1 ? { ciRunId: 201 } : bramka
      }))
      assert.equal(wydanie.draft, true)
      assert.ok(!wywolania.some((wywolanie) => wywolanie.metoda === 'PATCH'))
    }
  })
})

test('publiczny brak digest kończy się błędem po ograniczonych ponowieniach', async () => {
  await zeZbudowanymiPlikami(async ({ zestaw }) => {
    const { api, wydanie } = przygotujApiPublikacji(zestaw)
    let opoznienia = 0
    await assert.rejects(opublikujBete(kontekst, zestaw, (sciezka, opcje) => {
      const wynik = api(sciezka, opcje)
      if (opcje?.publiczne && sciezka.startsWith('/releases/')) wydanie.assets[0].digest = null
      return wynik
    }, async () => bramka, async () => { opoznienia++ }), /digest/)
    assert.equal(opoznienia, 5)
  })
})

test('asset GitHub: brak pliku, digest, uszkodzony hash, rozmiar lub stan blokują walidację', () => {
  const plik = { nazwa: 'web.tar.gz', bajty: Buffer.from('zawartość') }
  const asset = { name: plik.nazwa, size: plik.bajty.length, digest: 'sha256:' + createHash('sha256').update(plik.bajty).digest('hex'), state: 'uploaded' }
  sprawdzAssety({ assets: [asset] }, [plik])
  for (const zmiana of [{ digest: null }, { digest: 'sha256:' + 'f'.repeat(64) }, { size: 1 }, { state: 'new' }, { name: 'inny.gz' }]) assert.throws(() => sprawdzAssety({ assets: [{ ...asset, ...zmiana }] }, [plik]))
  assert.throws(() => sprawdzAssety({ assets: [] }, [plik]))
})

test('generator i publiczny prerelease przechodzą przez rzeczywisty czytnik A dopiero po sukcesie test-build', async () => {
  await zeZbudowanymiPlikami(async ({ zestaw }) => {
    const { api, wydanie } = przygotujApiPublikacji(zestaw)
    await opublikujBete(kontekst, zestaw, api, async () => bramka)
    for (const stan of ['in_progress', 'completed']) {
      const usluga = utworzUslugeAktualizacjiTestowych(async (sciezka) => {
        if (sciezka === '/commits/main') return commit
        if (sciezka.startsWith('/releases?')) return [wydanie]
        if (sciezka.startsWith('/actions/workflows/ci.yml/runs?')) return { workflow_runs: [przebiegCi] }
        if (sciezka === '/actions/runs/200') return przebiegCi
        if (sciezka === '/actions/runs/300') return { ...przebiegBuildu, status: stan, conclusion: stan === 'completed' ? 'success' : null }
        throw new Error('Nieoczekiwany odczyt')
      })
      if (stan === 'in_progress') await assert.rejects(usluga.sprawdzBuild(new AbortController().signal), /Brak potwierdzonego sukcesu/)
      else assert.deepEqual((await usluga.sprawdzBuild(new AbortController().signal)).manifest, zestaw.manifest)
    }
  })
})

test('transport nie przekazuje tokenu do publicznej weryfikacji, a błędu 403 nie myli z brakiem taga', async () => {
  const wywolania = []
  const api = utworzApi('token-testowy', async (adres, opcje) => {
    wywolania.push({ adres, ...opcje })
    return { ok: true, json: async () => ({}) }
  })
  await api('/releases')
  await api('/releases', { publiczne: true })
  assert.equal(wywolania[0].headers.Authorization, 'Bearer token-testowy')
  assert.equal(wywolania[1].headers.Authorization, undefined)
  await assert.rejects(utworzApi('token', async () => ({ ok: false, status: 403 }))('/releases', { brakDozwolony: true }), /HTTP 403/)
})

test('workflow jest ręczny, bezpieczny domyślnie, przypięty do SHA i nie dotyka kanałów produkcyjnych', async () => {
  const workflow = await readFile('.github/workflows/test-build.yml', 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /publish_beta:[\s\S]*type: boolean[\s\S]*default: false/)
  assert.match(workflow, /group: ogarniacz-test-beta\s+cancel-in-progress: false/)
  assert.equal((workflow.match(/ref: \$\{\{ github.sha \}\}/g) ?? []).length, 2)
  assert.match(workflow, /needs: budowanie\s+if: \$\{\{ inputs.publish_beta \}\}/)
  assert.equal((workflow.match(/contents: write/g) ?? []).length, 1)
  assert.doesNotMatch(workflow, /\n  (push|schedule|workflow_run):|rpi-stable|android-production|android:release|version:patch|deploy|signing|secrets\./)
  assert.throws(() => execFileSync(process.execPath, ['scripts/test-build.mjs', 'opublikuj'], {
    encoding: 'utf8', env: { ...process.env, ...srodowisko, GITHUB_RUN_ATTEMPT: '2' }, stdio: 'pipe',
  }), (blad) => blad.status === 1 && blad.stderr.includes('Ponowienia run_attempt'))
  assert.throws(() => execFileSync(process.execPath, ['scripts/test-build.mjs', 'opublikuj'], {
    encoding: 'utf8', env: { ...process.env, ...srodowisko, PUBLIKUJ_BETA: 'false' }, stdio: 'pipe',
  }), (blad) => blad.status === 1 && blad.stderr.includes('publish_beta=true'))
})
