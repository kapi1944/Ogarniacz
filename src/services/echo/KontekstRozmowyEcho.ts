import type { MigawkaKontekstuEcho, TuraRozmowyEcho, WynikNarzedziaEcho } from './typyEcho'

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
      nierozwiazanePytanie: this.nierozwiazanePytanie,
      odniesieniaCzasowe: [...this.odniesieniaCzasowe],
    }
  }
}
