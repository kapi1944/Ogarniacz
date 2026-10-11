import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza, inicjalizujBaze } from '../data/BazaOgarniacza'
import { tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import type { Lek } from '../domain/typy'
import { generujDawkiDnia, stanApteczki, wersjaStanuDawki, zapiszLekZDodanymZapasem, zapiszStatusDawkiZApteczka } from './LekiService'
import { oznaczDostarczeniePrzypomnienia, sciezkaAlarmuDawki, sprawdzAlarmDawki, uzgodnijPrzypomnieniaLekow } from './PrzypomnieniaLekow'
import { zakonczPrzypomnienie } from './PrzypomnieniaService'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T07:00:00'))
  await inicjalizujBaze()
  for (const nazwa of ['leki', 'dziennikLekow', 'przypomnienia', 'kolejkaSynchronizacji'] as const) await baza.tabela(nazwa).clear()
})
afterEach(() => vi.useRealTimers())

async function przygotuj(id = 'lek-test') {
  const lek: Lek = { ...utworzMetadane(id), nazwa: 'Lek testowy', dawkaInstrukcja: '', godziny: ['08:00', '20:00'],
    dawki: [{ id: 'rano', godzina: '08:00', ilosc: 1 }, { id: 'wieczor', godzina: '20:00', ilosc: 1 }], jednostka: 'szt.', aktywny: true }
  await zapiszLekZDodanymZapasem(lek, 10)
  return (await baza.tabela('leki').get(id))!
}
async function dawka(id: string) { const alarm = (await baza.tabela('przypomnienia').get(id))!; return sprawdzAlarmDawki(id, alarm.dawkaLeku!.wersjaStanu) }

describe('automatyczne przypomnienia konkretnych dawek', () => {
  it('tworzy osobne alarmy leków i dawek, idempotentnie także po ponownym otwarciu bazy', async () => {
    await przygotuj(); await przygotuj('drugi-lek')
    const przed = await uzgodnijPrzypomnieniaLekow()
    expect(przed).toHaveLength(28)
    expect(new Set(przed.map((alarm) => alarm.id)).size).toBe(28)
    const kolejka = await tabelaKolejki().toArray()
    baza.close(); await baza.open()
    vi.setSystemTime(new Date('2026-10-11T07:02:00'))
    expect(await uzgodnijPrzypomnieniaLekow()).toEqual(przed)
    expect(await tabelaKolejki().toArray()).toEqual(kolejka)
    expect(przed.every((alarm) => alarm.dawkaLeku?.planowanyCzas && alarm.dawkaLeku.wersjaDawkowaniaId)).toBe(true)
  })

  it('używa przyszłej wersji od dokładnej chwili i anuluje stary przyszły alarm bez usuwania historii', async () => {
    const lek = await przygotuj()
    const przed = await uzgodnijPrzypomnieniaLekow()
    const stary = przed.find((alarm) => alarm.dawkaLeku?.data === '2026-10-12')!
    const historyczny = przed[0]
    const przyjeta = await dawka(historyczny.id)
    await zapiszStatusDawkiZApteczka(przyjeta, 'zazyte')
    await uzgodnijPrzypomnieniaLekow()
    const historia = await baza.tabela('dziennikLekow').toArray()
    await zapiszLekZDodanymZapasem({ ...(await baza.tabela('leki').get(lek.id))!, godziny: ['09:00'], dawki: [{ id: 'rano', godzina: '09:00', ilosc: 2 }] }, undefined, { obowiazujeOd: '2026-10-12T08:30:00' })
    const po = await uzgodnijPrzypomnieniaLekow()
    expect(po.find((alarm) => alarm.id === stary.id)?.stan).toBe('nowe') // 08:00 poprzedniej wersji nadal obowiązuje.
    expect(po.some((alarm) => alarm.dawkaLeku?.data === '2026-10-12' && alarm.czas === new Date('2026-10-12T09:00:00').toISOString() && alarm.dawkaLeku.wersjaDawkowaniaId !== stary.dawkaLeku!.wersjaDawkowaniaId)).toBe(true)
    const nieaktualny = przed.find((alarm) => alarm.dawkaLeku?.data === '2026-10-12' && alarm.dawkaLeku.dawkaId === 'wieczor')!
    expect(po.find((alarm) => alarm.id === nieaktualny.id)?.dawkaLeku?.nieaktualne).toBe(true)
    await expect(sprawdzAlarmDawki(nieaktualny.id, nieaktualny.dawkaLeku!.wersjaStanu)).rejects.toThrow('nieaktualny')
    expect(await baza.tabela('dziennikLekow').toArray()).toEqual(historia)
    expect(await baza.tabela('przypomnienia').get(historyczny.id)).toBeDefined()
  })

  it('przyjmuje rzeczywistą ilość atomowo, odrzuca ponowne kliknięcie i alarm sprzed nowszej decyzji', async () => {
    await przygotuj()
    const alarm = (await uzgodnijPrzypomnieniaLekow())[0]
    const wystapienie = await dawka(alarm.id)
    const dane = { oczekiwanaWersjaStanu: alarm.dawkaLeku!.wersjaStanu, przyjetaIlosc: 2 }
    await zapiszStatusDawkiZApteczka(wystapienie, 'zazyte', undefined, dane)
    expect(stanApteczki((await baza.tabela('leki').get(wystapienie.lek.id))!)).toBe(8)
    await expect(zapiszStatusDawkiZApteczka(wystapienie, 'pominiete', undefined, dane)).rejects.toThrow('nieaktualny')
    await expect(zapiszStatusDawkiZApteczka(wystapienie, 'zazyte', undefined, dane)).rejects.toThrow('nieaktualny')
    await expect(sprawdzAlarmDawki(alarm.id, dane.oczekiwanaWersjaStanu)).rejects.toThrow('nieaktualny')
    expect((await uzgodnijPrzypomnieniaLekow()).find((element) => element.id === alarm.id)?.stan).toBe('wykonane')
    expect(stanApteczki((await baza.tabela('leki').get(wystapienie.lek.id))!)).toBe(8)
  })

  it('odracza przez północ z zachowaniem ID i pomija przez centralną usługę', async () => {
    await przygotuj()
    const alarm = (await uzgodnijPrzypomnieniaLekow())[0]
    const wystapienie = await dawka(alarm.id)
    const odroczoneDo = new Date('2026-10-12T01:00:00').toISOString()
    await zapiszStatusDawkiZApteczka(wystapienie, 'odroczone', odroczoneDo, { oczekiwanaWersjaStanu: alarm.dawkaLeku!.wersjaStanu })
    vi.setSystemTime(new Date('2026-10-12T00:30:00'))
    const odroczony = (await uzgodnijPrzypomnieniaLekow()).find((element) => element.id === alarm.id)!
    expect(odroczony.odroczoneDo).toBe(odroczoneDo)
    expect(odroczony.dawkaLeku?.data).toBe('2026-10-11')
    const aktualna = await dawka(alarm.id)
    await zapiszStatusDawkiZApteczka(aktualna, 'pominiete', undefined, { oczekiwanaWersjaStanu: odroczony.dawkaLeku!.wersjaStanu })
    expect((await uzgodnijPrzypomnieniaLekow()).find((element) => element.id === alarm.id)?.stan).toBe('pominiete')
    expect(stanApteczki((await baza.tabela('leki').get(aktualna.lek.id))!)).toBe(10)
  })

  it('przy niedoborze wymaga jawnego potwierdzenia i nie tworzy dostawy', async () => {
    await przygotuj()
    const alarm = (await uzgodnijPrzypomnieniaLekow())[0]
    const wystapienie = await dawka(alarm.id)
    const dane = { oczekiwanaWersjaStanu: alarm.dawkaLeku!.wersjaStanu, przyjetaIlosc: 12 }
    await expect(zapiszStatusDawkiZApteczka(wystapienie, 'zazyte', undefined, dane)).rejects.toThrow('Potwierdź rozbieżność')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    await zapiszStatusDawkiZApteczka(wystapienie, 'zazyte', undefined, { ...dane, potwierdzRozbieznosc: true })
    const lek = (await baza.tabela('leki').get(wystapienie.lek.id))!
    expect(stanApteczki(lek)).toBe(0)
    expect(lek.ruchyApteczki?.filter((ruch) => ruch.typ === 'dodanie')).toHaveLength(1)
    expect((await baza.tabela('dziennikLekow').toArray())[0].nierozliczonaIlosc).toBe(2)
  })

  it('cofnięcie zwraca wyłącznie zużyty zapas i odnawia alarm; wykonanie przypomnienia nie zapisuje przyjęcia', async () => {
    await przygotuj()
    const alarm = (await uzgodnijPrzypomnieniaLekow())[0]
    await baza.tabela('przypomnienia').put(zakonczPrzypomnienie(alarm).wykonane)
    expect((await uzgodnijPrzypomnieniaLekow()).find((element) => element.id === alarm.id)?.stan).toBe('wykonane')
    expect(await baza.tabela('dziennikLekow').count()).toBe(0)
    const lek = (await baza.tabela('leki').get(alarm.dawkaLeku!.lekId))!
    const wystapienie = generujDawkiDnia([lek], [], alarm.dawkaLeku!.data)[0]
    await zapiszStatusDawkiZApteczka(wystapienie, 'zazyte')
    await uzgodnijPrzypomnieniaLekow()
    vi.setSystemTime(new Date('2026-10-11T07:01:00'))
    const aktualnyLek = (await baza.tabela('leki').get(lek.id))!
    const przyjeta = generujDawkiDnia([aktualnyLek], await baza.tabela('dziennikLekow').toArray(), wystapienie.data)[0]
    await zapiszStatusDawkiZApteczka(przyjeta, 'oczekuje')
    expect((await uzgodnijPrzypomnieniaLekow()).find((element) => element.id === alarm.id)?.stan).toBe('nowe')
    expect(stanApteczki((await baza.tabela('leki').get(lek.id))!)).toBe(10)
  })

  it('wyłączenie leku anuluje alarmy i zachowuje rekordy', async () => {
    const lek = await przygotuj()
    const przed = await uzgodnijPrzypomnieniaLekow()
    await baza.tabela('leki').put({ ...lek, aktywny: false })
    const po = await uzgodnijPrzypomnieniaLekow()
    expect(po).toHaveLength(przed.length)
    expect(po.every((alarm) => alarm.dawkaLeku?.nieaktualne && alarm.stan === 'pominiete')).toBe(true)
  })

  it('awaria outboxu wycofuje cały plan', async () => {
    await przygotuj()
    const przed = await tabelaKolejki().toArray()
    const awaria = vi.spyOn(tabelaKolejki(), 'add').mockImplementationOnce(() => { throw new Error('Awaria') })
    try { await expect(uzgodnijPrzypomnieniaLekow()).rejects.toThrow('Awaria') } finally { awaria.mockRestore() }
    expect(await baza.tabela('przypomnienia').count()).toBe(0)
    expect(await tabelaKolejki().toArray()).toEqual(przed)
  })

  it('spóźnione dostarczenie nie nadpisuje nowszego odroczenia', async () => {
    await przygotuj()
    const alarm = (await uzgodnijPrzypomnieniaLekow())[0]
    await zapiszStatusDawkiZApteczka(await dawka(alarm.id), 'odroczone', new Date('2026-10-11T12:00:00').toISOString())
    const aktualny = (await uzgodnijPrzypomnieniaLekow()).find((element) => element.id === alarm.id)!
    await oznaczDostarczeniePrzypomnienia(alarm)
    expect(await baza.tabela('przypomnienia').get(alarm.id)).toEqual(aktualny)
  })

  it('rozróżnia dwa jesienne wystąpienia interwałowe i pomija wiosenną nieistniejącą godzinę', async () => {
    const srodowisko = (globalThis as typeof globalThis & { process: { env: Record<string, string | undefined> } }).process.env
    const poprzedniaStrefa = srodowisko.TZ
    srodowisko.TZ = 'Europe/Warsaw'
    try {
      vi.setSystemTime(new Date('2026-10-25T00:00:00'))
      const lek: Lek = { ...utworzMetadane('interwal'), nazwa: 'Interwał', dawkaInstrukcja: '', godziny: ['00:00'], dawki: [{ id: 'dawka', godzina: '00:00', ilosc: 1 }], trybDawkowania: 'co_x_godzin', interwalGodzin: 1, pierwszaGodzina: '00:00', jednostka: 'szt.', aktywny: true }
      await zapiszLekZDodanymZapasem(lek, 100)
      const alarmy = (await uzgodnijPrzypomnieniaLekow()).filter((alarm) => alarm.dawkaLeku?.data === '2026-10-25' && new Date(alarm.czas!).getHours() === 2)
      expect(alarmy).toHaveLength(2)
      expect(alarmy[0].id).not.toBe(alarmy[1].id)
      expect(alarmy[0].czas).not.toBe(alarmy[1].czas)
      expect(sciezkaAlarmuDawki(alarmy[0])).not.toBe(sciezkaAlarmuDawki(alarmy[1]))
      expect(wersjaStanuDawki(await dawka(alarmy[0].id))).not.toBe(wersjaStanuDawki(await dawka(alarmy[1].id)))
      await baza.tabela('leki').clear(); await baza.tabela('przypomnienia').clear()
      vi.setSystemTime(new Date('2026-03-29T00:00:00'))
      await zapiszLekZDodanymZapasem({ ...lek, id: 'wiosna', trybDawkowania: 'konkretne_godziny', godziny: ['02:30'], dawki: [{ id: 'rano', godzina: '02:30', ilosc: 1 }] })
      expect((await uzgodnijPrzypomnieniaLekow()).some((alarm) => alarm.dawkaLeku?.data === '2026-03-29')).toBe(false)
    } finally { if (poprzedniaStrefa === undefined) delete srodowisko.TZ; else srodowisko.TZ = poprzedniaStrefa }
  })
})
