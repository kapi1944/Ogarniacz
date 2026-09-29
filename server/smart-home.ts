import { z } from 'zod'

export type RyzykoAkcjiSmartHome = 'niskie' | 'umiarkowane' | 'wysokie'

export const AKCJE_SMART_HOME = {
  wlacz: { ryzyko: 'umiarkowane' as const },
  wylacz: { ryzyko: 'umiarkowane' as const },
} satisfies Record<'wlacz' | 'wylacz', { ryzyko: RyzykoAkcjiSmartHome }>

export interface EncjaSmartHome {
  id: string
  domena: string
  nazwa: string
  stan: string
  dostepna: boolean
  klasaUrzadzenia?: string
  jednostka?: string
}

export interface WynikDostepnosciSmartHome {
  dostepny: boolean
}

export interface WynikAkcjiSmartHome {
  wykonano: true
  akcja: 'wlacz' | 'wylacz'
  encjaId: string
  ryzyko: RyzykoAkcjiSmartHome
}

export interface DostawcaSmartHome {
  sprawdzDostepnosc(sygnal?: AbortSignal): Promise<WynikDostepnosciSmartHome>
  listaEncji(sygnal?: AbortSignal): Promise<EncjaSmartHome[]>
  pobierzStan(encjaId: string, sygnal?: AbortSignal): Promise<EncjaSmartHome | undefined>
  wlacz(encjaId: string, sygnal?: AbortSignal): Promise<WynikAkcjiSmartHome>
  wylacz(encjaId: string, sygnal?: AbortSignal): Promise<WynikAkcjiSmartHome>
}

export type KodBleduSmartHome = 'niedostepny' | 'timeout' | 'api' | 'niepoprawna_odpowiedz' | 'niepoprawna_encja'

export class BladSmartHome extends Error {
  readonly kod: KodBleduSmartHome

  constructor(kod: KodBleduSmartHome, komunikat: string) {
    super(komunikat)
    this.name = 'BladSmartHome'
    this.kod = kod
  }
}

export interface KonfiguracjaPolaczeniaSmartHome {
  adres?: string
  token?: string
  limitCzasuMs: number
}

const schematStanuHomeAssistant = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.record(z.string(), z.unknown()).default({}),
}).passthrough()

function projekcjaEncji(dane: unknown): EncjaSmartHome {
  const stan = schematStanuHomeAssistant.parse(dane)
  const nazwa = typeof stan.attributes.friendly_name === 'string' ? stan.attributes.friendly_name : stan.entity_id
  const klasaUrzadzenia = typeof stan.attributes.device_class === 'string' ? stan.attributes.device_class : undefined
  const jednostka = typeof stan.attributes.unit_of_measurement === 'string' ? stan.attributes.unit_of_measurement : undefined
  return {
    id: stan.entity_id,
    domena: stan.entity_id.split('.')[0] ?? '',
    nazwa,
    stan: stan.state,
    dostepna: !['unavailable', 'unknown'].includes(stan.state),
    ...(klasaUrzadzenia ? { klasaUrzadzenia } : {}),
    ...(jednostka ? { jednostka } : {}),
  }
}

function sprawdzIdEncji(encjaId: string): void {
  if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(encjaId)) {
    throw new BladSmartHome('niepoprawna_encja', 'Niepoprawny identyfikator encji Smart Home.')
  }
}

export class NiedostepnyDostawcaSmartHome implements DostawcaSmartHome {
  async sprawdzDostepnosc(): Promise<WynikDostepnosciSmartHome> {
    return { dostepny: false }
  }

  async listaEncji(): Promise<EncjaSmartHome[]> {
    return []
  }

  async pobierzStan(): Promise<undefined> {
    return undefined
  }

  async wlacz(): Promise<WynikAkcjiSmartHome> {
    throw new BladSmartHome('niedostepny', 'Smart Home nie jest skonfigurowany.')
  }

  async wylacz(): Promise<WynikAkcjiSmartHome> {
    throw new BladSmartHome('niedostepny', 'Smart Home nie jest skonfigurowany.')
  }
}

export class AdapterHomeAssistant implements DostawcaSmartHome {
  private readonly adres: string
  private readonly token: string
  private readonly limitCzasuMs: number
  private readonly pobierz: typeof fetch

  constructor(
    adres: string,
    token: string,
    limitCzasuMs: number,
    pobierz: typeof fetch = fetch,
  ) {
    this.adres = adres
    this.token = token
    this.limitCzasuMs = limitCzasuMs
    this.pobierz = pobierz
  }

  async sprawdzDostepnosc(sygnal?: AbortSignal): Promise<WynikDostepnosciSmartHome> {
    try {
      const odpowiedz = await this.wyslij('/api/', { method: 'GET' }, sygnal)
      return { dostepny: odpowiedz.ok }
    } catch {
      return { dostepny: false }
    }
  }

  async listaEncji(sygnal?: AbortSignal): Promise<EncjaSmartHome[]> {
    const odpowiedz = await this.wyslij('/api/states', { method: 'GET' }, sygnal)
    if (!odpowiedz.ok) throw new BladSmartHome('api', 'Home Assistant odrzucił pobranie listy encji.')
    try {
      return z.array(schematStanuHomeAssistant).parse(await odpowiedz.json()).map(projekcjaEncji)
    } catch (blad) {
      if (blad instanceof BladSmartHome) throw blad
      throw new BladSmartHome('niepoprawna_odpowiedz', 'Home Assistant zwrócił niepoprawną listę encji.')
    }
  }

  async pobierzStan(encjaId: string, sygnal?: AbortSignal): Promise<EncjaSmartHome | undefined> {
    sprawdzIdEncji(encjaId)
    const odpowiedz = await this.wyslij(`/api/states/${encodeURIComponent(encjaId)}`, { method: 'GET' }, sygnal)
    if (odpowiedz.status === 404) return undefined
    if (!odpowiedz.ok) throw new BladSmartHome('api', 'Home Assistant odrzucił pobranie stanu encji.')
    try {
      return projekcjaEncji(await odpowiedz.json())
    } catch {
      throw new BladSmartHome('niepoprawna_odpowiedz', 'Home Assistant zwrócił niepoprawny stan encji.')
    }
  }

  async wlacz(encjaId: string, sygnal?: AbortSignal): Promise<WynikAkcjiSmartHome> {
    return this.zmienStan('wlacz', encjaId, sygnal)
  }

  async wylacz(encjaId: string, sygnal?: AbortSignal): Promise<WynikAkcjiSmartHome> {
    return this.zmienStan('wylacz', encjaId, sygnal)
  }

  private async zmienStan(akcja: 'wlacz' | 'wylacz', encjaId: string, sygnal?: AbortSignal): Promise<WynikAkcjiSmartHome> {
    sprawdzIdEncji(encjaId)
    const usluga = akcja === 'wlacz' ? 'turn_on' : 'turn_off'
    const odpowiedz = await this.wyslij(`/api/services/homeassistant/${usluga}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entity_id: encjaId }),
    }, sygnal)
    if (!odpowiedz.ok) throw new BladSmartHome('api', `Home Assistant odrzucił akcję: ${akcja}.`)
    return { wykonano: true, akcja, encjaId, ryzyko: AKCJE_SMART_HOME[akcja].ryzyko }
  }

  private async wyslij(sciezka: string, inicjalizacja: RequestInit, sygnal?: AbortSignal): Promise<Response> {
    const kontroler = new AbortController()
    let przekroczonoLimit = false
    const anuluj = () => kontroler.abort()
    sygnal?.addEventListener('abort', anuluj, { once: true })
    if (sygnal?.aborted) kontroler.abort()
    const licznik = setTimeout(() => {
      przekroczonoLimit = true
      kontroler.abort()
    }, this.limitCzasuMs)
    try {
      return await this.pobierz(`${this.adres}${sciezka}`, {
        ...inicjalizacja,
        signal: kontroler.signal,
        headers: {
          authorization: `Bearer ${this.token}`,
          ...inicjalizacja.headers,
        },
      })
    } catch {
      throw new BladSmartHome(przekroczonoLimit ? 'timeout' : 'niedostepny', przekroczonoLimit
        ? 'Przekroczono czas odpowiedzi Smart Home.'
        : 'Smart Home jest niedostępny.')
    } finally {
      clearTimeout(licznik)
      sygnal?.removeEventListener('abort', anuluj)
    }
  }
}

export function utworzDostawceSmartHome(
  konfiguracja: KonfiguracjaPolaczeniaSmartHome,
  pobierz: typeof fetch = fetch,
): DostawcaSmartHome {
  if (!konfiguracja.adres || !konfiguracja.token) return new NiedostepnyDostawcaSmartHome()
  return new AdapterHomeAssistant(konfiguracja.adres, konfiguracja.token, konfiguracja.limitCzasuMs, pobierz)
}
