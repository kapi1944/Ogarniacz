export interface OgraniczeniaPolaLiczbowego {
  min?: number | string
  max?: number | string
  krok?: number
  jednostka?: string
}

export function czyJednostkaWEtykiecie(etykieta: string, jednostka: string): boolean {
  return etykieta.toLowerCase().split(/[\s()[\],:]+/).includes(jednostka.toLowerCase())
}

export function liczbaDoTekstu(liczba: number): string {
  const [mantysa, wykladnik] = String(liczba).toLowerCase().split('e')
  if (!wykladnik) return mantysa
  const ujemna = mantysa.startsWith('-')
  const czesci = mantysa.replace('-', '').split('.')
  const cyfry = czesci.join('')
  const przecinek = czesci[0].length + Number(wykladnik)
  const tekst = przecinek <= 0 ? `0.${'0'.repeat(-przecinek)}${cyfry}`
    : przecinek >= cyfry.length ? cyfry + '0'.repeat(przecinek - cyfry.length) : `${cyfry.slice(0, przecinek)}.${cyfry.slice(przecinek)}`
  return `${ujemna ? '-' : ''}${tekst}`
}

function zapisKanoniczny(tekst: string): string {
  if (!/^-?\d+(?:[.,]\d+)?$/.test(tekst)) throw new Error('Wpisz prawidłową liczbę. Możesz użyć przecinka lub kropki.')
  const [calosc, ulamek = ''] = tekst.replace(',', '.').split('.')
  const koncowka = ulamek.replace(/0+$/, '')
  const cyfry = `${BigInt(calosc.startsWith('-') ? calosc.slice(1) : calosc)}${koncowka ? `.${koncowka}` : ''}`
  return `${tekst.startsWith('-') && cyfry !== '0' ? '-' : ''}${cyfry}`
}

export function liczbaDoModelu(tekst: string): number {
  const zapis = zapisKanoniczny(tekst)
  const liczba = Number(zapis)
  if (!Number.isFinite(liczba) || zapisKanoniczny(liczbaDoTekstu(liczba)) !== zapis) throw new Error('Liczba przekracza zakres dokładnego zapisu. Zmniejsz liczbę cyfr.')
  return liczba
}

export function bladLiczby(tekst: string, { min, max, krok }: OgraniczeniaPolaLiczbowego = {}): string {
  try {
    const liczba = liczbaDoModelu(tekst)
    if (min !== undefined && liczba < Number(String(min).replace(',', '.'))) return `Wartość nie może być mniejsza niż ${min}.`
    if (max !== undefined && liczba > Number(String(max).replace(',', '.'))) return `Wartość nie może być większa niż ${max}.`
    if (krok && krok > 0) {
      const czesci = [tekst.replace(',', '.'), min === undefined ? '0' : liczbaDoTekstu(Number(String(min).replace(',', '.'))), liczbaDoTekstu(krok)]
      const skala = Math.max(...czesci.map((czesc) => czesc.split('.')[1]?.length ?? 0))
      const [wartosc, poczatek, odstęp] = czesci.map((czesc) => {
        const [calosc, ulamek = ''] = czesc.split('.')
        return BigInt(`${calosc}${ulamek.padEnd(skala, '0')}`)
      })
      if ((wartosc - poczatek) % odstęp !== 0n) return `Wpisz wartość zgodną z krokiem ${krok}.`
    }
    return ''
  } catch (przyczyna) { return (przyczyna as Error).message }
}
