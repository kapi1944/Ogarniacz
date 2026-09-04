import type { RepozytoriumZdalne, ZmianaSynchronizacji } from './DostawcaSynchronizacji'
import { odtworzWartoscZTransportu, przygotujWartoscDoTransportu } from '../services/BackupService'
import { pobierzInstallationId } from '../services/InstallationService'

interface OdpowiedzZmian {
  zmiany: ZmianaSynchronizacji[]
  synchronizowanoDo?: string
}

function polaczAdres(baza: string, sciezka: string): string {
  return `${baza.replace(/\/$/, '')}${sciezka}`
}

export class RepozytoriumZdalneHttp implements RepozytoriumZdalne {
  readonly trwale = true
  private kursor?: string

  constructor(
    private readonly adresApi: string,
    private readonly kluczDostepu: string,
    private readonly installationId = pobierzInstallationId,
  ) {}

  async pobierzZmiany(od: string): Promise<ZmianaSynchronizacji[]> {
    const odpowiedz = await fetch(polaczAdres(this.adresApi, `/api/sync/changes?od=${encodeURIComponent(od)}`), {
      headers: this.naglowki(),
    })
    const dane = await this.odczytajOdpowiedz(odpowiedz) as OdpowiedzZmian
    this.kursor = dane.synchronizowanoDo
    return odtworzWartoscZTransportu(dane.zmiany) as ZmianaSynchronizacji[]
  }

  pobierzKursor(): string | undefined {
    return this.kursor
  }

  async wyslijZmiany(zmiany: ZmianaSynchronizacji[], od = '1970-01-01T00:00:00.000Z'): Promise<void> {
    const odpowiedz = await fetch(polaczAdres(this.adresApi, '/api/sync/changes'), {
      method: 'POST',
      headers: { ...this.naglowki(), 'content-type': 'application/json' },
      body: JSON.stringify(await przygotujWartoscDoTransportu({ od, installationId: this.installationId(), zmiany })),
    })
    await this.odczytajOdpowiedz(odpowiedz)
  }

  private naglowki(): Record<string, string> {
    return {
      authorization: `Bearer ${this.kluczDostepu}`,
      'x-ogarniacz-installation-id': this.installationId(),
    }
  }

  private async odczytajOdpowiedz(odpowiedz: Response): Promise<unknown> {
    const dane = await odpowiedz.json().catch(() => ({})) as { error?: string }
    if (!odpowiedz.ok) throw new Error(dane.error || `Serwer synchronizacji zwrócił ${odpowiedz.status}.`)
    return dane
  }
}
