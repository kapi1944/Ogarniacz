import {
  LocalNotifications,
  type LocalNotificationSchema,
  type PendingLocalNotificationSchema,
} from '@capacitor/local-notifications'
import type { PowiadomieniePlatformowe } from './typy'

export const TYP_AKCJI_PRZYPOMNIENIA = 'ogarniacz-przypomnienie'

function skrot32(tekst: string) {
  let wynik = 2166136261
  for (let indeks = 0; indeks < tekst.length; indeks += 1) {
    wynik ^= tekst.charCodeAt(indeks)
    wynik = Math.imul(wynik, 16777619)
  }
  return wynik >>> 0
}

export function identyfikatorNatywnyWystapienia(typEncji: string, wystapienieId: string) {
  return skrot32(`${typEncji}:${wystapienieId}`) & 0x7fffffff
}

export function wersjaNatywnegoPowiadomienia(wartosci: readonly string[]) {
  return `v2-${skrot32(wartosci.join('\u001f')).toString(16).padStart(8, '0')}`
}

function unikalnePoId<T extends { id: number }>(elementy: T[]) {
  return [...new Map(elementy.map((element) => [element.id, element])).values()]
}

function daneDodatkowe(powiadomienie: PowiadomieniePlatformowe) {
  return {
    ogarniacz: true,
    przypomnienieId: powiadomienie.przypomnienieId,
    sciezka: powiadomienie.sciezka,
    wersja: powiadomienie.wersja,
  }
}

function schematNatywny(powiadomienie: PowiadomieniePlatformowe, exactAlarmsDostepne: boolean): LocalNotificationSchema {
  const dokladne = powiadomienie.wymagaDokladnosci && exactAlarmsDostepne
  return {
    id: powiadomienie.id,
    title: powiadomienie.tytul,
    body: powiadomienie.tresc,
    channelId: powiadomienie.kanal,
    autoCancel: true,
    group: 'ogarniacz-przypomnienia',
    actionTypeId: TYP_AKCJI_PRZYPOMNIENIA,
    extra: daneDodatkowe(powiadomienie),
    isExactNotification: dokladne,
    isExactMandatory: false,
    schedule: {
      at: new Date(Math.max(Date.parse(powiadomienie.termin), Date.now() + 500)),
      allowWhileIdle: dokladne,
    },
  }
}

export function utworzHarmonogramPrzypomnienAndroid(czyAndroid: boolean) {
  const czyDostarczenieDostepne = async () => {
    if (!czyAndroid) return false
    try {
      const [zgoda, systemowe] = await Promise.all([
        LocalNotifications.checkPermissions(),
        LocalNotifications.areEnabled(),
      ])
      return zgoda.display === 'granted' && systemowe.value
    } catch {
      return false
    }
  }

  const czyExactAlarmsDostepne = async () => {
    if (!czyAndroid) return false
    try {
      return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted'
    } catch {
      return false
    }
  }

  const zaplanuj = async (powiadomienia: PowiadomieniePlatformowe[]) => {
    const unikalne = unikalnePoId(powiadomienia)
    if (unikalne.length === 0 || !await czyDostarczenieDostepne()) return
    const exactAlarmsDostepne = await czyExactAlarmsDostepne()
    await LocalNotifications.schedule({
      notifications: unikalne.map((element) => schematNatywny(element, exactAlarmsDostepne)),
    })
  }

  const anuluj = async (identyfikatory: number[]) => {
    if (!czyAndroid) return
    const unikalne = [...new Set(identyfikatory)]
    if (unikalne.length === 0) return
    await LocalNotifications.cancel({ notifications: unikalne.map((id) => ({ id })) })
  }

  const przeplanuj = async (powiadomienia: PowiadomieniePlatformowe[]) => {
    const unikalne = unikalnePoId(powiadomienia)
    if (unikalne.length === 0 || !await czyDostarczenieDostepne()) return
    await anuluj(unikalne.map((element) => element.id))
    const exactAlarmsDostepne = await czyExactAlarmsDostepne()
    await LocalNotifications.schedule({
      notifications: unikalne.map((element) => schematNatywny(element, exactAlarmsDostepne)),
    })
  }

  const pobierzOczekujace = async (): Promise<PendingLocalNotificationSchema[]> => {
    if (!czyAndroid) return []
    return (await LocalNotifications.getPending()).notifications
  }

  const pobierzDostarczone = async (): Promise<LocalNotificationSchema[]> => {
    if (!czyAndroid) return []
    return (await LocalNotifications.getAll({ state: 'TRIGGERED' })).notifications
  }

  const usunDostarczone = async (identyfikatory: number[]) => {
    if (!czyAndroid) return
    const unikalne = [...new Set(identyfikatory)]
    if (unikalne.length === 0) return
    await LocalNotifications.removeDeliveredNotificationsById({ ids: unikalne })
  }

  return { zaplanuj, przeplanuj, anuluj, pobierzOczekujace, pobierzDostarczone, usunDostarczone }
}
