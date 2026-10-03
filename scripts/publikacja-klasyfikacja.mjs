import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function klasyfikujZmiany(pliki) {
  const wynik = { android: false, raspberry: false }
  for (const plik of pliki) {
    // Lista wyjątków jest celowo wąska; nieznane pliki wymagają obu kanałów.
    if (/^(docs\/|testy\/|src\/testy\/|\.vscode\/|\.idea\/)/.test(plik)
      || /(^|\/)[^/]+\.(test|spec)\.[^/]+$/.test(plik)
      || /^android\/[^/]+\/src\/(test|androidTest)\//.test(plik)
      || /\.(md|rst)$/i.test(plik)
      || /(^|\/)(README[^/]*|LICENSE[^/]*|CHANGELOG[^/]*)$/i.test(plik)
      || ['.gitignore', '.gitattributes', '.editorconfig'].includes(plik)) continue
    if (plik.startsWith('android/') || plik.startsWith('config/android-') || plik.startsWith('scripts/android')) {
      wynik.android = true
    } else if (plik.startsWith('server/') || plik.startsWith('deploy/rpi/')
      || /^scripts\/(aktualizuj-rpi|rpi-|deploy-rpi|configure-tailscale-rpi)/.test(plik)
      || plik === 'tsconfig.server.json') {
      wynik.raspberry = true
    } else {
      wynik.android = true
      wynik.raspberry = true
    }
  }
  return wynik
}

export function klasyfikujOdPunktow({ android, raspberry, cel }, git = (...argumenty) =>
  execFileSync('git', argumenty, { encoding: 'utf8' })) {
  const wynik = {}
  git('cat-file', '-e', `${cel}^{commit}`)
  for (const kanal of ['android', 'raspberry']) {
    const baza = kanal === 'android' ? android : raspberry
    if (!baza) { wynik[kanal] = true; continue }
    // Rozbieżna lub niepełna historia nie może dać fałszywego "bez zmian".
    git('merge-base', '--is-ancestor', baza, cel)
    const pliki = git('log', '--no-renames', '--format=', '--name-only', '-z', `${baza}..${cel}`)
      .split('\0').map((plik) => plik.trim()).filter(Boolean)
    wynik[kanal] = klasyfikujZmiany(pliki)[kanal]
  }
  return wynik
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [cel, android, raspberry] = process.argv.slice(2)
    const wynik = klasyfikujOdPunktow({ cel, android, raspberry })
    console.log(`android=${wynik.android}\nraspberry=${wynik.raspberry}`)
  } catch {
    console.error('Nie udało się sklasyfikować zatwierdzanych commitów; publikacja zatrzymana.')
    process.exitCode = 1
  }
}
