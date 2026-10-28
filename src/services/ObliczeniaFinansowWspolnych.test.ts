import { describe, expect, it } from 'vitest'
import type { PodzialKosztuWspolnego, WydatekDoObliczenWspolnych, ZwrotDoObliczenWspolnych } from '../domain/finanseWspolne'
import { WALUTY } from '../domain/kwoty'
import { groszeNaKwote, kwotaNaGrosze, obliczPodzialKosztu, obliczRozliczenieWspolne, obliczWydatekWspolny } from './ObliczeniaFinansowWspolnych'

const osoby = ['a', 'b', 'c', 'd']
const poRowno = (uczestnicyIds: readonly string[] = ['a', 'b']): PodzialKosztuWspolnego => ({ metoda: 'po_rowno', uczestnicyIds })
const wydatek = (zmiany: Partial<WydatekDoObliczenWspolnych> = {}): WydatekDoObliczenWspolnych => ({ id: 'zakup', kwotaGrosze: 4000, waluta: 'PLN', finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 4000 }], podzial: poRowno(), ...zmiany })
const zwrot = (kwotaGrosze: number, id = 'zwrot'): ZwrotDoObliczenWspolnych => ({ id, kwotaGrosze, waluta: 'PLN', odUczestnikaId: 'b', doUczestnikaId: 'a' })
const przelew = (odUczestnikaId: string, doUczestnikaId: string, kwotaGrosze: number) => ({ odUczestnikaId, doUczestnikaId, kwotaGrosze })

describe('kwoty w najmniejszych jednostkach', () => {
  it.each(WALUTY.map((waluta) => waluta.kod))('korzysta z waluty %s obsługiwanej przez F3 bez mnożenia zmiennoprzecinkowego', (waluta) => {
    expect(kwotaNaGrosze('125,50', waluta)).toBe(12550)
    expect(groszeNaKwote(12550, waluta)).toBe('125.50')
    expect(kwotaNaGrosze('0.29', waluta)).toBe(29)
    expect(kwotaNaGrosze('-0,01', waluta)).toBe(-1)
    expect(groszeNaKwote(-1, waluta)).toBe('-0.01')
    expect(kwotaNaGrosze(groszeNaKwote(Number.MAX_SAFE_INTEGER, waluta), waluta)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it.each(['NaN', 'Infinity', '1e3', '0.001', '1,', '', '1 000', '90071992547409.92'])('odrzuca tekst %s', (tekst) => {
    expect(() => kwotaNaGrosze(tekst)).toThrow()
  })

  it('odrzuca nieobsługiwaną walutę i niedokładne jednostki', () => {
    expect(() => kwotaNaGrosze('1', 'JPY')).toThrow('walutę')
    expect(() => groszeNaKwote(100, 'JPY')).toThrow('walutę')
    expect(() => groszeNaKwote(0.1)).toThrow()
    expect(groszeNaKwote(0)).toBe('0.00')
  })
})

describe('podziały i finansowanie', () => {
  it('dzieli 40 zł po równo przy jednym finansującym i nie wykonuje proponowanego przelewu', () => {
    const wynik = obliczRozliczenieWspolne(['a', 'b'], 'PLN', [wydatek()])
    expect(wynik.sumaWydatkowGrosze).toBe(4000)
    expect(wynik.propozycjePrzelewow).toEqual([przelew('b', 'a', 2000)])
    expect(wynik.bilanse).toEqual([
      { uczestnikId: 'a', wylozoneGrosze: 4000, kosztGrosze: 2000, bilansGrosze: 2000, doOtrzymaniaGrosze: 2000, doOddaniaGrosze: 0, wyslaneZwrotyGrosze: 0, otrzymaneZwrotyGrosze: 0 },
      { uczestnikId: 'b', wylozoneGrosze: 0, kosztGrosze: 2000, bilansGrosze: -2000, doOtrzymaniaGrosze: 0, doOddaniaGrosze: 2000, wyslaneZwrotyGrosze: 0, otrzymaneZwrotyGrosze: 0 },
    ])
  })

  it.each([[4000, 2000, 2000, 0], [6000, 4000, 2000, 1000], [8200, 5200, 3000, 1100]])('finansowanie niezależne od kosztu: %i / %i / %i', (kwotaGrosze, pierwsza, druga, naleznosc) => {
    const wynik = obliczRozliczenieWspolne(['a', 'b'], 'PLN', [wydatek({ kwotaGrosze, finansujacy: [{ uczestnikId: 'a', kwotaGrosze: pierwsza }, { uczestnikId: 'b', kwotaGrosze: druga }] })])
    expect(wynik.propozycjePrzelewow).toEqual(naleznosc ? [przelew('b', 'a', naleznosc)] : [])
  })

  it('dzieli 80 zł na 50/30 zł przy finansowaniu przez drugą osobę', () => {
    const wynik = obliczRozliczenieWspolne(['a', 'b'], 'PLN', [wydatek({ kwotaGrosze: 8000, finansujacy: [{ uczestnikId: 'b', kwotaGrosze: 8000 }], podzial: { metoda: 'kwotowo', pozycje: [{ uczestnikId: 'a', kwotaGrosze: 5000 }, { uczestnikId: 'b', kwotaGrosze: 3000 }] } })])
    expect(wynik.propozycjePrzelewow).toEqual([przelew('a', 'b', 5000)])
  })

  it('dzieli 800 zł przy udziałach 2:2:2:1 metodą największych reszt', () => {
    expect(obliczPodzialKosztu(80000, { metoda: 'udzialy', pozycje: osoby.map((uczestnikId, indeks) => ({ uczestnikId, udzialy: indeks === 3 ? 1 : 2 })) })).toEqual([
      { uczestnikId: 'a', kwotaGrosze: 22857 }, { uczestnikId: 'b', kwotaGrosze: 22857 }, { uczestnikId: 'c', kwotaGrosze: 22857 }, { uczestnikId: 'd', kwotaGrosze: 11429 },
    ])
  })

  it('wyznacza największe długi i należności, rozstrzygając remisy przez ID', () => {
    const wynik = obliczRozliczenieWspolne(osoby, 'PLN', [wydatek({ kwotaGrosze: 80000, finansujacy: [50000, 20000, 10000, 0].map((kwotaGrosze, indeks) => ({ uczestnikId: osoby[indeks], kwotaGrosze })), podzial: poRowno(osoby) })])
    expect(wynik.propozycjePrzelewow).toEqual([przelew('d', 'a', 20000), przelew('c', 'a', 10000)])
    const remisy = obliczRozliczenieWspolne(osoby, 'PLN', [wydatek({ finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 2000 }, { uczestnikId: 'b', kwotaGrosze: 2000 }], podzial: poRowno(osoby) })])
    expect(remisy.propozycjePrzelewow).toEqual([przelew('c', 'a', 1000), przelew('d', 'b', 1000)])
  })

  it('rozdziela procenty jako całkowite setne procenta i dopuszcza udział zerowy', () => {
    expect(obliczPodzialKosztu(101, { metoda: 'procentowo', pozycje: [{ uczestnikId: 'b', procentSetne: 7500 }, { uczestnikId: 'a', procentSetne: 2500 }, { uczestnikId: 'c', procentSetne: 0 }] })).toEqual([
      { uczestnikId: 'a', kwotaGrosze: 25 }, { uczestnikId: 'b', kwotaGrosze: 76 }, { uczestnikId: 'c', kwotaGrosze: 0 },
    ])
  })

  it('przydziela grosz tej samej osobie niezależnie od kolejności, bez mutacji wejścia', () => {
    for (const kolejnosc of [['a', 'b', 'c'], ['c', 'a', 'b'], ['b', 'c', 'a']]) {
      const podzial = poRowno(Object.freeze(kolejnosc))
      expect(obliczPodzialKosztu(1, podzial)).toEqual([{ uczestnikId: 'a', kwotaGrosze: 1 }, { uczestnikId: 'b', kwotaGrosze: 0 }, { uczestnikId: 'c', kwotaGrosze: 0 }])
    }
  })

  it('wyklucza finansującego z kosztu i nie dopisuje nowych uczestników do starego podziału', () => {
    const zakup = wydatek({ podzial: poRowno(['b', 'c']) })
    const wynik = obliczRozliczenieWspolne(osoby, 'PLN', [zakup])
    expect(wynik.bilanse.find((osoba) => osoba.uczestnikId === 'a')).toMatchObject({ kosztGrosze: 0, wylozoneGrosze: 4000 })
    expect(wynik.bilanse.find((osoba) => osoba.uczestnikId === 'd')).toMatchObject({ kosztGrosze: 0 })
    expect(wynik.propozycjePrzelewow).toEqual([przelew('b', 'a', 2000), przelew('c', 'a', 2000)])
  })

  it('kompensuje kilka wzajemnych zobowiązań i zachowuje wynik po zmianie kolejności danych', () => {
    const zakupy = [wydatek(), wydatek({ id: 'drugi', kwotaGrosze: 6000, finansujacy: [{ uczestnikId: 'b', kwotaGrosze: 6000 }], podzial: poRowno(['b', 'c']) })]
    const kopia = structuredClone(zakupy)
    const wynik = obliczRozliczenieWspolne(osoby, 'PLN', zakupy)
    expect(wynik.propozycjePrzelewow).toEqual([przelew('c', 'a', 2000), przelew('c', 'b', 1000)])
    expect(obliczRozliczenieWspolne([...osoby].reverse(), 'PLN', [...zakupy].reverse())).toEqual(wynik)
    expect(zakupy).toEqual(kopia)
  })

  it('zachowuje niezmienniki dla różnych kwot, wag i kolejności, także przy dużych iloczynach', () => {
    for (const kwotaGrosze of [1, 2, 3, 7, 99, 101, 80000, Number.MAX_SAFE_INTEGER]) {
      for (const wagi of [[1, 1, 1, 1], [0, 2, 3, 0], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1, 0]]) {
        const pozycje = osoby.map((uczestnikId, indeks) => ({ uczestnikId, udzialy: wagi[indeks] }))
        const podzial = obliczPodzialKosztu(kwotaGrosze, { metoda: 'udzialy', pozycje })
        expect(podzial.reduce((suma, pozycja) => suma + BigInt(pozycja.kwotaGrosze), 0n)).toBe(BigInt(kwotaGrosze))
        expect(obliczPodzialKosztu(kwotaGrosze, { metoda: 'udzialy', pozycje: [...pozycje].reverse() })).toEqual(podzial)
        const wynik = obliczRozliczenieWspolne(osoby, 'PLN', [wydatek({ kwotaGrosze, finansujacy: [{ uczestnikId: 'a', kwotaGrosze }], podzial: { metoda: 'udzialy', pozycje } })])
        expect(wynik.bilanse.reduce((suma, osoba) => suma + BigInt(osoba.bilansGrosze), 0n)).toBe(0n)
        expect(wynik.propozycjePrzelewow.length).toBeLessThanOrEqual(osoby.length - 1)
        const poZwrotach = obliczRozliczenieWspolne(osoby, 'PLN', [wydatek({ kwotaGrosze, finansujacy: [{ uczestnikId: 'a', kwotaGrosze }], podzial: { metoda: 'udzialy', pozycje } })], wynik.propozycjePrzelewow.map((propozycja, indeks) => ({ ...propozycja, id: String(indeks), waluta: 'PLN' })))
        expect(poZwrotach.bilanse.every((osoba) => osoba.bilansGrosze === 0)).toBe(true)
        expect(poZwrotach.propozycjePrzelewow).toEqual([])
      }
    }
  })
})

describe('faktyczne zwroty', () => {
  const zakup = wydatek({ kwotaGrosze: 20000, finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 20000 }] })

  it('oblicza dług 100 zł → zwrot 60 zł → pozostało 40 zł → zwrot 40 zł → zero', () => {
    const czesciowy = obliczRozliczenieWspolne(osoby, 'PLN', [zakup], [zwrot(6000)])
    expect(czesciowy.propozycjePrzelewow).toEqual([przelew('b', 'a', 4000)])
    expect(czesciowy.sumaWydatkowGrosze).toBe(20000)
    const pelny = obliczRozliczenieWspolne(osoby, 'PLN', [zakup], [zwrot(6000), zwrot(4000, 'drugi')])
    expect(pelny.propozycjePrzelewow).toEqual([])
    expect(pelny.bilanse.every((osoba) => osoba.bilansGrosze === 0)).toBe(true)
    expect(pelny.sumaWydatkowGrosze).toBe(20000)
    expect(obliczRozliczenieWspolne(osoby, 'PLN', [zakup]).propozycjePrzelewow).toEqual([przelew('b', 'a', 10000)])
  })

  it('uwzględnia nadpłatę, zły kierunek oraz zmianę/usunięcie wydatku bez usuwania zwrotu', () => {
    expect(obliczRozliczenieWspolne(osoby, 'PLN', [zakup], [zwrot(12000)]).propozycjePrzelewow).toEqual([przelew('a', 'b', 2000)])
    expect(obliczRozliczenieWspolne(osoby, 'PLN', [zakup], [{ ...zwrot(6000), odUczestnikaId: 'a', doUczestnikaId: 'b' }]).propozycjePrzelewow).toEqual([przelew('b', 'a', 16000)])
    expect(obliczRozliczenieWspolne(osoby, 'PLN', [wydatek()], [zwrot(6000)]).propozycjePrzelewow).toEqual([przelew('a', 'b', 4000)])
    expect(obliczRozliczenieWspolne(osoby, 'PLN', [], [zwrot(6000)]).propozycjePrzelewow).toEqual([przelew('a', 'b', 6000)])
  })

  it('odrzuca powtórzone ID, ale liczy dwa osobne prawdziwe przelewy', () => {
    expect(() => obliczRozliczenieWspolne(osoby, 'PLN', [zakup], [zwrot(6000), zwrot(6000)])).toThrow('niepowtarzalne')
    const przelewy = [zwrot(6000), zwrot(6000, 'drugi')]
    const wynik = obliczRozliczenieWspolne(osoby, 'PLN', [zakup], przelewy)
    expect(wynik.propozycjePrzelewow).toEqual([przelew('a', 'b', 2000)])
    expect(obliczRozliczenieWspolne([...osoby].reverse(), 'PLN', [zakup], [...przelewy].reverse())).toEqual(wynik)
  })
})

describe('walidacja', () => {
  it.each([0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('odrzuca wartość wydatku %s', (kwotaGrosze) => {
    expect(() => obliczWydatekWspolny(osoby, wydatek({ kwotaGrosze }))).toThrow()
  })

  it.each<PodzialKosztuWspolnego>([
    poRowno([]), poRowno(['a', 'a']), poRowno([' ']),
    { metoda: 'kwotowo', pozycje: [{ uczestnikId: 'a', kwotaGrosze: 3999 }] },
    { metoda: 'kwotowo', pozycje: [{ uczestnikId: 'a', kwotaGrosze: -1 }, { uczestnikId: 'b', kwotaGrosze: 4001 }] },
    { metoda: 'procentowo', pozycje: [{ uczestnikId: 'a', procentSetne: 9999 }] },
    { metoda: 'procentowo', pozycje: [{ uczestnikId: 'a', procentSetne: 10001 }] },
    { metoda: 'procentowo', pozycje: [{ uczestnikId: 'a', procentSetne: -1 }, { uczestnikId: 'b', procentSetne: 10001 }] },
    { metoda: 'procentowo', pozycje: [{ uczestnikId: 'a', procentSetne: 9999.5 }] },
    { metoda: 'udzialy', pozycje: [{ uczestnikId: 'a', udzialy: 0 }] },
    { metoda: 'udzialy', pozycje: [{ uczestnikId: 'a', udzialy: 0.5 }] },
    { metoda: 'udzialy', pozycje: [{ uczestnikId: 'a', udzialy: Infinity }] },
  ])('odrzuca błędny podział %#', (podzial) => {
    expect(() => obliczPodzialKosztu(4000, podzial)).toThrow()
  })

  it('odrzuca niepełne, ujemne, ułamkowe i powtórzone finansowanie oraz nieznane osoby', () => {
    for (const finansujacy of [[], [{ uczestnikId: 'a', kwotaGrosze: 3999 }], [{ uczestnikId: 'a', kwotaGrosze: -1 }, { uczestnikId: 'b', kwotaGrosze: 4001 }], [{ uczestnikId: 'a', kwotaGrosze: 0.5 }, { uczestnikId: 'b', kwotaGrosze: 3999.5 }], [{ uczestnikId: 'a', kwotaGrosze: 2000 }, { uczestnikId: 'a', kwotaGrosze: 2000 }], [{ uczestnikId: 'obca', kwotaGrosze: 4000 }]]) {
      expect(() => obliczWydatekWspolny(osoby, wydatek({ finansujacy }))).toThrow()
    }
    expect(() => obliczWydatekWspolny(osoby, wydatek({ podzial: poRowno(['obca']) }))).toThrow('nie należy')
    expect(() => obliczRozliczenieWspolne(['a', 'a'], 'PLN', [])).toThrow()
    expect(() => obliczRozliczenieWspolne(osoby, 'PLN', [wydatek(), wydatek()])).toThrow()
    expect(obliczRozliczenieWspolne([], 'PLN', []).bilanse).toEqual([])
  })

  it('odrzuca niepoprawne zwroty i mieszane waluty bez przewalutowania', () => {
    for (const niepoprawny of [zwrot(0), zwrot(-1), zwrot(0.1), zwrot(Infinity), { ...zwrot(100), doUczestnikaId: 'b' }, { ...zwrot(100), doUczestnikaId: 'obca' }, { ...zwrot(100), waluta: 'EUR' }]) {
      expect(() => obliczRozliczenieWspolne(osoby, 'PLN', [wydatek()], [niepoprawny])).toThrow()
    }
    expect(() => obliczRozliczenieWspolne(osoby, 'PLN', [wydatek({ waluta: 'EUR' })])).toThrow('Waluta')
    expect(() => obliczRozliczenieWspolne(osoby, 'XXX', [])).toThrow('walutę')
  })

  it('odrzuca przekroczenie zakresu sum kosztów, finansowania i zwrotów', () => {
    const duzy = wydatek({ kwotaGrosze: Number.MAX_SAFE_INTEGER, finansujacy: [{ uczestnikId: 'a', kwotaGrosze: Number.MAX_SAFE_INTEGER }] })
    expect(() => obliczRozliczenieWspolne(osoby, 'PLN', [duzy, { ...duzy, id: 'drugi' }])).toThrow('zakres')
    expect(() => obliczRozliczenieWspolne(osoby, 'PLN', [], [zwrot(Number.MAX_SAFE_INTEGER), zwrot(1, 'drugi')])).toThrow('zakres')
    expect(() => obliczWydatekWspolny(osoby, wydatek({ finansujacy: [{ uczestnikId: 'a', kwotaGrosze: Number.MAX_SAFE_INTEGER }, { uczestnikId: 'b', kwotaGrosze: Number.MAX_SAFE_INTEGER }] }))).toThrow('Suma finansowania')
  })
})
