import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { odroczPrzypomnienie, zakonczPrzypomnienie } from '../services/PrzypomnieniaService'
import { mapujPrzypomnienieNaPowiadomienie, utworzUslugePowiadomien } from './NotificationService'
import { sciezkaDlaSourceRef } from './trasy'

const lokalnePowiadomienia = vi.hoisted(() => ({
  addListener: vi.fn(),
  areEnabled: vi.fn(),
  cancel: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  checkPermissions: vi.fn(),
  createChannel: vi.fn(),
  getAll: vi.fn(),
  getPending: vi.fn(),
  listChannels: vi.fn(),
  registerActionTypes: vi.fn(),
  removeDeliveredNotificationsById: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: lokalnePowiadomienia }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-31T12:00:00.000Z'))
  vi.clearAllMocks()
  lokalnePowiadomienia.addListener.mockResolvedValue({ remove: vi.fn() })
  lokalnePowiadomienia.areEnabled.mockResolvedValue({ value: true })
  lokalnePowiadomienia.cancel.mockResolvedValue(undefined)
  lokalnePowiadomienia.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
  lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'granted' })
  lokalnePowiadomienia.createChannel.mockResolvedValue(undefined)
  lokalnePowiadomienia.getAll.mockResolvedValue({ notifications: [] })
  lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [] })
  lokalnePowiadomienia.listChannels.mockResolvedValue({ channels: [
    { id: 'ogarniacz-wazne', importance: 4 },
    { id: 'ogarniacz-zwykle', importance: 3 },
    { id: 'ogarniacz-zdrowie', importance: 3 },
    { id: 'ogarniacz-finanse', importance: 3 },
  ] })
  lokalnePowiadomienia.requestPermissions.mockResolvedValue({ display: 'granted' })
  lokalnePowiadomienia.registerActionTypes.mockResolvedValue(undefined)
  lokalnePowiadomienia.removeDeliveredNotificationsById.mockResolvedValue(undefined)
  lokalnePowiadomienia.schedule.mockResolvedValue({ notifications: [] })
  lokalnePowiadomienia.update.mockResolvedValue(undefined)
})

afterEach(() => vi.useRealTimers())

const przypomnienie = (zmiany: Partial<Przypomnienie> = {}): Przypomnienie => ({
  ...utworzMetadane('przypomnienie-1'),
  tytul: 'Zadzwoń do dentysty',
  typ: 'absolutne',
  czas: '2026-09-01T10:00:00.000Z',
  priorytet: 'normalny',
  stan: 'nowe',
  eskalacja: false,
  ...zmiany,
})

describe('mapowanie przypomnienia na kanał platformowy', () => {
  it('mapuje sourceRef zadania na właściwy rekord i trasę', () => {
    const wynik = mapujPrzypomnienieNaPowiadomienie(przypomnienie({
      zrodlo: { typ: 'zadania', id: 'zadanie 7' },
    }))

    expect(wynik).toMatchObject({
      przypomnienieId: 'przypomnienie-1',
      tresc: 'Zadzwoń do dentysty',
      sourceRef: { typ: 'zadania', id: 'zadanie 7' },
      sciezka: '/zadania?element=zadanie%207',
      kanal: 'ogarniacz-zwykle',
      wymagaDokladnosci: false,
    })
  })

  it('korzysta z istniejącej logiki czasu względnego i kanału ważnego', () => {
    const wynik = mapujPrzypomnienieNaPowiadomienie(przypomnienie({
      typ: 'wzgledne',
      przesuniecieMin: 30,
      priorytet: 'wysoki',
      zrodlo: { typ: 'wizyty', id: 'wizyta-1' },
    }))

    expect(wynik?.termin).toBe('2026-09-01T09:30:00.000Z')
    expect(wynik?.kanal).toBe('ogarniacz-wazne')
    expect(wynik?.sciezka).toBe('/zdrowie/wizyty?element=wizyta-1')
    expect(wynik?.wymagaDokladnosci).toBe(false)
  })

  it.each([
    [{ typ: 'leki' as const, id: 'lek-1' }, 'ogarniacz-zdrowie'],
    [{ typ: 'finanse' as const, id: 'wydatek-1' }, 'ogarniacz-finanse'],
  ])('dobiera kanał dziedzinowy dla %o', (zrodlo, kanal) => {
    expect(mapujPrzypomnienieNaPowiadomienie(przypomnienie({ zrodlo }))?.kanal).toBe(kanal)
  })

  it('nie mapuje zakończonego przypomnienia', () => {
    expect(mapujPrzypomnienieNaPowiadomienie(przypomnienie({ stan: 'wykonane' }))).toBeUndefined()
  })

  it('nie mapuje usuniętego przypomnienia', () => {
    expect(mapujPrzypomnienieNaPowiadomienie(przypomnienie({ usunietoAt: '2026-09-01T09:00:00.000Z' }))).toBeUndefined()
  })

  it('nie zapisuje treści przypomnienia w technicznej wersji payloadu', () => {
    const wynik = mapujPrzypomnienieNaPowiadomienie(przypomnienie())

    expect(wynik?.wersja).toMatch(/^v2-[a-f0-9]{8}$/)
    expect(wynik?.wersja).not.toContain('Zadzwoń do dentysty')
  })
})

describe('routing sourceRef', () => {
  it.each([
    [{ typ: 'notatki' as const, id: 'n-1' }, '/notatki?element=n-1'],
    [{ typ: 'na_pozniej' as const, id: 'p-1' }, '/na-pozniej?element=p-1'],
    [{ typ: 'finanse' as const, id: 'f-1' }, '/finanse?element=f-1'],
  ])('mapuje %o na %s', (sourceRef, oczekiwanaSciezka) => {
    expect(sciezkaDlaSourceRef(sourceRef, 'przypomnienie-1')).toBe(oczekiwanaSciezka)
  })

  it('bez sourceRef prowadzi do rekordu przypomnienia', () => {
    expect(sciezkaDlaSourceRef(undefined, 'przypomnienie 1')).toBe('/przypomnienia?element=przypomnienie%201')
  })

  it('przetwarza powtórzoną akcję powiadomienia tylko raz', async () => {
    const usluga = utworzUslugePowiadomien(true)
    await usluga.inicjalizuj()
    const obsluga = vi.fn()
    usluga.nasluchujAkcji(obsluga)
    const akcja = lokalnePowiadomienia.addListener.mock.calls[0][1]

    akcja({ actionId: 'tap', notification: { extra: { przypomnienieId: 'przypomnienie-1', sciezka: '/zadania?element=zadanie-1' } } })
    akcja({ actionId: 'tap', notification: { extra: { przypomnienieId: 'przypomnienie-1', sciezka: '/zadania?element=zadanie-1' } } })
    akcja({ actionId: 'tap', notification: { extra: { przypomnienieId: 'przypomnienie-1', sciezka: '/admin?element=zadanie-1' } } })

    expect(obsluga).toHaveBeenCalledTimes(1)
    expect(obsluga).toHaveBeenCalledWith({
      typ: 'otworz',
      przypomnienieId: 'przypomnienie-1',
      sciezka: '/zadania?element=zadanie-1',
    })
  })

  it('rejestruje tylko dwie proste akcje przypomnienia', async () => {
    await utworzUslugePowiadomien(true).inicjalizuj()

    expect(lokalnePowiadomienia.registerActionTypes).toHaveBeenCalledWith({
      types: [{
        id: 'ogarniacz-przypomnienie',
        actions: [
          { id: 'wykonane', title: 'Wykonane' },
          { id: 'odrocz', title: 'Za 15 min' },
        ],
      }],
    })
  })
})

describe('reconciliation natywnych powiadomień', () => {
  it('planuje alarm po utworzeniu przypomnienia', async () => {
    const utworzone = przypomnienie()
    const docelowe = mapujPrzypomnienieNaPowiadomienie(utworzone)!

    await utworzUslugePowiadomien(true).synchronizuj([utworzone], true)

    expect(lokalnePowiadomienia.schedule).toHaveBeenCalledWith(expect.objectContaining({
      notifications: [expect.objectContaining({ id: docelowe.id })],
    }))
  })

  it('nie tworzy kolejnej kopii, gdy oczekujące powiadomienie ma tę samą wersję', async () => {
    const docelowe = mapujPrzypomnienieNaPowiadomienie(przypomnienie())!
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{
      id: docelowe.id,
      extra: { ogarniacz: true, wersja: docelowe.wersja },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([przypomnienie()], true)

    expect(lokalnePowiadomienia.cancel).not.toHaveBeenCalled()
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
    expect(lokalnePowiadomienia.update).not.toHaveBeenCalled()
  })

  it('nie planuje ponownie alarmu, który Android już wyświetlił', async () => {
    const wyswietlonePrzypomnienie = przypomnienie({ czas: '2026-08-31T11:00:00.000Z' })
    const dostarczone = mapujPrzypomnienieNaPowiadomienie(wyswietlonePrzypomnienie)!
    lokalnePowiadomienia.getAll.mockResolvedValue({ notifications: [{
      id: dostarczone.id,
      extra: { ogarniacz: true, wersja: dostarczone.wersja },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([wyswietlonePrzypomnienie], true)

    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
    expect(lokalnePowiadomienia.removeDeliveredNotificationsById).not.toHaveBeenCalled()
  })

  it('przy zmianie terminu anuluje poprzedni harmonogram i tworzy aktualny', async () => {
    const poprzednie = mapujPrzypomnienieNaPowiadomienie(przypomnienie())!
    const zmienione = przypomnienie({ czas: '2026-09-01T11:00:00.000Z' })
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{
      id: poprzednie.id,
      extra: { ogarniacz: true, wersja: poprzednie.wersja },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([zmienione], true)

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: poprzednie.id }] })
    expect(lokalnePowiadomienia.schedule).toHaveBeenCalledWith(expect.objectContaining({
      notifications: [expect.objectContaining({ id: poprzednie.id, schedule: expect.objectContaining({ at: expect.any(Date) }) })],
    }))
  })

  it('anuluje oczekujące powiadomienie po usunięciu przypomnienia', async () => {
    const oczekujace = mapujPrzypomnienieNaPowiadomienie(przypomnienie())!
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{
      id: oczekujace.id,
      extra: { ogarniacz: true, wersja: oczekujace.wersja },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([
      przypomnienie({ usunietoAt: '2026-09-01T11:00:00.000Z' }),
    ], true)

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: oczekujace.id }] })
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })

  it('snooze zastępuje alarm tego samego wystąpienia bez tworzenia drugiego identyfikatora', async () => {
    const bazowe = przypomnienie({ czas: '2026-08-31T11:00:00.000Z' })
    const oczekujace = mapujPrzypomnienieNaPowiadomienie(bazowe)!
    const odroczone = odroczPrzypomnienie(bazowe, 15, new Date('2026-08-31T12:00:00.000Z'))
    lokalnePowiadomienia.getAll.mockResolvedValue({ notifications: [{
      id: oczekujace.id,
      extra: { ogarniacz: true, wersja: oczekujace.wersja },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([odroczone], true)

    const zaplanowane = lokalnePowiadomienia.schedule.mock.calls[0][0].notifications
    expect(lokalnePowiadomienia.removeDeliveredNotificationsById).toHaveBeenCalledWith({ ids: [oczekujace.id] })
    expect(zaplanowane).toHaveLength(1)
    expect(zaplanowane[0]).toMatchObject({ id: oczekujace.id })
    expect(zaplanowane[0].schedule.at.toISOString()).toBe('2026-08-31T12:15:00.000Z')
  })

  it('po wykonaniu cyklicznego wystąpienia anuluje je i planuje tylko następne', async () => {
    const biezace = przypomnienie({ typ: 'cykliczne', powtarzanie: { typ: 'codziennie', coIle: 1 } })
    const oczekujace = mapujPrzypomnienieNaPowiadomienie(biezace)!
    const wynik = zakonczPrzypomnienie(biezace)
    const nastepne = mapujPrzypomnienieNaPowiadomienie(wynik.nastepne!)!
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{
      id: oczekujace.id,
      extra: { ogarniacz: true, wersja: oczekujace.wersja },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([wynik.wykonane, wynik.nastepne!], true)

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: oczekujace.id }] })
    expect(lokalnePowiadomienia.schedule).toHaveBeenCalledWith(expect.objectContaining({
      notifications: [expect.objectContaining({ id: nastepne.id })],
    }))
  })

  it('po wykonaniu jednorazowego przypomnienia anuluje aktywny alarm', async () => {
    const biezace = przypomnienie()
    const oczekujace = mapujPrzypomnienieNaPowiadomienie(biezace)!
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{
      id: oczekujace.id,
      extra: { ogarniacz: true, wersja: oczekujace.wersja },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([zakonczPrzypomnienie(biezace).wykonane], true)

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: oczekujace.id }] })
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })

  it('uzgadnia kolejne stany z synchronizacji i nie duplikuje niezmienionego alarmu', async () => {
    let oczekujace: Array<{ id: number; extra?: Record<string, unknown> }> = []
    lokalnePowiadomienia.getPending.mockImplementation(async () => ({ notifications: oczekujace }))
    lokalnePowiadomienia.schedule.mockImplementation(async ({ notifications }) => {
      oczekujace = notifications.map(({ id, extra }: { id: number; extra?: Record<string, unknown> }) => ({ id, extra }))
      return { notifications: [] }
    })
    lokalnePowiadomienia.cancel.mockImplementation(async ({ notifications }) => {
      const anulowane = new Set(notifications.map(({ id }: { id: number }) => id))
      oczekujace = oczekujace.filter(({ id }) => !anulowane.has(id))
    })
    const usluga = utworzUslugePowiadomien(true)
    const zdalneNowe = przypomnienie()
    const zdalneZmienione = przypomnienie({ czas: '2026-09-01T12:00:00.000Z' })
    const zdalneUsuniete = przypomnienie({ czas: '2026-09-01T12:00:00.000Z', usunietoAt: '2026-09-01T12:05:00.000Z' })

    await usluga.synchronizuj([zdalneNowe], true)
    await usluga.synchronizuj([zdalneNowe], true)
    await usluga.synchronizuj([zdalneZmienione], true)
    await usluga.synchronizuj([zdalneUsuniete], true)

    expect(lokalnePowiadomienia.schedule).toHaveBeenCalledTimes(2)
    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledTimes(2)
    expect(oczekujace).toEqual([])
  })
})

describe('fallback dokładnych alarmów', () => {
  const powiadomienieDokladne = () => mapujPrzypomnienieNaPowiadomienie(przypomnienie({ priorytet: 'krytyczny' }))!

  it('używa dokładnego alarmu, gdy dostęp jest przyznany', async () => {
    await utworzUslugePowiadomien(true).zaplanuj([powiadomienieDokladne()])

    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0].isExactNotification).toBe(true)
  })

  it('planuje zwykły alarm, gdy exact alarm jest niedostępny', async () => {
    lokalnePowiadomienia.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })

    await utworzUslugePowiadomien(true).zaplanuj([powiadomienieDokladne()])

    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0].isExactNotification).toBe(false)
  })

  it('planuje zwykły alarm, gdy sprawdzenie exact alarm rzuca wyjątek', async () => {
    lokalnePowiadomienia.checkExactNotificationSetting.mockRejectedValue(new Error('Brak API ustawień'))

    await utworzUslugePowiadomien(true).zaplanuj([powiadomienieDokladne()])

    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0].isExactNotification).toBe(false)
  })

  it('zachowuje zwykłą zgodę, gdy nie można sprawdzić exact alarm', async () => {
    lokalnePowiadomienia.checkExactNotificationSetting.mockRejectedValue(new Error('Brak API ustawień'))

    const stan = await utworzUslugePowiadomien(true).sprawdzStan()

    expect(stan).toMatchObject({ zgoda: 'przyznana', systemoweWlaczone: true, exactAlarms: 'niedostepna' })
  })

  it('nie raportuje zaplanowania po odmowie zgody na powiadomienia', async () => {
    lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'denied' })

    const wynik = await utworzUslugePowiadomien(true).synchronizuj([przypomnienie()], true)

    expect(wynik.zaplanowanePrzypomnieniaIds).toEqual([])
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })
})
