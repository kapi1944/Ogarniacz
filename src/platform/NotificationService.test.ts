import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Przypomnienie } from '../domain/typy'
import { odroczPrzypomnienie, zakonczPrzypomnienie } from '../services/PrzypomnieniaService'
import { mapujPrzypomnienieNaPowiadomienie, utworzUslugePowiadomien } from './NotificationService'
import { sciezkaDlaSourceRef } from './trasy'
import { ustawBiezacyDostep } from '../services/UprawnieniaService'

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

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

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

describe('kanały alarmów lekowych', () => {
  const alarm = () => przypomnienie({ id: 'dawka:lek-1:2026-09-01:rano', zrodlo: { typ: 'leki', id: 'lek-1' }, tytul: 'Dawka leku: Prywatna nazwa',
    dawkaLeku: { lekId: 'lek-1', dawkaId: 'rano', idWystapienia: 'lek-1:2026-09-01:rano', data: '2026-09-01', planowanyCzas: '2026-09-01T10:00:00.000Z', wersjaDawkowaniaId: 'wersja-1', status: 'oczekuje', wersjaStanu: 'oczekuje||wersja-1|2026-09-01T10:00:00.000Z|' } })

  it('planuje stabilne wystąpienie, ukrywa nazwę i przekazuje stan do akcji bez zapisu dziennika', async () => {
    const usluga = utworzUslugePowiadomien(true)
    const przypomnienieDawki = alarm()
    await usluga.synchronizuj([przypomnienieDawki], true, true)
    const natywne = lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0]
    expect(natywne.body).toBe('Przypomnienie dotyczące zdrowia')
    expect(natywne.actionTypeId).toBe('ogarniacz-dawka')
    expect(natywne.extra).toEqual({ ogarniacz: true, przypomnienieId: przypomnienieDawki.id, wersja: mapujPrzypomnienieNaPowiadomienie(przypomnienieDawki, true)!.wersja })
    expect(natywne.isExactNotification).toBe(true)
    expect(JSON.stringify(natywne.extra)).not.toContain('Prywatna nazwa')
    const obsluga = vi.fn()
    usluga.nasluchujAkcji(obsluga)
    const akcja = lokalnePowiadomienia.addListener.mock.calls[0][1]
    akcja({ actionId: 'przyjeto', notification: natywne })
    akcja({ actionId: 'przyjeto', notification: natywne })
    expect(obsluga).toHaveBeenCalledTimes(1)
    expect(obsluga).toHaveBeenCalledWith({ typ: 'przyjeto', przypomnienieId: przypomnienieDawki.id, wersjaPowiadomienia: natywne.extra.wersja, sciezka: '/przypomnienia' })
  })

  it('bez dokładnych alarmów stosuje istniejący fallback, a bez zgody nie planuje', async () => {
    lokalnePowiadomienia.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })
    await utworzUslugePowiadomien(true).synchronizuj([alarm()], true)
    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0].isExactNotification).toBe(false)
    lokalnePowiadomienia.schedule.mockClear()
    lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'denied' })
    await utworzUslugePowiadomien(true).synchronizuj([alarm()], true)
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })

  it.each(['grant', 'konto', 'zgoda', 'system', 'wylaczone'])('anuluje oczekujące i wyświetlone alarmy po utracie dostępu: %s', async (powod) => {
    const element = alarm()
    const powiadomienie = mapujPrzypomnienieNaPowiadomienie(element, true)!
    const natywne = { id: powiadomienie.id, extra: { ogarniacz: true, wersja: powiadomienie.wersja } }
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [natywne] })
    lokalnePowiadomienia.getAll.mockResolvedValue({ notifications: [natywne] })
    if (powod === 'grant') ustawBiezacyDostep((modul) => modul !== 'leki')
    if (powod === 'konto') {
      localStorage.setItem('ogarniacz-wlasciciel-danych', 'pierwszy')
      localStorage.setItem('ogarniacz-konto-offline', JSON.stringify({ zalogowany: true, rola: 'wlasciciel', wlascicielId: 'drugi' }))
    }
    if (powod === 'zgoda') lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'denied' })
    if (powod === 'system') lokalnePowiadomienia.areEnabled.mockResolvedValue({ value: false })
    try {
      await utworzUslugePowiadomien(true).synchronizuj([element], powod !== 'wylaczone', true)
      expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: natywne.id }] })
      expect(lokalnePowiadomienia.removeDeliveredNotificationsById).toHaveBeenCalledWith({ ids: [natywne.id] })
      expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
    } finally {
      ustawBiezacyDostep(() => true)
      localStorage.removeItem('ogarniacz-wlasciciel-danych')
      localStorage.removeItem('ogarniacz-konto-offline')
    }
  })

  it('zmiana samego stanu dawki zmienia niejawny token i zastępuje alarm z dawnymi metadanymi', async () => {
    const element = alarm()
    const stare = mapujPrzypomnienieNaPowiadomienie(element, true)!
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{ id: stare.id, extra: { ogarniacz: true, wersja: stare.wersja.replace('v3-', 'v2-'), dawkaLeku: element.dawkaLeku, sourceRef: element.zrodlo } }] })
    lokalnePowiadomienia.getAll.mockResolvedValue({ notifications: [{ id: stare.id, extra: { ogarniacz: true, wersja: stare.wersja.replace('v3-', 'v2-'), dawkaLeku: element.dawkaLeku } }] })
    const nowe = { ...element, dawkaLeku: { ...element.dawkaLeku!, wersjaStanu: 'inna-wersja-bez-zmiany-terminu' } }
    expect(mapujPrzypomnienieNaPowiadomienie(nowe, true)!.wersja).not.toBe(stare.wersja)
    await utworzUslugePowiadomien(true).synchronizuj([nowe], true, true)
    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: stare.id }] })
    expect(lokalnePowiadomienia.removeDeliveredNotificationsById).toHaveBeenCalledWith({ ids: [stare.id] })
    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0].extra).toEqual({ ogarniacz: true, przypomnienieId: element.id, wersja: mapujPrzypomnienieNaPowiadomienie(nowe, true)!.wersja })
  })

  it('ukrywa szczegóły dawki także przy braku dodatkowego powiązania źródła', () => {
    expect(mapujPrzypomnienieNaPowiadomienie({ ...alarm(), zrodlo: undefined }, true)?.tresc).toBe('Przypomnienie dotyczące zdrowia')
  })

  it('usuwa także już wyświetlony stary alarm z metadanymi dawki bez ponownego dostarczenia', async () => {
    const element = alarm()
    element.czas = '2026-08-31T08:00:00.000Z'
    const stare = mapujPrzypomnienieNaPowiadomienie(element, true)!
    lokalnePowiadomienia.getAll.mockResolvedValue({ notifications: [{ id: stare.id, extra: { ogarniacz: true, wersja: stare.wersja.replace('v3-', 'v2-'), dawkaLeku: element.dawkaLeku } }] })
    await utworzUslugePowiadomien(true).synchronizuj([element], true, true)
    expect(lokalnePowiadomienia.removeDeliveredNotificationsById).toHaveBeenCalledWith({ ids: [stare.id] })
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })

  it('anuluje nieaktualny alarm oraz przeplanowuje odroczenie pod tym samym ID', async () => {
    const stare = mapujPrzypomnienieNaPowiadomienie(alarm())!
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{ id: stare.id, extra: { ogarniacz: true, wersja: stare.wersja } }] })
    const zmienione = alarm()
    zmienione.stan = 'odroczone'; zmienione.odroczoneDo = '2026-09-02T01:00:00.000Z'
    zmienione.dawkaLeku!.status = 'odroczone'; zmienione.dawkaLeku!.wersjaStanu = 'nowy-stan'
    await utworzUslugePowiadomien(true).synchronizuj([zmienione], true)
    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: stare.id }] })
    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0].schedule.at.toISOString()).toBe(zmienione.odroczoneDo)
    lokalnePowiadomienia.schedule.mockClear(); lokalnePowiadomienia.cancel.mockClear()
    zmienione.dawkaLeku!.nieaktualne = true
    await utworzUslugePowiadomien(true).synchronizuj([zmienione], true)
    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: stare.id }] })
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })

  it('PWA wykorzystuje aktywny service worker do wyświetlenia, bez planowania w zamkniętej aplikacji', async () => {
    const pokaz = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('Notification', { permission: 'granted' })
    const poprzedniOpis = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ active: {}, showNotification: pokaz }) } })
    try {
      expect(await utworzUslugePowiadomien(false).pokaz({ tytul: 'Ogarniacz', tresc: 'Przypomnienie dotyczące zdrowia', sciezka: '/zdrowie/leki?element=lek-1&wystapienie=dawka-1' })).toBe(true)
      expect(pokaz).toHaveBeenCalledWith('Ogarniacz', expect.objectContaining({ data: { sciezka: '/zdrowie/leki?element=lek-1&wystapienie=dawka-1' } }))
    } finally { if (poprzedniOpis) Object.defineProperty(navigator, 'serviceWorker', poprzedniOpis); else Reflect.deleteProperty(navigator, 'serviceWorker') }
  })
})

describe('odrębne powiadomienia synchronizacji', () => {
  const komunikat = { tytul: 'Ogarniacz — synchronizacja', tresc: 'Wysłano: 3, pobrano: 7, konflikty: 0.', rodzaj: 'synchronizacja' as const, sciezka: '/ustawienia' }

  it('używa osobnego kanału i identyfikatora, bez anulowania alarmów zdrowotnych', async () => {
    const usluga = utworzUslugePowiadomien(true)
    const zdrowotne = przypomnienie({ zrodlo: { typ: 'leki', id: 'lek-1' } })
    const alarm = mapujPrzypomnienieNaPowiadomienie(zdrowotne)!
    expect(await usluga.pokaz(komunikat)).toBe(true)
    expect(lokalnePowiadomienia.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'ogarniacz-system' }))
    const systemowe = lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0]
    expect(systemowe).toMatchObject({ id: -1, channelId: 'ogarniacz-system', extra: { synchronizacja: true, sciezka: '/ustawienia' } })
    expect(systemowe.actionTypeId).toBeUndefined()
    expect(systemowe.extra.ogarniacz).toBeUndefined()
    expect(systemowe.extra.przypomnienieId).toBeUndefined()
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [systemowe, { id: alarm.id, extra: { ogarniacz: true, wersja: alarm.wersja } }] })
    lokalnePowiadomienia.getAll.mockResolvedValue({ notifications: [systemowe] })
    await usluga.synchronizuj([zdrowotne], true)
    expect(lokalnePowiadomienia.cancel).not.toHaveBeenCalled()
    expect(lokalnePowiadomienia.removeDeliveredNotificationsById).not.toHaveBeenCalled()
    await usluga.synchronizuj([], false)
    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: alarm.id }] })
    expect(lokalnePowiadomienia.removeDeliveredNotificationsById).not.toHaveBeenCalled()
  })

  it('nie prosi samoczynnie o zgodę i bez niej nie planuje komunikatu systemowego', async () => {
    lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'denied' })
    expect(await utworzUslugePowiadomien(true).pokaz(komunikat)).toBe(false)
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
    expect(lokalnePowiadomienia.cancel).not.toHaveBeenCalled()
    expect(lokalnePowiadomienia.requestPermissions).not.toHaveBeenCalled()
  })

  it('kliknięcie systemowego komunikatu otwiera Ustawienia bez wykonania przypomnienia', async () => {
    const usluga = utworzUslugePowiadomien(true)
    await usluga.pokaz(komunikat)
    const obsluga = vi.fn()
    usluga.nasluchujAkcji(obsluga)
    lokalnePowiadomienia.addListener.mock.calls[0][1]({ actionId: 'tap', notification: { extra: { synchronizacja: true } } })
    expect(obsluga).toHaveBeenCalledWith({ typ: 'otworz', sciezka: '/ustawienia' })
  })

  it('na Windows/Web korzysta z Notification API tylko po zgodzie i scala komunikaty tagiem', async () => {
    const utworzPowiadomienie = vi.fn()
    class PowiadomienieTestowe {
      static permission = 'denied'
      constructor(tytul: string, opcje: unknown) { utworzPowiadomienie(tytul, opcje) }
    }
    vi.stubGlobal('Notification', PowiadomienieTestowe)
    const usluga = utworzUslugePowiadomien(false)
    expect(await usluga.pokaz(komunikat)).toBe(false)
    expect(utworzPowiadomienie).not.toHaveBeenCalled()
    PowiadomienieTestowe.permission = 'granted'
    expect(await usluga.pokaz(komunikat)).toBe(true)
    expect(utworzPowiadomienie).toHaveBeenCalledWith(komunikat.tytul, expect.objectContaining({ body: komunikat.tresc, tag: 'ogarniacz-synchronizacja' }))
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })
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

    expect(wynik?.wersja).toMatch(/^v3-[a-f0-9]{8}$/)
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

  it('przekazuje bezpieczną akcję po zimnym starcie, gdy odbiorca dołącza później', async () => {
    const usluga = utworzUslugePowiadomien(true)
    await usluga.inicjalizuj()
    const akcja = lokalnePowiadomienia.addListener.mock.calls[0][1]
    akcja({ actionId: 'tap', notification: { extra: { przypomnienieId: 'przypomnienie-1', sciezka: '/przypomnienia?element=przypomnienie-1' } } })
    const obsluga = vi.fn()

    usluga.nasluchujAkcji(obsluga)

    expect(obsluga).toHaveBeenCalledWith({
      typ: 'otworz',
      przypomnienieId: 'przypomnienie-1',
      sciezka: '/przypomnienia?element=przypomnienie-1',
    })
  })

  it('zachowuje ogólne akcje i rejestruje osobne akcje lekowe wymagające otwarcia aplikacji', async () => {
    await utworzUslugePowiadomien(true).inicjalizuj()

    expect(lokalnePowiadomienia.registerActionTypes).toHaveBeenCalledWith({
      types: [{
        id: 'ogarniacz-przypomnienie',
        actions: [
          { id: 'wykonane', title: 'Wykonane' },
          { id: 'odrocz', title: 'Za 15 min' },
        ],
      }, {
        id: 'ogarniacz-dawka',
        actions: [
          { id: 'przyjeto', title: 'Przyjęto', foreground: true },
          { id: 'odrocz', title: 'Odroczono', foreground: true },
          { id: 'pominieto', title: 'Pominięto', foreground: true },
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

  it('po aktualizacji zastępuje oczekujący alarm ze starym identyfikatorem', async () => {
    const docelowe = mapujPrzypomnienieNaPowiadomienie(przypomnienie())!
    const historycznyId = 1_097_629_924
    expect(docelowe.id).not.toBe(historycznyId)
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{
      id: historycznyId,
      extra: { ogarniacz: true, przypomnienieId: 'przypomnienie-1', wersja: 'historyczna' },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([przypomnienie()], true)

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: historycznyId }] })
    expect(lokalnePowiadomienia.schedule).toHaveBeenCalledWith(expect.objectContaining({
      notifications: [expect.objectContaining({ id: docelowe.id })],
    }))
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

  it('po aktualizacji usuwa historyczne wyświetlone powiadomienie bez ponownego alarmu', async () => {
    const wyswietlonePrzypomnienie = przypomnienie({ czas: '2026-08-31T11:00:00.000Z' })
    const historycznyId = 1_097_629_924
    lokalnePowiadomienia.getAll.mockResolvedValue({ notifications: [{
      id: historycznyId,
      extra: { ogarniacz: true, przypomnienieId: 'przypomnienie-1', wersja: 'historyczna' },
    }] })

    await utworzUslugePowiadomien(true).synchronizuj([wyswietlonePrzypomnienie], true)

    expect(lokalnePowiadomienia.removeDeliveredNotificationsById).toHaveBeenCalledWith({ ids: [historycznyId] })
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
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

  it('anuluje usunięte powiadomienie także po cofnięciu zgody', async () => {
    const oczekujace = mapujPrzypomnienieNaPowiadomienie(przypomnienie())!
    lokalnePowiadomienia.getPending.mockResolvedValue({ notifications: [{
      id: oczekujace.id,
      extra: { ogarniacz: true, wersja: oczekujace.wersja },
    }] })
    lokalnePowiadomienia.checkPermissions.mockResolvedValue({ display: 'denied' })

    await utworzUslugePowiadomien(true).synchronizuj([
      przypomnienie({ usunietoAt: '2026-09-01T11:00:00.000Z' }),
    ], true)

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledWith({ notifications: [{ id: oczekujace.id }] })
    expect(lokalnePowiadomienia.schedule).not.toHaveBeenCalled()
  })

  it('usuwa stary termin bez zgody i planuje aktualny po jej ponownym przyznaniu', async () => {
    const poprzednie = mapujPrzypomnienieNaPowiadomienie(przypomnienie())!
    const zmienione = przypomnienie({ czas: '2026-09-01T11:00:00.000Z' })
    let oczekujace: Array<{ id: number; extra?: Record<string, unknown> }> = [{
      id: poprzednie.id,
      extra: { ogarniacz: true, wersja: poprzednie.wersja },
    }]
    lokalnePowiadomienia.getPending.mockImplementation(async () => ({ notifications: oczekujace }))
    lokalnePowiadomienia.cancel.mockImplementation(async ({ notifications }) => {
      const anulowane = new Set(notifications.map(({ id }: { id: number }) => id))
      oczekujace = oczekujace.filter(({ id }) => !anulowane.has(id))
    })
    lokalnePowiadomienia.checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    const usluga = utworzUslugePowiadomien(true)

    await usluga.synchronizuj([zmienione], true)
    await usluga.synchronizuj([zmienione], true)

    expect(lokalnePowiadomienia.cancel).toHaveBeenCalledTimes(1)
    expect(lokalnePowiadomienia.schedule).toHaveBeenCalledTimes(1)
    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications[0].schedule.at.toISOString()).toBe('2026-09-01T11:00:00.000Z')
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

  it('po ponownym przyznaniu zgody planuje bieżące przypomnienie tylko raz', async () => {
    lokalnePowiadomienia.checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    const usluga = utworzUslugePowiadomien(true)

    await usluga.synchronizuj([przypomnienie()], true)
    await usluga.synchronizuj([przypomnienie()], true)

    expect(lokalnePowiadomienia.schedule).toHaveBeenCalledTimes(1)
    expect(lokalnePowiadomienia.schedule.mock.calls[0][0].notifications).toHaveLength(1)
  })
})
