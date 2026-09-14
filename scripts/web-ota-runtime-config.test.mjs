import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const ZMIENNE_KRYTYCZNE = [
  'VITE_SYNC_API_URL',
  'VITE_ANDROID_UPDATE_MANIFEST_URL',
  'VITE_ANDROID_WEB_UPDATE_MANIFEST_URL',
]

async function plikiZrodlowe(katalog) {
  const wpisy = await readdir(katalog, { withFileTypes: true })
  const wynik = await Promise.all(wpisy.map(async (wpis) => {
    const sciezka = join(katalog, wpis.name)
    if (wpis.isDirectory()) return plikiZrodlowe(sciezka)
    return /(?<!\.test)\.(ts|tsx)$/.test(wpis.name) ? [sciezka] : []
  }))
  return wynik.flat()
}

test('tylko RuntimeConfigService ma fallback krytycznych VITE dla wersji webowej', async () => {
  const pliki = await plikiZrodlowe('src')
  const naruszenia = []
  for (const plik of pliki) {
    const tresc = await readFile(plik, 'utf8')
    for (const zmienna of ZMIENNE_KRYTYCZNE) {
      if (tresc.includes(`import.meta.env.${zmienna}`) && plik.replaceAll('\\', '/') !== 'src/services/RuntimeConfigService.ts') {
        naruszenia.push(`${plik}: ${zmienna}`)
      }
    }
  }
  assert.deepEqual(naruszenia, [])
})
