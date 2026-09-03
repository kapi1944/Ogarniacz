import type { AktualizacjaKontekstuEcho, MigawkaKontekstuEcho, TuraRozmowyEcho, WynikNarzedziaEcho } from './typyEcho'

const LIMIT_TUR = 12
const LIMIT_WYNIKOW = 8
const LIMIT_ENCJI = 12

export class KontekstRozmowyEcho {
  private tury: TuraRozmowyEcho[] = []
  private pominieteTury = 0
  private streszczenie?: string
  private temat?: string
  private ostatnieEncje: MigawkaKontekstuEcho['ostatnieEncje'] = []
  private ostatnieWynikiNarzedzi: WynikNarzedziaEcho[] = []
  private ostatniaAkcja?: MigawkaKontekstuEcho['ostatniaAkcja']
  private ostatniaIntencja?: string
  private oczekujacaAkcja?: MigawkaKontekstuEcho['oczekujacaAkcja']
  private oczekujaceDoprecyzowanie?: MigawkaKontekstuEcho['oczekujaceDoprecyzowanie']
  private wartosciDomyslne: MigawkaKontekstuEcho['wartosciDomyslne'] = []
  private nierozwiazanePytanie?: string
  private odniesieniaCzasowe: string[] = []

  dodajTure(rola: TuraRozmowyEcho['rola'], tresc: string): void {
    this.tury.push({ rola, tresc, znacznikCzasu: new Date().toISOString() })
    if (this.tury.length > LIMIT_TUR) {
      this.tury.shift()
      this.pominieteTury += 1
    }
  }

  dodajWynikNarzedzia(wynik: WynikNarzedziaEcho): void {
    this.ostatnieWynikiNarzedzi = [...this.ostatnieWynikiNarzedzi, wynik].slice(-LIMIT_WYNIKOW)
  }

  ustawOstatniaAkcje(narzedzie: string, argumenty: unknown): void {
    this.ostatniaAkcja = { narzedzie, argumenty }
  }

  zastosujAktualizacje(aktualizacja?: AktualizacjaKontekstuEcho): void {
    if (!aktualizacja) return
    if (aktualizacja.temat !== undefined) this.temat = aktualizacja.temat
    if (aktualizacja.ostatniaIntencja !== undefined) this.ostatniaIntencja = aktualizacja.ostatniaIntencja
    if (aktualizacja.oczekujacaAkcja !== undefined) this.oczekujacaAkcja = aktualizacja.oczekujacaAkcja ?? undefined
    if (aktualizacja.oczekujaceDoprecyzowanie !== undefined) this.oczekujaceDoprecyzowanie = aktualizacja.oczekujaceDoprecyzowanie ?? undefined
    if (aktualizacja.wartosciDomyslne !== undefined) this.wartosciDomyslne = [...aktualizacja.wartosciDomyslne]
  }

  ustawTemat(temat?: string): void { this.temat = temat }
  ustawNierozwiazanePytanie(pytanie?: string): void { this.nierozwiazanePytanie = pytanie }
  ustawOdniesieniaCzasowe(odniesienia: string[]): void { this.odniesieniaCzasowe = odniesienia.slice(-6) }
  ustawStreszczenie(streszczenie?: string): void { this.streszczenie = streszczenie }

  ustawEncje(encje: MigawkaKontekstuEcho['ostatnieEncje']): void {
    this.ostatnieEncje = encje.slice(-LIMIT_ENCJI)
  }

  migawka(): MigawkaKontekstuEcho {
    const informacjaOLimicie = this.pominieteTury > 0
      ? `Pominięto ${this.pominieteTury} starszych tur. ${this.streszczenie ?? 'Brak zatwierdzonego streszczenia.'}`
      : this.streszczenie
    return {
      tury: [...this.tury],
      streszczenie: informacjaOLimicie,
      temat: this.temat,
      ostatnieEncje: [...this.ostatnieEncje],
      ostatnieWynikiNarzedzi: [...this.ostatnieWynikiNarzedzi],
      ostatniaAkcja: this.ostatniaAkcja,
      ostatniaIntencja: this.ostatniaIntencja,
      oczekujacaAkcja: this.oczekujacaAkcja,
      oczekujaceDoprecyzowanie: this.oczekujaceDoprecyzowanie,
      wartosciDomyslne: [...this.wartosciDomyslne],
      nierozwiazanePytanie: this.nierozwiazanePytanie,
      odniesieniaCzasowe: [...this.odniesieniaCzasowe],
    }
  }
}
