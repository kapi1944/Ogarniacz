import type { EchoService } from '../EchoService'
import type { OdpowiedzEcho } from './typyEcho'
import type { UslugaGlosuEcho } from '../../platform/GlosEchoService'
import type { PlatformaOgarniacza } from '../../platform/typy'
import { KonfiguracjaRozmowyEcho } from './KonfiguracjaRozmowyEcho'

export type StanSesjiGlosowejEcho = 'bezczynny' | 'sluchanie' | 'mowiUzytkownik' | 'transkrypcja' | 'myslenie' | 'mowienie' | 'oczekiwanie' | 'oczekujeDoprecyzowania' | 'oczekujePotwierdzenia' | 'blad'

interface ObslugaSesjiGlosowej {
  zmienStan: (stan: StanSesjiGlosowejEcho) => void
  odebranoCzesciowaWypowiedz?: (tekst: string) => void
  odebranoWypowiedz: (tekst: string) => void
  odebranoOdpowiedz: (odpowiedz: OdpowiedzEcho) => void
  zglosBlad: (komunikat: string) => void
}

interface ZaleznosciKontrolera {
  glos: UslugaGlosuEcho
  echo: Pick<EchoService, 'obsluz'>
  cyklZycia: PlatformaOgarniacza['cyklZycia']
  obsluga: ObslugaSesjiGlosowej
  konfiguracjaRozmowy?: KonfiguracjaRozmowyEcho
}

function komunikatBledu(blad: unknown) {
  return blad instanceof Error && blad.message ? blad.message : 'Nie udało się przeprowadzić rozmowy głosowej.'
}

function czyCicheZakonczenie(blad: unknown) {
  const kod = typeof blad === 'object' && blad && 'code' in blad ? String(blad.code) : ''
  const komunikat = komunikatBledu(blad)
  return kod === 'ANULOWANO' || kod === 'BRAK_MOWY' || kod === 'TIMEOUT' || /anulowano|nie usłyszałem|czas oczekiwania/i.test(komunikat)
}

export class KontrolerSesjiGlosowejEcho {
  private numerSesji = 0
  private aktywna = false
  private stan: StanSesjiGlosowejEcho = 'bezczynny'
  private kontrolerOdpowiedzi?: AbortController
  private usunStanGlosu?: () => void
  private usunCyklZycia?: () => void
  private inicjalizacja?: Promise<void>
  private aplikacjaAktywna = true
  private rozpoznawanieAktywne = false
  private przerwanoMowieniePrzezWtracenie = false
  private readonly obserwatorzyStanu = new Set<(stan: StanSesjiGlosowejEcho) => void>()
  private przygotujWejscie?: () => Promise<void>

  constructor(private readonly zaleznosci: ZaleznosciKontrolera) {}

  async inicjalizuj() {
    if (this.inicjalizacja) return this.inicjalizacja
    this.inicjalizacja = this.inicjalizujJednorazowo()
    return this.inicjalizacja
  }

  private async inicjalizujJednorazowo() {
    this.usunStanGlosu = await this.zaleznosci.glos.nasluchujStanu((stan, tekst) => {
      if (stan === 'bargeIn' && this.stan === 'mowienie') {
        this.przerwanoMowieniePrzezWtracenie = true
        this.ustawStan('sluchanie')
        return
      }
      if (!this.rozpoznawanieAktywne || !this.aktywna) return
      if (stan === 'mowiUzytkownik') this.ustawStan('mowiUzytkownik')
      if (stan === 'transkrypcja') this.ustawStan('transkrypcja')
      if (tekst) this.ustawCzesciowaWypowiedz(tekst)
    })
    this.usunCyklZycia = await this.zaleznosci.cyklZycia.nasluchuj((stan) => {
      this.aplikacjaAktywna = stan === 'aktywny'
      if (!this.aplikacjaAktywna) void this.anuluj()
    })
    this.aplikacjaAktywna = (await this.zaleznosci.cyklZycia.pobierzStan()) === 'aktywny'
  }

  async rozpocznij() {
    await this.inicjalizuj()
    if (!this.aplikacjaAktywna) return
    if (this.aktywna) await this.anuluj()
    await this.przygotujWejscie?.()
    if (!this.aplikacjaAktywna) return
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
    this.rozpoznawanieAktywne = false
    this.kontrolerOdpowiedzi?.abort()
    this.kontrolerOdpowiedzi = undefined
    await Promise.allSettled([
      this.zaleznosci.glos.anulujRozpoznawanie(),
      this.zaleznosci.glos.zatrzymajMowienie(),
    ])
    this.ustawCzesciowaWypowiedz('')
    this.ustawStan('bezczynny')
  }

  async zniszcz() {
    await this.inicjalizacja
    await this.anuluj()
    this.usunStanGlosu?.()
    this.usunCyklZycia?.()
    this.usunStanGlosu = undefined
    this.usunCyklZycia = undefined
    this.inicjalizacja = undefined
  }

  pobierzStan() {
    return this.stan
  }

  nasluchujStanu(obsluga: (stan: StanSesjiGlosowejEcho) => void) {
    this.obserwatorzyStanu.add(obsluga)
    return () => { this.obserwatorzyStanu.delete(obsluga) }
  }

  ustawPrzygotowanieWejscia(obsluga?: () => Promise<void>) {
    this.przygotujWejscie = obsluga
  }

  private async prowadzRozmowe(numer: number) {
    let kontynuacja = false
    let stanOczekiwania: StanSesjiGlosowejEcho = 'oczekiwanie'
    while (this.czyAktualna(numer)) {
      try {
        this.ustawStan(kontynuacja ? stanOczekiwania : 'sluchanie')
        const parametry = this.zaleznosci.konfiguracjaRozmowy?.pobierzParametryGlosu() ?? { limitPierwszejWypowiedziMs: 30_000, limitKontynuacjiMs: 12_000, limitPauzyMs: 4_000 }
        this.ustawCzesciowaWypowiedz('')
        this.rozpoznawanieAktywne = true
        const wypowiedz = await this.zaleznosci.glos.rozpoznaj(
          kontynuacja ? parametry.limitKontynuacjiMs : parametry.limitPierwszejWypowiedziMs,
          parametry.limitPauzyMs,
          (tekst) => {
            if (!this.czyAktualna(numer) || !this.rozpoznawanieAktywne) return
            this.ustawStan('mowiUzytkownik')
            this.ustawCzesciowaWypowiedz(tekst)
          },
        )
        this.rozpoznawanieAktywne = false
        if (!this.czyAktualna(numer) || !wypowiedz.trim()) break
        this.ustawCzesciowaWypowiedz('')
        this.zaleznosci.obsluga.odebranoWypowiedz(wypowiedz)
        this.ustawStan('myslenie')
        this.kontrolerOdpowiedzi = new AbortController()
        const odpowiedz = await this.zaleznosci.echo.obsluz(wypowiedz, 'stt', this.kontrolerOdpowiedzi.signal)
        this.kontrolerOdpowiedzi = undefined
        if (!this.czyAktualna(numer)) break
        this.zaleznosci.obsluga.odebranoOdpowiedz(odpowiedz)
        stanOczekiwania = odpowiedz.akcjaDoPotwierdzenia
          ? 'oczekujePotwierdzenia'
          : odpowiedz.oczekujeDoprecyzowania
            ? 'oczekujeDoprecyzowania'
            : 'oczekiwanie'
        this.ustawStan('mowienie')
        this.przerwanoMowieniePrzezWtracenie = false
        await this.zaleznosci.glos.mow(odpowiedz.tekst)
        kontynuacja = true
      } catch (blad) {
        this.rozpoznawanieAktywne = false
        if (!this.czyAktualna(numer)) return
        if (this.przerwanoMowieniePrzezWtracenie) {
          this.przerwanoMowieniePrzezWtracenie = false
          kontynuacja = true
          continue
        }
        if (czyCicheZakonczenie(blad)) break
        this.ustawCzesciowaWypowiedz('')
        this.ustawStan('blad')
        this.zaleznosci.obsluga.zglosBlad(komunikatBledu(blad))
        this.aktywna = false
        return
      }
    }
    if (this.czyAktualna(numer)) {
      this.aktywna = false
      this.rozpoznawanieAktywne = false
      this.ustawCzesciowaWypowiedz('')
      this.ustawStan('bezczynny')
    }
  }

  private czyAktualna(numer: number) {
    return this.aktywna && numer === this.numerSesji
  }

  private ustawStan(stan: StanSesjiGlosowejEcho) {
    this.stan = stan
    this.zaleznosci.obsluga.zmienStan(stan)
    this.obserwatorzyStanu.forEach((obsluga) => obsluga(stan))
  }

  private ustawCzesciowaWypowiedz(tekst: string) {
    this.zaleznosci.obsluga.odebranoCzesciowaWypowiedz?.(tekst)
  }
}
