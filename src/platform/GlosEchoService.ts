import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type StanNatywnegoGlosu = 'sluchanie' | 'transkrypcja' | 'mowienie'

interface EchoGlosPlugin {
  sprawdzDostepnosc: () => Promise<{ rozpoznawanie: boolean; mowienie: boolean; zgoda: string }>
  rozpocznijNasluchiwanie: (opcje: { limitMs: number }) => Promise<{ tekst: string }>
  anulujNasluchiwanie: () => Promise<void>
  mow: (opcje: { tekst: string }) => Promise<void>
  zatrzymajMowienie: () => Promise<void>
  addListener: (nazwa: 'stanGlosu', obsluga: (dane: { stan: StanNatywnegoGlosu }) => void) => Promise<PluginListenerHandle>
}

interface RozpoznawanieMowyPrzegladarki {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: (zdarzenie: { results: Record<number, Record<number, { transcript: string }>> }) => void
  onerror: (zdarzenie: { error?: string }) => void
  onend: () => void
  start: () => void
  abort: () => void
}

const wtyczka = registerPlugin<EchoGlosPlugin>('EchoGlos')

function konstruktorRozpoznawania() {
  const okno = window as unknown as {
    SpeechRecognition?: new () => RozpoznawanieMowyPrzegladarki
    webkitSpeechRecognition?: new () => RozpoznawanieMowyPrzegladarki
  }
  return okno.SpeechRecognition ?? okno.webkitSpeechRecognition
}

export function utworzUslugeGlosuEcho(czyAndroid: boolean) {
  let rozpoznawaniePrzegladarki: RozpoznawanieMowyPrzegladarki | undefined

  return {
    natywna: czyAndroid,
    async sprawdzDostepnosc() {
      if (czyAndroid) return wtyczka.sprawdzDostepnosc()
      return {
        rozpoznawanie: Boolean(konstruktorRozpoznawania()),
        mowienie: 'speechSynthesis' in window,
        zgoda: 'prompt',
      }
    },
    async rozpoznaj(limitMs = 15_000): Promise<string> {
      if (czyAndroid) return (await wtyczka.rozpocznijNasluchiwanie({ limitMs })).tekst
      const Konstruktor = konstruktorRozpoznawania()
      if (!Konstruktor) throw new Error('Rozpoznawanie mowy nie jest dostępne w tej przeglądarce.')
      return new Promise((rozwiaz, odrzuc) => {
        const rozpoznawanie = new Konstruktor()
        rozpoznawaniePrzegladarki = rozpoznawanie
        let zakonczone = false
        const licznik = window.setTimeout(() => {
          rozpoznawanie.abort()
          odrzuc(new Error('Przekroczono czas oczekiwania na wypowiedź.'))
        }, limitMs)
        const zakoncz = (wynik: () => void) => {
          if (zakonczone) return
          zakonczone = true
          window.clearTimeout(licznik)
          rozpoznawaniePrzegladarki = undefined
          wynik()
        }
        rozpoznawanie.lang = 'pl-PL'
        rozpoznawanie.continuous = false
        rozpoznawanie.interimResults = false
        rozpoznawanie.onresult = (zdarzenie) => zakoncz(() => rozwiaz(zdarzenie.results[0]?.[0]?.transcript?.trim() ?? ''))
        rozpoznawanie.onerror = () => zakoncz(() => odrzuc(new Error('Nie udało się rozpoznać mowy.')))
        rozpoznawanie.onend = () => zakoncz(() => odrzuc(new Error('Nie usłyszałem wypowiedzi.')))
        rozpoznawanie.start()
      })
    },
    async anulujRozpoznawanie() {
      if (czyAndroid) return wtyczka.anulujNasluchiwanie()
      rozpoznawaniePrzegladarki?.abort()
      rozpoznawaniePrzegladarki = undefined
    },
    async mow(tekst: string) {
      if (czyAndroid) return wtyczka.mow({ tekst })
      if (!('speechSynthesis' in window)) throw new Error('Odczytywanie odpowiedzi nie jest dostępne.')
      await new Promise<void>((rozwiaz, odrzuc) => {
        const wypowiedz = new SpeechSynthesisUtterance(tekst)
        wypowiedz.lang = 'pl-PL'
        wypowiedz.onend = () => rozwiaz()
        wypowiedz.onerror = () => odrzuc(new Error('Nie udało się odczytać odpowiedzi.'))
        speechSynthesis.cancel()
        speechSynthesis.speak(wypowiedz)
      })
    },
    async zatrzymajMowienie() {
      if (czyAndroid) return wtyczka.zatrzymajMowienie()
      if ('speechSynthesis' in window) speechSynthesis.cancel()
    },
    async nasluchujStanu(obsluga: (stan: StanNatywnegoGlosu) => void) {
      if (!czyAndroid) return () => undefined
      const nasluchiwanie = await wtyczka.addListener('stanGlosu', ({ stan }) => obsluga(stan))
      return () => void nasluchiwanie.remove()
    },
  }
}

export type UslugaGlosuEcho = ReturnType<typeof utworzUslugeGlosuEcho>
