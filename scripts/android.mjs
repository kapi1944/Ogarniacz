import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  obliczKodWersji,
  czyZgodnyJdk,
  parsujUrzadzeniaAdb,
  utworzManifestAktualizacji,
  walidujManifestAktualizacji,
  wybierzUrzadzenieAdb,
} from './android-wspolne.mjs'

const katalogRepozytorium = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const katalogAndroida = join(katalogRepozytorium, 'android')
const pakiet = JSON.parse(readFileSync(join(katalogRepozytorium, 'package.json'), 'utf8'))
const czyWindows = process.platform === 'win32'
const nazwaJava = czyWindows ? 'java.exe' : 'java'
const nazwaJavac = czyWindows ? 'javac.exe' : 'javac'
const nazwaKeytool = czyWindows ? 'keytool.exe' : 'keytool'
const nazwaAdb = czyWindows ? 'adb.exe' : 'adb'
const nazwaGradle = czyWindows ? 'gradlew.bat' : './gradlew'
const wymaganyNode = 22
const wymaganyJdk = odczytajWymaganyJdk()
const wymaganySdk = odczytajWymaganySdk()

function odczytajWymaganyJdk() {
  const plik = readFileSync(join(katalogAndroida, 'app', 'capacitor.build.gradle'), 'utf8')
  const wersje = [...plik.matchAll(/JavaVersion\.VERSION_(\d+)/g)].map((dopasowanie) => Number(dopasowanie[1]))
  return Math.max(17, ...wersje)
}

function odczytajWymaganySdk() {
  const plik = readFileSync(join(katalogAndroida, 'variables.gradle'), 'utf8')
  return Number(/compileSdkVersion\s*=\s*['"]?(\d+)/.exec(plik)?.[1] ?? 0)
}

function wykonajPrzechwytywanie(polecenie, argumenty, opcje = {}) {
  return spawnSync(polecenie, argumenty, {
    cwd: opcje.katalog ?? katalogRepozytorium,
    env: opcje.srodowisko ?? process.env,
    encoding: 'utf8',
    windowsHide: true,
    shell: opcje.powłoka ?? false,
  })
}

function wykonajEtap(etykieta, polecenie, argumenty, opcje = {}) {
  console.log(`\n→ ${etykieta}`)
  const wynik = spawnSync(polecenie, argumenty, {
    cwd: opcje.katalog ?? katalogRepozytorium,
    env: opcje.srodowisko ?? process.env,
    stdio: 'inherit',
    windowsHide: true,
    shell: opcje.powłoka ?? false,
  })
  if (wynik.error) throw new Error(`${etykieta}: ${wynik.error.message}`)
  if (wynik.status !== 0) throw new Error(`${etykieta} zakończył się kodem ${wynik.status ?? 'brak'}.`)
}

function unikalneIstniejace(sciezki) {
  const widziane = new Set()
  return sciezki.filter((sciezka) => {
    if (!sciezka) return false
    const pelna = resolve(sciezka)
    const klucz = czyWindows ? pelna.toLowerCase() : pelna
    if (widziane.has(klucz) || !existsSync(pelna)) return false
    widziane.add(klucz)
    return true
  })
}

function podkatalogi(katalog) {
  if (!katalog || !existsSync(katalog)) return []
  try {
    return readdirSync(katalog, { withFileTypes: true })
      .filter((wpis) => wpis.isDirectory())
      .map((wpis) => join(katalog, wpis.name))
  } catch {
    return []
  }
}

function sciezkiPolecenia(nazwa) {
  const polecenie = czyWindows ? 'where.exe' : 'which'
  const wynik = wykonajPrzechwytywanie(polecenie, [nazwa])
  if (wynik.status !== 0) return []
  return wynik.stdout.split(/\r?\n/).map((wartosc) => wartosc.trim()).filter(Boolean)
}

function kandydaciJdk() {
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env['ProgramFiles(x86)']
  const lokalneDane = process.env.LOCALAPPDATA
  const katalogUzytkownika = homedir()
  const kandydaci = [
    process.env.JAVA_HOME,
    programFiles && join(programFiles, 'Android', 'Android Studio', 'jbr'),
    lokalneDane && join(lokalneDane, 'Programs', 'Android Studio', 'jbr'),
    lokalneDane && join(lokalneDane, 'JetBrains', 'Toolbox', 'apps', 'AndroidStudio'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr',
  ]

  for (const plikJava of sciezkiPolecenia(nazwaJava)) kandydaci.push(dirname(dirname(plikJava)))
  for (const baza of [
    programFiles && join(programFiles, 'Java'),
    programFiles && join(programFiles, 'Eclipse Adoptium'),
    programFiles && join(programFiles, 'Microsoft'),
    programFiles && join(programFiles, 'Amazon Corretto'),
    programFilesX86 && join(programFilesX86, 'Java'),
    join(katalogUzytkownika, '.jdks'),
    lokalneDane && join(lokalneDane, 'OgarniaczToolchain'),
    '/usr/lib/jvm',
    '/Library/Java/JavaVirtualMachines',
  ]) {
    for (const katalog of podkatalogi(baza)) {
      kandydaci.push(katalog)
      kandydaci.push(join(katalog, 'Contents', 'Home'))
    }
  }

  return unikalneIstniejace(kandydaci)
}

function wersjaJdk(katalog) {
  const java = join(katalog, 'bin', nazwaJava)
  const javac = join(katalog, 'bin', nazwaJavac)
  if (!existsSync(java) || !existsSync(javac)) return undefined
  const wynik = wykonajPrzechwytywanie(java, ['-version'])
  const tekst = `${wynik.stdout}\n${wynik.stderr}`
  const dopasowanie = /version\s+"(?:1\.)?(\d+)/i.exec(tekst)
  if (wynik.status !== 0 || !dopasowanie) return undefined
  return { katalog: resolve(katalog), wersja: Number(dopasowanie[1]), opis: tekst.split(/\r?\n/).find(Boolean)?.trim() ?? '' }
}

function javaZPath() {
  const sciezka = sciezkiPolecenia(nazwaJava)[0]
  if (!sciezka) return undefined
  const wynik = wykonajPrzechwytywanie(sciezka, ['-version'])
  const tekst = `${wynik.stdout}\n${wynik.stderr}`
  const dopasowanie = /version\s+"(?:1\.)?(\d+)/i.exec(tekst)
  return wynik.status === 0 && dopasowanie ? { sciezka, wersja: Number(dopasowanie[1]) } : undefined
}

function odkodujWartoscProperties(wartosc) {
  return wartosc
    .replace(/\\\\/g, '\\')
    .replace(/\\:/g, ':')
    .replace(/\\=/g, '=')
    .trim()
}

function sdkZLocalProperties() {
  const sciezka = join(katalogAndroida, 'local.properties')
  if (!existsSync(sciezka)) return undefined
  const wiersz = readFileSync(sciezka, 'utf8').split(/\r?\n/).find((linia) => /^\s*sdk\.dir\s*=/.test(linia))
  return wiersz ? odkodujWartoscProperties(wiersz.replace(/^\s*sdk\.dir\s*=/, '')) : undefined
}

function sdkZKonfiguracjiAndroidStudio() {
  const baza = process.env.APPDATA && join(process.env.APPDATA, 'Google')
  const wyniki = []
  for (const katalog of podkatalogi(baza).filter((sciezka) => basename(sciezka).startsWith('AndroidStudio'))) {
    for (const nazwa of ['jdk.table.xml', 'other.xml']) {
      const plik = join(katalog, 'options', nazwa)
      if (!existsSync(plik)) continue
      const tresc = readFileSync(plik, 'utf8')
      for (const dopasowanie of tresc.matchAll(/value="([^"]*(?:Android[\\/]Sdk|android-sdk)[^"]*)"/gi)) {
        wyniki.push(dopasowanie[1].replace(/\$USER_HOME\$/g, homedir()).replace(/&quot;/g, '"'))
      }
    }
  }
  return wyniki
}

function kandydaciSdk() {
  return unikalneIstniejace([
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    sdkZLocalProperties(),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk'),
    ...sdkZKonfiguracjiAndroidStudio(),
  ])
}

function znajdzSdk() {
  return kandydaciSdk().find((katalog) => existsSync(join(katalog, 'platforms')) || existsSync(join(katalog, 'platform-tools')))
}

function znajdzAdb(sdk) {
  const kandydaci = [
    sdk && join(sdk, 'platform-tools', nazwaAdb),
    ...sciezkiPolecenia(nazwaAdb),
  ]
  return unikalneIstniejace(kandydaci)[0]
}

function pobierzUrzadzenia(adb) {
  if (!adb) return { urzadzenia: [], blad: 'Brak adb.' }
  const wynik = wykonajPrzechwytywanie(adb, ['devices', '-l'])
  if (wynik.status !== 0) return { urzadzenia: [], blad: (wynik.stderr || wynik.stdout).trim() || 'Nie udało się uruchomić adb.' }
  return { urzadzenia: parsujUrzadzeniaAdb(wynik.stdout) }
}

function zbierzDiagnostyke({ urzadzenieWymagane, wskazanySerial } = {}) {
  const znalezioneJdk = kandydaciJdk().map(wersjaJdk).filter(Boolean)
  const jdk = znalezioneJdk.find((kandydat) => czyZgodnyJdk(kandydat.wersja, wymaganyJdk))
  const sdk = znajdzSdk()
  const adb = znajdzAdb(sdk)
  const urzadzeniaAdb = pobierzUrzadzenia(adb)
  let urzadzenie
  let bladUrzadzenia = urzadzeniaAdb.blad
  if (!bladUrzadzenia && urzadzenieWymagane) {
    try {
      urzadzenie = wybierzUrzadzenieAdb(urzadzeniaAdb.urzadzenia, wskazanySerial)
    } catch (blad) {
      bladUrzadzenia = blad.message
    }
  }

  const platformaSdk = sdk && existsSync(join(sdk, 'platforms', `android-${wymaganySdk}`, czyWindows ? 'android.jar' : 'android.jar'))
  const gradle = join(katalogAndroida, czyWindows ? 'gradlew.bat' : 'gradlew')
  const capacitor = join(katalogRepozytorium, 'node_modules', '@capacitor', 'cli', 'package.json')
  const wersjaNode = Number(process.versions.node.split('.')[0])
  const npm = process.env.npm_execpath && existsSync(process.env.npm_execpath)
    ? wykonajPrzechwytywanie(process.execPath, [process.env.npm_execpath, '--version'])
    : wykonajPrzechwytywanie(czyWindows ? 'npm.cmd' : 'npm', ['--version'], { powłoka: czyWindows })

  return {
    node: { poprawny: wersjaNode >= wymaganyNode, wersja: process.version },
    npm: { poprawny: npm.status === 0, wersja: npm.stdout.trim() },
    javaPath: javaZPath(),
    jdk,
    znalezioneJdk,
    sdk,
    platformaSdk,
    adb,
    gradle: existsSync(gradle),
    capacitor: existsSync(capacitor) ? JSON.parse(readFileSync(capacitor, 'utf8')).version : undefined,
    urzadzenia: urzadzeniaAdb.urzadzenia,
    urzadzenie,
    bladUrzadzenia,
    urzadzenieWymagane: Boolean(urzadzenieWymagane),
  }
}

function drukujRaport(diagnostyka) {
  console.log('OGARNIACZ ANDROID DOCTOR')
  console.log(`NODE: ${diagnostyka.node.poprawny ? 'OK' : 'BŁĄD'} — ${diagnostyka.node.wersja} (wymagany >= ${wymaganyNode})`)
  console.log(`NPM: ${diagnostyka.npm.poprawny ? `OK — ${diagnostyka.npm.wersja}` : 'BŁĄD — nie znaleziono npm'}`)
  console.log(`JAVA PATH: ${diagnostyka.javaPath ? `OK — Java ${diagnostyka.javaPath.wersja} — ${diagnostyka.javaPath.sciezka}` : 'BRAK'}`)
  console.log(`JDK: ${diagnostyka.jdk ? `OK — JDK ${diagnostyka.jdk.wersja}` : `BŁĄD — brak wymaganego JDK ${wymaganyJdk}`}`)
  if (diagnostyka.jdk) {
    const zrodlo = process.env.JAVA_HOME && resolve(process.env.JAVA_HOME) === diagnostyka.jdk.katalog ? 'OK' : 'AUTO'
    console.log(`JAVA_HOME: ${zrodlo} — ${diagnostyka.jdk.katalog}`)
  } else {
    console.log(`JAVA_HOME: ${process.env.JAVA_HOME ? `NIEZGODNY — ${process.env.JAVA_HOME}` : 'BRAK'}`)
    for (const kandydat of diagnostyka.znalezioneJdk) {
      console.log(`JDK CANDIDATE: NIEZGODNY — JDK ${kandydat.wersja} — ${kandydat.katalog}`)
    }
  }
  console.log(`ANDROID SDK: ${diagnostyka.sdk ? 'OK' : 'BŁĄD'}${diagnostyka.sdk ? ` — ${diagnostyka.sdk}` : ' — nie znaleziono SDK'}`)
  if (diagnostyka.sdk) {
    console.log(`SDK PLATFORM ${wymaganySdk}: ${diagnostyka.platformaSdk ? 'OK' : 'BŁĄD — brak wymaganej platformy'}`)
    console.log(`ANDROID_HOME: ${process.env.ANDROID_HOME === diagnostyka.sdk ? 'OK' : 'AUTO'} — ${diagnostyka.sdk}`)
    console.log(`ANDROID_SDK_ROOT: ${process.env.ANDROID_SDK_ROOT === diagnostyka.sdk ? 'OK' : 'AUTO'} — ${diagnostyka.sdk}`)
  }
  console.log(`ADB: ${diagnostyka.adb ? `OK — ${diagnostyka.adb}` : 'BŁĄD — nie znaleziono platform-tools/adb'}`)
  console.log(`GRADLE WRAPPER: ${diagnostyka.gradle ? 'OK' : 'BŁĄD — brak gradlew'}`)
  console.log(`CAPACITOR: ${diagnostyka.capacitor ? `OK — ${diagnostyka.capacitor}` : 'BŁĄD — brak lokalnego @capacitor/cli'}`)

  if (diagnostyka.urzadzenia.length === 0) console.log('DEVICE: BRAK')
  for (const urzadzenie of diagnostyka.urzadzenia) {
    console.log(`DEVICE: ${urzadzenie.model} — ${urzadzenie.serial} — ${urzadzenie.transport}`)
    console.log(`STATUS: ${urzadzenie.stan === 'device' ? 'authorized' : urzadzenie.stan}`)
  }
  if (diagnostyka.bladUrzadzenia) console.log(`DEVICE ERROR: ${diagnostyka.bladUrzadzenia}`)

  const poprawny = diagnostyka.node.poprawny
    && diagnostyka.npm.poprawny
    && diagnostyka.jdk
    && diagnostyka.sdk
    && diagnostyka.platformaSdk
    && diagnostyka.gradle
    && diagnostyka.capacitor
    && (!diagnostyka.urzadzenieWymagane || diagnostyka.urzadzenie)
  console.log(`\nWYNIK: ${poprawny ? 'OK' : 'BŁĄD'}`)
  return Boolean(poprawny)
}

function srodowiskoAndroida(diagnostyka) {
  const srodowisko = { ...process.env }
  srodowisko.JAVA_HOME = diagnostyka.jdk.katalog
  srodowisko.ANDROID_HOME = diagnostyka.sdk
  srodowisko.ANDROID_SDK_ROOT = diagnostyka.sdk
  srodowisko.PATH = [
    join(diagnostyka.jdk.katalog, 'bin'),
    join(diagnostyka.sdk, 'platform-tools'),
    process.env.PATH,
  ].filter(Boolean).join(czyWindows ? ';' : ':')
  return srodowisko
}

function wymagajSrodowiska({ urzadzenie = false, wskazanySerial } = {}) {
  const diagnostyka = zbierzDiagnostyke({ urzadzenieWymagane: urzadzenie, wskazanySerial })
  if (!drukujRaport(diagnostyka)) throw new Error('Preflight Androida nie powiódł się. Szczegóły znajdują się w raporcie powyżej.')
  return { diagnostyka, srodowisko: srodowiskoAndroida(diagnostyka) }
}

function uruchomNpm(argumenty, srodowisko, etykieta) {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    wykonajEtap(etykieta, process.execPath, [process.env.npm_execpath, ...argumenty], { srodowisko })
    return
  }
  wykonajEtap(etykieta, czyWindows ? 'npm.cmd' : 'npm', argumenty, { srodowisko, powłoka: czyWindows })
}

function zbudujFrontend(srodowisko) {
  uruchomNpm(['run', 'build'], srodowisko, 'Build frontendu')
}

function synchronizujCapacitor(srodowisko) {
  const capacitor = join(katalogRepozytorium, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor')
  wykonajEtap('Capacitor sync Android', process.execPath, [capacitor, 'sync', 'android'], { srodowisko })
}

function zbudujGradle(wariant, srodowisko) {
  const zadanie = `assemble${wariant}`
  if (czyWindows) {
    wykonajEtap(`Gradle ${zadanie}`, process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${nazwaGradle} ${zadanie}`], {
      katalog: katalogAndroida,
      srodowisko,
    })
    return
  }
  wykonajEtap(`Gradle ${zadanie}`, nazwaGradle, [zadanie], { katalog: katalogAndroida, srodowisko })
}

function znajdzNajnowszyApk(wariant) {
  const katalog = join(katalogAndroida, 'app', 'build', 'outputs', 'apk', wariant.toLowerCase())
  if (!existsSync(katalog)) throw new Error(`Gradle nie utworzył katalogu APK: ${katalog}`)
  const pliki = readdirSync(katalog).filter((nazwa) => nazwa.endsWith('.apk')).map((nazwa) => join(katalog, nazwa))
  if (!pliki.length) throw new Error(`Nie znaleziono wygenerowanego APK w ${katalog}.`)
  return pliki.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}

function odczytajOpcje(argumenty) {
  const opcje = {}
  for (let indeks = 0; indeks < argumenty.length; indeks += 1) {
    const argument = argumenty[indeks]
    if (!argument.startsWith('--')) continue
    const [nazwa, wartoscInline] = argument.slice(2).split('=', 2)
    const wartosc = wartoscInline ?? argumenty[indeks + 1]
    if (wartoscInline === undefined && wartosc && !wartosc.startsWith('--')) indeks += 1
    opcje[nazwa] = wartoscInline ?? (wartosc && !wartosc.startsWith('--') ? wartosc : true)
  }
  return opcje
}

function odczytajWlasciwosci(sciezka) {
  const wynik = {}
  for (const linia of readFileSync(sciezka, 'utf8').split(/\r?\n/)) {
    const oczyszczona = linia.trim()
    if (!oczyszczona || oczyszczona.startsWith('#')) continue
    const indeks = oczyszczona.search(/(?<!\\)[=:]/)
    if (indeks < 1) continue
    wynik[oczyszczona.slice(0, indeks).trim()] = odkodujWartoscProperties(oczyszczona.slice(indeks + 1))
  }
  return wynik
}

function sprawdzKonfiguracjePodpisu() {
  const sciezka = join(katalogAndroida, 'keystore.properties')
  if (!existsSync(sciezka)) {
    throw new Error('Brak android/keystore.properties. Skonfiguruj stały klucz według docs/ANDROID.md; debug nadal działa bez tego pliku.')
  }
  const wartosci = odczytajWlasciwosci(sciezka)
  const wymagane = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']
  const brakujace = wymagane.filter((nazwa) => !wartosci[nazwa] || /UZUPELNIJ/i.test(wartosci[nazwa]))
  if (brakujace.length) throw new Error(`Niepełna konfiguracja android/keystore.properties: ${brakujace.join(', ')}.`)
  const plikKlucza = isAbsolute(wartosci.storeFile) ? wartosci.storeFile : resolve(katalogAndroida, wartosci.storeFile)
  if (!existsSync(plikKlucza)) throw new Error(`Nie znaleziono release keystore pod skonfigurowaną ścieżką: ${plikKlucza}`)
  return { plikKlucza, alias: wartosci.keyAlias }
}

function odczytajZmiennaBudowania(nazwa) {
  if (process.env[nazwa]?.trim()) return process.env[nazwa].trim()
  let wartosc
  for (const nazwaPliku of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const sciezka = join(katalogRepozytorium, nazwaPliku)
    if (!existsSync(sciezka)) continue
    for (const linia of readFileSync(sciezka, 'utf8').split(/\r?\n/)) {
      const dopasowanie = new RegExp(`^\\s*${nazwa}\\s*=\\s*(.*)$`).exec(linia)
      if (!dopasowanie) continue
      const surowa = dopasowanie[1].trim()
      wartosc = surowa.replace(/^(['"])(.*)\1$/, '$2').trim()
    }
  }
  return wartosc
}

function wymagajAdresuHttps(nazwa, wartosc) {
  if (!wartosc) throw new Error(`Brak ${nazwa}. Ustaw adres HTTPS przed budowaniem release.`)
  try {
    const adres = new URL(wartosc)
    if (adres.protocol !== 'https:') throw new Error()
    return adres.toString()
  } catch {
    throw new Error(`${nazwa} musi być prawidłowym adresem HTTPS.`)
  }
}

function znajdzApkSigner(sdk) {
  const katalog = join(sdk, 'build-tools')
  if (!existsSync(katalog)) return undefined
  const nazwa = czyWindows ? 'apksigner.bat' : 'apksigner'
  return podkatalogi(katalog)
    .sort((a, b) => basename(b).localeCompare(basename(a), undefined, { numeric: true }))
    .map((wersja) => join(wersja, nazwa))
    .find(existsSync)
}

function sprawdzPodpisApk(sciezkaApk, diagnostyka, srodowisko) {
  const apkSigner = znajdzApkSigner(diagnostyka.sdk)
  if (!apkSigner) throw new Error('Nie znaleziono apksigner w Android SDK build-tools.')
  if (czyWindows) {
    wykonajEtap('Weryfikacja podpisu release APK', process.env.ComSpec ?? 'cmd.exe', [
      '/d',
      '/s',
      '/c',
      `""${apkSigner}" verify --verbose "${sciezkaApk}""`,
    ], { srodowisko })
    return
  }
  wykonajEtap('Weryfikacja podpisu release APK', apkSigner, ['verify', '--verbose', sciezkaApk], { srodowisko })
}

async function wykonajRelease(opcje) {
  const podpisWstepny = sprawdzKonfiguracjePodpisu()
  wymagajAdresuHttps('VITE_ANDROID_UPDATE_MANIFEST_URL', odczytajZmiennaBudowania('VITE_ANDROID_UPDATE_MANIFEST_URL'))
  const { diagnostyka, srodowisko } = wymagajSrodowiska()
  zbudujFrontend(srodowisko)
  synchronizujCapacitor(srodowisko)
  const podpis = sprawdzKonfiguracjePodpisu()
  if (podpis.plikKlucza !== podpisWstepny.plikKlucza || podpis.alias !== podpisWstepny.alias) {
    throw new Error('Konfiguracja release signing zmieniła się podczas budowania. Uruchom release ponownie.')
  }
  console.log(`\nSIGNING: OK — stały alias ${podpis.alias}; plik klucza pozostaje poza repozytorium`)
  zbudujGradle('Release', srodowisko)
  const sciezkaApk = znajdzNajnowszyApk('Release')
  sprawdzPodpisApk(sciezkaApk, diagnostyka, srodowisko)
  const bazowyAdres = typeof opcje['base-url'] === 'string' ? opcje['base-url'] : process.env.OGARNIACZ_UPDATE_BASE_URL
  if (bazowyAdres && new URL(bazowyAdres).protocol !== 'https:') {
    throw new Error('Bazowy adres aktualizacji musi używać HTTPS.')
  }
  const manifest = walidujManifestAktualizacji(await utworzManifestAktualizacji({
    wersja: pakiet.version,
    sciezkaApk,
    bazowyAdres,
  }))
  const katalogWyjscia = dirname(sciezkaApk)
  const sciezkaManifestu = join(katalogWyjscia, 'latest.json')
  const sciezkaSkrotu = `${sciezkaApk}.sha256`
  writeFileSync(sciezkaManifestu, `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(sciezkaSkrotu, `${manifest.sha256}  ${basename(sciezkaApk)}\n`)

  console.log('\n=====================================')
  console.log('OGARNIACZ ANDROID RELEASE — SUCCESS')
  console.log('=====================================')
  console.log(`Version: ${manifest.version} (${manifest.versionCode})`)
  console.log(`APK: ${sciezkaApk}`)
  console.log(`SHA-256: ${manifest.sha256}`)
  console.log(`Manifest: ${sciezkaManifestu}`)
}

function wykonajDeploy(opcje) {
  const wskazanySerial = typeof opcje.device === 'string' ? opcje.device : undefined
  const { diagnostyka, srodowisko } = wymagajSrodowiska({ urzadzenie: true, wskazanySerial })
  zbudujFrontend(srodowisko)
  synchronizujCapacitor(srodowisko)
  zbudujGradle('Debug', srodowisko)
  const sciezkaApk = znajdzNajnowszyApk('Debug')
  const urzadzenie = diagnostyka.urzadzenie
  const argumentyAdb = ['-s', urzadzenie.serial]

  console.log('\n→ Instalacja APK z zachowaniem danych')
  const instalacja = wykonajPrzechwytywanie(diagnostyka.adb, [...argumentyAdb, 'install', '-r', '-d', sciezkaApk], { srodowisko })
  const tekstInstalacji = `${instalacja.stdout}\n${instalacja.stderr}`.trim()
  if (tekstInstalacji) console.log(tekstInstalacji)
  if (instalacja.status !== 0 || !/Success/i.test(tekstInstalacji)) {
    throw new Error('ADB nie zainstalował APK. Aplikacja nie została odinstalowana, więc jej dane pozostają nienaruszone.')
  }

  const weryfikacja = wykonajPrzechwytywanie(diagnostyka.adb, [...argumentyAdb, 'shell', 'dumpsys', 'package', 'pl.ogarniacz.app'], { srodowisko })
  if (weryfikacja.status !== 0 || !/versionName=/.test(weryfikacja.stdout)) throw new Error('Nie udało się potwierdzić zainstalowanej wersji pakietu.')
  const wersja = /versionName=([^\s]+)/.exec(weryfikacja.stdout)?.[1] ?? pakiet.version
  const kod = /versionCode=(\d+)/.exec(weryfikacja.stdout)?.[1] ?? String(obliczKodWersji(pakiet.version))

  console.log('\n→ Uruchamianie Ogarniacza')
  const uruchomienie = wykonajPrzechwytywanie(diagnostyka.adb, [...argumentyAdb, 'shell', 'am', 'start', '-W', '-n', 'pl.ogarniacz.app/.MainActivity'], { srodowisko })
  const tekstUruchomienia = `${uruchomienie.stdout}\n${uruchomienie.stderr}`.trim()
  if (tekstUruchomienia) console.log(tekstUruchomienia)
  if (uruchomienie.status !== 0 || /Error:/i.test(tekstUruchomienia) || !/Status:\s*ok/i.test(tekstUruchomienia)) {
    throw new Error('APK zainstalowano, ale nie udało się potwierdzić uruchomienia aplikacji.')
  }

  console.log('\n=====================================')
  console.log('OGARNIACZ ANDROID DEPLOY — SUCCESS')
  console.log('=====================================')
  console.log(`Device: ${urzadzenie.model} (${urzadzenie.serial})`)
  console.log(`Transport: ${urzadzenie.transport}`)
  console.log('Package: pl.ogarniacz.app')
  console.log(`Version: ${wersja} (${kod})`)
  console.log(`APK: ${sciezkaApk}`)
  console.log('Install: OK')
  console.log('Launch: OK')
}

function utworzKeystore(opcje) {
  const diagnostyka = zbierzDiagnostyke()
  if (!diagnostyka.jdk) throw new Error(`Nie znaleziono JDK ${wymaganyJdk}; nie można uruchomić keytool.`)
  const domyslna = join(homedir(), '.ogarniacz', 'keys', 'ogarniacz-release.jks')
  const sciezkaKlucza = resolve(typeof opcje.path === 'string' ? opcje.path : domyslna)
  const wzgledna = relative(katalogRepozytorium, sciezkaKlucza)
  if (wzgledna === '' || (!wzgledna.startsWith(`..${sep}`) && wzgledna !== '..' && !isAbsolute(wzgledna))) {
    throw new Error('Release keystore musi znajdować się poza repozytorium.')
  }
  if (existsSync(sciezkaKlucza)) throw new Error(`Klucz już istnieje: ${sciezkaKlucza}. Skrypt nie nadpisuje stałego klucza release.`)
  mkdirSync(dirname(sciezkaKlucza), { recursive: true })
  const keytool = join(diagnostyka.jdk.katalog, 'bin', nazwaKeytool)
  wykonajEtap('Jednorazowe utworzenie release keystore', keytool, [
    '-genkeypair',
    '-v',
    '-keystore', sciezkaKlucza,
    '-alias', 'ogarniacz',
    '-keyalg', 'RSA',
    '-keysize', '4096',
    '-validity', '10000',
  ], { srodowisko: { ...process.env, JAVA_HOME: diagnostyka.jdk.katalog } })
  console.log(`\nKlucz utworzono poza repozytorium: ${sciezkaKlucza}`)
  console.log('Utwórz lokalny android/keystore.properties według android/keystore.properties.example i zachowaj ten klucz do wszystkich kolejnych wydań.')
}

async function main() {
  const [polecenie = 'doctor', ...argumenty] = process.argv.slice(2)
  const opcje = odczytajOpcje(argumenty)
  if (polecenie === 'doctor') {
    const poprawny = drukujRaport(zbierzDiagnostyke({ urzadzenieWymagane: true, wskazanySerial: typeof opcje.device === 'string' ? opcje.device : undefined }))
    if (!poprawny) process.exitCode = 1
    return
  }
  if (polecenie === 'sync') {
    const { srodowisko } = wymagajSrodowiska()
    zbudujFrontend(srodowisko)
    synchronizujCapacitor(srodowisko)
    return
  }
  if (polecenie === 'build') {
    const { srodowisko } = wymagajSrodowiska()
    zbudujFrontend(srodowisko)
    synchronizujCapacitor(srodowisko)
    zbudujGradle('Debug', srodowisko)
    console.log(`\nDEBUG APK: ${znajdzNajnowszyApk('Debug')}`)
    return
  }
  if (polecenie === 'deploy') return wykonajDeploy(opcje)
  if (polecenie === 'release') return wykonajRelease(opcje)
  if (polecenie === 'keystore') return utworzKeystore(opcje)
  throw new Error(`Nieznane polecenie android: ${polecenie}`)
}

main().catch((blad) => {
  console.error(`\nBŁĄD: ${blad instanceof Error ? blad.message : String(blad)}`)
  process.exitCode = 1
})
