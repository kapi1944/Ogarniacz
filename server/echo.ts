import type { IncomingMessage } from 'node:http'

export interface WiadomoscEchoApi {
  rozmowaId?: string
  wiadomosc: string
  zrodlo: 'tekst' | 'stt'
}

export interface OdpowiedzEchoApi {
  rozmowaId: string
  tryb: 'pelny_agent' | 'ograniczony_lokalny'
  odpowiedz: string
  wymagaPotwierdzenia?: boolean
  akcjaDoPotwierdzenia?: {
    id: string
    narzedzie: string
    argumenty: unknown
    ryzyko: 'niskie' | 'umiarkowane' | 'wysokie'
    opis: string
  }
}

export type ObslugaEchoApi = (wiadomosc: WiadomoscEchoApi, sygnal: AbortSignal) => Promise<OdpowiedzEchoApi>

export async function odczytajWiadomoscEcho(zadanie: IncomingMessage): Promise<WiadomoscEchoApi> {
  const fragmenty: Buffer[] = []
  let rozmiar = 0
  for await (const fragment of zadanie) {
    const bufor = Buffer.isBuffer(fragment) ? fragment : Buffer.from(fragment)
    rozmiar += bufor.length
    if (rozmiar > 16_384) throw new Error('Za duże żądanie Echo.')
    fragmenty.push(bufor)
  }

  const dane = JSON.parse(Buffer.concat(fragmenty).toString('utf8')) as Record<string, unknown>
  if (typeof dane.wiadomosc !== 'string' || !dane.wiadomosc.trim() || dane.wiadomosc.length > 10_000) throw new Error('Niepoprawna wiadomość Echo.')
  if (dane.rozmowaId !== undefined && typeof dane.rozmowaId !== 'string') throw new Error('Niepoprawny identyfikator rozmowy.')
  if (dane.zrodlo !== undefined && dane.zrodlo !== 'tekst' && dane.zrodlo !== 'stt') throw new Error('Niepoprawne źródło wiadomości.')
  return { rozmowaId: dane.rozmowaId as string | undefined, wiadomosc: dane.wiadomosc.trim(), zrodlo: (dane.zrodlo as WiadomoscEchoApi['zrodlo'] | undefined) ?? 'tekst' }
}

export const niedostepnaObslugaEcho: ObslugaEchoApi = async () => {
  throw new Error('MODEL_ECHO_NIEDOSTEPNY')
}
