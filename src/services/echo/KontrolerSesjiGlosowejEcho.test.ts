import { describe, expect, it, vi } from 'vitest'
import { KontrolerSesjiGlosowejEcho, type StanSesjiGlosowejEcho } from './KontrolerSesjiGlosowejEcho'
import { KonfiguracjaRozmowyEcho } from './KonfiguracjaRozmowyEcho'
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
  it('tryb spokojny zachowuje dłuższą pauzę niż szybki', () => {
    const konfiguracja = new KonfiguracjaRozmowyEcho()
    const spokojny = konfiguracja.pobierzParametryGlosu()
    konfiguracja.ustawTempo('szybki')
    const szybki = konfiguracja.pobierzParametryGlosu()

    expect(spokojny.limitPauzyMs).toBe(4_000)
    expect(szybki.limitPauzyMs).toBe(1_200)
    expect(spokojny.limitPierwszejWypowiedziMs).toBeGreaterThan(szybki.limitPierwszejWypowiedziMs)
  })

  it('pokazuje partial, ale przekazuje do agenta wyłącznie poprawioną wypowiedź finalną', async () => {
    const glos = przygotujGlos([])
    let zakonczRozpoznawanie: ((tekst: string) => void) | undefined
    let odebranoStan: ((stan: 'sluchanie' | 'mowiUzytkownik' | 'transkrypcja' | 'mowienie' | 'bargeIn', tekst?: string) => void) | undefined
    glos.rozpoznaj = vi.fn(() => new Promise<string>((rozwiaz) => { zakonczRozpoznawanie = rozwiaz }))
    glos.nasluchujStanu = vi.fn(async (obsluga) => {
      odebranoStan = obsluga
      return () => undefined
    })
    const echo = { obsluz: vi.fn(async () => odpowiedz) }
    const czesciowe: string[] = []
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo,
      cyklZycia: przygotujCyklZycia().usluga,
      obsluga: { zmienStan: vi.fn(), odebranoCzesciowaWypowiedz: (tekst) => czesciowe.push(tekst), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.inicjalizuj()
    await kontroler.rozpocznij()
    await czekajNa(() => Boolean(odebranoStan && zakonczRozpoznawanie))
    odebranoStan?.('mowiUzytkownik', 'Dodaj to jutro')

    expect(czesciowe).toEqual(['', 'Dodaj to jutro'])
    expect(echo.obsluz).not.toHaveBeenCalled()

    zakonczRozpoznawanie?.('Dodaj to jutro, nie, czekaj, jednak w piątek.')
    await czekajNa(() => echo.obsluz.mock.calls.length === 1)

    expect(echo.obsluz).toHaveBeenCalledWith('Dodaj to jutro, nie, czekaj, jednak w piątek.', 'stt', expect.any(AbortSignal))
    await kontroler.anuluj()
    odebranoStan?.('mowiUzytkownik', 'Spóźniony fragment')

    expect(czesciowe.at(-1)).toBe('')
  })

  it('nie uruchamia STT podczas inicjalizacji ani powrotu aplikacji na pierwszy plan', async () => {
    const glos = przygotujGlos([])
    const cykl = przygotujCyklZycia()
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo: { obsluz: vi.fn(async () => odpowiedz) },
      cyklZycia: cykl.usluga,
      obsluga: { zmienStan: vi.fn(), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.inicjalizuj()
    cykl.zmienStan('nieaktywny')
    cykl.zmienStan('aktywny')

    expect(glos.rozpoznaj).not.toHaveBeenCalled()
    expect(kontroler.pobierzStan()).toBe('bezczynny')
  })

  it('nie uruchamia nowego STT po anulowaniu ani po cichym końcu rozmowy', async () => {
    const brakMowy = Object.assign(new Error('Nie usłyszałem wypowiedzi.'), { code: 'BRAK_MOWY' })
    const glos = przygotujGlos([brakMowy])
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo: { obsluz: vi.fn(async () => odpowiedz) },
      cyklZycia: przygotujCyklZycia().usluga,
      obsluga: { zmienStan: vi.fn(), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.rozpocznij()
    await czekajNa(() => kontroler.pobierzStan() === 'bezczynny')
    await kontroler.anuluj()

    expect(glos.rozpoznaj).toHaveBeenCalledTimes(1)
    expect(kontroler.pobierzStan()).toBe('bezczynny')
  })

  it('ignoruje partial spóźnionej sesji podczas nowej rozmowy', async () => {
    const glos = przygotujGlos([])
    const czesciowe: string[] = []
    const obslugiCzesciowe: Array<(tekst: string) => void> = []
    glos.rozpoznaj = vi.fn((_limit, _pauza, odebranoCzesciowy) => {
      obslugiCzesciowe.push(odebranoCzesciowy)
      return new Promise<string>(() => undefined)
    })
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo: { obsluz: vi.fn(async () => odpowiedz) },
      cyklZycia: przygotujCyklZycia().usluga,
      obsluga: { zmienStan: vi.fn(), odebranoCzesciowaWypowiedz: (tekst) => czesciowe.push(tekst), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.rozpocznij()
    await czekajNa(() => obslugiCzesciowe.length === 1)
    await kontroler.ponow()
    await czekajNa(() => obslugiCzesciowe.length === 2)
    obslugiCzesciowe[0]('Stary fragment')

    expect(czesciowe.at(-1)).toBe('')
    await kontroler.anuluj()
  })

  it('kończy rozmowę po timeoutcie bez ponownego uruchomienia STT', async () => {
    const timeout = Object.assign(new Error('Przekroczono czas oczekiwania na wypowiedź.'), { code: 'TIMEOUT' })
    const glos = przygotujGlos([timeout])
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo: { obsluz: vi.fn(async () => odpowiedz) },
      cyklZycia: przygotujCyklZycia().usluga,
      obsluga: { zmienStan: vi.fn(), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.rozpocznij()
    await czekajNa(() => kontroler.pobierzStan() === 'bezczynny')

    expect(glos.rozpoznaj).toHaveBeenCalledTimes(1)
  })

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

  it('przerywa TTS i od razu rozpoczyna nowe nasłuchiwanie', async () => {
    const glos = przygotujGlos(['Pierwsze polecenie', 'Korekta'])
    const rozpoznaj = glos.rozpoznaj as ReturnType<typeof vi.fn>
    let zakonczMowienie: (() => void) | undefined
    glos.mow = vi.fn(() => new Promise<void>((rozwiaz) => { zakonczMowienie = rozwiaz }))
    glos.zatrzymajMowienie = vi.fn(async () => { zakonczMowienie?.() })
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo: { obsluz: vi.fn(async () => odpowiedz) },
      cyklZycia: przygotujCyklZycia().usluga,
      obsluga: { zmienStan: vi.fn(), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.rozpocznij()
    await czekajNa(() => kontroler.pobierzStan() === 'mowienie')
    await kontroler.przerwijIMow()
    await czekajNa(() => rozpoznaj.mock.calls.length === 2)

    expect(glos.zatrzymajMowienie).toHaveBeenCalledTimes(1)
    expect(rozpoznaj).toHaveBeenNthCalledWith(2, 30_000, 4_000, expect.any(Function))
    await kontroler.anuluj()
  })

  it('zatrzymuje TTS i zachowuje sesję, gdy Android wykryje wypowiedź użytkownika', async () => {
    const glos = przygotujGlos(['Pierwsze polecenie', 'Popraw to na jutro'])
    let odebranoStan: ((stan: 'sluchanie' | 'mowiUzytkownik' | 'transkrypcja' | 'mowienie' | 'bargeIn', tekst?: string) => void) | undefined
    let zakonczMowienie: (() => void) | undefined
    glos.nasluchujStanu = vi.fn(async (obsluga) => {
      odebranoStan = obsluga
      return () => undefined
    })
    glos.mow = vi.fn(() => new Promise<void>((_rozwiaz, odrzuc) => { zakonczMowienie = () => odrzuc(Object.assign(new Error('Wypowiedź została przerwana.'), { code: 'ANULOWANO' })) }))
    glos.zatrzymajMowienie = vi.fn(async () => { zakonczMowienie?.() })
    const echo = { obsluz: vi.fn(async () => odpowiedz) }
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo,
      cyklZycia: przygotujCyklZycia().usluga,
      obsluga: { zmienStan: vi.fn(), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.inicjalizuj()
    await kontroler.rozpocznij()
    await czekajNa(() => kontroler.pobierzStan() === 'mowienie')
    odebranoStan?.('bargeIn')
    zakonczMowienie?.()
    await czekajNa(() => (glos.rozpoznaj as ReturnType<typeof vi.fn>).mock.calls.length === 2)

    expect(glos.zatrzymajMowienie).not.toHaveBeenCalled()
    expect(echo.obsluz).toHaveBeenNthCalledWith(2, 'Popraw to na jutro', 'stt', expect.any(AbortSignal))
    await kontroler.anuluj()
  })

  it('nie zatrzymuje TTS bez potwierdzonego sygnału barge-in', async () => {
    const glos = przygotujGlos(['Pierwsze polecenie'])
    let odebranoStan: ((stan: 'sluchanie' | 'mowiUzytkownik' | 'transkrypcja' | 'mowienie' | 'bargeIn', tekst?: string) => void) | undefined
    let zakonczMowienie: (() => void) | undefined
    glos.nasluchujStanu = vi.fn(async (obsluga) => {
      odebranoStan = obsluga
      return () => undefined
    })
    glos.mow = vi.fn(() => new Promise<void>((rozwiaz) => { zakonczMowienie = rozwiaz }))
    const kontroler = new KontrolerSesjiGlosowejEcho({
      glos,
      echo: { obsluz: vi.fn(async () => odpowiedz) },
      cyklZycia: przygotujCyklZycia().usluga,
      obsluga: { zmienStan: vi.fn(), odebranoWypowiedz: vi.fn(), odebranoOdpowiedz: vi.fn(), zglosBlad: vi.fn() },
    })

    await kontroler.inicjalizuj()
    await kontroler.rozpocznij()
    await czekajNa(() => kontroler.pobierzStan() === 'mowienie')
    odebranoStan?.('mowiUzytkownik', 'Jasne, zapisałem')

    expect(glos.zatrzymajMowienie).not.toHaveBeenCalled()
    zakonczMowienie?.()
    await kontroler.anuluj()
  })
})
