import type { PlatformaOgarniacza } from '../../platform/typy'
import type { KontrolerSesjiGlosowejEcho, StanSesjiGlosowejEcho } from './KontrolerSesjiGlosowejEcho'
import type { InformacjaOSilnikuWakeWordEcho, SilnikWakeWordEcho, StanSilnikaWakeWordEcho } from './SilnikWakeWordEcho'

export type WynikTestuWakeWordEcho = 'wykryto' | 'nieWykryto' | 'niedostepny'

export class KontrolerWakeWordEcho {
  private stan: StanSilnikaWakeWordEcho = 'zatrzymany'
  private komunikat?: string
  private usunCyklZycia?: () => void
  private usunStanSesji?: () => void
  private inicjalizacjaCyklu?: Promise<void>
  private wlaczony = false
  private aplikacjaAktywna = true
  private silnikAktywny = false
  private silnikPodlaczony = false
  private trwaUruchamianie?: Promise<void>
  private trwaZatrzymywanie?: Promise<void>
  private trwaWykrycie = false
  private zakonczTest?: (wynik: WynikTestuWakeWordEcho) => void

  constructor(
    private readonly silnik: SilnikWakeWordEcho,
    private readonly kontrolerSesji: Pick<KontrolerSesjiGlosowejEcho, 'rozpocznij' | 'pobierzStan' | 'nasluchujStanu'>,
    private readonly cyklZycia: PlatformaOgarniacza['cyklZycia'],
    private readonly zmienStan: (stan: StanSilnikaWakeWordEcho, komunikat?: string) => void = () => undefined,
  ) {}

  async sprawdzStan(): Promise<InformacjaOSilnikuWakeWordEcho> {
    const informacja = await this.silnik.sprawdzStan()
    if (!this.silnikAktywny) this.ustawStan(informacja.stan, informacja.komunikat)
    return informacja
  }

  async uruchom(): Promise<void> {
    this.wlaczony = true
    await this.inicjalizujCyklZycia()
    await this.uruchomSilnikJesliMozna()
  }

  async zatrzymaj(): Promise<void> {
    this.wlaczony = false
    this.zakonczTest?.('nieWykryto')
    this.zakonczTest = undefined
    await this.zatrzymajSilnik()
    this.ustawStan('zatrzymany')
  }

  async testuj(limitMs = 8_000): Promise<WynikTestuWakeWordEcho> {
    if (this.zakonczTest) return 'niedostepny'
    const bylWlaczony = this.wlaczony
    const informacja = await this.sprawdzStan()
    if (informacja.stan === 'niedostepny' || informacja.stan === 'brakKonfiguracji' || informacja.stan === 'blad') return 'niedostepny'

    return new Promise<WynikTestuWakeWordEcho>((rozwiaz) => {
      let licznik: ReturnType<typeof setTimeout> | undefined
      const zakoncz = (wynik: WynikTestuWakeWordEcho) => {
        if (licznik) clearTimeout(licznik)
        this.zakonczTest = undefined
        rozwiaz(wynik)
        if (!bylWlaczony) {
          this.wlaczony = false
          void this.zatrzymajSilnik().then(() => this.ustawStan('zatrzymany'))
        }
        else void this.uruchomSilnikJesliMozna()
      }
      this.zakonczTest = zakoncz
      licznik = setTimeout(() => zakoncz('nieWykryto'), Math.max(3_000, Math.min(15_000, limitMs)))
      this.wlaczony = true
      void this.inicjalizujCyklZycia().then(() => this.uruchomSilnikJesliMozna()).catch(() => zakoncz('niedostepny'))
    })
  }

  async zniszcz(): Promise<void> {
    await this.zatrzymaj()
    this.usunCyklZycia?.()
    this.usunStanSesji?.()
    this.usunCyklZycia = undefined
    this.usunStanSesji = undefined
    this.inicjalizacjaCyklu = undefined
  }

  pobierzStan(): StanSilnikaWakeWordEcho { return this.stan }
  pobierzKomunikat(): string | undefined { return this.komunikat }
  wstrzymajDlaSesji(): Promise<void> { return this.zatrzymajSilnik() }

  private async inicjalizujCyklZycia(): Promise<void> {
    if (this.usunCyklZycia) return
    if (!this.inicjalizacjaCyklu) {
      this.inicjalizacjaCyklu = (async () => {
        this.usunCyklZycia = await this.cyklZycia.nasluchuj((stan) => {
          this.aplikacjaAktywna = stan === 'aktywny'
          if (!this.aplikacjaAktywna) void this.zatrzymajSilnik()
          else void this.uruchomSilnikJesliMozna()
        })
        this.usunStanSesji = this.kontrolerSesji.nasluchujStanu((stan) => this.obsluzStanSesji(stan))
        this.aplikacjaAktywna = (await this.cyklZycia.pobierzStan()) === 'aktywny'
      })()
    }
    await this.inicjalizacjaCyklu
  }

  private obsluzStanSesji(stan: StanSesjiGlosowejEcho): void {
    if (stan === 'bezczynny') void this.uruchomSilnikJesliMozna()
    else if (this.silnikPodlaczony) void this.zatrzymajSilnik()
  }

  private async uruchomSilnikJesliMozna(): Promise<void> {
    if (this.trwaZatrzymywanie) {
      await this.trwaZatrzymywanie
      return this.uruchomSilnikJesliMozna()
    }
    if (!this.wlaczony || !this.aplikacjaAktywna || this.silnikAktywny || this.trwaUruchamianie || this.kontrolerSesji.pobierzStan() !== 'bezczynny') return
    this.ustawStan('uruchamianie')
    const uruchamianie = this.silnik.uruchom({
      wykrytoFraze: () => void this.obsluzWykrycie(),
      zmienStan: (stan, komunikat) => {
        this.silnikAktywny = stan === 'aktywny'
        this.ustawStan(stan, komunikat)
      },
    }).then(() => {
      this.silnikAktywny = this.stan === 'aktywny'
      this.silnikPodlaczony = this.silnikAktywny
    }).catch((blad) => {
      const komunikat = blad instanceof Error ? blad.message : 'Nie udało się uruchomić „Hej Echo”.'
      if (!['brakKonfiguracji', 'niedostepny'].includes(this.stan)) this.ustawStan('blad', komunikat)
    }).finally(() => {
      if (this.trwaUruchamianie === uruchamianie) this.trwaUruchamianie = undefined
    })
    this.trwaUruchamianie = uruchamianie
    await uruchamianie
  }

  private async obsluzWykrycie(): Promise<void> {
    if (this.trwaWykrycie) return
    this.trwaWykrycie = true
    await this.zatrzymajSilnik()
    const zakonczTest = this.zakonczTest
    if (zakonczTest) zakonczTest('wykryto')
    else if (this.wlaczony && this.aplikacjaAktywna) await this.kontrolerSesji.rozpocznij()
    this.trwaWykrycie = false
  }

  private async zatrzymajSilnik(): Promise<void> {
    if (this.trwaZatrzymywanie) return this.trwaZatrzymywanie
    if (!this.silnikPodlaczony && !this.trwaUruchamianie) return
    const zatrzymywanie = (async () => {
      await this.trwaUruchamianie
      await this.silnik.zatrzymaj()
      this.silnikAktywny = false
      this.silnikPodlaczony = false
    })().finally(() => {
      if (this.trwaZatrzymywanie === zatrzymywanie) this.trwaZatrzymywanie = undefined
    })
    this.trwaZatrzymywanie = zatrzymywanie
    await zatrzymywanie
  }

  private ustawStan(stan: StanSilnikaWakeWordEcho, komunikat?: string): void {
    this.stan = stan
    this.komunikat = komunikat
    this.zmienStan(stan, komunikat)
  }
}
