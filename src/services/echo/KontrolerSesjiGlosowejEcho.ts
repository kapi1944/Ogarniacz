import type { EchoService } from '../EchoService'
import type { OdpowiedzEcho } from './typyEcho'
import type { UslugaGlosuEcho } from '../../platform/GlosEchoService'
import type { PlatformaOgarniacza } from '../../platform/typy'

export type StanSesjiGlosowejEcho = 'bezczynny' | 'sluchanie' | 'transkrypcja' | 'myslenie' | 'mowienie' | 'oczekiwanie' | 'blad'

interface ObslugaSesjiGlosowej {
  zmienStan: (stan: StanSesjiGlosowejEcho) => void
  odebranoWypowiedz: (tekst: string) => void
  odebranoOdpowiedz: (odpowiedz: OdpowiedzEcho) => void
  zglosBlad: (komunikat: string) => void
}

interface ZaleznosciKontrolera {
  glos: UslugaGlosuEcho
  echo: Pick<EchoService, 'obsluz'>
  cyklZycia: PlatformaOgarniacza['cyklZycia']
  obsluga: ObslugaSesjiGlosowej
}

function komunikatBledu(blad: unknown) {
  return blad instanceof Error && blad.message ? blad.message : 'Nie udało się przeprowadzić rozmowy głosowej.'
}

function czyCicheZakonczenie(blad: unknown) {
  const kod = typeof blad === 'object' && blad && 'code' in blad ? String(blad.code) : ''
  const komunikat = komunikatBledu(blad)
  return kod === 'ANULOWANO' || kod === 'BRAK_MOWY' || /anulowano|nie usłyszałem|czas oczekiwania/i.test(komunikat)
}

export class KontrolerSesjiGlosowejEcho {
  private numerSesji = 0
  private aktywna = false
  private stan: StanSesjiGlosowejEcho = 'bezczynny'
  private kontrolerOdpowiedzi?: AbortController
  private usunStanGlosu?: () => void
  private usunCyklZycia?: () => void

  constructor(private readonly zaleznosci: ZaleznosciKontrolera) {}

  async inicjalizuj() {
    this.usunStanGlosu = await this.zaleznosci.glos.nasluchujStanu((stan) => {
      if (stan === 'transkrypcja') this.ustawStan('transkrypcja')
      if (stan === 'mowienie') this.ustawStan('mowienie')
    })
    this.usunCyklZycia = await this.zaleznosci.cyklZycia.nasluchuj((stan) => {
      if (stan === 'nieaktywny') void this.anuluj()
    })
  }

  async rozpocznij() {
    if (this.aktywna) await this.anuluj()
    const numer = ++this.numerSesji
    this.aktywna = true
    this.zaleznosci.obsluga.zglosBlad('')
    void this.prowadzRozmowe(numer)
  }

  async ponow() {
    await this.rozpocznij()
  }

  async przerwijIMow() {
    await this.rozpocznij()
  }

  async anuluj() {
    this.numerSesji += 1
    this.aktywna = false
    this.kontrolerOdpowiedzi?.abort()
    this.kontrolerOdpowiedzi = undefined
    await Promise.allSettled([
      this.zaleznosci.glos.anulujRozpoznawanie(),
      this.zaleznosci.glos.zatrzymajMowienie(),
    ])
    this.ustawStan('bezczynny')
  }

  async zniszcz() {
    await this.anuluj()
    this.usunStanGlosu?.()
    this.usunCyklZycia?.()
  }

  pobierzStan() {
    return this.stan
  }

  private async prowadzRozmowe(numer: number) {
    let kontynuacja = false
    while (this.czyAktualna(numer)) {
      try {
        this.ustawStan(kontynuacja ? 'oczekiwanie' : 'sluchanie')
        const wypowiedz = await this.zaleznosci.glos.rozpoznaj(kontynuacja ? 7_000 : 20_000)
        if (!this.czyAktualna(numer) || !wypowiedz.trim()) break
        this.zaleznosci.obsluga.odebranoWypowiedz(wypowiedz)
        this.ustawStan('myslenie')
        this.kontrolerOdpowiedzi = new AbortController()
        const odpowiedz = await this.zaleznosci.echo.obsluz(wypowiedz, 'stt', this.kontrolerOdpowiedzi.signal)
        this.kontrolerOdpowiedzi = undefined
        if (!this.czyAktualna(numer)) break
        this.zaleznosci.obsluga.odebranoOdpowiedz(odpowiedz)
        this.ustawStan('mowienie')
        await this.zaleznosci.glos.mow(odpowiedz.tekst)
        kontynuacja = true
      } catch (blad) {
        if (!this.czyAktualna(numer)) return
        if (kontynuacja && czyCicheZakonczenie(blad)) break
        this.ustawStan('blad')
        this.zaleznosci.obsluga.zglosBlad(komunikatBledu(blad))
        this.aktywna = false
        return
      }
    }
    if (this.czyAktualna(numer)) {
      this.aktywna = false
      this.ustawStan('bezczynny')
    }
  }

  private czyAktualna(numer: number) {
    return this.aktywna && numer === this.numerSesji
  }

  private ustawStan(stan: StanSesjiGlosowejEcho) {
    this.stan = stan
    this.zaleznosci.obsluga.zmienStan(stan)
  }
}
