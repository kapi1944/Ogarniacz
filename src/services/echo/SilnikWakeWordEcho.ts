export type StanSilnikaWakeWordEcho = 'zatrzymany' | 'uruchamianie' | 'aktywny' | 'niedostepny' | 'brakKonfiguracji' | 'blad'

export interface InformacjaOSilnikuWakeWordEcho {
  stan: StanSilnikaWakeWordEcho
  komunikat?: string
}

export interface ZdarzeniaSilnikaWakeWordEcho {
  wykrytoFraze: () => void
  zmienStan: (stan: StanSilnikaWakeWordEcho, komunikat?: string) => void
}

/**
 * Kontrakt keyword spottingu. Nie rozpoznaje wypowiedzi i nie przekazuje tekstu
 * do UI ani do agenta; pełne STT uruchamia dopiero odbiorca wykrytej frazy.
 */
export interface SilnikWakeWordEcho {
  sprawdzStan(): Promise<InformacjaOSilnikuWakeWordEcho>
  uruchom(zdarzenia: ZdarzeniaSilnikaWakeWordEcho): Promise<void>
  zatrzymaj(): Promise<void>
}

/** Minimalny most dla przyszłego natywnego SDK keyword spottingu. */
export interface NatywnaUslugaWakeWordEcho {
  sprawdzStan: () => Promise<InformacjaOSilnikuWakeWordEcho>
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

  sprawdzStan(): Promise<InformacjaOSilnikuWakeWordEcho> {
    return this.usluga.sprawdzStan()
  }

  async uruchom(zdarzenia: ZdarzeniaSilnikaWakeWordEcho): Promise<void> {
    await this.zatrzymaj()
    this.usunWykrycie = await this.usluga.nasluchujWykrycia(zdarzenia.wykrytoFraze)
    this.usunStan = await this.usluga.nasluchujStanu(zdarzenia.zmienStan)
    try {
      await this.usluga.uruchom()
    } catch (blad) {
      this.usunWykrycie?.()
      this.usunStan?.()
      this.usunWykrycie = undefined
      this.usunStan = undefined
      throw blad
    }
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
  async sprawdzStan(): Promise<InformacjaOSilnikuWakeWordEcho> {
    return { stan: 'niedostepny', komunikat: '„Hej Echo” jest dostępne tylko w aplikacji Android.' }
  }

  async uruchom(zdarzenia: ZdarzeniaSilnikaWakeWordEcho): Promise<void> {
    zdarzenia.zmienStan('niedostepny', '„Hej Echo” jest dostępne tylko w aplikacji Android.')
  }

  async zatrzymaj(): Promise<void> {}
}
