import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { zapewnijRelease, sprawdzPublikacje, ustalPunktWznowienia } from './android-release-publikacja.mjs'
import { pobierzPublicznyManifestPoPublikacji } from './android-wspolne.mjs'

const staryManifest = {
  versionName: '1.0.13',
  versionCode: 1_000_013,
  apkUrl: 'Ogarniacz-1.0.13-release.apk',
  sha256: 'a'.repeat(64),
}

const nowyManifest = {
  versionName: '1.0.14',
  versionCode: 1_000_014,
  apkUrl: 'Ogarniacz-1.0.14-release.apk',
  sha256: 'b'.repeat(64),
  size: 123,
}

for (const tagi of ['', '64726ebc\trefs/tags/v1.0.14', 'tag-obiekt\trefs/tags/v1.0.14\n64726ebc\trefs/tags/v1.0.14^{}']) {
  test(`wznowienie commitu wersji nie podbija jej przy ${tagi ? 'istniejącym tagu' : 'braku tagu'}`, () => {
    const wynik = ustalPunktWznowienia('1.0.14', (...argumenty) => {
      if (argumenty[0] === 'log') return '64726ebc'
      if (argumenty[0] === 'ls-remote') return tagi
      return argumenty[1].endsWith('package.json') ? '{"version":"1.0.14"}' : '{"minNativeVersionCode":1000014}'
    })
    assert.equal(wynik.commit, '64726ebc')
    assert.equal(wynik.tag, 'v1.0.14')
    assert.equal(wynik.tagi, tagi)
  })
}

test('brak commitu wersji i tag na innym commicie blokują wznowienie', () => {
  assert.throws(() => ustalPunktWznowienia('1.0.14', () => ''), /Brak commitu wersji/)
  assert.throws(() => ustalPunktWznowienia('1.0.14', (...argumenty) => {
    if (argumenty[0] === 'log') return '64726ebc'
    if (argumenty[0] === 'ls-remote') return 'inny-commit\trefs/tags/v1.0.14'
    return argumenty[1].endsWith('package.json') ? '{"version":"1.0.14"}' : '{"minNativeVersionCode":1000014}'
  }), /Istniejący tag wskazuje inny commit/)
})

function odpowiedzJson(manifest) {
  return { ok: true, json: async () => manifest }
}

test('ponawia odczyt publicznego latest.json do czasu propagacji nowego wydania', async () => {
  const odpowiedzi = [odpowiedzJson(staryManifest), odpowiedzJson(nowyManifest)]
  const opoznienia = []
  const wynik = await pobierzPublicznyManifestPoPublikacji({
    adresManifestu: 'https://example.test/releases/latest/download/latest.json',
    oczekiwanyManifest: nowyManifest,
    pobierz: async () => odpowiedzi.shift(),
    odczekaj: async (czasMs) => opoznienia.push(czasMs),
  })

  assert.equal(wynik, nowyManifest)
  assert.deepEqual(opoznienia, [5_000])
})

test('kończy publikację błędem po wyczerpaniu prób propagacji latest.json', async () => {
  let liczbaPobran = 0
  let liczbaOpoznien = 0
  await assert.rejects(
    pobierzPublicznyManifestPoPublikacji({
      adresManifestu: 'https://example.test/releases/latest/download/latest.json',
      oczekiwanyManifest: nowyManifest,
      pobierz: async () => {
        liczbaPobran += 1
        return odpowiedzJson(staryManifest)
      },
      odczekaj: async () => {
        liczbaOpoznien += 1
      },
    }),
    /Publiczny latest\.json nie odpowiada zweryfikowanemu artefaktowi release/,
  )
  assert.equal(liczbaPobran, 24)
  assert.equal(liczbaOpoznien, 23)
})

test('odrzuca publiczny latest.json z tym samym SHA, ale innym artefaktem', async () => {
  const niespojny = { ...nowyManifest, apkUrl: 'Ogarniacz-1.0.13-release.apk' }
  await assert.rejects(
    pobierzPublicznyManifestPoPublikacji({
      adresManifestu: 'https://example.test/releases/latest/download/latest.json',
      oczekiwanyManifest: nowyManifest,
      pobierz: async () => odpowiedzJson(niespojny),
      odczekaj: async () => undefined,
      maksymalnaLiczbaProb: 1,
    }),
    /Publiczny latest\.json nie odpowiada zweryfikowanemu artefaktowi release/,
  )
})

test('1.0.14: tag i APK dostępne, latest przez chwilę 1.0.13, następnie sukces', async () => {
  const apk = Buffer.from('podpisany APK 1.0.14')
  const manifest = { ...nowyManifest, size: apk.length, sha256: createHash('sha256').update(apk).digest('hex') }
  const adresy = []
  let probyLatest = 0
  await sprawdzPublikacje({
    repozytorium: 'test/Ogarniacz', manifest,
    adresManifestu: 'https://github.com/test/Ogarniacz/releases/latest/download/latest.json',
    odczekaj: async () => {}, raportuj: () => {},
    pobierz: async (adres) => {
      adresy.push(String(adres))
      if (String(adres).endsWith('.apk')) return { ok: true, arrayBuffer: async () => apk }
      if (String(adres).includes('/latest/')) return odpowiedzJson(++probyLatest === 1 ? staryManifest : manifest)
      return odpowiedzJson(manifest)
    },
  })
  assert.equal(probyLatest, 2)
  assert.match(adresy[0], /releases\/download\/v1\.0\.14\/latest.json$/)
  assert.match(adresy[1], /releases\/download\/v1\.0\.14\/Ogarniacz-1.0.14-release.apk$/)
})

test('rzeczywiście niezgodny SHA po limicie retry kończy weryfikację błędem', async () => {
  let proby = 0
  await assert.rejects(pobierzPublicznyManifestPoPublikacji({
    adresManifestu: 'https://example.test/latest.json', oczekiwanyManifest: nowyManifest,
    maksymalnaLiczbaProb: 3, odczekaj: async () => {}, raportuj: () => {},
    pobierz: async () => { proby++; return odpowiedzJson({ ...nowyManifest, sha256: 'c'.repeat(64) }) },
  }), /rzeczywista niespójność artefaktu: sha256/)
  assert.equal(proby, 3)
})

test('publiczny APK ponawia 404, ale trwała niezgodność rozmiaru/SHA kończy się błędem', async () => {
  const apk = Buffer.from('APK')
  const manifest = { ...nowyManifest, size: apk.length, sha256: createHash('sha256').update(apk).digest('hex') }
  let probyApk = 0
  const opcje = { repozytorium: 'test/Ogarniacz', manifest, adresManifestu: 'https://example.test/latest.json', odczekaj: async () => {}, raportuj: () => {}, maksymalnaLiczbaProb: 2 }
  await sprawdzPublikacje({ ...opcje, pobierz: async (adres) => {
    if (!String(adres).endsWith('.apk')) return odpowiedzJson(manifest)
    return ++probyApk === 1 ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => apk }
  } })
  assert.equal(probyApk, 2)
  await assert.rejects(sprawdzPublikacje({ ...opcje, pobierz: async (adres) => String(adres).endsWith('.apk')
    ? { ok: true, arrayBuffer: async () => Buffer.from('inne APK') } : odpowiedzJson(manifest),
  }), /APK przypiętego wydania.*rzeczywista niespójność artefaktu: sha256, size/)
})

test('404, 503 i błąd sieci są przejściowe; 403 przerywa od razu', async () => {
  const odpowiedzi = [{ ok: false, status: 404 }, { ok: false, status: 503 }, new Error('sieć'), odpowiedzJson(nowyManifest)]
  const pobierz = async () => { const wynik = odpowiedzi.shift(); if (wynik instanceof Error) throw wynik; return wynik }
  const opcje = { adresManifestu: 'https://example.test/latest.json', oczekiwanyManifest: nowyManifest, odczekaj: async () => {}, raportuj: () => {} }
  assert.equal(await pobierzPublicznyManifestPoPublikacji({ ...opcje, pobierz }), nowyManifest)
  await assert.rejects(pobierzPublicznyManifestPoPublikacji({ ...opcje, pobierz: async () => ({ ok: false, status: 403 }) }), /HTTP 403/)
})

test('retry respektuje limit czasu niezależnie od liczby prób', async () => {
  let czas = 0
  let proby = 0
  await assert.rejects(pobierzPublicznyManifestPoPublikacji({
    adresManifestu: 'https://example.test/latest.json', oczekiwanyManifest: nowyManifest,
    teraz: () => czas, limitCzasuMs: 7000, raportuj: () => {},
    odczekaj: async (ms) => { czas += ms },
    pobierz: async () => { proby++; return odpowiedzJson(staryManifest) },
  }), /Limit 7000 ms/)
  assert.equal(czas, 7000)
  assert.equal(proby, 2)
})

for (const stan of ['brak release', 'brak assetu', 'kompletne publiczne', 'kompletne draft']) {
  test(`idempotencja publikacji: ${stan}`, async () => {
    const pliki = [[nowyManifest.apkUrl, Buffer.from('APK')], [`${nowyManifest.apkUrl}.sha256`, Buffer.from('SHA')], ['latest.json', Buffer.from(JSON.stringify(nowyManifest))]]
    const assety = pliki.map(([name, dane], indeks) => ({ name, size: dane.length, url: `https://api.test/assets/${indeks}` }))
    const wydanie = { id: 123, draft: stan !== 'kompletne publiczne', prerelease: false, upload_url: 'https://upload.test/{?name,label}', assets: stan === 'brak release' ? [] : stan === 'brak assetu' ? assety.slice(0, 2) : assety }
    const mutacje = []
    const pobierz = async (adres, opcje = {}) => {
      if (opcje.method) { mutacje.push([opcje.method, adres]); return { ok: true, json: async () => wydanie } }
      if (adres.includes('/assets/')) return { ok: true, arrayBuffer: async () => pliki[Number(adres.split('/').at(-1))][1] }
      return { ok: stan !== 'brak release', status: stan === 'brak release' ? 404 : 200, json: async () => wydanie }
    }
    await zapewnijRelease({ repozytorium: 'test/Ogarniacz', token: 'test', manifest: nowyManifest, pliki, pobierz })
    assert.equal(mutacje.filter(([metoda]) => metoda === 'POST').length, stan === 'brak release' ? 4 : stan === 'brak assetu' ? 1 : 0)
    assert.equal(mutacje.filter(([metoda]) => metoda === 'PATCH').length, stan === 'kompletne publiczne' ? 0 : 1)
  })
}

test('istniejący niezgodny asset blokuje publikację bez nadpisania lub usuwania', async () => {
  const mutacje = []
  await assert.rejects(zapewnijRelease({ repozytorium: 'test/Ogarniacz', token: 'test', manifest: nowyManifest,
    pliki: [[nowyManifest.apkUrl, Buffer.from('APK')]],
    pobierz: async (adres, opcje = {}) => {
      if (opcje.method) mutacje.push(opcje.method)
      return adres.includes('/assets/')
        ? { ok: true, arrayBuffer: async () => Buffer.from('inne') }
        : { ok: true, json: async () => ({ assets: [{ name: nowyManifest.apkUrl, size: 4, url: 'https://api.test/assets/0' }] }) }
    },
  }), /Rzeczywista niespójność istniejącego assetu/)
  assert.deepEqual(mutacje, [])
})

test('workflow wydania wymaga Environment, buduje APK raz i publikuje gotowy artefakt', async () => {
  const workflow = await readFile('.github/workflows/android-release.yml', 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /version_bump:/)
  assert.match(workflow, /options: \[patch, minor, major\]/)
  assert.match(workflow, /environment: android-production/)
  assert.match(workflow, /ANDROID_RELEASE_KEYSTORE_BASE64: \$\{\{ secrets\.ANDROID_RELEASE_KEYSTORE_BASE64 \}\}/)
  assert.match(workflow, /VITE_SYNC_API_URL: \$\{\{ vars\.ANDROID_SYNC_API_URL \}\}/)
  assert.match(workflow, /VITE_SYNC_API_URL.*https:\/\/\*/)
  assert.match(workflow, /ANDROID_WEB_OTA_PUBLIC_KEY_PEM: \$\{\{ vars\.ANDROID_WEB_OTA_PUBLIC_KEY_PEM \}\}/)
  assert.match(workflow, /Brak konfiguracji Environment android-production/)
  assert.match(workflow, /VITE_SYNC_API_URL:ANDROID_SYNC_API_URL/)
  assert.match(workflow, /ANDROID_WEB_OTA_PUBLIC_KEY_PEM:ANDROID_WEB_OTA_PUBLIC_KEY_PEM/)
  assert.match(workflow, /printf '%s\\n' "\$ANDROID_WEB_OTA_PUBLIC_KEY_PEM" > android\/web-ota-public-key\.pem/)
  assert.match(workflow, /test -f android\/web-ota-public-key\.pem/)
  assert.match(workflow, /test -s android\/web-ota-public-key\.pem/)
  assert.match(workflow, /grep -q 'BEGIN PUBLIC KEY' android\/web-ota-public-key\.pem/)
  assert.match(workflow, /grep -q 'END PUBLIC KEY' android\/web-ota-public-key\.pem/)
  assert.match(workflow, /tr -d '\[:space:\]:'/)
  assert.match(workflow, /tr '\[:upper:\]' '\[:lower:\]'/)
  assert.match(workflow, /android-release-przygotowanie\.mjs --version-bump/)
  assert.match(workflow, /git diff --cached --quiet/)
  assert.match(workflow, /test -x android\/gradlew \|\| chmod \+x android\/gradlew/)
  assert.equal(workflow.match(/npm run android:release --/g)?.length, 2)
  assert.match(workflow, /npm run android:release -- --publish-existing/)
  assert.ok(
    workflow.indexOf('Sprawdź jednorazową konfigurację środowiska') < workflow.indexOf('Zainstaluj zależności'),
    'preflight konfiguracji musi nastąpić przed buildem',
  )
  assert.ok(
    workflow.indexOf('Opublikuj tylko po przygotowaniu artefaktów') < workflow.indexOf('Sprawdź tag i punkt zgodności Web OTA'),
    'tag zgodności Web OTA jest sprawdzany dopiero po wydaniu APK',
  )
  const skrypt = await readFile('scripts/android.mjs', 'utf8')
  assert.match(skrypt, /verify', '--print-certs'/)
  assert.match(skrypt, /sha256Certyfikatu/)
  assert.doesNotMatch(workflow, /storePassword=UZUPELNIJ|BEGIN PRIVATE KEY/)
  assert.match(skrypt, /sprawdzArtefaktRelease/)
  assert.match(skrypt, /'dump', 'badging'/)
  assert.match(skrypt, /packageMatch\[1\] !== 'pl\.ogarniacz\.app'/)
  assert.match(skrypt, /manifest\.apkUrl !== oczekiwanaNazwa/)
  const ci = await readFile('.github/workflows/ci.yml', 'utf8')
  const wersjaJdk = workflow.match(/java-version: '([^']+)'/)?.[1]
  assert.equal(wersjaJdk, '21')
  assert.equal(ci.match(/java-version: '([^']+)'/)?.[1], wersjaJdk)
  assert.ok(workflow.indexOf('Sprawdź natywny updater') < workflow.indexOf('Zapisz wersję dopiero'))
})
