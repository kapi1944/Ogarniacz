import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const wykonaj = promisify(execFile)
const KATALOG = '/home/kacper/apps/Ogarniacz'
const PLIK_STANU = `${KATALOG}/data/aktualizacja-rpi/status`
const JEDNOSTKI = {
  check: 'ogarniacz-update-check.service',
  start: 'ogarniacz-update.service',
  rollback: 'ogarniacz-update-rollback.service',
} as const

const STANY = new Set(['idle', 'checking', 'downloading/fetching', 'installing', 'building', 'restarting', 'success', 'rollback', 'error'])

export interface AktualizacjeRpi {
  odczytaj(): Promise<{ wersja: string; commit: string; originMain: string | null; dostepnosc: 'aktualna' | 'dostepna' | 'blad' | 'nieznana'; stan: string; komunikat: string }>
  uruchom(akcja: keyof typeof JEDNOSTKI): Promise<boolean>
}

export function utworzAktualizacjeRpi(): AktualizacjeRpi {
  const uruchomionaWersja = Promise.all([
    readFile(`${KATALOG}/package.json`, 'utf8'),
    wykonaj('git', ['rev-parse', '--verify', 'HEAD'], { cwd: KATALOG, timeout: 5000 }),
  ])
  void uruchomionaWersja.catch(() => {})
  async function odczytaj() {
    const [[pakiet, wynik], plik] = await Promise.all([uruchomionaWersja, readFile(PLIK_STANU, 'utf8').catch(() => '')])
    const [stanSurowy, komunikatSurowy, originSurowy, dostepnoscSurowa] = plik.trim().split('|')
    const stan = STANY.has(stanSurowy) ? stanSurowy : 'idle'
    const originMain = /^[0-9a-f]{40}$/.test(originSurowy ?? '') ? originSurowy : null
    const commit = wynik.stdout.trim()
    const dostepnosc = dostepnoscSurowa === 'blad' ? 'blad'
      : originMain ? (originMain === commit ? 'aktualna' : 'dostepna') : 'nieznana'
    return {
      wersja: String((JSON.parse(pakiet) as { version: string }).version),
      commit,
      originMain,
      dostepnosc: dostepnosc as 'aktualna' | 'dostepna' | 'blad' | 'nieznana',
      stan,
      komunikat: komunikatSurowy ?? '',
    }
  }

  return {
    odczytaj,
    async uruchom(akcja) {
      await wykonaj('/usr/bin/sudo', ['-n', '/usr/bin/systemctl', 'start', '--no-block', JEDNOSTKI[akcja]], { timeout: 5000 })
      return true
    },
  }
}
