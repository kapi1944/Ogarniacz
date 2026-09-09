import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROZSZERZENIA_WEB = new Set(['.css', '.ts', '.tsx'])

function normalizujSciezke(sciezka) {
  return sciezka.replaceAll('\\', '/').replace(/^\.\//, '')
}

function czyBezpiecznaSciezkaWeb(sciezka) {
  const znormalizowana = normalizujSciezke(sciezka)
  if (znormalizowana === 'index.html') return true
  if (znormalizowana.startsWith('public/') && znormalizowana.length > 'public/'.length) return true
  return znormalizowana.startsWith('src/') && ROZSZERZENIA_WEB.has(extname(znormalizowana).toLowerCase())
}

export function sklasyfikujZmianyWebOta(sciezki) {
  const zmienioneSciezki = [...new Set(sciezki.map(normalizujSciezke).filter(Boolean))]
  if (zmienioneSciezki.length === 0) {
    return { czyPublikowac: false, powod: 'Brak zmienionych plikow.' }
  }

  const wymagajaceApk = zmienioneSciezki.filter((sciezka) => !czyBezpiecznaSciezkaWeb(sciezka))
  if (wymagajaceApk.length > 0) {
    return {
      czyPublikowac: false,
      powod: `Zmiany poza jednoznacznie bezpiecznym zakresem web: ${wymagajaceApk.join(', ')}`,
    }
  }

  return { czyPublikowac: true, powod: 'Wszystkie zmiany dotycza wylacznie bezpiecznych plikow web.' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const wynik = sklasyfikujZmianyWebOta(process.argv.slice(2))
  if (wynik.czyPublikowac) {
    console.log(`Web OTA dozwolone — ${wynik.powod}`)
  } else {
    console.log('Web OTA pominięte — wymagane APK')
    console.log(`Powod: ${wynik.powod}`)
    process.exitCode = 2
  }
}
