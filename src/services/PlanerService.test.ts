import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { repozytoriumElementowZadan } from '../data/RepozytoriumElementowZadan'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { utworzMetadane } from '../domain/fabryki'
import type { ElementOgarniacza } from '../domain/elementyOgarniacza'
import type { UstawieniaHarmonogramu, WyjatekGrafiku, Zadanie } from '../domain/typy'
import { DOMYSLNE_USTAWIENIA } from '../domain/ustawienia'
import { utworzHarmonogramDnia, type HarmonogramDnia } from '../modules/pulpit/logikaOsiCzasu'
import { DostawcaZadanPulpitu } from '../providers/DostawcaZadanPulpitu'
import { utworzZadanie } from './ZadaniaService'
import { anulujPlan, generujPlan, walidujPozycjeDraftu, zatwierdzPlan, type DanePlanera } from './PlanerService'

const data = '2026-08-17'

function zadanie(zmiany: Partial<Zadanie> = {}): Zadanie {
  return {
    ...utworzZadanie({ tytul: 'Zadanie', opis: '', priorytet: 'normalny', szacowanyCzasMin: 60 }),
    ...zmiany,
  }
}

function ustawieniaHarmonogramu(dostepnoscDojazdu: 'pelna' | 'czesciowa' = 'czesciowa'): UstawieniaHarmonogramu {
  return {
    ...DOMYSLNE_USTAWIENIA.harmonogram,
    dniPracy: [1],
    godzinaRozpoczecia: '08:00',
    godzinaZakonczenia: '16:00',
    dojazdDoPracyMinuty: 60,
    powrotZPracyMinuty: 0,
    dostepnoscDojazdu,
  }
}

function harmonogramWolny(od = '07:00', doGodziny = '22:00'): HarmonogramDnia {
  return {
    data,
    pracuje: false,
    odPracy: '08:00',
    doPracy: '16:00',
    dojazdDoPracyMinuty: 0,
    powrotZPracyMinuty: 0,
    dostepnoscDojazdu: 'czesciowa',
    zakresAktywny: { od, do: doGodziny },
    przedzialy: [],
    jestWyjatkiem: false,
  }
}

function wydarzenie(godzina: string, czasTrwaniaMinuty?: number): ElementOgarniacza {
  return {
    id: `wydarzenie:${godzina}`,
    typ: 'wizyta',
    tytul: 'Hard event',
    data,
    godzina,
    czasTrwaniaMinuty,
    trybTerminu: 'o_godzinie',
    status: 'otwarty',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  }
}

function dane(zmiany: Partial<DanePlanera> = {}): DanePlanera {
  return {
    data,
    zadania: [zadanie()],
    wydarzenia: [],
    harmonogram: harmonogramWolny(),
    ...zmiany,
  }
}

describe('Planer draftu', () => {
  beforeEach(async () => {
    baza.close()
    await Dexie.delete('ogarniacz-v1')
    await inicjalizujBaze()
  })

  it('FULL pozwala zaplanować zwykłe zadanie w dojeździe', () => {
    const harmonogram = utworzHarmonogramDnia(data, ustawieniaHarmonogramu('pelna'))
    const wynik = generujPlan(dane({
      harmonogram,
      zadania: [zadanie({ terminGranicznyElementu: `${data}T08:00:00` })],
    }))
    expect(wynik.pozycje[0]).toMatchObject({ status: 'zaplanowana', poczatek: `${data}T07:00:00` })
  })

  it('PARTIAL commute nie pozwala planować zwykłego zadania', () => {
    const harmonogram = utworzHarmonogramDnia(data, ustawieniaHarmonogramu('czesciowa'))
    const wynik = generujPlan(dane({
      harmonogram,
      zadania: [zadanie({ terminGranicznyElementu: `${data}T08:00:00` })],
    }))
    expect(wynik.pozycje[0]).toMatchObject({ status: 'konflikt' })
  })

  it('FULL override wyjątku dnia zmienia wynik', () => {
    const wyjatek: WyjatekGrafiku = {
      ...utworzMetadane('wyjatek'),
      data,
      pracuje: true,
      od: '08:00',
      do: '16:00',
      dojazdDoPracyMinuty: 60,
      powrotZPracyMinuty: 0,
      dostepnoscDojazdu: 'pelna',
    }
    const bezWyjatku = generujPlan(dane({
      harmonogram: utworzHarmonogramDnia(data, ustawieniaHarmonogramu('czesciowa')),
      zadania: [zadanie({ terminGranicznyElementu: `${data}T08:00:00` })],
    }))
    const zWyjatkiem = generujPlan(dane({
      harmonogram: utworzHarmonogramDnia(data, ustawieniaHarmonogramu('czesciowa'), wyjatek),
      zadania: [zadanie({ terminGranicznyElementu: `${data}T08:00:00` })],
    }))
    expect(bezWyjatku.pozycje[0]?.status).toBe('konflikt')
    expect(zWyjatkiem.pozycje[0]).toMatchObject({ status: 'zaplanowana', poczatek: `${data}T07:00:00` })
  })

  it('blok pracy domyślnie nie służy do prywatnego zadania', () => {
    const wynik = generujPlan(dane({
      harmonogram: utworzHarmonogramDnia(data, ustawieniaHarmonogramu('czesciowa')),
      zadania: [zadanie({ terminGranicznyElementu: `${data}T12:00:00` })],
    }))
    expect(wynik.pozycje[0]?.status).toBe('konflikt')
  })

  it('hard event blokuje slot', () => {
    const wynik = generujPlan(dane({ wydarzenia: [wydarzenie('07:00', 60)] }))
    expect(wynik.pozycje[0]).toMatchObject({ status: 'zaplanowana', poczatek: `${data}T08:00:00` })
  })

  it('punktowa dawka nie staje się godzinnym blokiem', () => {
    const wynik = generujPlan(dane({ wydarzenia: [wydarzenie('07:00')] }))
    expect(wynik.pozycje[0]).toMatchObject({ status: 'zaplanowana', poczatek: `${data}T07:01:00` })
  })

  it('duration 60 minut nie mieści się w przedziale 30 minut', () => {
    const wynik = generujPlan(dane({ harmonogram: harmonogramWolny('07:00', '07:30') }))
    expect(wynik.pozycje[0]).toMatchObject({ status: 'konflikt' })
  })

  it('brak duration pozostawia zadanie do uzupełnienia bez arbitralnego defaultu', () => {
    const wynik = generujPlan(dane({ zadania: [zadanie({ szacowanyCzasMin: undefined })] }))
    expect(wynik.pozycje[0]).toMatchObject({ status: 'wymaga_czasu' })
    expect(wynik.pozycje[0].czasTrwaniaMinuty).toBeUndefined()
  })

  it('deadline wybiera wcześniejszy poprawny slot', () => {
    const wynik = generujPlan(dane({
      zadania: [zadanie({ terminGranicznyElementu: `${data}T09:00:00` })],
      wydarzenia: [wydarzenie('08:00', 60)],
    }))
    expect(wynik.pozycje[0]).toMatchObject({ status: 'zaplanowana', poczatek: `${data}T07:00:00` })
  })

  it('brak slotu przed deadline zwraca konflikt', () => {
    const wynik = generujPlan(dane({
      zadania: [zadanie({ terminGranicznyElementu: `${data}T07:30:00` })],
    }))
    expect(wynik.pozycje[0]).toMatchObject({ status: 'konflikt' })
  })

  it('ręczna korekta jest walidowana względem hard events i dostępności', () => {
    const wejscie = dane({ wydarzenia: [wydarzenie('09:00', 60)] })
    const wynik = generujPlan(wejscie)
    const pozycja = wynik.pozycje[0]!
    expect(walidujPozycjeDraftu(wejscie, pozycja, '09:30', 60).poprawna).toBe(false)
    expect(walidujPozycjeDraftu(wejscie, pozycja, '11:00', 60)).toMatchObject({ poprawna: true, poczatek: `${data}T11:00:00` })
  })

  it('dwa identyczne wejścia dają identyczny plan', () => {
    const wejscie = dane({ zadania: [zadanie({ id: 'b' }), zadanie({ id: 'a', tytul: 'Inne' })] })
    expect(generujPlan(wejscie)).toEqual(generujPlan(wejscie))
  })

  it('nie planuje zadania zablokowanego przez niewykonane zadanie', () => {
    const blokujace = zadanie({ id: 'blokujace', tytul: 'Najpierw to' })
    const zablokowane = zadanie({ id: 'zablokowane', tytul: 'Potem to', blokowanePrzezIds: [blokujace.id] })

    const wynik = generujPlan(dane({ zadania: [blokujace, zablokowane] }))

    expect(wynik.pozycje.some((x) => x.zadanieId === zablokowane.id)).toBe(false)
    expect(wynik.pozycje.some((x) => x.zadanieId === blokujace.id)).toBe(true)
  })

  it('generowanie i anulowanie draftu niczego nie zapisują', async () => {
    const repozytorium = pobierzRepozytorium('zadania')
    const rekord = zadanie({ id: 'zadanie-repo' })
    await repozytorium.zapisz(rekord)
    const przed = await repozytorium.lista()
    const wynik = generujPlan(dane({ zadania: przed }))
    expect(anulujPlan(wynik)).toBeUndefined()
    expect(await repozytorium.lista()).toEqual(przed)
  })

  it('confirm aktualizuje kanoniczne Zadanie, a provider pokazuje nowy termin po requery', async () => {
    const utworzone = await repozytoriumElementowZadan.utworz({
      typ: 'zadanie',
      tytul: 'Do zaplanowania',
      czasTrwaniaMinuty: 60,
    })
    const zadania = await pobierzRepozytorium('zadania').lista()
    const wynik = generujPlan(dane({ zadania }))
    expect(await zatwierdzPlan(wynik, repozytoriumElementowZadan)).toBe(1)

    const elementy = await new DostawcaZadanPulpitu(repozytoriumElementowZadan).pobierzElementy({ od: data, do: data })
    expect(elementy).toMatchObject([{
      id: utworzone.id,
      data,
      godzina: '07:00',
      trybTerminu: 'o_godzinie',
    }])
    expect(await pobierzRepozytorium('blokiCzasu').lista()).toEqual([])
  })
})
