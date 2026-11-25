import { CapacitorHttp, type HttpResponse } from '@capacitor/core'
import { czyKanalBeta } from '../services/RuntimeConfigService'
import { BladKonfliktuSynchronizacji, type OdrzuconaZmianaSynchronizacji, type RepozytoriumZdalne, type WynikWysylaniaZmian, type ZmianaSynchronizacji } from './DostawcaSynchronizacji'
import { odtworzWartoscZTransportu, przygotujWartoscDoTransportu } from '../services/BackupService'
import { pobierzInstallationId } from '../services/InstallationService'
import { BladKonta, pobierzCsrfKonta, pobierzKontoOffline, pobierzSesjeKonta } from '../services/KontaService'
import { pobierzAktywnyProfil, pobierzSygnalProfilu, czyProfileUruchomione } from './ProfileLokalne'
import { czyDostepFinansowWspolnych, sprawdzDostepFinansowWspolnych } from '../services/UprawnieniaService'
import { BladDanychFinansowych, czyTabelaFinansowa, TABELE_FINANSOW_WSPOLNYCH, walidujObrazFinansowy } from '../../server/wspolne/SynchronizacjaFinansow.ts'

interface OdpowiedzZmian {
  zmiany: ZmianaSynchronizacji[]
  synchronizowanoDo?: string
  obslugiwaneTabeleFinansowe?: string[]
  liczbaRekordowFinansowych?: number
}

export type RodzajBleduSynchronizacji = 'brak_sesji' | 'sesja_wygasla' | 'csrf' | 'brak_polaczenia' | 'zmiana_odrzucona' | 'blad_synchronizacji'

export interface SzczegolyBleduSynchronizacji {
  /** Status HTTP odpowiedzi; brak oznacza błąd transportu (sieć, timeout). */
  status?: number
  /** Tabela i ID rekordu odrzuconego przez serwer — bez treści rekordu. */
  tabela?: string
  rekordId?: string
}

export class BladSynchronizacjiHttp extends Error {
  readonly status?: number
  readonly tabela?: string
  readonly rekordId?: string

  constructor(public readonly rodzaj: RodzajBleduSynchronizacji, komunikat: string, szczegoly: SzczegolyBleduSynchronizacji = {}) {
    super(komunikat)
    this.name = 'BladSynchronizacjiHttp'
    this.status = szczegoly.status
    this.tabela = szczegoly.tabela
    this.rekordId = szczegoly.rekordId
  }
}

function krotkiIdentyfikator(wartosc: unknown): string | undefined {
  return typeof wartosc === 'string' && wartosc.length > 0 && wartosc.length <= 200 ? wartosc : undefined
}

function polaczAdres(baza: string, sciezka: string): string {
  return `${baza.replace(/\/$/, '')}${sciezka}`
}

export class RepozytoriumZdalneHttp implements RepozytoriumZdalne {
  readonly trwale = true
  private kursor?: string
  private tabeleFinansowe: readonly string[] = []
  private readonly profil = pobierzAktywnyProfil()
  private readonly sygnal = pobierzSygnalProfilu()

  private sprawdzProfil(): void {
    if (czyKanalBeta()) throw new BladSynchronizacjiHttp('brak_polaczenia', 'Synchronizacja w Beta jest zablokowana.')
    if (czyProfileUruchomione() && !this.profil) throw new BladSynchronizacjiHttp('brak_sesji', 'Tryb lokalny nie synchronizuje danych konta.')
    if (this.sygnal.aborted || this.profil && (pobierzAktywnyProfil()?.id !== this.profil.id || this.adresApi !== this.profil.serwer)) throw new BladSynchronizacjiHttp('brak_sesji', 'Profil zmienił się. Zatrzymano synchronizację.')
  }

  constructor(
    private readonly adresApi: string,
    private readonly installationId = pobierzInstallationId,
  ) {}

  async pobierzZmiany(od: string): Promise<ZmianaSynchronizacji[]> {
    await this.zapewnijSesje()
    const odpowiedz = await this.wykonajZadanie(() => CapacitorHttp.get({
      url: polaczAdres(this.adresApi, `/api/sync/changes?od=${encodeURIComponent(od)}${czyDostepFinansowWspolnych('odczyt') ? '&finanseWspolne=1' : ''}`),
      headers: this.naglowki(false),
      connectTimeout: 15_000,
      readTimeout: 15_000,
      webFetchExtra: { credentials: 'include' },
    }))
    const dane = await this.odczytajOdpowiedz(odpowiedz) as OdpowiedzZmian
    this.tabeleFinansowe = TABELE_FINANSOW_WSPOLNYCH.every((tabela) => dane.obslugiwaneTabeleFinansowe?.includes(tabela)) ? TABELE_FINANSOW_WSPOLNYCH : []
    const finansowe = dane.zmiany.filter((zmiana) => czyTabelaFinansowa(zmiana.tabela))
    if (finansowe.length) sprawdzDostepFinansowWspolnych('odczyt')
    if (this.tabeleFinansowe.length && dane.liczbaRekordowFinansowych !== finansowe.length) throw new BladDanychFinansowych('Niepełna paczka wspólnych finansów.')
    if (finansowe.length && !this.tabeleFinansowe.length) throw new BladDanychFinansowych('Serwer nie potwierdził obsługi wspólnych finansów.')
    try { walidujObrazFinansowy(finansowe) }
    catch { throw new BladDanychFinansowych('Niepoprawne lub niepełne dane wspólnych finansów.') }
    this.kursor = dane.synchronizowanoDo
    return odtworzWartoscZTransportu(dane.zmiany) as ZmianaSynchronizacji[]
  }

  pobierzKursor(): string | undefined {
    return this.kursor
  }

  pobierzObslugiwaneTabeleFinansowe(): readonly string[] { return this.tabeleFinansowe }

  async wyslijZmiany(zmiany: ZmianaSynchronizacji[], od = '1970-01-01T00:00:00.000Z'): Promise<WynikWysylaniaZmian> {
    await this.zapewnijSesje()
    if (zmiany.some((zmiana) => czyTabelaFinansowa(zmiana.tabela))) {
      sprawdzDostepFinansowWspolnych('edycja')
      if (!TABELE_FINANSOW_WSPOLNYCH.every((tabela) => this.tabeleFinansowe.includes(tabela))) throw new Error('Backend nie obsługuje wspólnych finansów. Zmiany pozostają lokalne.')
    }
    // `obslugujeOdrzucone` pozwala serwerowi zapisać poprawne zmiany i zwrócić listę odrzuconych zamiast 400 dla całej paczki.
    const dane = await przygotujWartoscDoTransportu({ od, installationId: this.installationId(), obslugujeOdrzucone: true, zmiany })
    const wyslij = () => this.wykonajZadanie(async () => {
      if (zmiany.some((zmiana) => czyTabelaFinansowa(zmiana.tabela))) sprawdzDostepFinansowWspolnych('edycja')
      return CapacitorHttp.post({
        url: polaczAdres(this.adresApi, '/api/sync/changes'),
        headers: { ...this.naglowki(true), 'content-type': 'application/json' },
        data: dane,
        connectTimeout: 15_000,
        readTimeout: 15_000,
        webFetchExtra: { credentials: 'include' },
      })
    })
    let odpowiedz = await wyslij()
    if (this.czyBladCsrf(odpowiedz)) {
      await this.odswiezSesjePoBledzieCsrf()
      odpowiedz = await wyslij()
    }
    const potwierdzenie = await this.odczytajOdpowiedz(odpowiedz) as { pominiete?: { tabela: string }[]; odrzucone?: unknown }
    if (potwierdzenie.pominiete?.some((zmiana) => czyTabelaFinansowa(zmiana.tabela))) throw new Error('Serwer pominął dane finansowe; zachowano kolejkę.')
    if (potwierdzenie.odrzucone === undefined) return {}
    if (!Array.isArray(potwierdzenie.odrzucone)) throw new BladSynchronizacjiHttp('blad_synchronizacji', 'Serwer zwrócił niepoprawną listę odrzuconych zmian.', { status: odpowiedz.status })
    const odrzucone: OdrzuconaZmianaSynchronizacji[] = potwierdzenie.odrzucone.flatMap((wpis: unknown) => {
      if (!wpis || typeof wpis !== 'object') return []
      const { tabela, rekordId, zmianaId, powod } = wpis as Record<string, unknown>
      return [{
        ...(krotkiIdentyfikator(tabela) ? { tabela: krotkiIdentyfikator(tabela) } : {}),
        ...(krotkiIdentyfikator(rekordId) ? { rekordId: krotkiIdentyfikator(rekordId) } : {}),
        ...(krotkiIdentyfikator(zmianaId) ? { zmianaId: krotkiIdentyfikator(zmianaId) } : {}),
        powod: krotkiIdentyfikator(powod) ?? 'nieznany',
      }]
    })
    // Finanse wspólne są niepodzielne: częściowy zapis oznaczałby niespójny obraz salda.
    if (odrzucone.some((wpis) => wpis.tabela && czyTabelaFinansowa(wpis.tabela))) throw new Error('Serwer odrzucił dane finansowe; zachowano kolejkę.')
    return { odrzucone }
  }

  private naglowki(czyZapis: boolean): Record<string, string> {
    this.sprawdzProfil()
    const csrf = pobierzCsrfKonta()
    return {
      ...(czyZapis && csrf ? { 'x-ogarniacz-csrf': csrf } : {}),
      'x-ogarniacz-installation-id': this.installationId(),
      ...(this.profil ? { 'x-ogarniacz-user-id': this.profil.uzytkownikId, 'x-ogarniacz-owner-id': this.profil.wlascicielId } : {}),
    }
  }

  private async zapewnijSesje(): Promise<void> {
    this.sprawdzProfil()
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
      throw this.mapujBladPolaczenia(blad)
    }
  }

  private async odczytajOdpowiedz(odpowiedz: HttpResponse): Promise<unknown> {
    const dane = odpowiedz.data && typeof odpowiedz.data === 'object' ? odpowiedz.data as { error?: string; kod?: unknown; tabela?: unknown; rekordId?: unknown } : {}
    if (odpowiedz.status === 409) throw new BladKonfliktuSynchronizacji(dane.error)
    if (odpowiedz.status === 401) {
      if (czyProfileUruchomione() && this.profil) window.dispatchEvent(new Event('ogarniacz:sesja-wygasla'))
      throw new BladSynchronizacjiHttp('sesja_wygasla', 'Sesja wygasła. Zaloguj się ponownie.')
    }
    if (this.czyBladCsrf(odpowiedz)) throw new BladSynchronizacjiHttp('csrf', 'Sesja wymaga odświeżenia przed zapisem.')
    if (odpowiedz.status === 400 && dane.kod === 'zmiana_odrzucona') {
      const tabela = krotkiIdentyfikator(dane.tabela)
      throw new BladSynchronizacjiHttp('zmiana_odrzucona', `Serwer odrzucił zmianę${tabela ? ` w tabeli ${tabela}` : ''}.`, {
        status: 400,
        tabela,
        rekordId: krotkiIdentyfikator(dane.rekordId),
      })
    }
    if (odpowiedz.status < 200 || odpowiedz.status >= 300) {
      throw new BladSynchronizacjiHttp('blad_synchronizacji', dane.error || `Serwer synchronizacji zwrócił ${odpowiedz.status}.`, { status: odpowiedz.status })
    }
    return dane
  }

  private async wykonajZadanie(zadanie: () => Promise<HttpResponse>): Promise<HttpResponse> {
    try {
      this.sprawdzProfil()
      const wynik = await zadanie()
      this.sprawdzProfil()
      return wynik
    } catch (blad) {
      throw this.mapujBladPolaczenia(blad)
    }
  }

  private mapujBladPolaczenia(blad: unknown): BladSynchronizacjiHttp {
    if (blad instanceof BladSynchronizacjiHttp) return blad
    if (blad instanceof BladKonta) {
      return new BladSynchronizacjiHttp('blad_synchronizacji', `Serwer kont zwrócił HTTP ${blad.status}.`, { status: blad.status })
    }
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
    if (/failed to fetch|network error|unable to resolve host|UnknownHostException|connection refused|failed to connect|unreachable|connection reset|socket closed/i.test(komunikat)) {
      return new BladSynchronizacjiHttp('brak_polaczenia', `Serwer synchronizacji jest niedostępny. ${wskazowkaSieci}`)
    }
    return new BladSynchronizacjiHttp('blad_synchronizacji', komunikat || 'Nie udało się połączyć z serwerem synchronizacji.')
  }
}
