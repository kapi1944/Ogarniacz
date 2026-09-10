import { LocalNotifications } from '@capacitor/local-notifications'
import type { Przypomnienie } from '../domain/typy'
import { czasUruchomienia } from '../services/PrzypomnieniaService'
import {
  identyfikatorNatywnyWystapienia,
  TYP_AKCJI_PRZYPOMNIENIA,
  utworzHarmonogramPrzypomnienAndroid,
  wersjaNatywnegoPowiadomienia,
} from './HarmonogramPrzypomnienAndroid'
import { normalizujSciezkePowiadomienia, poprawnePowiazanieEncji, sciezkaDlaSourceRef } from './trasy'
import type {
  AkcjaPowiadomienia,
  DanePowiadomienia,
  KanalPowiadomienia,
  PowiadomieniePlatformowe,
  StanPowiadomienPlatformy,
  StanZgody,
  WynikSynchronizacjiPowiadomien,
} from './typy'

const AKCJA_WYKONANE = 'wykonane'
const AKCJA_ODROCZ = 'odrocz'

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

function czyZdrowotne(przypomnienie: Przypomnienie): boolean {
  return ['leki', 'wizyty', 'skierowania', 'zdrowie'].includes(przypomnienie.zrodlo?.typ ?? '')
}

function kanalDlaPrzypomnienia(przypomnienie: Przypomnienie): KanalPowiadomienia {
  if (przypomnienie.eskalacja || przypomnienie.priorytet === 'krytyczny' || przypomnienie.priorytet === 'wysoki') return 'ogarniacz-wazne'
  if (czyZdrowotne(przypomnienie)) return 'ogarniacz-zdrowie'
  if (przypomnienie.zrodlo?.typ === 'finanse' || przypomnienie.zrodlo?.typ === 'rachunki') return 'ogarniacz-finanse'
  return 'ogarniacz-zwykle'
}

export function mapujPrzypomnienieNaPowiadomienie(przypomnienie: Przypomnienie, ukrywajSzczegolyZdrowotne = false): PowiadomieniePlatformowe | undefined {
  if (przypomnienie.usunietoAt) return undefined
  if (!STANY_DO_DOSTARCZENIA.has(przypomnienie.stan)) return undefined
  const termin = czasUruchomienia(przypomnienie)
  if (!termin || Number.isNaN(termin.getTime())) return undefined
  const kanal = kanalDlaPrzypomnienia(przypomnienie)
  const sciezka = sciezkaDlaSourceRef(przypomnienie.zrodlo, przypomnienie.id)
  const wymagaDokladnosci = przypomnienie.priorytet === 'krytyczny' && przypomnienie.typ === 'absolutne'
  const tresc = ukrywajSzczegolyZdrowotne && czyZdrowotne(przypomnienie) ? 'Przypomnienie dotyczące zdrowia' : przypomnienie.tytul
  const wersja = wersjaNatywnegoPowiadomienia([termin.toISOString(), tresc, kanal, sciezka, String(wymagaDokladnosci)])
  return {
    id: identyfikatorNatywnyWystapienia('przypomnienie', przypomnienie.id),
    przypomnienieId: przypomnienie.id,
    tytul: 'Ogarniacz',
    tresc,
    termin: termin.toISOString(),
    kanal,
    sourceRef: przypomnienie.zrodlo,
    sciezka,
    wymagaDokladnosci,
    wersja,
  }
}

function czyOgarniacza(powiadomienie: { extra?: Record<string, unknown> }) {
  return powiadomienie.extra?.ogarniacz === true
}

function wersjaNatywnego(powiadomienie: { extra?: Record<string, unknown> }) {
  return typeof powiadomienie.extra?.wersja === 'string' ? powiadomienie.extra.wersja : ''
}

export function utworzUslugePowiadomien(czyAndroid: boolean) {
  const harmonogram = utworzHarmonogramPrzypomnienAndroid(czyAndroid)
  const obslugiAkcji = new Set<(akcja: AkcjaPowiadomienia) => void>()
  const ostatnieAkcje = new Map<string, number>()
  let oczekujacaAkcja: AkcjaPowiadomienia | undefined
  let inicjalizacja: Promise<void> | undefined
  let kolejkaSynchronizacji = Promise.resolve<WynikSynchronizacjiPowiadomien>({ zaplanowanePrzypomnieniaIds: [] })

  const przekazAkcje = (akcja: AkcjaPowiadomienia) => {
    const { sciezka, przypomnienieId, typ } = akcja
    const bezpiecznaSciezka = normalizujSciezkePowiadomienia(sciezka)
    if (!bezpiecznaSciezka || (przypomnienieId && przypomnienieId.length > 200) || (typ !== 'otworz' && !przypomnienieId)) return
    const teraz = Date.now()
    const kluczAkcji = `${typ}:${przypomnienieId ?? bezpiecznaSciezka}`
    const poprzedniaAkcja = ostatnieAkcje.get(kluczAkcji)
    if (poprzedniaAkcja !== undefined && teraz - poprzedniaAkcja < 2_000) return
    ostatnieAkcje.set(kluczAkcji, teraz)
    const bezpiecznaAkcja = { ...akcja, sciezka: bezpiecznaSciezka }
    if (obslugiAkcji.size === 0) oczekujacaAkcja = bezpiecznaAkcja
    else obslugiAkcji.forEach((obsluga) => obsluga(bezpiecznaAkcja))
  }

  const przygotujKanaly = async () => {
    if (!czyAndroid) return
    await Promise.all(KANALY.map((kanal) => LocalNotifications.createChannel(kanal)))
  }

  const przygotujAkcje = async () => {
    if (!czyAndroid) return
    await LocalNotifications.registerActionTypes({
      types: [{
        id: TYP_AKCJI_PRZYPOMNIENIA,
        actions: [
          { id: AKCJA_WYKONANE, title: 'Wykonane' },
          { id: AKCJA_ODROCZ, title: 'Za 15 min' },
        ],
      }],
    })
  }

  const inicjalizuj = () => {
    if (!czyAndroid) return Promise.resolve()
    inicjalizacja ??= Promise.all([
      przygotujKanaly(),
      przygotujAkcje(),
      LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
        const sciezka = notification.extra?.sciezka
        const przypomnienieId = notification.extra?.przypomnienieId
        if (typeof sciezka !== 'string' || typeof przypomnienieId !== 'string') return
        const typ = actionId === AKCJA_WYKONANE ? 'wykonane' : actionId === AKCJA_ODROCZ ? 'odrocz' : 'otworz'
        const sourceRef = poprawnePowiazanieEncji(notification.extra?.sourceRef) ? notification.extra.sourceRef : undefined
        przekazAkcje({ typ, przypomnienieId, sciezka, sourceRef })
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
    if (sciezka) powiadomienie.onclick = () => {
      window.focus()
      przekazAkcje({ typ: 'otworz', sciezka })
    }
    return true
  }

  const wykonajSynchronizacje = async (przypomnienia: Przypomnienie[], wlaczone: boolean, ukrywajSzczegolyZdrowotne = false) => {
    if (!czyAndroid) return { zaplanowanePrzypomnieniaIds: [] }
    await inicjalizuj()
    const [wszystkieOczekujace, wszystkieDostarczone] = await Promise.all([
      harmonogram.pobierzOczekujace(),
      harmonogram.pobierzDostarczone(),
    ])
    const oczekujace = wszystkieOczekujace.filter(czyOgarniacza)
    const dostarczone = wszystkieDostarczone.filter(czyOgarniacza)
    if (!wlaczone) {
      await harmonogram.anuluj(oczekujace.map((element) => element.id))
      return { zaplanowanePrzypomnieniaIds: [] }
    }
    const stan = await sprawdzStan()
    if (stan.zgoda !== 'przyznana' || !stan.systemoweWlaczone) return { zaplanowanePrzypomnieniaIds: [] }

    const oczekujacePoId = new Map(oczekujace.map((element) => [element.id, element]))
    const dostarczonePoId = new Map(dostarczone.map((element) => [element.id, element]))
    const teraz = Date.now()
    const docelowe = przypomnienia
      .map((przypomnienie) => ({ przypomnienie, powiadomienie: mapujPrzypomnienieNaPowiadomienie(przypomnienie, ukrywajSzczegolyZdrowotne) }))
      .filter((element): element is { przypomnienie: Przypomnienie; powiadomienie: PowiadomieniePlatformowe } => Boolean(element.powiadomienie))
      .filter(({ powiadomienie }) => Date.parse(powiadomienie.termin) > teraz
        || oczekujacePoId.has(powiadomienie.id)
        || dostarczonePoId.has(powiadomienie.id))
    const doceloweIds = new Set(docelowe.map(({ powiadomienie }) => powiadomienie.id))
    await harmonogram.anuluj(oczekujace.filter((element) => !doceloweIds.has(element.id)).map((element) => element.id))
    await harmonogram.usunDostarczone(dostarczone.filter((element) => !doceloweIds.has(element.id)).map((element) => element.id))

    const nowe: PowiadomieniePlatformowe[] = []
    const zmienione: PowiadomieniePlatformowe[] = []
    const dostarczoneDoZastapienia: number[] = []
    for (const { powiadomienie } of docelowe) {
      const istniejace = oczekujacePoId.get(powiadomienie.id)
      const wyswietlone = dostarczonePoId.get(powiadomienie.id)
      if (istniejace) {
        if (wersjaNatywnego(istniejace) !== powiadomienie.wersja) zmienione.push(powiadomienie)
      } else if (!wyswietlone) {
        nowe.push(powiadomienie)
      } else if (Date.parse(powiadomienie.termin) > teraz && wersjaNatywnego(wyswietlone) !== powiadomienie.wersja) {
        dostarczoneDoZastapienia.push(powiadomienie.id)
        nowe.push(powiadomienie)
      }
    }
    await harmonogram.usunDostarczone(dostarczoneDoZastapienia)
    await harmonogram.zaplanuj(nowe)
    await harmonogram.przeplanuj(zmienione)
    return { zaplanowanePrzypomnieniaIds: docelowe.map(({ przypomnienie }) => przypomnienie.id) }
  }

  return {
    inicjalizuj,
    dostepne: () => czyAndroid || 'Notification' in window,
    poprosOUprawnienie,
    sprawdzStan,
    pokaz,
    zaplanuj: harmonogram.zaplanuj,
    anuluj: harmonogram.anuluj,
    przeplanuj: harmonogram.przeplanuj,
    synchronizuj(przypomnienia: Przypomnienie[], wlaczone: boolean, ukrywajSzczegolyZdrowotne = false) {
      kolejkaSynchronizacji = kolejkaSynchronizacji
        .then(() => wykonajSynchronizacje(przypomnienia, wlaczone, ukrywajSzczegolyZdrowotne))
        .catch(() => ({ zaplanowanePrzypomnieniaIds: [] }))
      return kolejkaSynchronizacji
    },
    nasluchujAkcji(obsluga: (akcja: AkcjaPowiadomienia) => void) {
      obslugiAkcji.add(obsluga)
      if (oczekujacaAkcja) {
        const akcja = oczekujacaAkcja
        oczekujacaAkcja = undefined
        obsluga(akcja)
      }
      return () => {
        obslugiAkcji.delete(obsluga)
      }
    },
  }
}
