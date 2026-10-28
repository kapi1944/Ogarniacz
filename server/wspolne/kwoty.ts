export const WALUTY = [
  { kod: 'PLN', nazwa: 'złoty polski' }, { kod: 'EUR', nazwa: 'euro' },
  { kod: 'USD', nazwa: 'dolar amerykański' }, { kod: 'GBP', nazwa: 'funt brytyjski' },
  { kod: 'CHF', nazwa: 'frank szwajcarski' }, { kod: 'CZK', nazwa: 'korona czeska' },
  { kod: 'UAH', nazwa: 'hrywna ukraińska' },
] as const



// Obsługiwane waluty mają po dwie cyfry jednostki ułamkowej.
export function normalizujKwote(tekst: string, waluta = 'PLN'): string {
  if (!WALUTY.some((pozycja) => pozycja.kod === waluta)) throw new Error('Wybierz obsługiwaną walutę.')
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(tekst)) throw new Error('Wpisz prawidłową kwotę, z maksymalnie dwiema cyframi po przecinku.')
  const [calosc, ulamek = ''] = tekst.replace(',', '.').split('.')
  return `${BigInt(calosc) === 0n && tekst.startsWith('-') ? '-0' : BigInt(calosc).toString()}.${ulamek.padEnd(2, '0')}`
}
