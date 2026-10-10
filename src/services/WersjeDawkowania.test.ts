import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import type { Lek } from '../domain/typy'
import { aktualnySchematLeku, generujDawkiDnia, mozliweChwileSchematu, przewidywanaDataWyczerpania, stanApteczki, wyznaczNastepnaDawke, zapiszLekZDodanymZapasem, zapiszStatusDawkiZApteczka } from './LekiService'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-08-01T00:00:00'))
  await inicjalizujBaze()
  for (const nazwa of ['leki', 'dziennikLekow', 'kolejkaSynchronizacji'] as const) await baza.tabela(nazwa).clear()
})
afterEach(() => vi.useRealTimers())

async function przygotuj(tryb: Lek['trybDawkowania'] = 'konkretne_godziny') {
  const lek: Lek = { ...utworzMetadane('lek-wersje'), nazwa: 'Lek testowy', dawkaInstrukcja: 'Instrukcja źródłowa', godziny: ['08:00', '20:00'], dawki: [{ id: 'rano', godzina: '08:00', ilosc: 1 }, { id: 'wieczor', godzina: '20:00', ilosc: 1 }], trybDawkowania: tryb, jednostka: 'szt.', aktywny: true }
  await zapiszLekZDodanymZapasem(lek, 20)
  return odczytaj()
}
async function odczytaj() { return (await baza.tabela('leki').get('lek-wersje'))! }
async function dawki(data: string) { return generujDawkiDnia([await odczytaj()], await baza.tabela('dziennikLekow').toArray(), data) }

describe('wersje schematów leków', () => {
  it('zmienia godziny i liczbę dawek bez zmiany wcześniejszego planu, przyjęcia, ID i zużycia', async () => {
    const lek = await przygotuj()
    vi.setSystemTime(new Date('2026-08-14T22:00:00'))
    const pierwotna = (await dawki('2026-08-14'))[0]!
    await zapiszStatusDawkiZApteczka(pierwotna, 'zazyte', undefined, { przyjetaIlosc: 0.5, przyjetoAt: '2026-08-14T08:15:00' })
    const przed = await baza.tabela('dziennikLekow').toArray()
    const ruchyPrzed = (await odczytaj()).ruchyApteczki
    vi.setSystemTime(new Date('2026-09-01T00:00:00'))
    const aktualny = await odczytaj()
    await zapiszLekZDodanymZapasem({ ...aktualny, dawki: [{ ...aktualny.dawki![0], godzina: '09:00' }], godziny: ['09:00'] }, undefined, { obowiazujeOd: '2026-09-01T00:00:00', notatka: 'Zmiana wpisana przez użytkownika' })
    expect((await dawki('2026-08-14')).map((dawka) => dawka.planowanaGodzina)).toEqual(['08:00', '20:00'])
    const po = (await dawki('2026-08-14'))[0]!
    expect(po.idWystapienia).toBe(pierwotna.idWystapienia)
    expect(po.wersjaDawkowaniaId).toBe(lek.historiaDawkowania![0].id)
    expect(po.dawka.ilosc).toBe(1)
    expect(po.wpis?.przyjetaIlosc).toBe(0.5)
    expect(await baza.tabela('dziennikLekow').toArray()).toEqual(przed)
    expect((await odczytaj()).ruchyApteczki).toEqual(ruchyPrzed)
    expect((await dawki('2026-09-01')).map((dawka) => dawka.planowanaGodzina)).toEqual(['09:00'])
    expect((await odczytaj()).historiaDawkowania).toHaveLength(2)
    expect((await baza.tabela('kolejkaSynchronizacji').where('tabela').equals('leki').first())?.rekord).toMatchObject({ historiaDawkowania: (await odczytaj()).historiaDawkowania })
  })

  it('wybiera wersję według chwili wystąpienia w środku dnia i chroni zużycie przy powtórzeniu', async () => {
    await przygotuj()
    vi.setSystemTime(new Date('2026-08-14T12:00:00'))
    const rano = (await dawki('2026-08-14'))[0]!
    await zapiszStatusDawkiZApteczka(rano, 'zazyte')
    const lek = await odczytaj()
    await zapiszLekZDodanymZapasem({ ...lek, dawki: [{ ...lek.dawki![0], godzina: '09:00', ilosc: 3 }, { ...lek.dawki![1], ilosc: 2 }], godziny: ['09:00', '20:00'] }, undefined, { obowiazujeOd: '2026-08-14T12:00:00' })
    const plan = await dawki('2026-08-14')
    expect(plan.map((dawka) => [dawka.planowanaGodzina, dawka.dawka.ilosc])).toEqual([['08:00', 1], ['20:00', 2]])
    expect(plan[0].wersjaDawkowaniaId).not.toBe(plan[1].wersjaDawkowaniaId)
    expect(plan[0].idWystapienia).toBe(rano.idWystapienia)
    expect(plan[1].dawka.id).toBe('wieczor')
    await zapiszStatusDawkiZApteczka(plan[1], 'zazyte')
    await zapiszStatusDawkiZApteczka(plan[1], 'zazyte')
    await zapiszStatusDawkiZApteczka(rano, 'zazyte')
    expect(stanApteczki(await odczytaj())).toBe(17)
    await zapiszStatusDawkiZApteczka(plan[1], 'oczekuje')
    expect(stanApteczki(await odczytaj())).toBe(19)
    await zapiszStatusDawkiZApteczka(plan[1], 'zazyte')
    expect(stanApteczki(await odczytaj())).toBe(17)
  })

  it('dwa schematy tego samego dnia z tą samą definicją mają niezależne wystąpienia', async () => {
    const lek = await przygotuj()
    vi.setSystemTime(new Date('2026-08-14T12:00:00'))
    await zapiszLekZDodanymZapasem({ ...lek, dawki: [{ ...lek.dawki![0], godzina: '13:00' }], godziny: ['13:00'] }, undefined, { obowiazujeOd: '2026-08-14T12:00:00' })
    const plan = await dawki('2026-08-14')
    expect(plan.map((dawka) => dawka.planowanaGodzina)).toEqual(['08:00', '13:00'])
    expect(plan[0].dawka.id).toBe(plan[1].dawka.id)
    expect(plan[0].idWystapienia).not.toBe(plan[1].idWystapienia)
    await zapiszStatusDawkiZApteczka(plan[0], 'zazyte')
    await zapiszStatusDawkiZApteczka(plan[1], 'zazyte')
    expect(stanApteczki(await odczytaj())).toBe(18)
  })

  it('zachowuje kilka dawek dziennie oraz aktywne dni i przyszłe wersje', async () => {
    const lek = await przygotuj('razy_dziennie')
    vi.setSystemTime(new Date('2026-08-14T00:00:00'))
    await zapiszLekZDodanymZapasem({ ...lek, liczbaDawekDziennie: 3, dawki: [...lek.dawki!, { id: 'poludnie', godzina: '14:00', ilosc: 1 }], godziny: ['08:00', '14:00', '20:00'] }, undefined, { obowiazujeOd: '2026-08-15T12:00:00' })
    expect(await dawki('2026-08-14')).toHaveLength(2)
    expect((await dawki('2026-08-15')).map((dawka) => dawka.planowanaGodzina)).toEqual(['08:00', '14:00', '20:00'])
    expect(await dawki('2026-08-16')).toHaveLength(3)
    expect(aktualnySchematLeku(await odczytaj())?.dawki).toHaveLength(2)
  })

  it('pierwszy przyszły schemat nie jest prezentowany ani generowany jako obowiązujący wcześniej', async () => {
    const lek = await przygotuj()
    const przyszly = { ...lek, id: 'przyszly-lek', historiaDawkowania: undefined }
    await zapiszLekZDodanymZapasem(przyszly, undefined, { obowiazujeOd: '2026-08-15T12:00:00' })
    const zapisany = (await baza.tabela('leki').get(przyszly.id))!
    expect(aktualnySchematLeku(zapisany)).toBeUndefined()
    expect(generujDawkiDnia([zapisany], [], '2026-08-14')).toHaveLength(0)
    expect(generujDawkiDnia([zapisany], [], '2026-08-15').map((dawka) => dawka.planowanaGodzina)).toEqual(['20:00'])
  })

  it('nie zgaduje starszych parametrów ani wersji; zachowuje historyczny wpis po pierwszej zmianie', async () => {
    const lek: Lek = { ...utworzMetadane('lek-wersje'), nazwa: 'Starszy lek', dawkaInstrukcja: '', godziny: ['08:00'], aktywny: true }
    await baza.tabela('leki').put(lek)
    const wpis = { ...utworzMetadane('stary-wpis'), lekId: lek.id, data: '2026-07-10', planowanaGodzina: '07:00', status: 'zazyte' as const, reakcjaAt: '2026-07-10T10:00:00Z' }
    await baza.tabela('dziennikLekow').put(wpis)
    await zapiszLekZDodanymZapasem({ ...lek, godziny: ['09:00'], dawki: [{ id: 'rano', godzina: '09:00', ilosc: 1 }] })
    const historyczna = (await dawki('2026-07-10'))[0]!
    expect(historyczna.idWystapienia).toBe(wpis.id)
    expect(historyczna.dawka.ilosc).toBeUndefined()
    expect(historyczna.wersjaDawkowaniaId).toBeUndefined()
    expect(historyczna.wpis?.przyjetoAt).toBeUndefined()
    expect(await baza.tabela('dziennikLekow').get(wpis.id)).toEqual(wpis)
    expect((await odczytaj()).historiaDawkowania![0].poczatekNieznany).toBe(true)
    expect(await dawki('2026-07-09')).toHaveLength(0)
  })

  it('zachowuje jednostki wersji niezależnie od zapasu i korzysta z jawnej rozbieżności', async () => {
    const lek = await przygotuj()
    vi.setSystemTime(new Date('2026-08-14T12:00:00'))
    await zapiszLekZDodanymZapasem({ ...lek, jednostka: 'mg', dawki: [{ ...lek.dawki![1], ilosc: 500 }], godziny: ['20:00'] })
    const wieczor = (await dawki('2026-08-14')).at(-1)!
    expect(wieczor.jednostkaDawki).toBe('mg')
    await expect(zapiszStatusDawkiZApteczka(wieczor, 'zazyte')).rejects.toThrow('Jednostka')
    await zapiszStatusDawkiZApteczka(wieczor, 'zazyte', undefined, { potwierdzRozbieznosc: true })
    expect(stanApteczki(await odczytaj())).toBe(20)
    expect((await baza.tabela('dziennikLekow').get(wieczor.idWystapienia))?.planowanaJednostka).toBe('mg')
    expect((await baza.tabela('dziennikLekow').get(wieczor.idWystapienia))?.nierozliczonaIlosc).toBe(500)
    expect(przewidywanaDataWyczerpania(await odczytaj(), '2026-08-14')).toBeUndefined()
  })

  it('zmiana samych danych leku lub zapasu nie tworzy dodatkowej wersji', async () => {
    const lek = await przygotuj()
    await zapiszLekZDodanymZapasem({ ...lek, nazwa: 'Nowa nazwa' }, 2)
    const po = await odczytaj()
    expect(po.historiaDawkowania).toEqual(lek.historiaDawkowania)
    expect(stanApteczki(po)).toBe(22)
  })

  it('nie dopisuje jednostki starego zapasu przy uzupełnieniu nowego schematu', async () => {
    const lek: Lek = { ...utworzMetadane('lek-wersje'), nazwa: 'Starszy lek', dawkaInstrukcja: '', godziny: ['08:00'], aktywny: true, zapasJednostek: 5 }
    await baza.tabela('leki').put(lek)
    await zapiszLekZDodanymZapasem(lek, 1)
    expect((await odczytaj()).jednostkaZapasu).toBeNull()
    vi.setSystemTime(new Date('2026-08-14T12:00:00'))
    await zapiszLekZDodanymZapasem({ ...await odczytaj(), jednostka: 'mg', godziny: ['20:00'], dawki: [{ id: 'wieczor', godzina: '20:00', ilosc: 500 }] })
    await expect(zapiszStatusDawkiZApteczka((await dawki('2026-08-14'))[0], 'zazyte')).rejects.toThrow('Jednostka')
    expect(stanApteczki(await odczytaj())).toBe(6)
  })

  it('odrzuca stare przyszłe wystąpienie po zmianie schematu i wycofuje wersję przy awarii kolejki', async () => {
    const lek = await przygotuj()
    const staraDawka = (await dawki('2026-08-15'))[0]
    vi.setSystemTime(new Date('2026-08-14T12:00:00'))
    const zmieniony = { ...lek, godziny: ['09:00'], dawki: [{ ...lek.dawki![0], godzina: '09:00' }] }
    const kolejkaPrzed = await tabelaKolejki().toArray()
    const awaria = vi.spyOn(tabelaKolejki(), 'add').mockImplementationOnce(() => { throw new Error('Awaria kolejki') })
    try { await expect(zapiszLekZDodanymZapasem(zmieniony)).rejects.toThrow('Awaria') } finally { awaria.mockRestore() }
    expect(await odczytaj()).toEqual(lek)
    expect(await tabelaKolejki().toArray()).toEqual(kolejkaPrzed)
    await zapiszLekZDodanymZapasem(zmieniony)
    await expect(zapiszStatusDawkiZApteczka(staraDawka, 'zazyte')).rejects.toThrow('Harmonogram')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    expect(stanApteczki(await odczytaj())).toBe(20)
  })

  it('po ponownym otwarciu bazy zachowuje wersje, wystąpienia, dawki i outbox', async () => {
    await przygotuj()
    const przed = await dawki('2026-08-14')
    baza.close()
    await baza.open()
    expect(await dawki('2026-08-14')).toEqual(przed)
    expect((await baza.tabela('kolejkaSynchronizacji').toArray())[0].rekord).toMatchObject({ historiaDawkowania: (await odczytaj()).historiaDawkowania })
  })

  it('chroni wersje przed edycją, nieaktualnym formularzem i zmianą działającą wstecz', async () => {
    const lek = await przygotuj()
    vi.setSystemTime(new Date('2026-08-14T12:00:00'))
    const zmieniony = { ...lek, dawki: [{ ...lek.dawki![0], ilosc: 2 }] }
    await expect(zapiszLekZDodanymZapasem(zmieniony, undefined, { obowiazujeOd: '2026-08-10T12:00:00' })).rejects.toThrow('przeszłości')
    await zapiszLekZDodanymZapasem(zmieniony)
    await expect(zapiszLekZDodanymZapasem(lek)).rejects.toThrow('Historia')
    const aktualny = await odczytaj()
    await expect(zapiszLekZDodanymZapasem({ ...aktualny, historiaDawkowania: [] })).rejects.toThrow('Historia')
    expect((await odczytaj()).historiaDawkowania).toHaveLength(2)
  })

  it('interwał nie restartuje się co dzień i zachowuje dwie godziny 02:00 przy zmianie czasu', async () => {
    const srodowisko = (globalThis as typeof globalThis & { process: { env: Record<string, string | undefined> } }).process.env
    const poprzedniaStrefa = srodowisko.TZ
    srodowisko.TZ = 'Europe/Warsaw'
    try {
      vi.setSystemTime(new Date('2026-10-25T00:00:00'))
      const lek: Lek = { ...utworzMetadane('lek-wersje'), nazwa: 'Interwał', dawkaInstrukcja: '', godziny: ['00:00'], dawki: [{ id: 'interwal', godzina: '00:00', ilosc: 1 }], trybDawkowania: 'co_x_godzin', interwalGodzin: 1, pierwszaGodzina: '00:00', jednostka: 'szt.', aktywny: true }
      await zapiszLekZDodanymZapasem(lek, 50)
      const plan = await dawki('2026-10-25')
      expect(plan).toHaveLength(25)
      const powtorzone = plan.filter((dawka) => dawka.planowanaGodzina === '02:00')
      expect(powtorzone).toHaveLength(2)
      expect(powtorzone[0].planowanyCzas).not.toBe(powtorzone[1].planowanyCzas)
      expect(wyznaczNastepnaDawke(plan, new Date('2026-10-25T02:30:00+02:00'))?.idWystapienia).toBe(powtorzone[1].idWystapienia)
      expect((await dawki('2026-10-26'))[0].idWystapienia).toContain('interwal-25')
      vi.setSystemTime(new Date('2026-10-25T02:30:00+01:00'))
      expect(mozliweChwileSchematu('2026-10-25T02:30').map((chwila) => chwila.toISOString())).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'])
      await expect(zapiszLekZDodanymZapasem({ ...await odczytaj(), interwalGodzin: 2 }, undefined, { obowiazujeOd: '2026-10-25T02:30' })).rejects.toThrow('dwukrotnie')
      await zapiszLekZDodanymZapasem({ ...await odczytaj(), interwalGodzin: 2 })
      const poZmianie = await dawki('2026-10-25')
      expect(poZmianie.filter((dawka) => dawka.planowanaGodzina === '02:00')).toHaveLength(2)
      vi.setSystemTime(new Date('2026-03-29T00:00:00'))
      const wiosenny = { ...lek, id: 'wiosna', interwalGodzin: 6, historiaDawkowania: undefined }
      await expect(zapiszLekZDodanymZapasem(wiosenny, undefined, { obowiazujeOd: '2026-03-29T02:30' })).rejects.toThrow('nie istnieje')
      await zapiszLekZDodanymZapasem(wiosenny)
      const zapisany = (await baza.tabela('leki').get('wiosna'))!
      expect(generujDawkiDnia([zapisany], [], '2026-03-29').map((dawka) => dawka.planowanaGodzina)).toEqual(['00:00', '07:00', '13:00', '19:00'])
      const wedlugZegara = { ...zapisany, id: 'zegara', trybDawkowania: 'konkretne_godziny' as const, historiaDawkowania: undefined, godziny: ['02:30', '03:30'], dawki: [{ id: 'nieistniejaca', godzina: '02:30', ilosc: 1 }, { id: 'istniejaca', godzina: '03:30', ilosc: 1 }] }
      expect(generujDawkiDnia([wedlugZegara], [], '2026-03-29').map((dawka) => dawka.planowanaGodzina)).toEqual(['03:30'])
    } finally {
      if (poprzedniaStrefa === undefined) delete srodowisko.TZ
      else srodowisko.TZ = poprzedniaStrefa
    }
  })
})
