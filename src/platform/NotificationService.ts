import { LocalNotifications, type LocalNotificationSchema, type PendingLocalNotificationSchema } from '@capacitor/local-notifications'
import type { Przypomnienie } from '../domain/typy'
import { czasUruchomienia } from '../services/PrzypomnieniaService'
import { normalizujSciezkePowiadomienia, sciezkaDlaSourceRef } from './trasy'
import type {
  DanePowiadomienia,
  KanalPowiadomienia,
  PowiadomieniePlatformowe,
  StanPowiadomienPlatformy,
  StanZgody,
  WynikSynchronizacjiPowiadomien,
} from './typy'

const KANALY = [
  { id: 'ogarniacz-wazne', name: 'Ważne przypomnienia', description: 'Pilne i eskalowane przypomnienia', importance: 4 as const, vibration: true },
  { id: 'ogarniacz-zwykle', name: 'Zwykłe przypomnienia', description: 'Codzienne przypomnienia Ogarniacza', importance: 3 as const, vibration: true },
  { id: 'ogarniacz-zdrowie', name: 'Zdrowie', description: 'Leki, wizyty i pozostałe sprawy zdrowotne', importance: 3 as const, vibration: true },
  { id: 'ogarniacz-finanse', name: 'Finanse', description: 'Rachunki i sprawy finansowe', importance: 3 as const, vibration: true },
]

const STANY_DO_DOSTARCZENIA = new Set<Przypomnienie['stan']>(['nowe', 'dostarczone', 'odroczone', 'eskalowane'])

function stanZgody(wartosc: string): StanZgody {
  if (wartosc === 'granted') return 'przyznana'
  if (wartosc === 'denied') return 'odrzucona'
  return 'pytaj'
}

function identyfikatorPowiadomienia(tekst: string) {
  let wynik = 2166136261
  for (let indeks = 0; indeks < tekst.length; indeks += 1) {
    wynik ^= tekst.charCodeAt(indeks)
    wynik = Math.imul(wynik, 16777619)
  }
  return wynik & 0x7fffffff
}

function kanalDlaPrzypomnienia(przypomnienie: Przypomnienie): KanalPowiadomienia {
  if (przypomnienie.eskalacja || przypomnienie.priorytet === 'krytyczny' || przypomnienie.priorytet === 'wysoki') return 'ogarniacz-wazne'
  if (przypomnienie.zrodlo?.typ === 'leki' || przypomnienie.zrodlo?.typ === 'wizyty') return 'ogarniacz-zdrowie'
  if (przypomnienie.zrodlo?.typ === 'finanse' || przypomnienie.zrodlo?.typ === 'rachunki') return 'ogarniacz-finanse'
  return 'ogarniacz-zwykle'
}

export function mapujPrzypomnienieNaPowiadomienie(przypomnienie: Przypomnienie): PowiadomieniePlatformowe | undefined {
  if (!STANY_DO_DOSTARCZENIA.has(przypomnienie.stan)) return undefined
  const termin = czasUruchomienia(przypomnienie)
  if (!termin || Number.isNaN(termin.getTime())) return undefined
  const kanal = kanalDlaPrzypomnienia(przypomnienie)
  const sciezka = sciezkaDlaSourceRef(przypomnienie.zrodlo, przypomnienie.id)
  const wymagaDokladnosci = przypomnienie.priorytet === 'krytyczny' || przypomnienie.eskalacja
  const wersja = [termin.toISOString(), przypomnienie.tytul, kanal, sciezka, wymagaDokladnosci].join('|')
  return {
    id: identyfikatorPowiadomienia(`ogarniacz:${przypomnienie.id}`),
    przypomnienieId: przypomnienie.id,
    tytul: 'Ogarniacz',
    tresc: przypomnienie.tytul,
    termin: termin.toISOString(),
    kanal,
    sourceRef: przypomnienie.zrodlo,
    sciezka,
    wymagaDokladnosci,
    wersja,
  }
}

function daneDodatkowe(powiadomienie: PowiadomieniePlatformowe) {
  return {
    ogarniacz: true,
    przypomnienieId: powiadomienie.przypomnienieId,
    sourceRef: powiadomienie.sourceRef,
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
    extra: daneDodatkowe(powiadomienie),
    isExactNotification: dokladne,
    isExactMandatory: false,
    schedule: {
      at: new Date(Math.max(Date.parse(powiadomienie.termin), Date.now() + 500)),
      allowWhileIdle: dokladne,
    },
  }
}

function czyOgarniacza(powiadomienie: PendingLocalNotificationSchema) {
  return powiadomienie.extra?.ogarniacz === true
}

function wersjaOczekujacego(powiadomienie: PendingLocalNotificationSchema) {
  return typeof powiadomienie.extra?.wersja === 'string' ? powiadomienie.extra.wersja : ''
}

export function utworzUslugePowiadomien(czyAndroid: boolean) {
  const obslugiAkcji = new Set<(sciezka: string) => void>()
  const ostatnieAkcje = new Map<string, number>()
  let oczekujacaSciezka: string | undefined
  let inicjalizacja: Promise<void> | undefined
  let kolejkaSynchronizacji = Promise.resolve<WynikSynchronizacjiPowiadomien>({ zaplanowanePrzypomnieniaIds: [] })

  const przekazSciezke = (sciezka: string) => {
    const bezpiecznaSciezka = normalizujSciezkePowiadomienia(sciezka)
    if (!bezpiecznaSciezka) return
    const teraz = Date.now()
    const poprzedniaAkcja = ostatnieAkcje.get(bezpiecznaSciezka)
    if (poprzedniaAkcja !== undefined && teraz - poprzedniaAkcja < 2_000) return
    ostatnieAkcje.set(bezpiecznaSciezka, teraz)
    if (obslugiAkcji.size === 0) oczekujacaSciezka = bezpiecznaSciezka
    else obslugiAkcji.forEach((obsluga) => obsluga(bezpiecznaSciezka))
  }

  const przygotujKanaly = async () => {
    if (!czyAndroid) return
    await Promise.all(KANALY.map((kanal) => LocalNotifications.createChannel(kanal)))
  }

  const inicjalizuj = () => {
    if (!czyAndroid) return Promise.resolve()
    inicjalizacja ??= Promise.all([
      przygotujKanaly(),
      LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        const sciezka = notification.extra?.sciezka
        if (typeof sciezka === 'string') przekazSciezke(sciezka)
      }),
    ]).then(() => undefined).catch(() => undefined)
    return inicjalizacja
  }

  const sprawdzStan = async (): Promise<StanPowiadomienPlatformy> => {
    if (!czyAndroid) {
      if (!('Notification' in window)) return { zgoda: 'niedostepna', systemoweWlaczone: false, kanalyGotowe: null, exactAlarms: null }
      return {
        zgoda: stanZgody(Notification.permission),
        systemoweWlaczone: Notification.permission === 'granted',
        kanalyGotowe: null,
        exactAlarms: null,
      }
    }
    try {
      await inicjalizuj()
      const [zgoda, systemowe, kanaly, exactAlarms] = await Promise.all([
        LocalNotifications.checkPermissions(),
        LocalNotifications.areEnabled(),
        LocalNotifications.listChannels(),
        LocalNotifications.checkExactNotificationSetting()
          .then((wynik) => stanZgody(wynik.exact_alarm))
          .catch(() => 'niedostepna' as const),
      ])
      return {
        zgoda: stanZgody(zgoda.display),
        systemoweWlaczone: systemowe.value,
        kanalyGotowe: KANALY.every((wymagany) => kanaly.channels.some((kanal) => kanal.id === wymagany.id && kanal.importance !== 0)),
        exactAlarms,
      }
    } catch {
      return { zgoda: 'niedostepna', systemoweWlaczone: false, kanalyGotowe: false, exactAlarms: 'niedostepna' }
    }
  }

  const poprosOUprawnienie = async () => {
    if (!czyAndroid) {
      if (!('Notification' in window)) return false
      return (await Notification.requestPermission()) === 'granted'
    }
    try {
      await inicjalizuj()
      return (await LocalNotifications.requestPermissions()).display === 'granted'
    } catch {
      return false
    }
  }

  const pokaz = async ({ tytul, tresc, sciezka }: DanePowiadomienia) => {
    if (czyAndroid || !('Notification' in window) || Notification.permission !== 'granted') return false
    const powiadomienie = new Notification(tytul, { body: tresc })
    if (sciezka) powiadomienie.onclick = () => { window.focus(); przekazSciezke(sciezka) }
    return true
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
    if (!czyAndroid || powiadomienia.length === 0) return
    const exactAlarmsDostepne = await czyExactAlarmsDostepne()
    await LocalNotifications.schedule({ notifications: powiadomienia.map((element) => schematNatywny(element, exactAlarmsDostepne)) })
  }

  const anuluj = async (identyfikatory: number[]) => {
    if (!czyAndroid || identyfikatory.length === 0) return
    await LocalNotifications.cancel({ notifications: identyfikatory.map((id) => ({ id })) })
  }

  const przeplanuj = async (powiadomienia: PowiadomieniePlatformowe[]) => {
    if (!czyAndroid || powiadomienia.length === 0) return
    const exactAlarmsDostepne = await czyExactAlarmsDostepne()
    await LocalNotifications.update({ notifications: powiadomienia.map((element) => schematNatywny(element, exactAlarmsDostepne)) })
  }

  const wykonajSynchronizacje = async (przypomnienia: Przypomnienie[], wlaczone: boolean) => {
    if (!czyAndroid) return { zaplanowanePrzypomnieniaIds: [] }
    await inicjalizuj()
    const oczekujace = (await LocalNotifications.getPending()).notifications.filter(czyOgarniacza)
    if (!wlaczone) {
      await anuluj(oczekujace.map((element) => element.id))
      return { zaplanowanePrzypomnieniaIds: [] }
    }
    const stan = await sprawdzStan()
    if (stan.zgoda !== 'przyznana' || !stan.systemoweWlaczone) return { zaplanowanePrzypomnieniaIds: [] }

    const oczekujacePoId = new Map(oczekujace.map((element) => [element.id, element]))
    const teraz = Date.now()
    const docelowe = przypomnienia
      .map((przypomnienie) => ({ przypomnienie, powiadomienie: mapujPrzypomnienieNaPowiadomienie(przypomnienie) }))
      .filter((element): element is { przypomnienie: Przypomnienie; powiadomienie: PowiadomieniePlatformowe } => Boolean(element.powiadomienie))
      .filter(({ przypomnienie, powiadomienie }) =>
        przypomnienie.stan !== 'dostarczone' || Date.parse(powiadomienie.termin) > teraz || oczekujacePoId.has(powiadomienie.id),
      )
    const doceloweIds = new Set(docelowe.map(({ powiadomienie }) => powiadomienie.id))
    await anuluj(oczekujace.filter((element) => !doceloweIds.has(element.id)).map((element) => element.id))

    const nowe: PowiadomieniePlatformowe[] = []
    const zmienione: PowiadomieniePlatformowe[] = []
    for (const { powiadomienie } of docelowe) {
      const istniejace = oczekujacePoId.get(powiadomienie.id)
      if (!istniejace) nowe.push(powiadomienie)
      else if (wersjaOczekujacego(istniejace) !== powiadomienie.wersja) zmienione.push(powiadomienie)
    }
    await anuluj(zmienione.map((powiadomienie) => powiadomienie.id))
    await zaplanuj([...nowe, ...zmienione])
    return { zaplanowanePrzypomnieniaIds: docelowe.map(({ przypomnienie }) => przypomnienie.id) }
  }

  return {
    inicjalizuj,
    dostepne: () => czyAndroid || 'Notification' in window,
    poprosOUprawnienie,
    sprawdzStan,
    pokaz,
    zaplanuj,
    anuluj,
    przeplanuj,
    synchronizuj(przypomnienia: Przypomnienie[], wlaczone: boolean) {
      kolejkaSynchronizacji = kolejkaSynchronizacji
        .then(() => wykonajSynchronizacje(przypomnienia, wlaczone))
        .catch(() => ({ zaplanowanePrzypomnieniaIds: [] }))
      return kolejkaSynchronizacji
    },
    nasluchujAkcji(obsluga: (sciezka: string) => void) {
      obslugiAkcji.add(obsluga)
      if (oczekujacaSciezka) {
        const sciezka = oczekujacaSciezka
        oczekujacaSciezka = undefined
        obsluga(sciezka)
      }
      return () => {
        obslugiAkcji.delete(obsluga)
      }
    },
  }
}
