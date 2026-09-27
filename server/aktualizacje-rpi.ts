import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const wykonaj = promisify(execFile)
const KATALOG = '/home/kacper/apps/Ogarniacz'
const PLIK_STANU = `${KATALOG}/data/aktualizacja-rpi/status`
const PLIK_POPRZEDNI = `${KATALOG}/data/aktualizacja-rpi/poprzedni`
const JEDNOSTKI = {
  check: 'ogarniacz-update-check.service',
  start: 'ogarniacz-update.service',
  rollback: 'ogarniacz-update-rollback.service',
} as const

const STANY = new Set(['idle', 'checking', 'downloading/fetching', 'installing', 'building', 'restarting', 'success', 'rollback', 'error'])

export interface AktualizacjeRpi {
  odczytaj(): Promise<{ wersja: string; commit: string; originMain: string | null; dostepnosc: 'aktualna' | 'dostepna' | 'blad' | 'nieznana'; stan: string; komunikat: string; moznaPrzywrocic: boolean }>
  uruchom(akcja: keyof typeof JEDNOSTKI): Promise<boolean>
}

export function utworzAktualizacjeRpi(): AktualizacjeRpi {
  const uruchomionaWersja = Promise.all([
    readFile(`${KATALOG}/package.json`, 'utf8'),
    wykonaj('git', ['rev-parse', '--verify', 'HEAD'], { cwd: KATALOG, timeout: 5000 }),
  ])
  void uruchomionaWersja.catch(() => {})
  async function odczytaj() {
    const [[pakiet, wynik], plik, poprzedniPlik] = await Promise.all([uruchomionaWersja, readFile(PLIK_STANU, 'utf8').catch(() => ''), readFile(PLIK_POPRZEDNI, 'utf8').catch(() => '')])
    const [stanSurowy, komunikatSurowy, originSurowy, dostepnoscSurowa] = plik.trim().split('|')
    const stan = STANY.has(stanSurowy) ? stanSurowy : 'idle'
    const originMain = /^[0-9a-f]{40}$/.test(originSurowy ?? '') ? originSurowy : null
    const commit = wynik.stdout.trim()
    const [poprzedni, cel] = poprzedniPlik.trim().split(/\r?\n/)
    const moznaPrzywrocic = /^[0-9a-f]{40}$/.test(poprzedni ?? '') && cel === commit
    const dostepnosc = dostepnoscSurowa === 'blad' ? 'blad'
      : originMain ? (originMain === commit ? 'aktualna' : 'dostepna') : 'nieznana'
    return {
      wersja: String((JSON.parse(pakiet) as { version: string }).version),
      commit,
      originMain,
      dostepnosc: dostepnosc as 'aktualna' | 'dostepna' | 'blad' | 'nieznana',
      stan,
      komunikat: komunikatSurowy ?? '',
      moznaPrzywrocic,
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
