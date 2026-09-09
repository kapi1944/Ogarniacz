import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCIEZKA_ZGODNOSCI_WEB_OTA = 'config/web-ota-compatibility.json'

export function odczytajMinNativeVersionCode(tresc) {
  const konfiguracja = typeof tresc === 'string' ? JSON.parse(tresc) : tresc
  const kodWersji = konfiguracja?.minNativeVersionCode
  if (!Number.isSafeInteger(kodWersji) || kodWersji <= 0 || kodWersji > 2_100_000_000) {
    throw new Error('Nieprawidlowy minNativeVersionCode w konfiguracji Web OTA.')
  }
  return kodWersji
}

export async function wczytajMinNativeVersionCode() {
  return odczytajMinNativeVersionCode(await readFile(resolve(SCIEZKA_ZGODNOSCI_WEB_OTA), 'utf8'))
}

export function utworzTagApkDlaKoduWersji(kodWersji) {
  if (!Number.isSafeInteger(kodWersji) || kodWersji <= 0) throw new Error('Nieprawidlowy versionCode APK.')
  const wersjaGlowna = Math.floor(kodWersji / 1_000_000)
  const reszta = kodWersji % 1_000_000
  const wersjaPoboczna = Math.floor(reszta / 1_000)
  const poprawka = reszta % 1_000
  return `v${wersjaGlowna}.${wersjaPoboczna}.${poprawka}`
}

async function odczytajStandardoweWejscie() {
  let tresc = ''
  for await (const fragment of process.stdin) tresc += fragment
  return tresc
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const polecenie = process.argv[2]
  try {
    if (polecenie === '--odczytaj') {
      console.log(odczytajMinNativeVersionCode(await odczytajStandardoweWejscie()))
    } else if (polecenie === '--tag-apk') {
      console.log(utworzTagApkDlaKoduWersji(Number(process.argv[3])))
    } else {
      throw new Error('Nieprawidlowe polecenie kontroli zgodnosci Web OTA.')
    }
  } catch (blad) {
    console.error(blad instanceof Error ? blad.message : String(blad))
    process.exitCode = 1
  }
}
