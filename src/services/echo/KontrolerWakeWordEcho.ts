import type { PlatformaOgarniacza } from '../../platform/typy'
import type { KontrolerSesjiGlosowejEcho } from './KontrolerSesjiGlosowejEcho'
import type { SilnikWakeWordEcho, StanSilnikaWakeWordEcho } from './SilnikWakeWordEcho'

export class KontrolerWakeWordEcho {
  private stan: StanSilnikaWakeWordEcho = 'zatrzymany'
  private usunCyklZycia?: () => void
  private uruchomiony = false

  constructor(
    private readonly silnik: SilnikWakeWordEcho,
    private readonly kontrolerSesji: Pick<KontrolerSesjiGlosowejEcho, 'rozpocznij'>,
    private readonly cyklZycia: PlatformaOgarniacza['cyklZycia'],
    private readonly zmienStan: (stan: StanSilnikaWakeWordEcho, komunikat?: string) => void = () => undefined,
  ) {}

  async uruchom(): Promise<void> {
    if (this.uruchomiony) return
    this.uruchomiony = true
    this.ustawStan('uruchamianie')
    this.usunCyklZycia = await this.cyklZycia.nasluchuj((stan) => {
      if (stan === 'nieaktywny') void this.zatrzymaj()
    })
    if ((await this.cyklZycia.pobierzStan()) !== 'aktywny') return
    await this.silnik.uruchom({
      wykrytoFraze: () => void this.kontrolerSesji.rozpocznij(),
      zmienStan: (stan, komunikat) => this.ustawStan(stan, komunikat),
    })
  }

  async zatrzymaj(): Promise<void> {
    this.uruchomiony = false
    await this.silnik.zatrzymaj()
    this.ustawStan('zatrzymany')
  }

  async zniszcz(): Promise<void> {
    await this.zatrzymaj()
    this.usunCyklZycia?.()
    this.usunCyklZycia = undefined
  }

  pobierzStan(): StanSilnikaWakeWordEcho { return this.stan }

  private ustawStan(stan: StanSilnikaWakeWordEcho, komunikat?: string): void {
    this.stan = stan
    this.zmienStan(stan, komunikat)
  }
}
