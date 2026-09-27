import type { KontoUzytkownika } from './KontaService'

export interface DaneDiagnostykiSynchronizacji {
  srodowisko: 'Android' | 'Web'
  hostApi: string
  protokolApi: 'HTTP' | 'HTTPS' | 'brak'
  stanSesji: 'zalogowany' | 'niezalogowany'
  rola: 'Właściciel' | 'Edytor' | 'brak'
  csrf: 'dostępny' | 'brak'
  installationId: string
  trybAutoryzacji: 'sesja'
}

export function utworzDiagnostykeSynchronizacji({
  czyAndroid,
  adresApi,
  konto,
  csrfDostepny,
  installationId,
}: {
  czyAndroid: boolean
  adresApi?: string
  konto?: KontoUzytkownika
  csrfDostepny: boolean
  installationId: string
}): DaneDiagnostykiSynchronizacji {
  let hostApi = 'brak konfiguracji'
  let protokolApi: DaneDiagnostykiSynchronizacji['protokolApi'] = 'brak'
  if (adresApi) {
    try {
      const adres = new URL(adresApi)
      hostApi = adres.host
      protokolApi = adres.protocol === 'https:' ? 'HTTPS' : 'HTTP'
    } catch {
      hostApi = 'nieprawidłowy adres'
    }
  }
  return {
    srodowisko: czyAndroid ? 'Android' : 'Web',
    hostApi,
    protokolApi,
    stanSesji: konto?.zalogowany ? 'zalogowany' : 'niezalogowany',
    rola: konto?.rola === 'wlasciciel' ? 'Właściciel' : konto?.rola === 'edytor' ? 'Edytor' : 'brak',
    csrf: csrfDostepny ? 'dostępny' : 'brak',
    installationId: installationId ? `${installationId.slice(0, 8)}…` : 'brak',
    trybAutoryzacji: 'sesja',
  }
}
