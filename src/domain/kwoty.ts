export const WALUTY = [
  { kod: 'PLN', nazwa: 'złoty polski' }, { kod: 'EUR', nazwa: 'euro' },
  { kod: 'USD', nazwa: 'dolar amerykański' }, { kod: 'GBP', nazwa: 'funt brytyjski' },
  { kod: 'CHF', nazwa: 'frank szwajcarski' }, { kod: 'CZK', nazwa: 'korona czeska' },
  { kod: 'UAH', nazwa: 'hrywna ukraińska' },
] as const

export interface KwotaZWaluta { kwota: string; waluta: string }

// Obsługiwane waluty mają po dwie cyfry jednostki ułamkowej.
export function normalizujKwote(tekst: string, waluta = 'PLN'): string {
  if (!WALUTY.some((pozycja) => pozycja.kod === waluta)) throw new Error('Wybierz obsługiwaną walutę.')
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(tekst)) throw new Error('Wpisz prawidłową kwotę, z maksymalnie dwiema cyframi po przecinku.')
  const [calosc, ulamek = ''] = tekst.replace(',', '.').split('.')
  return `${BigInt(calosc) === 0n && tekst.startsWith('-') ? '-0' : BigInt(calosc).toString()}.${ulamek.padEnd(2, '0')}`
}

export function kwotaDoModelu(tekst: string, waluta = 'PLN'): number {
  const kwota = normalizujKwote(tekst, waluta)
  const liczba = Number(kwota)
  if (!Number.isFinite(liczba) || normalizujKwote(String(liczba), waluta) !== kwota.replace(/^-0\.00$/, '0.00')) throw new Error('Kwota jest zbyt duża do dokładnego zapisu w tym formularzu.')
  return liczba
}

export function odczytajKwoteFormularza(tekst: string): KwotaZWaluta {
  if (!tekst.startsWith('{')) return { kwota: tekst, waluta: 'PLN' }
  const wartosc = JSON.parse(tekst) as KwotaZWaluta
  if (typeof wartosc.kwota !== 'string' || typeof wartosc.waluta !== 'string') throw new Error('Nieprawidłowy zapis kwoty i waluty.')
  return wartosc
}

function rozlozKwote(kwota: number) {
  if (!Number.isFinite(kwota)) throw new Error('Kwota musi być skończoną liczbą.')
  const [mantysa, wykladnik = '0'] = String(kwota).toLowerCase().split('e')
  const skala = (mantysa.split('.')[1]?.length ?? 0) - Number(wykladnik)
  return { liczba: BigInt(mantysa.replace('.', '')), skala }
}

// Sumowanie dziesiętnych zapisów przez BigInt, również dla historycznych liczb.
export function sumaKwot(kwoty: readonly number[]): number {
  const czesci = kwoty.map(rozlozKwote)
  const skala = czesci.reduce((wynik, czesc) => Math.max(wynik, czesc.skala), 0)
  const suma = czesci.reduce((wynik, czesc) => wynik + czesc.liczba * 10n ** BigInt(skala - czesc.skala), 0n)
  const cyfry = (suma < 0n ? -suma : suma).toString().padStart(skala + 1, '0')
  const wynik = Number(`${suma < 0n ? '-' : ''}${skala ? `${cyfry.slice(0, -skala)}.${cyfry.slice(-skala)}` : cyfry}`)
  if (!Number.isFinite(wynik)) throw new Error('Suma kwot przekracza obsługiwany zakres.')
  const odczyt = rozlozKwote(wynik)
  const wspolnaSkala = Math.max(skala, odczyt.skala)
  if (odczyt.liczba * 10n ** BigInt(wspolnaSkala - odczyt.skala) !== suma * 10n ** BigInt(wspolnaSkala - skala)) throw new Error('Suma kwot przekracza zakres dokładnego zapisu liczbowego.')
  return wynik
}
