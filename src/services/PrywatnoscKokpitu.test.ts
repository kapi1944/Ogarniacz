import { describe, expect, it } from 'vitest'
import { czyTrwaPracaKokpitu, regulaPrywatnosci, rozwiazPrywatnosc } from './PrywatnoscKokpitu'
import { DOMYSLNE_USTAWIENIA } from '../domain/ustawienia'
import { utworzMetadane } from '../domain/fabryki'

describe('prywatność kokpitu', () => {
  const regula = { id: 'noc', dni: [2], od: '22:00', do: '03:00', tryb: 'prywatny' as const }
  const teraz = new Date(2026, 10, 4, 2, 59)
  it('uwzględnia poprzedni dzień dla przedziału przechodzącego przez północ', () => {
    expect(regulaPrywatnosci(teraz, [regula], false).id).toBe('noc')
    expect(regulaPrywatnosci(new Date(2026, 10, 4, 3), [regula], false).tryb).toBe('publiczny')
  })
  it('odmawia ujawnienia danych po utracie uwierzytelnienia', () => {
    expect(rozwiazPrywatnosc(teraz, false, regula, { tryb: 'prywatny' })).toBe('publiczny')
  })
  it('stosuje zmianę ręczną przed grafikiem, ale wygasza ją po zmianie reguły lub czasu', () => {
    const praca = regulaPrywatnosci(teraz, [{ ...regula, tryb: 'publiczny' }], true)
    expect(praca).toEqual({ id: 'praca', tryb: 'prywatny' })
    expect(rozwiazPrywatnosc(teraz, true, praca, { tryb: 'publiczny', regula: 'praca' })).toBe('publiczny')
    expect(rozwiazPrywatnosc(teraz, true, praca, { tryb: 'publiczny', regula: 'noc' })).toBe('prywatny')
    expect(rozwiazPrywatnosc(teraz, true, praca, { tryb: 'publiczny', do: teraz.getTime() })).toBe('prywatny')
  })
  it('korzysta z wyjątków grafiku i świąt', () => {
    const harmonogram = DOMYSLNE_USTAWIENIA.harmonogram
    const sroda = new Date(2026, 10, 4, 11)
    expect(czyTrwaPracaKokpitu(sroda, harmonogram, [], [])).toBe(true)
    expect(czyTrwaPracaKokpitu(sroda, harmonogram, [{ ...utworzMetadane(), data: '2026-11-04', pracuje: false }], [])).toBe(false)
    expect(czyTrwaPracaKokpitu(new Date(2026, 10, 11, 11), harmonogram, [], [])).toBe(false)
  })
})
