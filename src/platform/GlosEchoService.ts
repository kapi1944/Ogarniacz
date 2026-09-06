import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type StanNatywnegoGlosu = 'sluchanie' | 'mowiUzytkownik' | 'transkrypcja' | 'mowienie'

interface EchoGlosPlugin {
  sprawdzDostepnosc: () => Promise<{ rozpoznawanie: boolean; mowienie: boolean; zgoda: string }>
  rozpocznijNasluchiwanie: (opcje: { limitMs: number; limitPauzyMs?: number }) => Promise<{ tekst: string }>
  anulujNasluchiwanie: () => Promise<void>
  mow: (opcje: { tekst: string }) => Promise<void>
  zatrzymajMowienie: () => Promise<void>
  addListener: (nazwa: 'stanGlosu', obsluga: (dane: { stan: StanNatywnegoGlosu; tekst?: string }) => void) => Promise<PluginListenerHandle>
}

interface RozpoznawanieMowyPrzegladarki {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: (zdarzenie: { results: { length: number; [indeks: number]: { isFinal: boolean; [indeks: number]: { transcript: string } } } }) => void
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
    async rozpoznaj(limitMs = 15_000, limitPauzyMs?: number, odebranoCzesciowy?: (tekst: string) => void): Promise<string> {
      if (czyAndroid) return (await wtyczka.rozpocznijNasluchiwanie({ limitMs, limitPauzyMs })).tekst
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
        rozpoznawanie.interimResults = true
        rozpoznawanie.onresult = (zdarzenie) => {
          const wynik = zdarzenie.results[zdarzenie.results.length - 1]
          const tekst = wynik?.[0]?.transcript?.trim() ?? ''
          if (wynik?.isFinal) zakoncz(() => rozwiaz(tekst))
          else if (tekst) odebranoCzesciowy?.(tekst)
        }
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
    async nasluchujStanu(obsluga: (stan: StanNatywnegoGlosu, tekst?: string) => void) {
      if (!czyAndroid) return () => undefined
      const nasluchiwanie = await wtyczka.addListener('stanGlosu', ({ stan, tekst }) => obsluga(stan, tekst))
      return () => void nasluchiwanie.remove()
    },
  }
}

export type UslugaGlosuEcho = ReturnType<typeof utworzUslugeGlosuEcho>
