import { CapacitorHttp, type HttpResponse } from '@capacitor/core'
import { BladKonfliktuSynchronizacji, type RepozytoriumZdalne, type ZmianaSynchronizacji } from './DostawcaSynchronizacji'
import { odtworzWartoscZTransportu, przygotujWartoscDoTransportu } from '../services/BackupService'
import { pobierzInstallationId } from '../services/InstallationService'
import { BladKonta, pobierzCsrfKonta, pobierzKontoOffline, pobierzSesjeKonta } from '../services/KontaService'

interface OdpowiedzZmian {
  zmiany: ZmianaSynchronizacji[]
  synchronizowanoDo?: string
}

export type RodzajBleduSynchronizacji = 'brak_sesji' | 'sesja_wygasla' | 'csrf' | 'brak_polaczenia' | 'blad_synchronizacji'

export class BladSynchronizacjiHttp extends Error {
  constructor(public readonly rodzaj: RodzajBleduSynchronizacji, komunikat: string) {
    super(komunikat)
    this.name = 'BladSynchronizacjiHttp'
  }
}

function polaczAdres(baza: string, sciezka: string): string {
  return `${baza.replace(/\/$/, '')}${sciezka}`
}

export class RepozytoriumZdalneHttp implements RepozytoriumZdalne {
  readonly trwale = true
  private kursor?: string

  constructor(
    private readonly adresApi: string,
    private readonly installationId = pobierzInstallationId,
  ) {}

  async pobierzZmiany(od: string): Promise<ZmianaSynchronizacji[]> {
    await this.zapewnijSesje()
    const odpowiedz = await this.wykonajZadanie(() => CapacitorHttp.get({
      url: polaczAdres(this.adresApi, `/api/sync/changes?od=${encodeURIComponent(od)}`),
      headers: this.naglowki(false),
      connectTimeout: 15_000,
      readTimeout: 15_000,
      webFetchExtra: { credentials: 'include' },
    }))
    const dane = await this.odczytajOdpowiedz(odpowiedz) as OdpowiedzZmian
    this.kursor = dane.synchronizowanoDo
    return odtworzWartoscZTransportu(dane.zmiany) as ZmianaSynchronizacji[]
  }

  pobierzKursor(): string | undefined {
    return this.kursor
  }

  async wyslijZmiany(zmiany: ZmianaSynchronizacji[], od = '1970-01-01T00:00:00.000Z'): Promise<void> {
    await this.zapewnijSesje()
    const dane = await przygotujWartoscDoTransportu({ od, installationId: this.installationId(), zmiany })
    const wyslij = () => this.wykonajZadanie(async () => CapacitorHttp.post({
      url: polaczAdres(this.adresApi, '/api/sync/changes'),
      headers: { ...this.naglowki(true), 'content-type': 'application/json' },
      data: dane,
      connectTimeout: 15_000,
      readTimeout: 15_000,
      webFetchExtra: { credentials: 'include' },
    }))
    let odpowiedz = await wyslij()
    if (this.czyBladCsrf(odpowiedz)) {
      await this.odswiezSesjePoBledzieCsrf()
      odpowiedz = await wyslij()
    }
    await this.odczytajOdpowiedz(odpowiedz)
  }

  private naglowki(czyZapis: boolean): Record<string, string> {
    const csrf = pobierzCsrfKonta()
    return {
      ...(czyZapis && csrf ? { 'x-ogarniacz-csrf': csrf } : {}),
      'x-ogarniacz-installation-id': this.installationId(),
    }
  }

  private async zapewnijSesje(): Promise<void> {
    if (pobierzCsrfKonta()) return
    const sesjaBylaZnana = Boolean(pobierzKontoOffline())
    try {
      await pobierzSesjeKonta()
    } catch (blad) {
      if (blad instanceof BladKonta && blad.status === 401) {
        throw new BladSynchronizacjiHttp(
          sesjaBylaZnana ? 'sesja_wygasla' : 'brak_sesji',
          sesjaBylaZnana ? 'Sesja wygasła. Zaloguj się ponownie.' : 'Brak sesji. Zaloguj się, aby synchronizować dane.',
        )
      }
      throw this.mapujBladPolaczenia(blad)
    }
  }

  private czyBladCsrf(odpowiedz: HttpResponse): boolean {
    const dane = odpowiedz.data && typeof odpowiedz.data === 'object' ? odpowiedz.data as { error?: string } : {}
    return odpowiedz.status === 403 && /sesja wymaga odświeżenia/i.test(dane.error ?? '')
  }

  private async odswiezSesjePoBledzieCsrf(): Promise<void> {
    try {
      await pobierzSesjeKonta()
    } catch (blad) {
      if (blad instanceof BladKonta && blad.status === 401) {
        throw new BladSynchronizacjiHttp('sesja_wygasla', 'Sesja wygasła. Zaloguj się ponownie.')
      }
      const bladPolaczenia = this.mapujBladPolaczenia(blad)
      if (bladPolaczenia.rodzaj === 'brak_polaczenia') throw bladPolaczenia
      throw new BladSynchronizacjiHttp('csrf', 'Nie udało się odświeżyć sesji po błędzie CSRF.')
    }
  }

  private async odczytajOdpowiedz(odpowiedz: HttpResponse): Promise<unknown> {
    const dane = odpowiedz.data && typeof odpowiedz.data === 'object' ? odpowiedz.data as { error?: string } : {}
    if (odpowiedz.status === 409) throw new BladKonfliktuSynchronizacji(dane.error)
    if (odpowiedz.status === 401) throw new BladSynchronizacjiHttp('sesja_wygasla', 'Sesja wygasła. Zaloguj się ponownie.')
    if (this.czyBladCsrf(odpowiedz)) throw new BladSynchronizacjiHttp('csrf', 'Sesja wymaga odświeżenia przed zapisem.')
    if (odpowiedz.status < 200 || odpowiedz.status >= 300) {
      throw new BladSynchronizacjiHttp('blad_synchronizacji', dane.error || `Serwer synchronizacji zwrócił ${odpowiedz.status}.`)
    }
    return dane
  }

  private async wykonajZadanie(zadanie: () => Promise<HttpResponse>): Promise<HttpResponse> {
    try {
      return await zadanie()
    } catch (blad) {
      throw this.mapujBladPolaczenia(blad)
    }
  }

  private mapujBladPolaczenia(blad: unknown): BladSynchronizacjiHttp {
    const komunikat = blad instanceof Error ? blad.message
      : typeof blad === 'object' && blad !== null && 'message' in blad ? String(blad.message) : ''
    const wskazowkaSieci = new URL(this.adresApi).hostname.endsWith('.ts.net')
      ? 'Sprawdź, czy Tailscale jest połączony na telefonie i Raspberry Pi.'
      : 'Sprawdź adres endpointu i połączenie z siecią.'
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return new BladSynchronizacjiHttp('brak_polaczenia', 'Brak połączenia z siecią. Synchronizacja zachowa oczekujące zmiany.')
    }
    if (/timeout|timed out/i.test(komunikat)) {
      return new BladSynchronizacjiHttp('brak_polaczenia', `Przekroczono czas połączenia z serwerem synchronizacji. ${wskazowkaSieci}`)
    }
    if (/failed to fetch|network error|unable to resolve host|connection refused|failed to connect|unreachable/i.test(komunikat)) {
      return new BladSynchronizacjiHttp('brak_polaczenia', `Serwer synchronizacji jest niedostępny. ${wskazowkaSieci}`)
    }
    return new BladSynchronizacjiHttp('blad_synchronizacji', komunikat || 'Nie udało się połączyć z serwerem synchronizacji.')
  }
}
