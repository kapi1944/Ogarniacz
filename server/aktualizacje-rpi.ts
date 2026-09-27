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
const STANY_W_TRAKCIE = new Set(['checking', 'downloading/fetching', 'installing', 'building', 'restarting', 'rollback'])
const NAZWY_JEDNOSTEK = Object.values(JEDNOSTKI)

export interface AktualizacjeRpi {
  odczytaj(): Promise<{ wersja: string; commit: string; originMain: string | null; dostepnosc: 'aktualna' | 'dostepna' | 'blad' | 'nieznana'; stan: string; komunikat: string; moznaPrzywrocic: boolean }>
  uruchom(akcja: keyof typeof JEDNOSTKI): Promise<'przyjeto' | 'zajete' | 'brakRollbacku'>
}

export function utworzAktualizacjeRpi(): AktualizacjeRpi {
  let uruchamianie = false
  async function aktywnaJednostka(): Promise<boolean> {
    const wyniki = await Promise.all(NAZWY_JEDNOSTEK.map(async (jednostka) => {
      const wynik = await wykonaj('/usr/bin/systemctl', ['show', '--property=ActiveState', '--value', jednostka], { timeout: 5000 })
      return wynik.stdout.trim() === 'active' || wynik.stdout.trim() === 'activating'
    }))
    return wyniki.some(Boolean)
  }
  async function odczytaj() {
    const [[pakiet, wynik], plik, poprzedniPlik] = await Promise.all([
      Promise.all([readFile(`${KATALOG}/package.json`, 'utf8'), wykonaj('git', ['rev-parse', '--verify', 'HEAD'], { cwd: KATALOG, timeout: 5000 })]),
      readFile(PLIK_STANU, 'utf8').catch(() => ''), readFile(PLIK_POPRZEDNI, 'utf8').catch(() => ''),
    ])
    const pola = plik.trim().split('|')
    const [stanSurowy, komunikatSurowy, originSurowy, dostepnoscSurowa] = pola
    const poprawnyStan = pola.length === 4 && STANY.has(stanSurowy) && ['aktualna', 'dostepna', 'blad', ''].includes(dostepnoscSurowa)
    let stan = poprawnyStan ? stanSurowy : plik ? 'error' : 'idle'
    let komunikat = poprawnyStan ? komunikatSurowy : plik ? 'Niepoprawny plik statusu; wymagana interwencja administratora.' : ''
    if (STANY_W_TRAKCIE.has(stan) && !(await aktywnaJednostka())) {
      stan = 'error'
      komunikat = 'Aktualizator przerwano przed zakończeniem; wymagana interwencja administratora.'
    }
    const originMain = /^[0-9a-f]{40}$/.test(originSurowy ?? '') ? originSurowy : null
    const commit = wynik.stdout.trim()
    const commity = poprzedniPlik.trim().split(/\r?\n/)
    const [poprzedni, cel] = commity
    let moznaPrzywrocic = commity.length === 2 && /^[0-9a-f]{40}$/.test(poprzedni ?? '') && /^[0-9a-f]{40}$/.test(cel ?? '') && poprzedni !== cel && cel === commit
    if (moznaPrzywrocic) {
      try {
        await wykonaj('git', ['cat-file', '-e', `${poprzedni}^{commit}`], { cwd: KATALOG, timeout: 5000 })
        await wykonaj('git', ['merge-base', '--is-ancestor', poprzedni, cel], { cwd: KATALOG, timeout: 5000 })
      }
      catch { moznaPrzywrocic = false }
    }
    const dostepnosc = dostepnoscSurowa === 'blad' ? 'blad'
      : originMain ? (originMain === commit ? 'aktualna' : 'dostepna') : 'nieznana'
    return {
      wersja: String((JSON.parse(pakiet) as { version: string }).version),
      commit,
      originMain,
      dostepnosc: dostepnosc as 'aktualna' | 'dostepna' | 'blad' | 'nieznana',
      stan,
      komunikat,
      moznaPrzywrocic,
    }
  }

  return {
    odczytaj,
    async uruchom(akcja) {
      if (uruchamianie) return 'zajete'
      uruchamianie = true
      try {
        if (await aktywnaJednostka()) return 'zajete'
        if (akcja === 'rollback' && !(await odczytaj()).moznaPrzywrocic) return 'brakRollbacku'
        await wykonaj('/usr/bin/sudo', ['-n', '/usr/bin/systemctl', 'start', '--no-block', JEDNOSTKI[akcja]], { timeout: 5000 })
        return 'przyjeto'
      } finally { uruchamianie = false }
    },
  }
}
