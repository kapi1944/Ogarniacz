import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import type { KonfiguracjaSerwera } from './config.ts'

const MAKSYMALNY_ROZMIAR_ZADANIA = 512 * 1024
const MAKSYMALNY_ROZMIAR_ODPOWIEDZI = 128 * 1024

const schematZadaniaModeluEcho = z.object({
  format: z.record(z.string(), z.unknown()),
  messages: z.array(z.object({
    role: z.enum(['system', 'user']),
    content: z.string().max(200_000),
  }).strict()).min(1).max(4),
}).strict()

export class BladModeluEcho extends Error {
  readonly statusHttp: number

  constructor(statusHttp: number, komunikat: string) {
    super(komunikat)
    this.name = 'BladModeluEcho'
    this.statusHttp = statusHttp
  }
}

export type ObslugaModeluEcho = (zadanie: unknown, sygnal: AbortSignal) => Promise<unknown>

export async function odczytajZadanieModeluEcho(zadanie: IncomingMessage): Promise<unknown> {
  const fragmenty: Buffer[] = []
  let rozmiar = 0
  for await (const fragment of zadanie) {
    const bufor = Buffer.isBuffer(fragment) ? fragment : Buffer.from(fragment)
    rozmiar += bufor.length
    if (rozmiar > MAKSYMALNY_ROZMIAR_ZADANIA) throw new BladModeluEcho(413, 'Za duże żądanie modelu Echo.')
    fragmenty.push(bufor)
  }
  try {
    return schematZadaniaModeluEcho.parse(JSON.parse(Buffer.concat(fragmenty).toString('utf8')))
  } catch (blad) {
    if (blad instanceof BladModeluEcho) throw blad
    throw new BladModeluEcho(400, 'Niepoprawne zadanie modelu Echo.')
  }
}

export function utworzObslugeModeluEcho(
  konfiguracja: KonfiguracjaSerwera,
  pobierz: typeof fetch = fetch,
): ObslugaModeluEcho {
  return async (zadanie, sygnal) => {
    if (!konfiguracja.adresModeluEcho || !konfiguracja.nazwaModeluEcho) {
      throw new BladModeluEcho(503, 'Lokalny model Echo nie jest skonfigurowany.')
    }
    const poprawneZadanie = schematZadaniaModeluEcho.parse(zadanie)
    const kontroler = new AbortController()
    let przekroczonoLimit = false
    const anuluj = () => kontroler.abort()
    sygnal.addEventListener('abort', anuluj, { once: true })
    if (sygnal.aborted) kontroler.abort()
    const licznik = setTimeout(() => {
      przekroczonoLimit = true
      kontroler.abort()
    }, konfiguracja.limitCzasuModeluEchoMs)
    try {
      const odpowiedz = await pobierz(konfiguracja.adresModeluEcho, {
        method: 'POST',
        signal: kontroler.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: konfiguracja.nazwaModeluEcho,
          stream: false,
          format: poprawneZadanie.format,
          options: { temperature: 0 },
          messages: poprawneZadanie.messages,
        }),
      })
      if (!odpowiedz.ok) throw new BladModeluEcho(503, 'Lokalny model Echo jest niedostępny.')
      const tresc = await odpowiedz.text()
      if (Buffer.byteLength(tresc, 'utf8') > MAKSYMALNY_ROZMIAR_ODPOWIEDZI) {
        throw new BladModeluEcho(502, 'Odpowiedź modelu Echo jest za duża.')
      }
      try {
        return JSON.parse(tresc) as unknown
      } catch {
        throw new BladModeluEcho(502, 'Lokalny model Echo zwrócił niepoprawny JSON.')
      }
    } catch (blad) {
      if (blad instanceof BladModeluEcho) throw blad
      if (przekroczonoLimit) throw new BladModeluEcho(504, 'Przekroczono czas odpowiedzi modelu Echo.')
      if (sygnal.aborted) throw blad
      throw new BladModeluEcho(503, 'Lokalny model Echo jest niedostępny.')
    } finally {
      clearTimeout(licznik)
      sygnal.removeEventListener('abort', anuluj)
    }
  }
}
