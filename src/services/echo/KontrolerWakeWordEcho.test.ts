import { describe, expect, it, vi } from 'vitest'
import { KontrolerWakeWordEcho } from './KontrolerWakeWordEcho'
import type { SilnikWakeWordEcho, ZdarzeniaSilnikaWakeWordEcho } from './SilnikWakeWordEcho'
import type { StanSesjiGlosowejEcho } from './KontrolerSesjiGlosowejEcho'

async function poczekaj() {
  await new Promise((rozwiaz) => setTimeout(rozwiaz, 0))
}

function przygotujZaleznosci() {
  let zdarzeniaSilnika: ZdarzeniaSilnikaWakeWordEcho | undefined
  let obslugaCyklu: ((stan: 'aktywny' | 'nieaktywny') => void) | undefined
  let obslugaSesji: ((stan: StanSesjiGlosowejEcho) => void) | undefined
  let stanSesji: StanSesjiGlosowejEcho = 'bezczynny'
  const silnik: SilnikWakeWordEcho = {
    sprawdzStan: vi.fn(async () => ({ stan: 'zatrzymany' as const })),
    uruchom: vi.fn(async (noweZdarzenia) => {
      zdarzeniaSilnika = noweZdarzenia
      noweZdarzenia.zmienStan('aktywny')
    }),
    zatrzymaj: vi.fn(async () => undefined),
  }
  const rozpocznij = vi.fn(async () => {
    stanSesji = 'sluchanie'
    obslugaSesji?.('sluchanie')
  })
  const kontroler = new KontrolerWakeWordEcho(silnik, {
    rozpocznij,
    pobierzStan: () => stanSesji,
    nasluchujStanu: (obsluga) => { obslugaSesji = obsluga; return () => { obslugaSesji = undefined } },
  }, {
    pobierzStan: vi.fn(async () => 'aktywny' as const),
    nasluchuj: vi.fn(async (obsluga) => { obslugaCyklu = obsluga; return () => { obslugaCyklu = undefined } }),
  })

  return {
    kontroler,
    silnik,
    rozpocznij,
    wykryj: () => zdarzeniaSilnika?.wykrytoFraze(),
    zmienCykl: (stan: 'aktywny' | 'nieaktywny') => obslugaCyklu?.(stan),
    zmienStanSesji: (stan: StanSesjiGlosowejEcho) => { stanSesji = stan; obslugaSesji?.(stan) },
  }
}

describe('KontrolerWakeWordEcho', () => {
  it('uruchamia tylko jedną instancję lokalnego nasłuchu', async () => {
    const { kontroler, silnik } = przygotujZaleznosci()

    await Promise.all([kontroler.uruchom(), kontroler.uruchom()])

    expect(silnik.uruchom).toHaveBeenCalledOnce()
    expect(kontroler.pobierzStan()).toBe('aktywny')
  })

  it('po wykryciu frazy zwalnia keyword spotter i uruchamia istniejącą sesję STT', async () => {
    const { kontroler, silnik, rozpocznij, wykryj } = przygotujZaleznosci()
    await kontroler.uruchom()

    wykryj()
    await poczekaj()

    expect(silnik.zatrzymaj).toHaveBeenCalledOnce()
    expect(rozpocznij).toHaveBeenCalledOnce()
  })

  it('wznawia wake word dopiero po zakończeniu sesji rozmowy', async () => {
    const { kontroler, silnik, wykryj, zmienStanSesji } = przygotujZaleznosci()
    await kontroler.uruchom()
    wykryj()
    await poczekaj()

    expect(silnik.uruchom).toHaveBeenCalledTimes(1)
    zmienStanSesji('bezczynny')
    await poczekaj()

    expect(silnik.uruchom).toHaveBeenCalledTimes(2)
  })

  it('zatrzymuje nasłuch w tle i wznawia go po powrocie aplikacji', async () => {
    const { kontroler, silnik, zmienCykl } = przygotujZaleznosci()
    await kontroler.uruchom()

    zmienCykl('nieaktywny')
    await poczekaj()
    expect(silnik.zatrzymaj).toHaveBeenCalledOnce()

    zmienCykl('aktywny')
    await poczekaj()
    expect(silnik.uruchom).toHaveBeenCalledTimes(2)
  })

  it('test wykrycia nie uruchamia pełnego STT', async () => {
    const { kontroler, rozpocznij, wykryj } = przygotujZaleznosci()
    const test = kontroler.testuj(3_000)
    await poczekaj()
    wykryj()

    await expect(test).resolves.toBe('wykryto')
    expect(rozpocznij).not.toHaveBeenCalled()
  })
})
