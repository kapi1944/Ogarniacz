import { beforeEach, describe, expect, it, vi } from 'vitest'
import manifestPowiadomienAndroid from '../../node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml?raw'
import type { PowiadomieniePlatformowe } from './typy'
import {
  identyfikatorNatywnyWystapienia,
  utworzHarmonogramPrzypomnienAndroid,
  wersjaNatywnegoPowiadomienia,
} from './HarmonogramPrzypomnienAndroid'

const lokalnePowiadomienia = vi.hoisted(() => ({
  areEnabled: vi.fn(),
  cancel: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  checkPermissions: vi.fn(),
  getPending: vi.fn(),
  schedule: vi.fn(),
}))

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: lokalnePowiadomienia }))

const powiadomienie = (zmiany: Partial<PowiadomieniePlatformowe> = {}): PowiadomieniePlatformowe => ({
  id: identyfikatorNatywnyWystapienia('przypomnienie', 'wystapienie-1'),
  przypomnienieId: 'wystapienie-1',
  tytul: 'Ogarniacz',
  tresc: 'Prywatna treść użytkownika',
  termin: '2026-09-10T12:00:00.000Z',
  kanal: 'ogarniacz-zwykle',
  sourceRef: { typ: 'zadania', id: 'zadanie-1' },
  sciezka: '/zadania?element=zadanie-1',
  wymagaDokladnosci: false,
  wersja: wersjaNatywnegoPowiadomienia(['2026-09-10T12:00:00.000Z', 'Prywatna treść użytkownika']),
  ...zmiany,
})

beforeEach(() => {
  vi.clearAllMocks()
  lokalnePowiadomienia.areEnabled.mockResolvedValue({ value: true })
  lokalnePowiadomienia.cancel.mockResolvedValue(undefined)
  lokalnePowiadomienia.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' })
  lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'granted' })
  lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [] })
  lokalnePowiadomienia.schedule.mockResolvedValue({ notifications: [] })
})

describe('natywny harmonogram przypomnień Androida', () => {
  it('wyznacza stabilny identyfikator z typu encji i wystąpienia', () => {
    const pierwszy = identyfikatorNatywnyWystapienia('przypomnienie', 'wystapienie-1')

    expect(identyfikatorNatywnyWystapienia('przypomnienie', 'wystapienie-1')).toBe(pierwszy)
    expect(identyfikatorNatywnyWystapienia('przypomnienie', 'wystapienie-2')).not.toBe(pierwszy)
    expect(identyfikatorNatywnyWystapienia('inna-encja', 'wystapienie-1')).not.toBe(pierwszy)
    expect(pierwszy).toBeGreaterThanOrEqual(0)
  })

  it('zmienia techniczną wersję po zmianie treści bez ujawniania tej treści', () => {
    const pierwsza = wersjaNatywnegoPowiadomienia(['termin', 'Prywatna treść użytkownika'])
    const druga = wersjaNatywnegoPowiadomienia(['termin', 'Zmieniona prywatna treść'])

    expect(druga).not.toBe(pierwsza)
    expect(pierwsza).not.toContain('Prywatna treść użytkownika')
  })

  it('planuje jedną kopię wystąpienia i nie umieszcza treści domenowej w extra', async () => {
    const harmonogram = utworzHarmonogramPrzypomnienAndroid(true)
    const element = powiadomienie()

    await harmonogram.zaplanuj([element, element])

    const schemat = lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0]
    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications).toHaveLength(1)
    expect(schemat.extra).toEqual({
      ogarniacz: true,
      przypomnienieId: 'wystapienie-1',
      sciezka: '/zadania?element=zadanie-1',
      wersja: element.wersja,
    })
    expect(JSON.stringify(schemat.extra)).not.toContain(element.tresc)
    expect(schemat.extra).not.toHaveProperty('sourceRef')
  })

  it('przeplanowuje przez anulowanie starego alarmu przed utworzeniem nowego', async () => {
    const harmonogram = utworzHarmonogramPrzypomnienAndroid(true)
    const element = powiadomienie()

    await harmonogram.przeplanuj([element])

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: element.id }] })
    expect(lokalnePowiadomienia.cancel.mock.invocationCallOrder[0]).toBeLessThan(lokalnePowiadomienia.schedule.mock.invocationCallOrder[0])
  })

  it('anuluje identyfikator tylko raz', async () => {
    const harmonogram = utworzHarmonogramPrzypomnienAndroid(true)
    const id = powiadomienie().id

    await harmonogram.anuluj([id, id])

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id }] })
  })

  it('nie próbuje planować po odmowie uprawnienia', async () => {
    lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'denied' })

    await utworzHarmonogramPrzypomnienAndroid(true).zaplanuj([powiadomienie()])

    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })

  it('używa alarmu nieexact, gdy specjalny dostęp nie jest przyznany', async () => {
    lokalnePowiadomienia.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })

    await utworzHarmonogramPrzypomnienAndroid(true).zaplanuj([powiadomienie({ wymagaDokladnosci: true })])

    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0]).toMatchObject({
      isExactNotification: false,
      isExactMandatory: false,
      schedule: { allowWhileIdle: false },
    })
  })

  it('ma w zależności natywnej odbiornik odbudowujący alarmy po restarcie urządzenia', () => {
    expect(manifestPowiadomienAndroid).toContain('LocalNotificationRestoreReceiver')
    expect(manifestPowiadomienAndroid).toContain('android.intent.action.BOOT_COMPLETED')
    expect(manifestPowiadomienAndroid).toContain('android.permission.RECEIVE_BOOT_COMPLETED')
  })
})
