import assert from 'node:assert/strict'
import { test, mock, afterEach } from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { zapewnijRelease } from './android-release-publikacja.mjs'
import { uruchom } from './platform-release.mjs'
import { etapy, nazwyEtapu, skrot, sprawdzBramke, sprawdzZestaw, sprawdzWersjePakietow, utworzPotwierdzenie } from './platform-release-wspolne.mjs'

afterEach(() => mock.restoreAll())
const stan = { wersja: '1.1.2', sha: 'b'.repeat(40), zrodlo: 'a'.repeat(40), ci: '123' }
const zielone = { id: 123, head_sha: stan.zrodlo, head_branch: 'main', status: 'completed', conclusion: 'success', event: 'push', head_repository: { full_name: 'test/Ogarniacz' }, path: '.github/workflows/ci.yml' }
const json = (dane) => Buffer.from(`${JSON.stringify(dane, null, 2)}\n`)

function zestaw(stanWydania = stan) {
  const stan = stanWydania
  const pliki = new Map()
  for (const etap of etapy) {
    for (const nazwa of nazwyEtapu(stan.wersja, etap)) {
      if (nazwa.endsWith('.sha256')) {
        const plik = nazwa.slice(0, -7)
        pliki.set(nazwa, Buffer.from(`${skrot(pliki.get(plik))}  ${plik}\n`))
      } else if (nazwa === 'latest.json') {
        const nazwaApk = nazwyEtapu(stan.wersja, 'android')[0], apk = pliki.get(nazwaApk)
        pliki.set(nazwa, json({ versionName: stan.wersja, versionCode: 1001002, apkUrl: nazwaApk, size: apk.length, sha256: skrot(apk) }))
      } else pliki.set(nazwa, Buffer.from(`Testowy artefakt ${nazwa}`))
    }
    pliki.set(`${etap}.json`, json(utworzPotwierdzenie(stan, etap, pliki)))
  }
  pliki.set('SHA256SUMS.txt', Buffer.from([...pliki].map(([nazwa, dane]) => `${skrot(dane)}  ${nazwa}\n`).join('')))
  pliki.set('wydanie.json', json(stan))
  return pliki
}

// Atrapa wyłącznie granicy systemowej SDK/tar. Walidacja, transport i publikacja są rzeczywiste.
const weryfikatory = { sprawdzApk: async () => {}, sprawdzPaczki: async () => {} }

function github(pliki, { poczatkowe = [], publiczne = false, awariaPo, uszkodzZdalny } = {}) {
  let istnieje = poczatkowe.length > 0 || publiczne
  const zdalne = new Map(poczatkowe.map((nazwa) => [nazwa, pliki.get(nazwa)]))
  const operacje = []
  let wysylki = 0
  const wydanie = () => ({ id: 1, tag_name: `v${stan.wersja}`, draft: !publiczne, prerelease: false, upload_url: 'https://upload.test/{?name,label}',
    assets: [...zdalne].map(([name, dane]) => ({ name, size: dane.length, url: `https://api.test/assets/${name}` })) })
  const pobierz = async (adres, opcje = {}) => {
    if (opcje.method) operacje.push([opcje.method, adres])
    if (opcje.method === 'POST' && adres.includes('upload.test')) {
      if (awariaPo !== undefined && wysylki++ === awariaPo) return { ok: false, status: 503 }
      zdalne.set(new URL(adres).searchParams.get('name'), opcje.body)
    } else if (opcje.method === 'POST') istnieje = true
    else if (opcje.method === 'PATCH') publiczne = true
    if (adres.includes('/assets/')) {
      const nazwa = adres.split('/').at(-1)
      return { ok: true, arrayBuffer: async () => nazwa === uszkodzZdalny ? Buffer.from('uszkodzony') : zdalne.get(nazwa) }
    }
    if (adres.includes('/releases?')) return { ok: true, json: async () => istnieje ? [wydanie()] : [] }
    return { ok: istnieje, status: istnieje ? 200 : 404, json: async () => wydanie() }
  }
  return { pobierz, operacje, zdalne, publiczne: () => publiczne }
}

function publikacja(pliki, serwer, dodatkowe = {}) {
  return zapewnijRelease({ repozytorium: 'test/Ogarniacz', token: 'test', stan, manifest: JSON.parse(pliki.get('latest.json')),
    pliki: [...pliki], weryfikatory, potwierdzMain: async () => {}, pobierz: serwer.pobierz, ...dodatkowe })
}

test('brak instalatora Windows blokuje wydanie przed utworzeniem draftu', async () => {
  const pliki = zestaw(), serwer = github(pliki)
  pliki.delete(nazwyEtapu(stan.wersja, 'windows')[0])
  await assert.rejects(publikacja(pliki, serwer), /Brak .*Setup.exe/)
  assert.deepEqual(serwer.operacje, [])
})

test('błędna suma SHA-256 lokalnego pliku blokuje publikację', async () => {
  const pliki = zestaw(), serwer = github(pliki)
  pliki.set(nazwyEtapu(stan.wersja, 'windows')[0], Buffer.from('podmiana'))
  await assert.rejects(publikacja(pliki, serwer), /SHA-256/)
  assert.deepEqual(serwer.operacje, [])
})

test('niezgodna wersja pakietów i pochodzenie platform blokują publikację', async () => {
  const pliki = zestaw(), serwer = github(pliki)
  pliki.set('raspberry.json', json({ ...JSON.parse(pliki.get('raspberry.json')), wersja: '1.1.3' }))
  await assert.rejects(publikacja(pliki, serwer), /Niezgodna wersja/)
  assert.throws(() => sprawdzWersjePakietow({ version: '1.1.2' }, { version: '1.1.1', packages: { '': { version: '1.1.2' } } }), /Niezgodna wersja/)
  assert.deepEqual(serwer.operacje, [])
})

test('niepowodzenie podpisu APK zatrzymuje wydanie przed zapisem GitHub', async () => {
  const pliki = zestaw(), serwer = github(pliki)
  await assert.rejects(publikacja(pliki, serwer, { weryfikatory: { ...weryfikatory, sprawdzApk: () => { throw new Error('apksigner verify: błąd podpisu APK') } } }), /błąd podpisu APK/)
  await assert.rejects(sprawdzZestaw(stan, pliki, { sprawdzPaczki: weryfikatory.sprawdzPaczki }), /Brak weryfikacji podpisu/)
  assert.deepEqual(serwer.operacje, [])
})

test('częściowy draft po awarii pozostaje prywatny, wznowienie dosyła tylko brakujące pliki', async () => {
  const pliki = zestaw(), serwer = github(pliki, { awariaPo: 3 })
  await assert.rejects(publikacja(pliki, serwer), /HTTP 503/)
  assert.equal(serwer.publiczne(), false)
  const zapisane = [...serwer.zdalne.keys()]
  assert.equal(zapisane.length, 3)
  const przed = serwer.operacje.length
  await publikacja(pliki, serwer)
  assert.equal(serwer.publiczne(), true)
  const wyslane = serwer.operacje.slice(przed).filter(([metoda]) => metoda === 'POST').map(([, adres]) => new URL(adres).searchParams.get('name'))
  assert.equal(wyslane.length, pliki.size - zapisane.length)
  assert.ok(wyslane.every((nazwa) => !zapisane.includes(nazwa)))
})

test('powtórna publikacja kompletnego wydania nie zapisuje ani nie usuwa assetów', async () => {
  const pliki = zestaw(), serwer = github(pliki)
  await publikacja(pliki, serwer)
  const przed = serwer.operacje.length
  await publikacja(pliki, serwer)
  assert.equal(serwer.operacje.length, przed)
})

test('niezgodny istniejący asset nigdy nie jest nadpisywany', async () => {
  const pliki = zestaw(), nazwa = [...pliki.keys()][0], serwer = github(pliki, { poczatkowe: [nazwa] })
  serwer.zdalne.set(nazwa, Buffer.from('inny plik'))
  await assert.rejects(publikacja(pliki, serwer), /niespójność istniejącego assetu/)
  assert.deepEqual(serwer.operacje, [])
})

test('SHA-256 pobranego draftu jest sprawdzany przed upublicznieniem', async () => {
  const pliki = zestaw(), serwer = github(pliki, { uszkodzZdalny: nazwyEtapu(stan.wersja, 'windows')[0] })
  await assert.rejects(publikacja(pliki, serwer), /Błędna suma SHA-256 zdalnego/)
  assert.equal(serwer.publiczne(), false)
  assert.ok(!serwer.operacje.some(([metoda]) => metoda === 'PATCH'))
})

test('zmiana main podczas wysyłania draftu blokuje upublicznienie', async () => {
  const pliki = zestaw(), serwer = github(pliki)
  let bramki = 0
  await assert.rejects(publikacja(pliki, serwer, { potwierdzMain: () => { if (++bramki > 1) throw new Error('main zmienił się') } }), /main zmienił się/)
  assert.equal(serwer.publiczne(), false)
})

test('poprawne wydanie wszystkich platform staje się publiczne dopiero z pełnym zestawem', async () => {
  const pliki = zestaw(), serwer = github(pliki)
  await publikacja(pliki, serwer)
  assert.equal(serwer.publiczne(), true)
  assert.equal(serwer.zdalne.size, pliki.size)
  assert.equal(serwer.operacje.at(-1)[0], 'PATCH')
})

test('wyłączona automatyzacja, PR, czerwone CI i stary SHA są blokowane', () => {
  const baza = { sha: stan.zrodlo, main: stan.zrodlo, repozytorium: 'test/Ogarniacz', ci: zielone }
  for (const wlaczona of [undefined, '', 'false', 'TRUE']) assert.throws(() => sprawdzBramke({ ...baza, automatyczna: true, wlaczona }), /wyłączona/)
  for (const zmiana of [{ event: 'pull_request' }, { conclusion: 'failure' }, { head_branch: 'inna' }, { head_sha: stan.sha }, { status: 'in_progress' }, { path: '.github/workflows/inny.yml' }]) {
    assert.throws(() => sprawdzBramke({ ...baza, ci: { ...zielone, ...zmiana } }), /Brak zielonego CI/)
  }
  assert.throws(() => sprawdzBramke({ ...baza, main: stan.sha }), /main zmienił się/)
  sprawdzBramke({ ...baza, automatyczna: true, wlaczona: 'true' })
})

async function wRepozytorium(sprawdz) {
  const poprzedni = process.cwd(), srodowisko = { ...process.env }
  const katalog = mkdtempSync(join(tmpdir(), 'ogarniacz-wydanie-'))
  const git = (...argumenty) => execFileSync('git', argumenty, { cwd: katalog, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git('init', '--bare', join(katalog, 'origin.git')); git('init', '-b', 'main')
    git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test')
    writeFileSync(join(katalog, 'package.json'), JSON.stringify({ version: '1.1.1' }))
    writeFileSync(join(katalog, 'package-lock.json'), JSON.stringify({ version: '1.1.1', packages: { '': { version: '1.1.1' } } }))
    git('add', 'package.json', 'package-lock.json'); git('commit', '-m', 'baza'); git('tag', 'v1.1.1')
    mkdirSync(join(katalog, 'server')); writeFileSync(join(katalog, 'server', 'main.ts'), 'produkcja')
    git('add', 'server/main.ts'); git('commit', '-m', 'zmiana tylko backendu')
    git('remote', 'add', 'origin', join(katalog, 'origin.git')); git('push', 'origin', 'main', '--tags')
    const zrodlo = git('rev-parse', 'HEAD'), wyjscie = join(katalog, 'output')
    Object.assign(process.env, { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: zrodlo,
      GITHUB_REPOSITORY: 'test/Ogarniacz', GITHUB_WORKFLOW_REF: 'test/Ogarniacz/.github/workflows/android-release.yml@refs/heads/main', GITHUB_OUTPUT: wyjscie,
      SOURCE_SHA: zrodlo, VERSION_BUMP: 'patch', RESUME_VERSION: '', AUTOMATYCZNA: 'false' })
    mock.method(globalThis, 'fetch', async (adres) => {
      const sciezka = String(adres)
      let dane
      if (sciezka.includes('/actions/')) dane = sciezka.includes('/workflows/') ? { workflow_runs: [{ ...zielone, head_sha: zrodlo }] } : { ...zielone, head_sha: zrodlo }
      else if (sciezka.endsWith('/releases/latest')) dane = { tag_name: 'v1.1.1' }
      else if (sciezka.includes('/releases?')) dane = []
      return { ok: Boolean(dane), status: dane ? 200 : 404, json: async () => dane }
    })
    process.chdir(katalog)
    await sprawdz({ git, zrodlo, wyjscie, katalog })
  } finally {
    process.chdir(poprzedni)
    for (const klucz of Object.keys(process.env)) if (!(klucz in srodowisko)) delete process.env[klucz]
    Object.assign(process.env, srodowisko)
    rmSync(katalog, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

test('rzeczywisty Git: zmiana tylko Raspberry tworzy wspólną wersję, powtórne CI i wznowienie nie tworzą następnej', async () => {
  await wRepozytorium(async ({ git, zrodlo, wyjscie }) => {
    await uruchom(['przygotuj'])
    const commit = git('rev-parse', 'HEAD')
    assert.notEqual(commit, zrodlo)
    assert.equal(JSON.parse(readFileSync('package.json')).version, '1.1.2')
    assert.match(readFileSync(wyjscie, 'utf8'), /aktywne=true/)
    await uruchom(['przygotuj'])
    assert.equal(git('rev-parse', 'origin/main'), commit)
    process.env.AUTOMATYCZNA = 'true'; process.env.AUTO_PUBLISH_ENABLED = 'true'; process.env.SOURCE_SHA = commit
    await uruchom(['przygotuj'])
    assert.ok(readFileSync(wyjscie, 'utf8').trim().endsWith('aktywne=false'))
    process.env.AUTOMATYCZNA = 'false'; process.env.SOURCE_SHA = zrodlo
    process.env.RESUME_VERSION = '1.1.2'
    await uruchom(['przygotuj'])
    assert.equal(git('rev-parse', 'origin/main'), commit)
    process.env.RESUME_VERSION = '1.1.3'
    await assert.rejects(uruchom(['przygotuj']), /Brak zapisanego commita/)
    assert.equal(git('rev-parse', 'origin/main'), commit)
  })
})

test('wznowienie odtwarza Windows z draftu bez buildu, niezgodne pobrane bajty zatrzymują etap', async () => {
  await wRepozytorium(async ({ wyjscie }) => {
    await uruchom(['przygotuj'])
    const zapis = JSON.parse(readFileSync(wyjscie, 'utf8').split('\n').find((linia) => linia.startsWith('stan=')).slice(5))
    process.env.STAN_WYDANIA = JSON.stringify(zapis)
    const pliki = zestaw(zapis), nazwy = [...nazwyEtapu(zapis.wersja, 'windows'), 'windows.json']
    let uszkodzony = false
    mock.method(globalThis, 'fetch', async (adres) => {
      if (String(adres).includes('/assets/')) return { ok: true, arrayBuffer: async () => uszkodzony ? Buffer.from('podmiana') : pliki.get(String(adres).split('/').at(-1)) }
      return { ok: true, json: async () => String(adres).includes('/actions/') ? { artifacts: [] } : [{ tag_name: `v${zapis.wersja}`, draft: true,
        assets: nazwy.map((name) => ({ name, url: `https://api.test/assets/${name}` })) }] }
    })
    await uruchom(['odtworz', 'windows'])
    assert.ok(readFileSync(wyjscie, 'utf8').trim().endsWith('gotowe=true'))
    assert.deepEqual(readFileSync(join('artifacts/wydanie', nazwy[0])), pliki.get(nazwy[0]))
    uszkodzony = true
    await assert.rejects(uruchom(['odtworz', 'windows']), /JSON|Unexpected token|SHA-256/)
  })
})

test('rzeczywiste tar.gz: metadane Web i package.json Raspberry wymagają tej samej wersji', async () => {
  await wRepozytorium(async ({ wyjscie }) => {
    await uruchom(['przygotuj'])
    const zapis = JSON.parse(readFileSync(wyjscie, 'utf8').split('\n').find((linia) => linia.startsWith('stan=')).slice(5))
    process.env.STAN_WYDANIA = JSON.stringify(zapis)
    mkdirSync('dist'); mkdirSync('artifacts/wydanie', { recursive: true })
    writeFileSync('dist/wydanie.json', json(zapis))
    const web = join('artifacts/wydanie', nazwyEtapu(zapis.wersja, 'web')[0])
    execFileSync('tar', ['-czf', web, '-C', 'dist', '.'])
    await uruchom(['potwierdz', 'web'])
    writeFileSync('dist/wydanie.json', json({ ...zapis, wersja: '1.1.3' }))
    execFileSync('tar', ['-czf', web, '-C', 'dist', '.'])
    await assert.rejects(uruchom(['potwierdz', 'web']), /Niezgodna wersja lub SHA paczki/)
    writeFileSync('dist/wydanie.json', json(zapis))
    mkdirSync('paczka/dist', { recursive: true })
    writeFileSync('paczka/dist/wydanie.json', json(zapis))
    writeFileSync('paczka/package.json', json({ version: '1.1.3' }))
    writeFileSync('paczka/package-lock.json', json({ version: '1.1.3', packages: { '': { version: '1.1.3' } } }))
    const rpi = join('artifacts/wydanie', nazwyEtapu(zapis.wersja, 'raspberry')[0])
    execFileSync('tar', ['-czf', rpi, '-C', 'paczka', 'dist', 'package.json', 'package-lock.json'])
    await assert.rejects(uruchom(['potwierdz', 'raspberry']), /Niezgodna wersja Raspberry Pi/)
  })
})

test('rzeczywisty Git: przesunięcie main po rezerwacji blokuje nową wersję i publikację starego SHA', async () => {
  await wRepozytorium(async ({ git }) => {
    await uruchom(['przygotuj'])
    writeFileSync('server/main.ts', 'nowsza produkcja')
    git('add', 'server/main.ts'); git('commit', '-m', 'main przesuwa się'); git('push', 'origin', 'HEAD:main')
    await assert.rejects(uruchom(['przygotuj']), /main zmienił się/)
    process.env.SOURCE_SHA = git('rev-parse', 'HEAD')
    await assert.rejects(uruchom(['przygotuj']), /niezakończone wydanie|Brak zielonego CI/)
    assert.equal(JSON.parse(readFileSync('package.json')).version, '1.1.2')
  })
})

test('rzeczywisty Git: wyłączona automatyzacja nie zapisuje wersji', async () => {
  await wRepozytorium(async ({ git, zrodlo }) => {
    process.env.AUTOMATYCZNA = 'true'; process.env.AUTO_PUBLISH_ENABLED = 'false'
    await assert.rejects(uruchom(['przygotuj']), /wyłączona/)
    assert.equal(git('rev-parse', 'HEAD'), zrodlo)
  })
})

test('workflow łączy wszystkie platformy przed publikacją i osobno zatwierdza kanał', () => {
  const workflow = readFileSync('.github/workflows/android-release.yml', 'utf8')
  assert.match(workflow, /needs: \[przygotowanie, android, windows, web, raspberry\]/)
  assert.match(workflow, /needs: \[przygotowanie, publikacja\]/)
  assert.match(workflow, /group: android-production-release/)
  assert.doesNotMatch(workflow, /--publish-existing|continue-on-error/)
  const auto = readFileSync('.github/workflows/auto-publish.yml', 'utf8')
  assert.match(auto, /vars.AUTO_PUBLISH_ENABLED == 'true'/)
  assert.match(auto, /source_sha="\$ODBIORCA_SHA"/)
  const wznowienie = readFileSync('.github/workflows/android-release-resume.yml', 'utf8')
  assert.match(wznowienie, /-f resume_version=/)
  assert.doesNotMatch(wznowienie, /android-release-publikacja.mjs/)
})
