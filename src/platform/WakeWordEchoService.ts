import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { InformacjaOSilnikuWakeWordEcho, NatywnaUslugaWakeWordEcho, StanSilnikaWakeWordEcho } from '../services/echo/SilnikWakeWordEcho'

interface WakeWordEchoPlugin {
  sprawdzStan: () => Promise<InformacjaOSilnikuWakeWordEcho>
  uruchom: () => Promise<void>
  zatrzymaj: () => Promise<void>
  addListener: {
    (nazwa: 'wykrytoFraze', obsluga: () => void): Promise<PluginListenerHandle>
    (nazwa: 'stanWakeWord', obsluga: (dane: { stan: StanSilnikaWakeWordEcho; komunikat?: string }) => void): Promise<PluginListenerHandle>
  }
}

const wtyczka = registerPlugin<WakeWordEchoPlugin>('WakeWordEcho')

export function utworzUslugeWakeWordEcho(czyAndroid: boolean): NatywnaUslugaWakeWordEcho {
  if (!czyAndroid) {
    return {
      sprawdzStan: async () => ({ stan: 'niedostepny', komunikat: '„Hej Echo” jest dostępne tylko w aplikacji Android.' }),
      uruchom: async () => undefined,
      zatrzymaj: async () => undefined,
      nasluchujWykrycia: async () => () => undefined,
      nasluchujStanu: async () => () => undefined,
    }
  }

  return {
    sprawdzStan: () => wtyczka.sprawdzStan(),
    uruchom: () => wtyczka.uruchom(),
    zatrzymaj: () => wtyczka.zatrzymaj(),
    async nasluchujWykrycia(obsluga) {
      const nasluchiwanie = await wtyczka.addListener('wykrytoFraze', obsluga)
      return () => void nasluchiwanie.remove()
    },
    async nasluchujStanu(obsluga) {
      const nasluchiwanie = await wtyczka.addListener('stanWakeWord', ({ stan, komunikat }) => obsluga(stan, komunikat))
      return () => void nasluchiwanie.remove()
    },
  }
}
