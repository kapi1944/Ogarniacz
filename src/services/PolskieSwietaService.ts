// OGARNIACZ_URLOPY_SWIETA_PL_2026_08_NODE_V2
// Ustawowe dni wolne od pracy w Polsce.
// Święta ruchome są wyliczane lokalnie i deterministycznie.

export interface PolskieSwieto {
  data: string
  nazwa: string
  ruchome: boolean
}

function iso(rok: number, miesiac: number, dzien: number): string {
  return `${rok}-${String(miesiac).padStart(2, '0')}-${String(dzien).padStart(2, '0')}`
}

function dodajDni(dataIso: string, dni: number): string {
  const [rok, miesiac, dzien] = dataIso.split('-').map(Number)
  const data = new Date(Date.UTC(rok, miesiac - 1, dzien + dni))
  return iso(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate())
}

export function dataWielkanocy(rok: number): string {
  // Algorytm Meeusa/Jonesa/Butchera dla kalendarza gregoriańskiego.
  const a = rok % 19
  const b = Math.floor(rok / 100)
  const c = rok % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const miesiac = Math.floor((h + l - 7 * m + 114) / 31)
  const dzien = ((h + l - 7 * m + 114) % 31) + 1
  return iso(rok, miesiac, dzien)
}

export function pobierzPolskieSwieta(rok: number): PolskieSwieto[] {
  const wielkanoc = dataWielkanocy(rok)

  const wynik: PolskieSwieto[] = [
    { data: iso(rok, 1, 1), nazwa: 'Nowy Rok', ruchome: false },
    { data: iso(rok, 1, 6), nazwa: 'Święto Trzech Króli', ruchome: false },
    { data: wielkanoc, nazwa: 'Niedziela Wielkanocna', ruchome: true },
    { data: dodajDni(wielkanoc, 1), nazwa: 'Poniedziałek Wielkanocny', ruchome: true },
    { data: iso(rok, 5, 1), nazwa: 'Święto Pracy', ruchome: false },
    { data: iso(rok, 5, 3), nazwa: 'Święto Konstytucji 3 Maja', ruchome: false },
    { data: dodajDni(wielkanoc, 49), nazwa: 'Zesłanie Ducha Świętego (Zielone Świątki)', ruchome: true },
    { data: dodajDni(wielkanoc, 60), nazwa: 'Boże Ciało', ruchome: true },
    { data: iso(rok, 8, 15), nazwa: 'Wniebowzięcie NMP / Święto Wojska Polskiego', ruchome: false },
    { data: iso(rok, 11, 1), nazwa: 'Wszystkich Świętych', ruchome: false },
    { data: iso(rok, 11, 11), nazwa: 'Narodowe Święto Niepodległości', ruchome: false },
    { data: iso(rok, 12, 25), nazwa: 'Boże Narodzenie', ruchome: false },
    { data: iso(rok, 12, 26), nazwa: 'Drugi dzień Bożego Narodzenia', ruchome: false },
  ]

  // Od 2025 r. 24 grudnia (Wigilia) jest ustawowym dniem wolnym.
  if (rok >= 2025) {
    wynik.push({ data: iso(rok, 12, 24), nazwa: 'Wigilia Bożego Narodzenia', ruchome: false })
  }

  return wynik.sort((a, b) => a.data.localeCompare(b.data))
}

export function pobierzPolskieSwieto(data: string): PolskieSwieto | undefined {
  const rok = Number(data.slice(0, 4))
  if (!Number.isInteger(rok)) return undefined
  return pobierzPolskieSwieta(rok).find((swieto) => swieto.data === data)
}

export function czyPolskieSwieto(data: string): boolean {
  return Boolean(pobierzPolskieSwieto(data))
}
