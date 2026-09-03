import { dzisiajIso } from '../../domain/fabryki'
import { KontekstRozmowyEcho } from './KontekstRozmowyEcho'
import { LokalnySemantycznyProviderEcho } from './LokalnySemantycznyProviderEcho'
import { RejestrNarzedziEcho, WykonawcaNarzedziEcho, utworzDomyslnyRejestrNarzedziEcho } from './NarzedziaEcho'
import type { AkcjaDoPotwierdzeniaEcho, DecyzjaModeluEcho, KontekstCzasuEcho, OdpowiedzEcho, ProviderModeluEcho, StanPracyEcho, ZadanieModeluEcho, ZrodloWejsciaEcho } from './typyEcho'

const INSTRUKCJE_SYSTEMOWE = [
  'Jesteś Echo, centralnym osobistym asystentem Ogarniacza. Rozmawiaj po polsku, naturalnie, spokojnie i zwięźle.',
  'Nie zgaduj danych użytkownika. Pobieraj tylko potrzebne dane za pomocą dostępnych narzędzi.',
  'Nie znasz implementacji bazy i nie możesz wykonywać kodu, SQL ani poleceń systemowych.',
  'Jeśli brakuje istotnej informacji, zadaj jedno naturalne pytanie. Jeśli danych nie ma, powiedz wprost, że ich nie ma.',
  'Możesz proponować działania, ale decyzję o wykonaniu i potwierdzeniu podejmuje warstwa polityki.',
]

export interface OpcjeAgentaEcho {
  provider?: ProviderModeluEcho
  kontekst?: KontekstRozmowyEcho
  rejestr?: RejestrNarzedziEcho
  wykonawca?: WykonawcaNarzedziEcho
  limitKrokow?: number
  limitCzasuMs?: number
  pobierzCzas?: () => KontekstCzasuEcho
  onZmianaStanu?: (stan: StanPracyEcho) => void
}

function pobierzBiezacyCzas(): KontekstCzasuEcho {
  const teraz = new Date()
  return {
    teraz: teraz.toISOString(),
    dataLokalna: dzisiajIso(teraz),
    strefaCzasowa: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
  }
}

export class AgentEcho {
  readonly provider: ProviderModeluEcho
  readonly kontekst: KontekstRozmowyEcho
  readonly rejestr: RejestrNarzedziEcho
  readonly wykonawca: WykonawcaNarzedziEcho
  private readonly limitKrokow: number
  private readonly limitCzasuMs: number
  private readonly pobierzCzas: () => KontekstCzasuEcho
  private readonly onZmianaStanu?: (stan: StanPracyEcho) => void
  private oczekujacaAkcja?: AkcjaDoPotwierdzeniaEcho

  constructor(opcje: OpcjeAgentaEcho = {}) {
    this.provider = opcje.provider ?? new LokalnySemantycznyProviderEcho()
    this.kontekst = opcje.kontekst ?? new KontekstRozmowyEcho()
    this.rejestr = opcje.rejestr ?? utworzDomyslnyRejestrNarzedziEcho()
    this.wykonawca = opcje.wykonawca ?? new WykonawcaNarzedziEcho(this.rejestr)
    this.limitKrokow = opcje.limitKrokow ?? 6
    this.limitCzasuMs = opcje.limitCzasuMs ?? 15_000
    this.pobierzCzas = opcje.pobierzCzas ?? pobierzBiezacyCzas
    this.onZmianaStanu = opcje.onZmianaStanu
  }

  async obsluz(tresc: string, zrodlo: ZrodloWejsciaEcho = 'tekst', sygnalZewnetrzny?: AbortSignal): Promise<OdpowiedzEcho> {
    const oczyszczona = tresc.trim()
    if (!oczyszczona) return this.odpowiedz('Powiedz albo napisz, czym mam się zająć.')
    this.onZmianaStanu?.('rozumiem')
    this.kontekst.dodajTure('uzytkownik', oczyszczona)
    this.kontekst.ustawTemat(this.kontekst.migawka().temat ?? (zrodlo === 'stt' ? 'rozmowa głosowa' : 'rozmowa tekstowa'))
    const odpowiedz = await this.uruchomPetle(sygnalZewnetrzny)
    this.onZmianaStanu?.('gotowe')
    return odpowiedz
  }

  async potwierdz(akcja: AkcjaDoPotwierdzeniaEcho, sygnalZewnetrzny?: AbortSignal): Promise<OdpowiedzEcho> {
    if (!this.oczekujacaAkcja || this.oczekujacaAkcja.wywolanie.id !== akcja.wywolanie.id) {
      return this.odpowiedz('To potwierdzenie nie jest już aktualne. Powiedz, co mam zrobić ponownie.', 'umiarkowane')
    }
    this.oczekujacaAkcja = undefined
    this.onZmianaStanu?.('wykonuje')
    const wynik = await this.wykonawca.wykonaj(akcja.wywolanie, true)
    this.kontekst.dodajWynikNarzedzia(wynik)
    if (wynik.status !== 'wykonane') return this.odpowiedz('Nie udało się bezpiecznie wykonać tej zmiany.', akcja.ryzyko)
    this.kontekst.ustawOstatniaAkcje(akcja.wywolanie.nazwa, akcja.wywolanie.argumenty)
    return this.uruchomPetle(sygnalZewnetrzny)
  }

  anulujPotwierdzenie(): void {
    this.oczekujacaAkcja = undefined
  }

  private zbudujZadanieModelu(): ZadanieModeluEcho {
    return {
      instrukcjeSystemowe: INSTRUKCJE_SYSTEMOWE,
      kontekstCzasu: this.pobierzCzas(),
      kontekstRozmowy: this.kontekst.migawka(),
      narzedzia: this.rejestr.definicje(),
    }
  }

  private async uruchomPetle(sygnalZewnetrzny?: AbortSignal): Promise<OdpowiedzEcho> {
    try {
      for (let krok = 0; krok < this.limitKrokow; krok += 1) {
        const decyzja = await this.pobierzDecyzje(this.zbudujZadanieModelu(), sygnalZewnetrzny)
        const gotowa = await this.obsluzDecyzje(decyzja)
        if (gotowa) return gotowa
      }
      return this.odpowiedz('Zatrzymałem tę próbę, bo wymagała zbyt wielu kroków. Spróbujmy ująć cel trochę węziej.')
    } catch (blad) {
      if (blad instanceof DOMException && blad.name === 'AbortError') return this.odpowiedz('Przerwałem tę odpowiedź.')
      return this.odpowiedz('Nie mogę teraz dokończyć tej rozmowy. Twoje dane nie zostały zmienione.')
    }
  }

  private async obsluzDecyzje(decyzja: DecyzjaModeluEcho): Promise<OdpowiedzEcho | undefined> {
    this.kontekst.zastosujAktualizacje(decyzja.aktualizacjaKontekstu)
    if (decyzja.typ === 'odpowiedz' || decyzja.typ === 'pytanie') {
      const tresc = decyzja.tresc.trim() || 'Nie mam jeszcze wystarczających danych, żeby odpowiedzieć.'
      this.kontekst.dodajTure('echo', tresc)
      this.kontekst.ustawNierozwiazanePytanie(decyzja.typ === 'pytanie' ? tresc : undefined)
      return this.odpowiedz(tresc, 'niskie', decyzja.typ === 'odpowiedz' ? decyzja.wartosciDomyslne : undefined)
    }

    if (decyzja.wywolania.length === 0) return undefined
    for (const wywolanie of decyzja.wywolania) {
      this.onZmianaStanu?.('wykonuje')
      const wynik = await this.wykonawca.wykonaj(wywolanie)
      this.kontekst.dodajWynikNarzedzia(wynik)
      if (wynik.status === 'wymaga_potwierdzenia') {
        const narzedzie = this.rejestr.pobierz(wywolanie.nazwa)
        const akcja: AkcjaDoPotwierdzeniaEcho = { wywolanie, ryzyko: narzedzie?.ryzyko ?? 'wysokie', opis: wynik.komunikat ?? 'Zmiana danych' }
        this.oczekujacaAkcja = akcja
        return { tekst: `Mogę to zrobić, ale najpierw potrzebuję potwierdzenia: ${akcja.opis}`, ryzyko: akcja.ryzyko, tryb: this.provider.tryb, wymagaPotwierdzenia: true, akcjaDoPotwierdzenia: akcja }
      }
      if (wynik.status === 'wykonane') {
        this.kontekst.ustawOstatniaAkcje(wywolanie.nazwa, wywolanie.argumenty)
        this.zapamietajEncjeWyniku(wywolanie.nazwa, wynik.dane)
      }
    }
    return undefined
  }

  private async pobierzDecyzje(zadanie: ZadanieModeluEcho, sygnalZewnetrzny?: AbortSignal): Promise<DecyzjaModeluEcho> {
    this.onZmianaStanu?.('rozumiem')
    const kontroler = new AbortController()
    const anuluj = () => kontroler.abort()
    sygnalZewnetrzny?.addEventListener('abort', anuluj, { once: true })
    let licznik: ReturnType<typeof setTimeout> | undefined
    try {
      const limit = new Promise<never>((_rozwiaz, odrzuc) => {
        licznik = setTimeout(() => {
          kontroler.abort()
          odrzuc(new DOMException('Przekroczono czas odpowiedzi modelu', 'AbortError'))
        }, this.limitCzasuMs)
      })
      return await Promise.race([this.provider.odpowiedz(zadanie, kontroler.signal), limit])
    } finally {
      if (licznik) clearTimeout(licznik)
      sygnalZewnetrzny?.removeEventListener('abort', anuluj)
    }
  }

  private odpowiedz(tekst: string, ryzyko: OdpowiedzEcho['ryzyko'] = 'niskie', wartosciDomyslne?: OdpowiedzEcho['wartosciDomyslne']): OdpowiedzEcho {
    return { tekst, ryzyko, tryb: this.provider.tryb, wartosciDomyslne }
  }

  private zapamietajEncjeWyniku(narzedzie: string, dane: unknown): void {
    if (Array.isArray(dane)) {
      if (dane.length === 1) this.zapamietajEncjeWyniku(narzedzie, dane[0])
      return
    }
    if (!dane || typeof dane !== 'object') return
    const wynik = dane as { id?: unknown; tytul?: unknown }
    if (typeof wynik.id !== 'string') return
    const typ = narzedzie.includes('reminder') ? 'przypomnienie' : narzedzie.includes('task') ? 'zadanie' : undefined
    if (!typ) return
    const obecne = this.kontekst.migawka().ostatnieEncje.filter((encja) => !(encja.typ === typ && encja.id === wynik.id))
    if (narzedzie.startsWith('delete_')) {
      this.kontekst.ustawEncje(obecne)
      return
    }
    this.kontekst.ustawEncje([...obecne, { typ, id: wynik.id, etykieta: typeof wynik.tytul === 'string' ? wynik.tytul : undefined }])
  }
}
