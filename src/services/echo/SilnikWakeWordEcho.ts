export type StanSilnikaWakeWordEcho = 'zatrzymany' | 'uruchamianie' | 'gotowy' | 'blad'

export interface ZdarzeniaSilnikaWakeWordEcho {
  wykrytoFraze: () => void
  zmienStan: (stan: StanSilnikaWakeWordEcho, komunikat?: string) => void
}

/**
 * Kontrakt keyword spottingu. Nie rozpoznaje wypowiedzi i nie przekazuje tekstu
 * do UI ani do agenta; pełne STT uruchamia dopiero odbiorca wykrytej frazy.
 */
export interface SilnikWakeWordEcho {
  uruchom(zdarzenia: ZdarzeniaSilnikaWakeWordEcho): Promise<void>
  zatrzymaj(): Promise<void>
}

/** Minimalny most dla przyszłego natywnego SDK keyword spottingu. */
export interface NatywnaUslugaWakeWordEcho {
  uruchom: () => Promise<void>
  zatrzymaj: () => Promise<void>
  nasluchujWykrycia: (obsluga: () => void) => Promise<() => void>
  nasluchujStanu: (obsluga: (stan: StanSilnikaWakeWordEcho, komunikat?: string) => void) => Promise<() => void>
}

/** Adapter izolujący domenę Echo od API wybranego natywnego silnika KWS. */
export class AdapterNatywnegoSilnikaWakeWordEcho implements SilnikWakeWordEcho {
  private usunWykrycie?: () => void
  private usunStan?: () => void

  constructor(private readonly usluga: NatywnaUslugaWakeWordEcho) {}

  async uruchom(zdarzenia: ZdarzeniaSilnikaWakeWordEcho): Promise<void> {
    this.usunWykrycie = await this.usluga.nasluchujWykrycia(zdarzenia.wykrytoFraze)
    this.usunStan = await this.usluga.nasluchujStanu(zdarzenia.zmienStan)
    await this.usluga.uruchom()
  }

  async zatrzymaj(): Promise<void> {
    await this.usluga.zatrzymaj()
    this.usunWykrycie?.()
    this.usunStan?.()
    this.usunWykrycie = undefined
    this.usunStan = undefined
  }
}

/** Tymczasowy adapter, dopóki aplikacja nie ma skonfigurowanego natywnego KWS. */
export class NiedostepnySilnikWakeWordEcho implements SilnikWakeWordEcho {
  async uruchom(zdarzenia: ZdarzeniaSilnikaWakeWordEcho): Promise<void> {
    zdarzenia.zmienStan('blad', 'Wykrywanie „Hej Echo” wymaga jeszcze natywnego silnika keyword spotting.')
  }

  async zatrzymaj(): Promise<void> {}
}
