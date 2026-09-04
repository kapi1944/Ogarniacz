import { describe, expect, it, vi } from 'vitest'
import { KontrolerSesjiGlosowejEcho, type StanSesjiGlosowejEcho } from './KontrolerSesjiGlosowejEcho'
import type { UslugaGlosuEcho } from '../../platform/GlosEchoService'
import type { PlatformaOgarniacza } from '../../platform/typy'

const odpowiedz = { tekst: 'Jasne, zapisałem.', ryzyko: 'niskie' as const, tryb: 'ograniczony_lokalny' as const }

async function czekajNa(warunek: () => boolean) {
  for (let proba = 0; proba < 20 && !warunek(); proba += 1) await new Promise((rozwiaz) => setTimeout(rozwiaz, 0))
  expect(warunek()).toBe(true)
}

function przygotujGlos(wypowiedzi: Array<string | Error>) {
  let indeks = 0
  return {
    natywna: true,
    sprawdzDostepnosc: vi.fn(),
    rozpoznaj: vi.fn(async () => {
      const wynik = wypowiedzi[indeks++]
      if (wynik instanceof Error) throw wynik
      return wynik
    }),
    anulujRozpoznawanie: vi.fn(async () => undefined),
    mow: vi.fn(async () => undefined),
    zatrzymajMowienie: vi.fn(async () => undefined),
    nasluchujStanu: vi.fn(async () => () => undefined),
  } as unknown as UslugaGlosuEcho
}

function przygotujCyklZycia() {
  let obsluga: ((stan: 'aktywny' | 'nieaktywny') => void) | undefined
  return {
    usluga: {
      pobierzStan: vi.fn(async () => 'aktywny' as const),
      nasluchuj: vi.fn(async (nowaObsluga) => {
        obsluga = nowaObsluga
        return () => undefined
      }),
    } as PlatformaOgarniacza['cyklZycia'],
    zmienStan: (stan: 'aktywny' | 'nieaktywny') => obsluga?.(stan),
  }
}

describe('KontrolerSesjiGlosowejEcho', () => {
  it('prowadzi rozmowę przez centralny agent i kończy cicho po oknie follow-up', async () => {
    const brakMowy = Object.assign(new Error('Nie usłyszałem wypowiedzi.'), { code: 'BRAK_MOWY' })
    const glos = przygotujGlos(['Przypomnij mi jutro po pracy.', brakMowy])
    const echo = { obsluz: vi.fn(async () => odpowiedz) }
    const stany: StanSesjiGlosowejEcho[] = []
    const wypowiedzi: string[] = []
    const odpowiedzi: string[] = []
    const cykl = przygotujCyklZycia()
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo,
      cyklZycia: cykl.usluga,
      obsluga: {
        zmienStan: (stan) => stany.push(stan),
        odebranoWypowiedz: (tekst) => wypowiedzi.push(tekst),
        odebranoOdpowiedz: (wynik) => odpowiedzi.push(wynik.tekst),
        zglosBlad: vi.fn(),
      },
    })

    await kontroler.inicjalizuj()
    await kontroler.rozpocznij()
    await czekajNa(() => kontroler.pobierzStan() === 'bezczynny')

    expect(echo.obsluz).toHaveBeenCalledWith('Przypomnij mi jutro po pracy.', 'stt', expect.any(AbortSignal))
    expect(wypowiedzi).toEqual(['Przypomnij mi jutro po pracy.'])
    expect(odpowiedzi).toEqual(['Jasne, zapisałem.'])
    expect(glos.mow).toHaveBeenCalledWith('Jasne, zapisałem.')
    expect(stany).toEqual(expect.arrayContaining(['sluchanie', 'myslenie', 'mowienie', 'oczekiwanie', 'bezczynny']))
  })

  it('anuluje STT i TTS po przejściu aplikacji do tła', async () => {
    const glos = przygotujGlos([new Promise<string>(() => undefined) as unknown as string])
    glos.rozpoznaj = vi.fn(() => new Promise<string>(() => undefined))
    const cykl = przygotujCyklZycia()
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo: { obsluz: vi.fn(async () => odpowiedz) },
      cyklZycia: cykl.usluga,
      obsluga: { zmienStan: vi.fn(), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.inicjalizuj()
    await kontroler.rozpocznij()
    cykl.zmienStan('nieaktywny')
    await czekajNa(() => kontroler.pobierzStan() === 'bezczynny')

    expect(glos.anulujRozpoznawanie).toHaveBeenCalled()
    expect(glos.zatrzymajMowienie).toHaveBeenCalled()
  })

  it('blokuje równoległą sesję przez anulowanie poprzedniej', async () => {
    const glos = przygotujGlos([new Error('Nie usłyszałem wypowiedzi.'), new Error('Nie usłyszałem wypowiedzi.')])
    glos.rozpoznaj = vi.fn(() => new Promise<string>(() => undefined))
    const cykl = przygotujCyklZycia()
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo: { obsluz: vi.fn(async () => odpowiedz) },
      cyklZycia: cykl.usluga,
      obsluga: { zmienStan: vi.fn(), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.rozpocznij()
    await kontroler.przerwijIMow()

    expect(glos.anulujRozpoznawanie).toHaveBeenCalledTimes(1)
    expect(glos.zatrzymajMowienie).toHaveBeenCalledTimes(1)
    await kontroler.anuluj()
  })
})
