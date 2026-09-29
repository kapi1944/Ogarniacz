import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import type { BlokCzasu, Ustawienia, Wizyta, WyjatekGrafiku } from '../../domain/typy'
import { utworzHarmonogramDnia } from '../../modules/pulpit/logikaOsiCzasu'
import { znajdzWolneOkna, utworzWydarzeniaPlanera } from '../PlanerService'
import { pobierzKontekstPlanowaniaEcho } from './KontekstPlanowaniaEcho'

const dzisiaj = '2026-09-28'
const jutro = '2026-09-29'
const kontekstCzasu = { teraz: `${dzisiaj}T08:00:00.000Z`, dataLokalna: dzisiaj, strefaCzasowa: 'Europe/Warsaw' }

function ustawienia(dniPracy: number[] = [1, 2]): Ustawienia {
  return {
    ...structuredClone(DOMYSLNE_USTAWIENIA),
    harmonogram: {
      ...DOMYSLNE_USTAWIENIA.harmonogram,
      dniPracy,
      godzinaRozpoczecia: '07:45',
      godzinaZakonczenia: '16:00',
      dojazdDoPracyMinuty: 0,
      powrotZPracyMinuty: 0,
    },
  }
}

function blok(od: string, doGodziny: string): BlokCzasu {
  return {
    ...utworzMetadane(`blok-${od}`),
    tytul: 'Blok prywatny',
    poczatek: `${dzisiaj}T${od}:00`,
    koniec: `${dzisiaj}T${doGodziny}:00`,
    typ: 'inne',
    elastycznosc: 'twardy',
    status: 'zaakceptowany',
  }
}

function wizyta(godzina: string): Wizyta {
  return {
    ...utworzMetadane(`wizyta-${godzina}`),
    nazwa: 'Dentysta',
    status: 'umowiona',
    data: dzisiaj,
    godzina,
    notatka: '',
    pytania: [],
    dokumentyIds: [],
    checklista: [],
  }
}

describe('kontekst danych czasu Echo', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
    await pobierzRepozytorium('ustawienia').zapisz(ustawienia())
  })

  it('wylicza pracę 07:45–16:00, jej dokładną połowę oraz zakresy przed i po pracy', async () => {
    const kontekst = await pobierzKontekstPlanowaniaEcho(kontekstCzasu, [])
    const dzien = kontekst.dni?.[0]

    expect(dzien?.praca).toEqual({
      od: `${dzisiaj}T07:45:00`,
      do: `${dzisiaj}T16:00:00`,
      polowa: `${dzisiaj}T11:52:30`,
      zrodlo: 'grafik',
    })
    expect(dzien?.przedPraca).toEqual({ od: `${dzisiaj}T07:00:00`, do: `${dzisiaj}T07:45:00` })
    expect(dzien?.poPracy).toEqual({ od: `${dzisiaj}T16:00:00`, do: `${dzisiaj}T22:00:00` })
  })

  it('dzień wolny nie zawiera sztucznych godzin pracy', async () => {
    await pobierzRepozytorium('ustawienia').zapisz(ustawienia([]))

    const dzien = (await pobierzKontekstPlanowaniaEcho(kontekstCzasu, [])).dni?.[0]

    expect(dzien).toMatchObject({ pracuje: false, wolneOkna: [{ poczatek: `${dzisiaj}T07:00:00`, koniec: `${dzisiaj}T22:00:00`, minuty: 900 }] })
    expect(dzien?.praca).toBeUndefined()
    expect(dzien?.przedPraca).toBeUndefined()
    expect(dzien?.poPracy).toBeUndefined()
  })

  it('najnowszy wyjątek grafiku ma pierwszeństwo przed tygodniem i starszym wyjątkiem', async () => {
    const starszy: WyjatekGrafiku = { ...utworzMetadane('wyjatek-stary'), data: dzisiaj, pracuje: false, updatedAt: '2026-09-27T10:00:00.000Z' }
    const nowszy: WyjatekGrafiku = { ...utworzMetadane('wyjatek-nowy'), data: dzisiaj, pracuje: true, od: '10:00', do: '14:00', updatedAt: '2026-09-28T06:00:00.000Z' }
    await pobierzRepozytorium('wyjatkiGrafiku').zapiszWiele([starszy, nowszy])

    const dzien = (await pobierzKontekstPlanowaniaEcho(kontekstCzasu, [])).dni?.[0]

    expect(dzien?.praca).toMatchObject({ od: `${dzisiaj}T10:00:00`, do: `${dzisiaj}T14:00:00`, zrodlo: 'wyjatek' })
  })

  it('blok i wizyta dzielą czas po pracy na kilka rzeczywistych wolnych okien', async () => {
    const zapisanyBlok = blok('16:30', '17:00')
    const zapisanaWizyta = wizyta('18:00')
    await pobierzRepozytorium('blokiCzasu').zapisz(zapisanyBlok)
    await pobierzRepozytorium('wizyty').zapisz(zapisanaWizyta)

    const dzien = (await pobierzKontekstPlanowaniaEcho(kontekstCzasu, [])).dni?.[0]

    expect(dzien?.wolneOkna.filter((okno) => okno.poczatek >= `${dzisiaj}T16:00:00`)).toEqual([
      { poczatek: `${dzisiaj}T16:00:00`, koniec: `${dzisiaj}T16:20:00`, minuty: 20 },
      { poczatek: `${dzisiaj}T17:10:00`, koniec: `${dzisiaj}T17:50:00`, minuty: 40 },
      { poczatek: `${dzisiaj}T19:10:00`, koniec: `${dzisiaj}T22:00:00`, minuty: 170 },
    ])
    expect(dzien?.zajetePrzedzialy.map((przedzial) => przedzial.zrodlo)).toEqual(['blok_czasu', 'wizyta'])

    const danePlanera = {
      data: dzisiaj,
      zadania: [],
      wydarzenia: utworzWydarzeniaPlanera(dzisiaj, [zapisanyBlok], [zapisanaWizyta]),
      harmonogram: utworzHarmonogramDnia(dzisiaj, ustawienia().harmonogram),
    }
    expect(znajdzWolneOkna(danePlanera, 30)).toEqual([
      { poczatek: `${dzisiaj}T07:00:00`, koniec: `${dzisiaj}T07:30:00`, minuty: 30 },
      { poczatek: `${dzisiaj}T17:10:00`, koniec: `${dzisiaj}T17:40:00`, minuty: 30 },
      { poczatek: `${dzisiaj}T19:10:00`, koniec: `${dzisiaj}T19:40:00`, minuty: 30 },
    ])
    expect(znajdzWolneOkna(danePlanera, 180)).toEqual([])
  })

  it('przekazuje osobne dane jutra zamiast ponownie używać dzisiejszego grafiku', async () => {
    const wyjatekJutra: WyjatekGrafiku = { ...utworzMetadane('wyjatek-jutro'), data: jutro, pracuje: true, od: '12:00', do: '18:00' }
    await pobierzRepozytorium('wyjatkiGrafiku').zapisz(wyjatekJutra)

    const kontekst = await pobierzKontekstPlanowaniaEcho(kontekstCzasu, [])

    expect(kontekst.dni?.map((dzien) => dzien.data)).toEqual([dzisiaj, jutro])
    expect(kontekst.dni?.[0].praca).toMatchObject({ od: `${dzisiaj}T07:45:00`, do: `${dzisiaj}T16:00:00` })
    expect(kontekst.dni?.[1].praca).toMatchObject({ od: `${jutro}T12:00:00`, do: `${jutro}T18:00:00`, zrodlo: 'wyjatek' })
  })
})
