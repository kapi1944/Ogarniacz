import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { baza } from '../data/BazaOgarniacza'
import { rekordDoSynchronizacji, zachowajLokalneSamopoczucie } from '../data/KolejkaSynchronizacji'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { normalizujUstawienia } from '../domain/ustawienia'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie, Zadanie } from '../domain/typy'
import { ustawBiezacyDostep } from './UprawnieniaService'
import { utworzZadanie } from './ZadaniaService'
import { przywrocBackup, utworzBackup } from './BackupService'
import { czyPodsumowaniePoPracyWlaczone, oznaczStanPodsumowaniaPoPracy, planPodsumowanPoPracy, pobierzDanePodsumowaniaPoPracy, profilPodsumowaniaPoPracy, terminPodsumowaniaPoPracy, utworzPodsumowaniePoPracy, uzgodnijPodsumowaniaPoPracy, type DanePodsumowaniaPoPracy } from './PodsumowaniePoPracyService'

let dane: DanePodsumowaniaPoPracy
const data = '2026-11-02'
const czas = (godzina: string, dzien = data) => new Date(`${dzien}T${godzina}:00`)
const zadanie = (id: string, zmiany: Partial<Zadanie> = {}): Zadanie => ({ ...utworzZadanie({ tytul: id, termin: data }), id, ...zmiany })
const podsumowanie = () => utworzPodsumowaniePoPracy(data, dane)!
const dzisiejsze = async () => (await baza.tabela('przypomnienia').toArray()).find((element) => element.echoPoPracy?.data === data)!

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(czas('12:00'))
  localStorage.clear()
  for (const tabela of ['zadania', 'ustawienia', 'wyjatkiGrafiku', 'urlopy', 'przypomnienia', 'kolejkaSynchronizacji'] as const) await baza.tabela(tabela).clear()
  dane = { ustawienia: normalizujUstawienia({ harmonogram: { godzinaRozpoczecia: '08:00', godzinaZakonczenia: '16:00', powrotZPracyMinuty: 40 } }), zadania: [], wyjatki: [], urlopy: [] }
  await repozytoriumUstawien.zapisz(dane.ustawienia)
})
afterEach(() => { vi.useRealTimers(); localStorage.clear(); ustawBiezacyDostep(() => true) })

describe('Echo P1 — termin i wybór zadań', () => {
  it.each([
    ['P1-01', '16:00', 40, 30, '17:10'], ['P1-02', '15:00', 40, 30, '16:10'],
    ['P1-03', '16:00', 60, 30, '17:30'], ['P1-04', '16:00', 40, 45, '17:25'],
  ])('%s wylicza termin z końca powrotu', (_, koniec, powrot, opoznienie, oczekiwana) => {
    dane.ustawienia.harmonogram.godzinaZakonczenia = String(koniec)
    dane.ustawienia.harmonogram.powrotZPracyMinuty = Number(powrot)
    dane.ustawienia.podsumowaniePoPracy.opoznienieMinuty = Number(opoznienie)
    expect(terminPodsumowaniaPoPracy(data, dane)).toBe(czas(String(oczekiwana)).toISOString())
  })

  it('P1-05 nie planuje dnia wolnego', () => { expect(terminPodsumowaniaPoPracy('2026-11-07', dane)).toBeUndefined() })
  it('P1-06 respektuje urlop', () => {
    dane.urlopy = [{ ...utworzMetadane('urlop'), dataOd: data, dataDo: data, typ: 'wypoczynkowy', status: 'potwierdzony' }]
    expect(terminPodsumowaniaPoPracy(data, dane)).toBeUndefined()
  })
  it.each([false, true])('P1-07/08 respektuje wyjątek pracuje=%s', (pracuje) => {
    dane.wyjatki = [{ ...utworzMetadane('wyjatek'), data, pracuje, od: '08:00', do: '15:00' }]
    expect(terminPodsumowaniaPoPracy(data, dane)).toBe(pracuje ? czas('16:10').toISOString() : undefined)
  })
  it('P1-09 nie zastępuje brakującego powrotu końcem pracy', () => {
    dane.ustawienia.harmonogram.powrotZPracyMinuty = 0
    expect(terminPodsumowaniaPoPracy(data, dane)).toBeUndefined()
  })
  it('P1-10 brak zadań nie tworzy alarmu', () => { expect(planPodsumowanPoPracy(dane, czas('12:00'))).toEqual([]) })
  it.each([
    ['P1-11', ['2026-10-29', '2026-10-31', '2026-11-01'], 3, 0],
    ['P1-12', [data], 0, 1], ['P1-13', ['2026-11-01', data], 1, 1],
  ])('%s zachowuje osobne kategorie', (_, daty, zalegle, dzisiaj) => {
    dane.zadania = (daty as string[]).map((termin, indeks) => zadanie(String(indeks), { termin }))
    expect(podsumowanie()).toMatchObject({ liczbaZaleglych: zalegle, liczbaNaDzisiaj: dzisiaj, liczbaRazem: Number(zalegle) + Number(dzisiaj) })
  })
  it.each(['wykonany', 'anulowany', 'pominiety'] as const)('P1-14/15 pomija status %s', (statusElementu) => {
    dane.zadania = [zadanie('zamkniete', { statusElementu })]
    expect(podsumowanie().liczbaRazem).toBe(0)
  })
  it.each(['wykonane', 'anulowane', 'pominiete'])('pomija historyczny status %s', (status) => {
    dane.zadania = [zadanie('legacy', { status: status as Zadanie['status'] })]
    expect(podsumowanie().liczbaRazem).toBe(0)
  })
  it('P1-16 uwzględnia zadania w toku', () => { dane.zadania = [zadanie('w toku', { status: 'w_toku' })]; expect(podsumowanie().liczbaRazem).toBe(1) })
  it('P1-17 pomija zadania bez daty, przyszłe i usunięte', () => {
    dane.zadania = [zadanie('bez daty', { termin: undefined }), zadanie('przyszle', { termin: '2026-11-03' }), zadanie('usuniete', { usunietoAt: czas('11:00').toISOString() })]
    expect(podsumowanie().liczbaRazem).toBe(0)
  })
  it('P1-18/19 obsługuje daty kanoniczne, godziny, końce dnia i deadline bez drugiej daty', () => {
    dane.zadania = [zadanie('godzina', { dataElementu: data, godzinaElementu: '08:00', trybTerminuElementu: 'o_godzinie', termin: '2026-10-01' }),
      zadanie('koniec', { dataElementu: data, trybTerminuElementu: 'koniec_dnia', termin: undefined }),
      zadanie('bez godziny', { dataElementu: data, trybTerminuElementu: 'bez_godziny' }),
      zadanie('deadline', { termin: undefined, terminGranicznyElementu: data })]
    expect(podsumowanie()).toMatchObject({ liczbaZaleglych: 0, liczbaNaDzisiaj: 4 })
  })
  it('P1-20 deduplikuje aktualne wystąpienia bez generowania kolejnych', () => {
    const cykliczne = zadanie('seria', { powtarzanie: { typ: 'codziennie' } })
    dane.zadania = [cykliczne, cykliczne, zadanie('poprzednie', { status: 'wykonane', termin: '2026-11-01', powtarzanie: { typ: 'codziennie' } })]
    expect(podsumowanie().dzisiaj.map((pozycja) => pozycja.element.id)).toEqual(['seria'])
    expect(dane.zadania).toHaveLength(3)
  })
  it('P1-21 sortuje cztery priorytety i stabilnie rozstrzyga identyczne terminy', () => {
    dane.zadania = [zadanie('niski', { priorytet: 'niski', godzinaElementu: '07:00' }), zadanie('normalny'), zadanie('wysoki', { priorytet: 'wysoki' }), zadanie('krytyczny', { priorytet: 'krytyczny' }), zadanie('a')]
    expect(podsumowanie().dzisiaj.map((pozycja) => pozycja.element.id)).toEqual(['krytyczny', 'wysoki', 'a', 'normalny', 'niski'])
  })
  it('P1-22 bez priorytetów sortuje chronologicznie', () => {
    dane.ustawienia.podsumowaniePoPracy.priorytety = false
    dane.zadania = [zadanie('pilne', { priorytet: 'krytyczny', termin: '2026-11-01' }), zadanie('starsze', { priorytet: 'niski', termin: '2026-10-01' })]
    expect(podsumowanie().zalegle.map((pozycja) => pozycja.element.id)).toEqual(['starsze', 'pilne'])
  })
  it('P1-28/29 respektuje proaktywność, wyciszenie i dostęp Echo do zadań', () => {
    expect(czyPodsumowaniePoPracyWlaczone(dane.ustawienia)).toBe(true)
    for (const zmiany of [{ proaktywnoscEcho: false }, { echoWyciszone: true }, { modulyEcho: [] }]) expect(czyPodsumowaniePoPracyWlaczone({ ...dane.ustawienia, ...zmiany })).toBe(false)
  })
  it('P1-31 normalizuje starsze ustawienia i granice bez zmiany innych preferencji', () => {
    expect(normalizujUstawienia({ echoWyciszone: true }).podsumowaniePoPracy).toEqual({ wlaczone: true, opoznienieMinuty: 30, zalegle: true, dzisiaj: true, priorytety: true })
    for (const [wartosc, wynik] of [[-1, 0], [181, 180], [30.5, 31], [NaN, 30]]) expect(normalizujUstawienia({ podsumowaniePoPracy: { opoznienieMinuty: wartosc } }).podsumowaniePoPracy.opoznienieMinuty).toBe(wynik)
  })
  it('P1-32 powrót przez północ zachowuje datę dnia pracy', () => {
    dane.ustawienia.harmonogram.godzinaZakonczenia = '23:40'
    dane.ustawienia.harmonogram.powrotZPracyMinuty = 60
    expect(podsumowanie()).toMatchObject({ data, termin: czas('01:10', '2026-11-03').toISOString() })
  })
  it.each(['2026-03-28', '2026-10-24'])('P1-33 liczy minuty rzeczywiste przy zmianie czasu: %s', (dzien) => {
    dane.ustawienia.harmonogram.dniPracy = [6]
    dane.ustawienia.harmonogram.godzinaZakonczenia = '23:30'
    dane.ustawienia.harmonogram.powrotZPracyMinuty = 180
    dane.ustawienia.podsumowaniePoPracy.opoznienieMinuty = 60
    expect(Date.parse(terminPodsumowaniaPoPracy(dzien, dane)!)).toBe(czas('23:30', dzien).getTime() + 240 * 60_000)
  })
  it('P1-34 ukrycie na Pulpicie nie wyklucza zadania', () => { dane.zadania = [zadanie('ukryte', { pokazNaPulpicie: false })]; expect(podsumowanie().liczbaRazem).toBe(1) })
  it('P1-35 nie ujawnia prywatnych ćwiczeń ani danych bez uprawnień', async () => {
    dane.zadania = [zadanie('prywatne', { sesjaTerapiiId: 'sesja' })]
    expect(podsumowanie().liczbaRazem).toBe(0)
    ustawBiezacyDostep((modul) => modul !== 'zadania')
    expect(await pobierzDanePodsumowaniaPoPracy()).toBeUndefined()
  })
  it('P1-38 nie nadrabia wielu godzin i dawnych dni', () => {
    dane.zadania = [zadanie('otwarte')]
    expect(planPodsumowanPoPracy(dane, czas('18:10')).some((pozycja) => pozycja.data === data)).toBe(true)
    expect(planPodsumowanPoPracy(dane, czas('18:11')).some((pozycja) => pozycja.data === data)).toBe(false)
  })
})

describe('Echo P1 — trwały cykl przypomnienia', () => {
  beforeEach(async () => { await baza.tabela('zadania').put(zadanie('zadanie')) })
  it('P1-23 anuluje alarm po ukończeniu wszystkich zadań', async () => {
    await uzgodnijPodsumowaniaPoPracy(czas('12:00'), true)
    await baza.tabela('zadania').update('zadanie', { status: 'wykonane' })
    await uzgodnijPodsumowaniaPoPracy(czas('13:00'), true)
    expect((await dzisiejsze()).stan).toBe('pominiete')
  })
  it('P1-24/25/26 restart, sync i zmiana grafiku nie ponawiają doręczenia', async () => {
    await uzgodnijPodsumowaniaPoPracy(czas('17:10'), false)
    expect(await oznaczStanPodsumowaniaPoPracy((await dzisiejsze()).id, 'dostarczone', czas('17:10'))).toBe(true)
    baza.close(); await baza.open()
    dane.ustawienia.harmonogram.godzinaZakonczenia = '17:00'
    await repozytoriumUstawien.zapisz(dane.ustawienia)
    await uzgodnijPodsumowaniaPoPracy(czas('17:20'), false)
    const zapisane = await dzisiejsze()
    expect(zapisane.echoPoPracy?.dostarczonoAt).toBe(czas('17:10').toISOString())
    expect(await oznaczStanPodsumowaniaPoPracy(zapisane.id, 'dostarczone', czas('18:10'))).toBe(false)
  })
  it('P1-27 wyłącza przyszłe wystąpienia i zachowuje zwykłe przypomnienia', async () => {
    const inne: Przypomnienie = { ...utworzMetadane('inne'), tytul: 'Inne', typ: 'absolutne', czas: czas('18:00').toISOString(), stan: 'nowe', priorytet: 'normalny', eskalacja: false }
    await baza.tabela('przypomnienia').put(inne)
    await uzgodnijPodsumowaniaPoPracy(czas('12:00'), true)
    dane.ustawienia.podsumowaniePoPracy.wlaczone = false
    await repozytoriumUstawien.zapisz(dane.ustawienia)
    await uzgodnijPodsumowaniaPoPracy(czas('12:01'), true)
    expect((await dzisiejsze()).stan).toBe('pominiete')
    expect(await baza.tabela('przypomnienia').get('inne')).toEqual(inne)
  })
  it('P1-30 działa wyłącznie na lokalnych danych offline', async () => {
    const siec = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect((await uzgodnijPodsumowaniaPoPracy(czas('12:00'), false)).some((element) => element.echoPoPracy)).toBe(true)
    expect(siec).not.toHaveBeenCalled(); siec.mockRestore()
  })
  it('P1-36 zmiany grafiku zastępują termin zachowując ID', async () => {
    await uzgodnijPodsumowaniaPoPracy(czas('12:00'), true)
    const poprzednie = await dzisiejsze()
    dane.ustawienia.harmonogram.godzinaZakonczenia = '15:00'
    await repozytoriumUstawien.zapisz(dane.ustawienia)
    await uzgodnijPodsumowaniaPoPracy(czas('12:01'), true)
    expect(await dzisiejsze()).toMatchObject({ id: poprzednie.id, czas: czas('16:10').toISOString(), stan: 'nowe' })
  })
  it('P1-37 równoległe uzgodnienia i próby dostarczenia tworzą jeden zapis', async () => {
    await Promise.all(Array.from({ length: 4 }, () => uzgodnijPodsumowaniaPoPracy(czas('17:10'), false)))
    const id = (await dzisiejsze()).id
    const wyniki = await Promise.all(Array.from({ length: 4 }, () => oznaczStanPodsumowaniaPoPracy(id, 'dostarczone', czas('17:10'))))
    expect(wyniki.filter(Boolean)).toHaveLength(1)
    expect((await baza.tabela('przypomnienia').toArray()).filter((element) => element.echoPoPracy?.data === data)).toHaveLength(1)
  })
  it('P1-39 odrzuca poprzedni profil', async () => {
    await uzgodnijPodsumowaniaPoPracy(czas('17:10'), false)
    const stare = await dzisiejsze()
    await baza.tabela('przypomnienia').put({ ...stare, echoPoPracy: { ...stare.echoPoPracy!, profilId: 'inny-profil' } })
    expect(await oznaczStanPodsumowaniaPoPracy(stare.id, 'dostarczone', czas('17:10'))).toBe(false)
  })
  it('P1-40 starszy rekord synchronizacji zachowuje dostarczenie, a planowanie pozostaje lokalne', async () => {
    await uzgodnijPodsumowaniaPoPracy(czas('12:00'), true)
    const stare = await dzisiejsze()
    await oznaczStanPodsumowaniaPoPracy(stare.id, 'zaplanowane', czas('12:00'))
    const lokalne = await dzisiejsze()
    expect(lokalne.stan).toBe('nowe')
    expect((rekordDoSynchronizacji('przypomnienia', lokalne) as Przypomnienie).echoPoPracy?.zaplanowanoNa).toBeUndefined()
    await uzgodnijPodsumowaniaPoPracy(czas('17:11'), true, [lokalne.id])
    const dostarczone = await dzisiejsze()
    const scalone = zachowajLokalneSamopoczucie('przypomnienia', stare, dostarczone) as Przypomnienie
    expect(scalone.echoPoPracy?.dostarczonoAt).toBe(czas('17:11').toISOString())
    const bezMetadanych = { ...stare, echoPoPracy: undefined }
    expect((zachowajLokalneSamopoczucie('przypomnienia', bezMetadanych, dostarczone) as Przypomnienie).echoPoPracy?.dostarczonoAt).toBe(czas('17:11').toISOString())
    expect(profilPodsumowaniaPoPracy()).toBe(dostarczone.echoPoPracy?.profilId)
  })
  it('sam upływ natywnego terminu nie udaje potwierdzonego dostarczenia i nie ponawia alarmu', async () => {
    await uzgodnijPodsumowaniaPoPracy(czas('12:00'), true)
    await oznaczStanPodsumowaniaPoPracy((await dzisiejsze()).id, 'zaplanowane', czas('12:00'))
    await uzgodnijPodsumowaniaPoPracy(czas('17:11'), true)
    expect((await dzisiejsze()).echoPoPracy).toMatchObject({ zamknietoOknoAt: czas('17:11').toISOString() })
    expect((await dzisiejsze()).echoPoPracy?.dostarczonoAt).toBeUndefined()
    expect(await oznaczStanPodsumowaniaPoPracy((await dzisiejsze()).id, 'dostarczone', czas('17:11'))).toBe(false)
  })
  it('weryfikuje ponownie ukończenie zadania tuż przed doręczeniem', async () => {
    await uzgodnijPodsumowaniaPoPracy(czas('17:10'), false)
    await baza.tabela('zadania').update('zadanie', { status: 'wykonane' })
    expect(await oznaczStanPodsumowaniaPoPracy((await dzisiejsze()).id, 'dostarczone', czas('17:10'))).toBe(false)
  })
  it('starszy backup nie usuwa historii dostarczenia', async () => {
    const starszaKopia = await utworzBackup(['pozostaleDane', 'ustawienia'])
    await uzgodnijPodsumowaniaPoPracy(czas('17:10'), false)
    const id = (await dzisiejsze()).id
    await oznaczStanPodsumowaniaPoPracy(id, 'dostarczone', czas('17:10'))
    await przywrocBackup(starszaKopia)
    await uzgodnijPodsumowaniaPoPracy(czas('17:11'), false)
    expect((await dzisiejsze()).echoPoPracy?.dostarczonoAt).toBe(czas('17:10').toISOString())
    expect(await oznaczStanPodsumowaniaPoPracy(id, 'dostarczone', czas('17:11'))).toBe(false)
  })
  it('istniejąca baza bez nowych pól zachowuje preferencje i otrzymuje domyślne ustawienia', async () => {
    const { podsumowaniePoPracy: _nowe, ...stare } = dane.ustawienia
    await baza.tabela('ustawienia').put({ ...stare, echoWyciszone: true } as typeof dane.ustawienia)
    baza.close(); await baza.open()
    const odczytane = await repozytoriumUstawien.wczytaj()
    expect(odczytane.echoWyciszone).toBe(true)
    expect(odczytane.harmonogram).toEqual(stare.harmonogram)
    expect(odczytane.podsumowaniePoPracy.opoznienieMinuty).toBe(30)
  })
})
