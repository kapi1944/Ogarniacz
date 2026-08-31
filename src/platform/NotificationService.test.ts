import { beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { mapujPrzypomnienieNaPowiadomienie, utworzUslugePowiadomien } from './NotificationService'
import { sciezkaDlaSourceRef } from './trasy'

const lokalnePowiadomienia = vi.hoisted(() => ({
  addListener: vi.fn(),
  areEnabled: vi.fn(),
  cancel: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  checkPermissions: vi.fn(),
  createChannel: vi.fn(),
  getPending: vi.fn(),
  listChannels: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: lokalnePowiadomienia }))

beforeEach(() => {
  vi.clearAllMocks()
  lokalnePowiadomienia.addListener.mockResolvedValue({ remove: vi.fn() })
  lokalnePowiadomienia.areEnabled.mockResolvedValue({ value: true })
  lokalnePowiadomienia.cancel.mockResolvedValue(undefined)
  lokalnePowiadomienia.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
  lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'granted' })
  lokalnePowiadomienia.createChannel.mockResolvedValue(undefined)
  lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [] })
  lokalnePowiadomienia.listChannels.mockResolvedValue({ channels: [
    { id: 'ogarniacz-wazne', importance: 4 },
    { id: 'ogarniacz-zwykle', importance: 3 },
    { id: 'ogarniacz-zdrowie', importance: 3 },
    { id: 'ogarniacz-finanse', importance: 3 },
  ] })
  lokalnePowiadomienia.requestPermissions.mockResolvedValue({ display: 'granted' })
  lokalnePowiadomienia.schedule.mockResolvedValue({ notifications: [] })
  lokalnePowiadomienia.update.mockResolvedValue(undefined)
})

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
    expect(wynik?.sciezka).toBe('/wizyty?element=wizyta-1')
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
