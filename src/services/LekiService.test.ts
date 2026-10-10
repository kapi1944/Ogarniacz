import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import type { DziennikLeku, Lek } from '../domain/typy'
import { dawkiZaplanowaneNaDzien, generujDawkiDnia, graniceLokalnegoDnia, idWystapieniaDawki, proponujGodzinyDawek, przewidywanaDataWyczerpania, stanApteczki, zapiszLekZDodanymZapasem, zapiszStatusDawki, zapiszStatusDawkiZApteczka } from './LekiService'

const lek: Lek = {
  ...utworzMetadane('lek-1'),
  nazwa: 'Lek testowy',
  dawkaInstrukcja: '1 tabletka',
  godziny: ['08:00', '20:00'],
  dawki: [
    { id: 'rano', godzina: '08:00', ilosc: 2, instrukcja: '2 tabletki' },
    { id: 'wieczor', godzina: '20:00', ilosc: 1, instrukcja: '1 tabletka' },
  ],
  aktywny: true,
}

describe('leki', () => {
  it('generuje dwie dawki jednego leku z ich własną ilością', () => {
    const dawki = generujDawkiDnia([lek], [], '2026-08-14')
    expect(dawki.map((dawka) => [dawka.planowanaGodzina, dawka.dawka.ilosc])).toEqual([['08:00', 2], ['20:00', 1]])
    expect(dawki.map((dawka) => dawka.dawka.id)).toEqual(['rano', 'wieczor'])
  })

  it('proponuje godziny wyłącznie w aktywnym oknie, bez północy', () => {
    const godziny = proponujGodzinyDawek(3, '07:00', '22:00')
    expect(godziny).toEqual(['07:00', '14:30', '22:00'])
    expect(godziny).not.toContain('00:00')
  })

  it('tworzy i zapisuje niezależne wystąpienia dawkowania co X godzin', () => {
    const interwalowy: Lek = {
      ...lek,
      id: 'lek-interwalowy',
      trybDawkowania: 'co_x_godzin',
      dataOd: '2026-08-14',
      interwalGodzin: 6,
      pierwszaGodzina: '20:00',
      dawki: [{ id: 'interwal', godzina: '20:00', ilosc: 1 }],
    }
    const dawki = generujDawkiDnia([interwalowy], [], '2026-08-15')
    expect(dawki.map((dawka) => dawka.planowanaGodzina)).toEqual(['02:00', '08:00', '14:00', '20:00'])
    expect(dawki).toHaveLength(4)
    expect(new Set(dawki.map((dawka) => dawka.idWystapienia)).size).toBe(4)

    const wpis0800 = zapiszStatusDawki(dawki.find((dawka) => dawka.planowanaGodzina === '08:00')!, 'zazyte')
    const poPierwszymZapisie = generujDawkiDnia([interwalowy], [wpis0800], '2026-08-15')
    expect(poPierwszymZapisie.map((dawka) => [dawka.planowanaGodzina, dawka.status])).toEqual([
      ['02:00', 'oczekuje'], ['08:00', 'zazyte'], ['14:00', 'oczekuje'], ['20:00', 'oczekuje'],
    ])

    const wpis1400 = zapiszStatusDawki(poPierwszymZapisie.find((dawka) => dawka.planowanaGodzina === '14:00')!, 'pominiete')
    expect(wpis1400.id).not.toBe(wpis0800.id)
    expect(generujDawkiDnia([interwalowy], [wpis0800, wpis1400], '2026-08-15').map((dawka) => dawka.status)).toEqual(['oczekuje', 'zazyte', 'pominiete', 'oczekuje'])
  })

  it('wyznacza lokalne granice dnia kalendarzowo podczas zmiany czasu', () => {
    const srodowisko = (globalThis as typeof globalThis & { process: { env: Record<string, string | undefined> } }).process.env
    const poprzedniaStrefa = srodowisko.TZ
    srodowisko.TZ = 'Europe/Warsaw'
    try {
      const granice = graniceLokalnegoDnia('2026-03-29')!
      expect(granice.od.getHours()).toBe(0)
      expect(granice.do.getHours()).toBe(0)
      expect((granice.do.getTime() - granice.od.getTime()) / 3_600_000).toBe(23)

      const interwalowy: Lek = { ...lek, id: 'lek-zmiana-czasu', trybDawkowania: 'co_x_godzin', dataOd: '2026-03-29', interwalGodzin: 6, pierwszaGodzina: '00:00', dawki: [{ id: 'interwal-zmiana-czasu', godzina: '00:00', ilosc: 1 }] }
      expect(dawkiZaplanowaneNaDzien(interwalowy, '2026-03-29').map((dawka) => dawka.godzina)).toEqual(['00:00', '07:00', '13:00', '19:00'])
    } finally {
      if (poprzedniaStrefa === undefined) delete srodowisko.TZ
      else srodowisko.TZ = poprzedniaStrefa
    }
  })

  it('rozdziela dwie dawki 02:00 podczas jesiennej zmiany czasu', () => {
    const srodowisko = (globalThis as typeof globalThis & { process: { env: Record<string, string | undefined> } }).process.env
    const poprzedniaStrefa = srodowisko.TZ
    srodowisko.TZ = 'Europe/Warsaw'
    try {
      const interwalowy: Lek = { ...lek, id: 'lek-jesienna-zmiana-czasu', trybDawkowania: 'co_x_godzin', dataOd: '2026-10-25', interwalGodzin: 1, pierwszaGodzina: '00:00', dawki: [{ id: 'interwal-jesien', godzina: '00:00', ilosc: 1 }] }
      const dawki = generujDawkiDnia([interwalowy], [], '2026-10-25')
      const dawki0200 = dawki.filter((dawka) => dawka.planowanaGodzina === '02:00')
      expect(dawki).toHaveLength(25)
      expect(dawki0200).toHaveLength(2)
      expect(dawki0200[0]!.idWystapienia).not.toBe(dawki0200[1]!.idWystapienia)

      const wpisPierwszej0200 = zapiszStatusDawki(dawki0200[0]!, 'zazyte')
      const poPierwszymZapisie = generujDawkiDnia([interwalowy], [wpisPierwszej0200], '2026-10-25').filter((dawka) => dawka.planowanaGodzina === '02:00')
      expect(poPierwszymZapisie.map((dawka) => dawka.status)).toEqual(['zazyte', 'oczekuje'])

      const wpisDrugiej0200 = zapiszStatusDawki(poPierwszymZapisie[1]!, 'pominiete')
      const statusy = (wpisy: DziennikLeku[]) => generujDawkiDnia([interwalowy], wpisy, '2026-10-25').filter((dawka) => dawka.planowanaGodzina === '02:00').map((dawka) => dawka.status)
      expect(statusy([wpisPierwszej0200, wpisDrugiej0200])).toEqual(['zazyte', 'pominiete'])
      expect(statusy([wpisDrugiej0200, wpisPierwszej0200])).toEqual(['zazyte', 'pominiete'])

      const wpisLegacy: DziennikLeku = { ...utworzMetadane('legacy-0200'), lekId: interwalowy.id, data: '2026-10-25', planowanaGodzina: '02:00', status: 'zazyte' }
      expect(statusy([wpisLegacy]).filter((status) => status === 'zazyte')).toHaveLength(1)

      const wpisWadliwegoModelu: DziennikLeku = { ...utworzMetadane(idWystapieniaDawki(interwalowy.id, '2026-10-25', 'interwal-jesien')), lekId: interwalowy.id, dawkaId: 'interwal-jesien', data: '2026-10-25', planowanaGodzina: '02:00', status: 'pominiete' }
      expect(statusy([wpisWadliwegoModelu]).filter((status) => status === 'pominiete')).toHaveLength(1)
    } finally {
      if (poprzedniaStrefa === undefined) delete srodowisko.TZ
      else srodowisko.TZ = poprzedniaStrefa
    }
  })

  it('liczy zapas z sumy rzeczywistych ilości dawek dnia', () => {
    expect(przewidywanaDataWyczerpania({ ...lek, zapasJednostek: 7 }, '2026-08-14')).toBe('2026-08-16')
  })

  it('odczytuje stary wpis bez dawkaId i zachowuje jego działanie', () => {
    const stary: Lek = { ...utworzMetadane('lek-stary'), nazwa: 'Stary lek', dawkaInstrukcja: '1 tabletka', godziny: ['08:00', '20:00'], zuzycieNaDawke: 1, aktywny: true }
    const wpis: DziennikLeku = { ...utworzMetadane('lek-stary:2026-08-14:08:00'), lekId: stary.id, data: '2026-08-14', planowanaGodzina: '08:00', status: 'zazyte' }
    const dawki = generujDawkiDnia([stary], [wpis], '2026-08-14')
    expect(dawki.map((dawka) => dawka.status)).toEqual(['zazyte', 'oczekuje'])
    expect(przewidywanaDataWyczerpania({ ...stary, zapasJednostek: 4 }, '2026-08-14')).toBe('2026-08-15')

    const bezIlosci = { ...stary, id: 'lek-bez-ilosci', zuzycieNaDawke: undefined }
    expect(generujDawkiDnia([bezIlosci], [], '2026-08-14')[0]?.dawka.ilosc).toBeUndefined()
    expect(przewidywanaDataWyczerpania({ ...bezIlosci, zapasJednostek: 4 }, '2026-08-14')).toBeUndefined()
  })

  it('wiąże historię ze stabilnym id dawki po zmianie przyszłej godziny', () => {
    const pierwsza = generujDawkiDnia([lek], [], '2026-08-14')[0]!
    const wpis = zapiszStatusDawki(pierwsza, 'zazyte')
    const poZmianieGodziny = { ...lek, dawki: [{ ...lek.dawki![0]!, godzina: '09:00' }, lek.dawki![1]!] }
    const odswiezona = generujDawkiDnia([poZmianieGodziny], [wpis], '2026-08-14')[0]!
    expect(odswiezona.planowanaGodzina).toBe('09:00')
    expect(odswiezona.status).toBe('zazyte')
    expect(odswiezona.wpis?.planowanaGodzina).toBe('08:00')
  })
})

describe('apteczka leków', () => {
  beforeEach(async () => {
    await inicjalizujBaze()
    await baza.tabela('leki').clear()
    await baza.tabela('dziennikLekow').clear()
    await tabelaKolejki().clear()
  })

  afterEach(async () => {
    await baza.tabela('leki').clear()
    await baza.tabela('dziennikLekow').clear()
  })

  async function przygotujLek(iloscDawki: number, zapas = 5) {
    const testowy: Lek = { ...lek, id: `lek-apteczka-${iloscDawki}`, dawki: [{ id: 'dawka-apteczka', godzina: '08:00', ilosc: iloscDawki }], godziny: ['08:00'], postac: 'tabletka', jednostka: 'szt.' }
    await zapiszLekZDodanymZapasem(testowy, zapas)
    const zapisany = await baza.tabela('leki').get(testowy.id)
    return generujDawkiDnia([zapisany!], [], '2026-08-14')[0]!
  }

  it('odejmuje jedną jednostkę po potwierdzeniu dawki ilość 1', async () => {
    const dawka = await przygotujLek(1)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(4)
  })

  it('odejmuje pełną ilość dawki 2', async () => {
    const dawka = await przygotujLek(2)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(3)
  })

  it('ponowne zapisanie zażytego i synchronizacja tego samego wystąpienia nie tworzą drugiego zużycia', async () => {
    const dawka = await przygotujLek(1)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    const odswiezona = generujDawkiDnia([(await baza.tabela('leki').get(dawka.lek.id))!], await baza.tabela('dziennikLekow').toArray(), dawka.data)[0]!
    await zapiszStatusDawkiZApteczka(odswiezona, 'zazyte')
    const zapisany = (await baza.tabela('leki').get(dawka.lek.id))!
    expect(stanApteczki(zapisany)).toBe(4)
    expect(zapisany.ruchyApteczki?.filter((ruch) => ruch.idWystapienia === dawka.idWystapienia)).toHaveLength(1)
  })

  it('cofnięcie zażytego przywraca zapas', async () => {
    const dawka = await przygotujLek(2)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    const odswiezona = generujDawkiDnia([(await baza.tabela('leki').get(dawka.lek.id))!], await baza.tabela('dziennikLekow').toArray(), dawka.data)[0]!
    await zapiszStatusDawkiZApteczka(odswiezona, 'pominiete')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(5)
  })

  it('zachowuje działanie starszego leku bez nowych pól apteczki', () => {
    const starszy: Lek = { ...lek, jednostkaLubPostac: 'tabletka', postac: undefined, jednostka: undefined, ruchyApteczki: undefined, zapasJednostek: 3 }
    expect(stanApteczki(starszy)).toBe(3)
    expect(przewidywanaDataWyczerpania(starszy, '2026-08-14')).toBe('2026-08-14')
  })
  it('odczytuje aktualną ilość i zapas zamiast stanu UI', async () => {
    const dawka = await przygotujLek(1)
    const aktualny = (await baza.tabela('leki').get(dawka.lek.id))!
    await baza.tabela('leki').put({ ...aktualny, dawki: [{ ...aktualny.dawki![0], ilosc: 3 }] })
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(2)
    expect((await baza.tabela('dziennikLekow').get(dawka.idWystapienia))?.przyjetaIlosc).toBe(3)
  })

  it('cofa zużycie i ponownie przyjmuje, także ze starym obiektem UI', async () => {
    const dawka = await przygotujLek(2)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    await zapiszStatusDawkiZApteczka(dawka, 'oczekuje')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(5)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(3)
    expect((await baza.tabela('leki').get(dawka.lek.id))?.ruchyApteczki?.filter((ruch) => ruch.typ === 'zuzycie')).toHaveLength(1)
  })

  it('odracza tylko do poprawnego przyszłego terminu, a pominięcie nie zużywa zapasu', async () => {
    const dawka = await przygotujLek(2)
    for (const termin of [undefined, 'błędny', '2020-01-01T10:00', '2099-02-30T10:00']) {
      await expect(zapiszStatusDawkiZApteczka(dawka, 'odroczone', termin)).rejects.toThrow('termin')
    }
    await zapiszStatusDawkiZApteczka(dawka, 'odroczone', '2099-01-01T10:00:00Z')
    expect((await baza.tabela('dziennikLekow').get(dawka.idWystapienia))?.odroczoneDo).toBe('2099-01-01T10:00:00.000Z')
    await zapiszStatusDawkiZApteczka(dawka, 'pominiete')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(5)
    expect((await baza.tabela('dziennikLekow').get(dawka.idWystapienia))?.odroczoneDo).toBeUndefined()
  })

  it('wymaga jawnego potwierdzenia niedoboru i zachowuje nierozliczoną ilość bez fikcyjnej dostawy', async () => {
    const dawka = await przygotujLek(3, 1)
    const przed = await tabelaKolejki().toArray()
    await expect(zapiszStatusDawkiZApteczka(dawka, 'zazyte')).rejects.toThrow('Niedobór')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    expect(await tabelaKolejki().toArray()).toEqual(przed)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte', undefined, { potwierdzRozbieznosc: true })
    const wpis = (await baza.tabela('dziennikLekow').get(dawka.idWystapienia))!
    expect(wpis).toMatchObject({ status: 'zazyte', przyjetaIlosc: 3, przyjetaJednostka: 'szt.', nierozliczonaIlosc: 2 })
    expect(wpis.rozbieznoscApteczki).toContain('Niedobór')
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect((await baza.tabela('dziennikLekow').get(wpis.id))?.nierozliczonaIlosc).toBe(2)
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(0)
    expect((await baza.tabela('leki').get(dawka.lek.id))?.ruchyApteczki?.filter((ruch) => ruch.typ === 'dodanie')).toHaveLength(1)
    await zapiszStatusDawkiZApteczka(dawka, 'oczekuje')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(1)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte', undefined, { potwierdzRozbieznosc: true })
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(0)
    const kolejka = await tabelaKolejki().toArray()
    expect(kolejka.find((zmiana) => zmiana.tabela === 'dziennikLekow')?.rekord).toMatchObject({ nierozliczonaIlosc: 2 })
    expect(kolejka.find((zmiana) => zmiana.tabela === 'leki')?.rekord).toMatchObject({ zapasJednostek: 0 })
  })

  it('rozdziela faktyczny czas, czas planowany i edycję oraz rozlicza rzeczywistą ilość', async () => {
    const dawka = await przygotujLek(2)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte', undefined, { przyjetoAt: '2026-08-13T22:15:00Z', przyjetaIlosc: 1.5, przyjetaJednostka: 'szt.' })
    const wpis = (await baza.tabela('dziennikLekow').get(dawka.idWystapienia))!
    expect(wpis).toMatchObject({ data: '2026-08-14', planowanaGodzina: '08:00', przyjetoAt: '2026-08-13T22:15:00.000Z', przyjetaIlosc: 1.5, przyjetaJednostka: 'szt.' })
    expect(wpis.updatedAt).not.toBe(wpis.przyjetoAt)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect((await baza.tabela('dziennikLekow').get(wpis.id))?.przyjetoAt).toBe(wpis.przyjetoAt)
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(3.5)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte', undefined, { przyjetaIlosc: 2.5 })
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(2.5)
  })

  it('nie przelicza samodzielnie odmiennej jednostki dawki', async () => {
    const dawka = await przygotujLek(2)
    const dane = { przyjetaIlosc: 500, przyjetaJednostka: 'mg' }
    await expect(zapiszStatusDawkiZApteczka(dawka, 'zazyte', undefined, dane)).rejects.toThrow('Jednostka')
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte', undefined, { ...dane, potwierdzRozbieznosc: true })
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(5)
    expect((await baza.tabela('dziennikLekow').get(dawka.idWystapienia))?.nierozliczonaIlosc).toBe(500)
  })

  it('wycofuje dziennik, ruchy i kolejkę przy błędzie po zapisach wewnątrz transakcji', async () => {
    const dawka = await przygotujLek(2)
    const przedLek = await baza.tabela('leki').get(dawka.lek.id)
    const przedKolejka = await tabelaKolejki().toArray()
    const dodaj = tabelaKolejki().add.bind(tabelaKolejki())
    const awaria = vi.spyOn(tabelaKolejki(), 'add').mockImplementationOnce(dodaj).mockImplementationOnce(() => { throw new Error('Awaria kolejki') })
    try { await expect(zapiszStatusDawkiZApteczka(dawka, 'zazyte')).rejects.toThrow('Awaria') } finally { awaria.mockRestore() }
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    expect(await baza.tabela('leki').get(dawka.lek.id)).toEqual(przedLek)
    expect(await tabelaKolejki().toArray()).toEqual(przedKolejka)
  })

  it('dopasowuje historyczny wpis, zachowuje ID i nie utożsamia reakcjaAt z przyjęciem', async () => {
    const dawka = await przygotujLek(2)
    const historyczny: DziennikLeku = { ...utworzMetadane('historyczny-wpis'), lekId: dawka.lek.id, data: dawka.data, planowanaGodzina: '08:00', status: 'zazyte', reakcjaAt: '2026-08-14T10:00:00Z' }
    await baza.tabela('dziennikLekow').put(historyczny)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect(await baza.tabela('dziennikLekow').count()).toBe(1)
    const zapisany = (await baza.tabela('dziennikLekow').get(historyczny.id))!
    expect(zapisany.createdAt).toBe(historyczny.createdAt)
    expect(zapisany.przyjetoAt).toBeUndefined()
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(5)
    await zapiszStatusDawkiZApteczka(dawka, 'oczekuje')
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(3)
    expect(await baza.tabela('dziennikLekow').count()).toBe(1)
    expect(generujDawkiDnia([(await baza.tabela('leki').get(dawka.lek.id))!], await baza.tabela('dziennikLekow').toArray(), dawka.data)[0]?.status).toBe('zazyte')
  })

  it('równoległe potwierdzenia zużywają zapas tylko raz', async () => {
    const dawka = await przygotujLek(2)
    await Promise.all([zapiszStatusDawkiZApteczka(dawka, 'zazyte'), zapiszStatusDawkiZApteczka(dawka, 'zazyte')])
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(3)
    expect(await baza.tabela('dziennikLekow').count()).toBe(1)
  })

  it('odrzuca nieprawidłowe przyjęcie i zmieniony harmonogram bez zapisów', async () => {
    const dawka = await przygotujLek(2)
    for (const dane of [{ przyjetaIlosc: -1 }, { przyjetaIlosc: NaN }, { przyjetaJednostka: ' ' }, { przyjetoAt: '2026-02-30T12:00' }, { przyjetoAt: '2099-01-01T12:00Z' }]) {
      await expect(zapiszStatusDawkiZApteczka(dawka, 'zazyte', undefined, dane)).rejects.toThrow()
    }
    await baza.tabela('leki').update(dawka.lek.id, { dawki: [{ id: 'nowa', godzina: '09:00', ilosc: 2 }] })
    await expect(zapiszStatusDawkiZApteczka(dawka, 'zazyte')).rejects.toThrow('Harmonogram')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
  })

  it('ponownie odczytuje zapas, gdy UI pokazuje już nieaktualny stan', async () => {
    const dawka = await przygotujLek(2)
    const aktualny = (await baza.tabela('leki').get(dawka.lek.id))!
    await baza.tabela('leki').put({ ...aktualny, ruchyApteczki: [...aktualny.ruchyApteczki!, { id: 'inne-zuzycie', typ: 'zuzycie', ilosc: 4, data: dawka.data, createdAt: aktualny.createdAt }] })
    await expect(zapiszStatusDawkiZApteczka(dawka, 'zazyte')).rejects.toThrow('Niedobór')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
  })

  it('cofa wcześniejsze zużycie przypisane do ID historycznego wpisu', async () => {
    const dawka = await przygotujLek(2)
    const aktualny = (await baza.tabela('leki').get(dawka.lek.id))!
    const wpis: DziennikLeku = { ...utworzMetadane('stare-id'), lekId: dawka.lek.id, data: dawka.data, planowanaGodzina: '08:00', status: 'zazyte' }
    await baza.tabela('dziennikLekow').put(wpis)
    await baza.tabela('leki').put({ ...aktualny, ruchyApteczki: [...aktualny.ruchyApteczki!, { id: 'zuzycie:stare-id', typ: 'zuzycie', ilosc: 2, data: dawka.data, createdAt: aktualny.createdAt }] })
    await zapiszStatusDawkiZApteczka(dawka, 'oczekuje')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(5)
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte')
    expect(stanApteczki((await baza.tabela('leki').get(dawka.lek.id))!)).toBe(3)
  })

  it('zapisuje fakt przyjęcia bez prowadzonego zapasu dopiero po potwierdzeniu', async () => {
    const testowy: Lek = { ...lek, id: 'bez-zapasu', jednostka: 'szt.' }
    await baza.tabela('leki').put(testowy)
    const dawka = generujDawkiDnia([testowy], [], '2026-08-14')[0]!
    await expect(zapiszStatusDawkiZApteczka(dawka, 'zazyte')).rejects.toThrow('Nie prowadzisz zapasu')
    await zapiszStatusDawkiZApteczka(dawka, 'zazyte', undefined, { potwierdzRozbieznosc: true })
    expect((await baza.tabela('dziennikLekow').get(dawka.idWystapienia))?.nierozliczonaIlosc).toBe(2)
    expect(await baza.tabela('leki').get(testowy.id)).toEqual(testowy)
  })

})
