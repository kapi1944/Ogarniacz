import { czyKontoZgodneZDanymiLokalnymi } from './KontaService'
import type { Table } from 'dexie'
import { baza, nazwyTabel } from '../data/BazaOgarniacza'
import type {
  DostawcaSynchronizacji,
  NazwaTabeliSynchronizowanej,
  RepozytoriumZdalne,
  WynikSynchronizacji,
  ZmianaSynchronizacji,
} from '../data/DostawcaSynchronizacji'
import { BladKonfliktuSynchronizacji } from '../data/DostawcaSynchronizacji'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'
import { czyTabelaSynchronizowana, dodajDoKolejkiSynchronizacji, pobierzKolejkeSynchronizacji, policzZmianyDoSynchronizacji, tabelaKolejki, usunWyslaneZmiany, zapiszBladKolejki, zachowajLokalneSamopoczucie } from '../data/KolejkaSynchronizacji'
import { utworzMetadane } from '../domain/fabryki'
import { czyPrywatnaPsychoterapia } from '../domain/psychoterapia'
import type { EncjaBazowa, KonfliktSynchronizacji, StanSynchronizacji } from '../domain/typy'
import { pobierzInstallationId } from './InstallationService'
import { komunikatyBledowSynchronizacji, sklasyfikujBladSynchronizacji } from './DiagnostykaSynchronizacji'
import { pobierzSygnalProfilu } from '../data/ProfileLokalne'
import { czyDostepFinansowWspolnych, sprawdzDostepFinansowWspolnych } from './UprawnieniaService'
import { BladDanychFinansowych, czyTabelaFinansowa, TABELE_FINANSOW_WSPOLNYCH, walidujObrazFinansowy, sprawdzKontynuacjeHistorii } from '../../server/wspolne/SynchronizacjaFinansow.ts'
import { daneBiznesowe, kanonicznyZapis, schematyFinansowe } from '../../server/wspolne/ZapisFinansowy.ts'
import { zbudujWpisHistorii } from './HistoriaZmianService'

const KOMUNIKAT_NIEPELNYCH_FINANSOW = 'Wspólne finanse wymagają pełnej synchronizacji lub rozstrzygnięcia konfliktów. Saldo jest tymczasowo niedostępne.'

export type EtapOperacjiSynchronizacji = 'pobieranie' | 'wysylanie'

const POCZATEK_SYNCHRONIZACJI = '1970-01-01T00:00:00.000Z'
export const nazwyTabelSynchronizowanych = nazwyTabel.filter(
  (nazwa): nazwa is NazwaTabeliSynchronizowanej => czyTabelaSynchronizowana(nazwa),
)

interface OpcjeSyncEngine {
  obslugaEtapu?: (etap: EtapOperacjiSynchronizacji) => void
  teraz?: () => string
  czyOnline?: () => boolean
  installationId?: () => string
  liczbaProb?: number
  opoznieniePonowieniaMs?: number
}

export type WyborWartosciKonfliktu = 'lokalny' | 'zdalny'

export type RozstrzygniecieKonfliktu =
  | { typ: 'lokalny' }
  | { typ: 'zdalny' }
  | { typ: 'reczny'; pola: Record<string, WyborWartosciKonfliktu> }

function tabelaLokalna(nazwa: NazwaTabeliSynchronizowanej): Table<EncjaBazowa, string> {
  return baza.table(nazwa) as Table<EncjaBazowa, string>
}

function kluczZmiany(zmiana: Pick<ZmianaSynchronizacji, 'tabela' | 'rekord'>): string {
  return `${zmiana.tabela}:${zmiana.rekord.id}`
}

function kanonizuj(wartosc: unknown): string {
  if (wartosc === null || typeof wartosc !== 'object') return JSON.stringify(wartosc) ?? 'null'
  if (wartosc instanceof Blob) return JSON.stringify({ typ: wartosc.type, rozmiar: wartosc.size })
  if (Array.isArray(wartosc)) return `[${wartosc.map(kanonizuj).join(',')}]`
  return `{${Object.entries(wartosc)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([klucz, element]) => `${JSON.stringify(klucz)}:${kanonizuj(element)}`)
    .join(',')}}`
}

function takieSame(a: EncjaBazowa, b: EncjaBazowa): boolean {
  return kanonizuj(a) === kanonizuj(b)
}

function walidujZmianyZdalne(zmiany: ZmianaSynchronizacji[]): void {
  const dozwoloneTabele = new Set<string>([...nazwyTabelSynchronizowanych, 'wpisyTerapii'])
  for (const zmiana of zmiany) {
    if (
      !dozwoloneTabele.has(zmiana.tabela)
      || !zmiana.rekord
      || typeof zmiana.rekord.id !== 'string'
      || typeof zmiana.rekord.createdAt !== 'string'
      || typeof zmiana.rekord.updatedAt !== 'string'
      || typeof zmiana.installationId !== 'string'
    ) {
      throw new Error('Provider zwrócił niepoprawną paczkę synchronizacji.')
    }
  }
}

async function pobierzLokalneZmiany(installationId: string): Promise<ZmianaSynchronizacji[]> {
  return (await pobierzKolejkeSynchronizacji()).map((zmiana) => ({
    zmianaId: zmiana.id,
    bazowyUpdatedAt: zmiana.bazowyUpdatedAt,
    tabela: zmiana.tabela as NazwaTabeliSynchronizowanej,
    rekord: structuredClone(zmiana.rekord),
    installationId,
  }))
}

async function uzupelnijKolejkePoMigracji(): Promise<void> {
  const biezacaBaza = baza
  const sygnal = pobierzSygnalProfilu()
  const sprawdzProfil = () => { if (baza !== biezacaBaza || sygnal.aborted) throw new Error('Profil zmienił się podczas przygotowania kolejki.') }

  if (czyDostepFinansowWspolnych('edycja') && !(await baza.tabela('stanSynchronizacji').get('glowny'))?.finanseWspolneZmigrowane) {
    sprawdzProfil()
    await biezacaBaza.transaction('rw', [...TABELE_FINANSOW_WSPOLNYCH.map((nazwa) => baza.table(nazwa)), tabelaKolejki(), baza.tabela('stanSynchronizacji')], async () => {
      const stan = await baza.tabela('stanSynchronizacji').get('glowny')
      if (stan?.finanseWspolneZmigrowane) return
      sprawdzProfil()
      sprawdzDostepFinansowWspolnych('edycja')
      for (const tabela of TABELE_FINANSOW_WSPOLNYCH) for (const rekord of await baza.tabela(tabela).toArray()) {
        sprawdzProfil()
        if (!(await tabelaKolejki().where('[tabela+rekordId]').equals([tabela, rekord.id]).count())) await dodajDoKolejkiSynchronizacji(tabela, rekord)
      }
      sprawdzProfil()
      await biezacaBaza.tabela('stanSynchronizacji').put({ ...utworzMetadane('glowny'), stan: 'oczekuje', liczbaKonfliktow: 0, liczbaOczekujacych: 0, ...stan, finanseWspolneZmigrowane: true })
    })
  }
  sprawdzProfil()
  if ((await baza.tabela('stanSynchronizacji').get('glowny'))?.kolejkaZmigrowana) return
  sprawdzProfil()
  await biezacaBaza.transaction('rw', [...nazwyTabelSynchronizowanych.map(tabelaLokalna), tabelaKolejki(), baza.tabela('stanSynchronizacji')], async () => {
    sprawdzProfil()
    const stan = await biezacaBaza.tabela('stanSynchronizacji').get('glowny')
    if (stan?.kolejkaZmigrowana) return
    const od = stan?.ostatniSync ?? POCZATEK_SYNCHRONIZACJI
    for (const tabela of nazwyTabelSynchronizowanych) {
      if (czyTabelaFinansowa(tabela)) continue
      const rekordy = await tabelaLokalna(tabela).where('updatedAt').above(od).toArray()
      for (const rekord of rekordy) {
        sprawdzProfil()
        const istnieje = await tabelaKolejki().where('[tabela+rekordId]').equals([tabela, rekord.id]).count()
        if (!istnieje) await dodajDoKolejkiSynchronizacji(tabela, rekord)
      }
    }
    sprawdzProfil()
    await biezacaBaza.tabela('stanSynchronizacji').put({
      ...utworzMetadane('glowny'), stan: 'zsynchronizowano', liczbaKonfliktow: 0, liczbaOczekujacych: 0,
      ...stan, kolejkaZmigrowana: true,
    })
  })
}

export async function pobierzStanSynchronizacji(): Promise<StanSynchronizacji> {
  const stan = (await baza.tabela('stanSynchronizacji').get('glowny')) ?? {
    ...utworzMetadane('glowny'),
    stan: 'zsynchronizowano',
    liczbaKonfliktow: 0,
    liczbaOczekujacych: 0,
    kolejkaZmigrowana: false,
  }
  return { ...stan, liczbaOczekujacych: await policzZmianyDoSynchronizacji(), liczbaKonfliktow: await baza.tabela('konfliktySynchronizacji').count() }
}

export async function pobierzKonfliktySynchronizacji(): Promise<KonfliktSynchronizacji[]> {
  const biezacaBaza = baza
  const sygnal = pobierzSygnalProfilu()
  const konflikty = await baza.tabela('konfliktySynchronizacji').orderBy('wykrytoAt').reverse().toArray()
  if (baza !== biezacaBaza || sygnal.aborted) throw new Error('Profil zmienił się podczas odczytu konfliktów.')
  return konflikty.filter((konflikt) => !czyTabelaFinansowa(konflikt.tabela) || czyDostepFinansowWspolnych('odczyt'))
}

export async function sprawdzKompletnoscFinansow(): Promise<void> {
  if ((await baza.tabela('stanSynchronizacji').get('glowny'))?.finanseWspolneNiekompletne
    || (await baza.tabela('konfliktySynchronizacji').toArray()).some((konflikt) => czyTabelaFinansowa(konflikt.tabela))) throw new Error(KOMUNIKAT_NIEPELNYCH_FINANSOW)
}

export async function oznaczOczekujacaSynchronizacje(online = typeof navigator === 'undefined' || navigator.onLine): Promise<void> {
  const obecny = await pobierzStanSynchronizacji()
  if (obecny.stan === 'synchronizacja' || obecny.stan === 'konflikt') return
  const teraz = new Date().toISOString()
  await baza.tabela('stanSynchronizacji').put({
    ...obecny,
    stan: online ? 'oczekuje' : 'offline',
    ostatniBlad: undefined,
    updatedAt: teraz,
  })
}

export async function oznaczSynchronizacjeOffline(): Promise<void> {
  const obecny = await pobierzStanSynchronizacji()
  await baza.tabela('stanSynchronizacji').put({
    ...obecny,
    stan: obecny.stan === 'konflikt' ? 'konflikt' : 'offline',
    polaczenie: 'offline',
    ostatniBlad: undefined,
    updatedAt: new Date().toISOString(),
  })
}

export async function odtworzOczekujacaSynchronizacje(online = typeof navigator === 'undefined' || navigator.onLine): Promise<boolean> {
  if (!czyKontoZgodneZDanymiLokalnymi()) throw new Error('Konto nie jest powiązane z lokalną bazą.')
  await uzupelnijKolejkePoMigracji()
  const obecny = await pobierzStanSynchronizacji()
  if (obecny.stan === 'konflikt') return false
  const liczbaOczekujacych = obecny.liczbaOczekujacych

  if (obecny.stan === 'synchronizacja') {
    await baza.tabela('stanSynchronizacji').put({
      ...obecny,
      stan: liczbaOczekujacych > 0 ? (online ? 'oczekuje' : 'offline') : 'zsynchronizowano',
      ostatniBlad: undefined,
      liczbaOczekujacych,
      updatedAt: new Date().toISOString(),
    })
    return liczbaOczekujacych > 0
  }

  if (liczbaOczekujacych === 0) return false
  await oznaczOczekujacaSynchronizacje(online)
  return true
}

export class SyncEngine implements DostawcaSynchronizacji {
  private readonly obslugaEtapu?: (etap: EtapOperacjiSynchronizacji) => void
  private readonly teraz: () => string
  private readonly czyOnline: () => boolean
  private readonly installationId: () => string
  private readonly liczbaProb: number
  private readonly opoznieniePonowieniaMs: number
  private trwajacaSynchronizacja?: Promise<WynikSynchronizacji>
  private sprawdzKontekst = () => {}

  constructor(opcje: OpcjeSyncEngine = {}) {
    this.obslugaEtapu = opcje.obslugaEtapu
    this.teraz = opcje.teraz ?? (() => new Date().toISOString())
    this.czyOnline = opcje.czyOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine)
    this.installationId = opcje.installationId ?? pobierzInstallationId
    this.liczbaProb = Math.max(1, opcje.liczbaProb ?? 3)
    this.opoznieniePonowieniaMs = Math.max(0, opcje.opoznieniePonowieniaMs ?? 250)
  }

  synchronizuj(repozytoriumZdalne: RepozytoriumZdalne): Promise<WynikSynchronizacji> {
    if (!this.trwajacaSynchronizacja) {
      const biezacaBaza = baza
      const sygnal = pobierzSygnalProfilu()
      this.sprawdzKontekst = () => {
        if (baza !== biezacaBaza || sygnal.aborted) throw new Error('Profil zmienił się podczas synchronizacji.')
      }
    }
    this.trwajacaSynchronizacja ??= this.wykonajSynchronizacje(repozytoriumZdalne)
      .finally(() => { this.trwajacaSynchronizacja = undefined })
    return this.trwajacaSynchronizacja
  }

  async rozstrzygnijKonflikt(id: string, rozstrzygniecie: RozstrzygniecieKonfliktu): Promise<void> {
    const biezacaBaza = baza
    const sygnal = pobierzSygnalProfilu()
    const sprawdzProfil = () => { if (baza !== biezacaBaza || sygnal.aborted) throw new Error('Profil zmienił się podczas rozstrzygania konfliktu.') }
    if (this.trwajacaSynchronizacja) throw new Error('Poczekaj na zakończenie synchronizacji przed rozstrzygnięciem konfliktu.')
    this.sprawdzKontekst = sprawdzProfil
    if (!czyKontoZgodneZDanymiLokalnymi()) throw new Error('To konto nie jest powiązane z lokalną bazą. Użyj osobnego profilu urządzenia lub przeglądarki.')
    const konflikt = await baza.tabela('konfliktySynchronizacji').get(id)
    sprawdzProfil()
    if (!konflikt) return
    if (!nazwyTabelSynchronizowanych.includes(konflikt.tabela as NazwaTabeliSynchronizowanej)) throw new Error('Tabela lokalna nie podlega rozstrzyganiu konfliktów synchronizacji.')
    const tabela = konflikt.tabela as NazwaTabeliSynchronizowanej
    const finansowy = czyTabelaFinansowa(tabela)
    if (finansowy) sprawdzDostepFinansowWspolnych('edycja')
    const stan = await pobierzStanSynchronizacji()
    const teraz = this.teraz()
    const najnowszyZnacznik = [stan.ostatniSync, konflikt.lokalny.updatedAt, konflikt.zdalny.updatedAt]
      .filter((wartosc): wartosc is string => Boolean(wartosc))
      .reduce((najnowszy, wartosc) => wartosc > najnowszy ? wartosc : najnowszy, teraz)
    const znacznikLokalnegoWyboru = teraz > najnowszyZnacznik
      ? teraz
      : new Date(new Date(najnowszyZnacznik).getTime() + 1).toISOString()
    const rekord = this.przygotujRozstrzygnietyRekord(konflikt, rozstrzygniecie, znacznikLokalnegoWyboru)
    const wyborZdalny = !finansowy && rozstrzygniecie.typ === 'zdalny'
    const kolejka = tabelaKolejki()
    await baza.transaction('rw', [tabelaLokalna(tabela), ...TABELE_FINANSOW_WSPOLNYCH.map((nazwa) => baza.table(nazwa)), baza.tabela('konfliktySynchronizacji'), baza.tabela('historiaZmian'), kolejka], async () => {
      sprawdzProfil()
      if (!takieSame((await baza.tabela('konfliktySynchronizacji').get(id))!, konflikt)
        || finansowy && !takieSame((await tabelaLokalna(tabela).get(rekord.id))!, konflikt.lokalny)) throw new Error('Dane konfliktu zmieniły się. Odczytaj je ponownie.')
      if (finansowy) {
        sprawdzDostepFinansowWspolnych('edycja')
        await this.walidujLokalnyObraz([{ tabela, rekord, installationId: this.installationId() }])
      }
      if (czyPrywatnaPsychoterapia(tabela, await tabelaLokalna(tabela).get(rekord.id)) || czyPrywatnaPsychoterapia(tabela, rekord)) throw new Error('Prywatna sesja lub ćwiczenie nie podlega synchronizacji.')
      const zabezpieczony = zachowajLokalneSamopoczucie(tabela, rekord, await tabelaLokalna(tabela).get(rekord.id))
      await tabelaLokalna(tabela).put(zabezpieczony)
      if (finansowy) await this.zapiszHistorieFinansowa(tabela, rekord, konflikt.lokalny)
      await baza.tabela('konfliktySynchronizacji').delete(id)
      if (wyborZdalny) {
        const oczekujace = await kolejka.where('[tabela+rekordId]').equals([tabela, rekord.id]).primaryKeys()
        await usunWyslaneZmiany(oczekujace)
      } else {
        if (finansowy) await kolejka.where('[tabela+rekordId]').equals([tabela, rekord.id]).delete()
        await dodajDoKolejkiSynchronizacji(tabela, zabezpieczony, konflikt.zdalny)
      }
      sprawdzProfil()
    })
    sprawdzProfil()
    await this.ustawStanPoKonfliktach()
    powiadomOZmianieDanych(tabela)
  }

  private przygotujRozstrzygnietyRekord(
    konflikt: KonfliktSynchronizacji,
    rozstrzygniecie: RozstrzygniecieKonfliktu,
    updatedAt: string,
  ): EncjaBazowa {
    if (czyTabelaFinansowa(konflikt.tabela)) {
      if (rozstrzygniecie.typ === 'reczny') throw new Error('Konflikt finansowy wymaga wyboru kompletnej wersji.')
      const tabela = konflikt.tabela
      const zdalny = schematyFinansowe[tabela].parse(konflikt.zdalny)
      const wybrany = schematyFinansowe[tabela].parse(rozstrzygniecie.typ === 'lokalny' ? konflikt.lokalny : konflikt.zdalny)
      const stan = (rekord: typeof wybrany) => ({ ...daneBiznesowe(tabela, rekord), ...(rekord.usunietoAt ? { usunietoAt: rekord.usunietoAt } : {}) })
      const oczekiwanaRewizja = zdalny.rewizja ?? 0
      const wersja = {
        rewizja: oczekiwanaRewizja + 1, oczekiwanaRewizja, idZapisu: crypto.randomUUID(), operacja: 'rozstrzygniecie', znacznikCzasu: updatedAt,
        podpisPolecenia: kanonicznyZapis({ operacja: 'rozstrzygniecie', oczekiwanaRewizja }), przed: stan(zdalny), po: stan(wybrany),
        wariantyKonfliktu: JSON.parse(kanonicznyZapis({ wybrano: rozstrzygniecie.typ, lokalny: konflikt.lokalny, zdalny: konflikt.zdalny })),
      }
      return schematyFinansowe[tabela].parse({ ...wybrany, createdAt: zdalny.createdAt, updatedAt, rewizja: wersja.rewizja, historiaWersji: [...zdalny.historiaWersji ?? [], wersja] })
    }
    if (rozstrzygniecie.typ === 'zdalny') return structuredClone(konflikt.zdalny)
    if (rozstrzygniecie.typ === 'reczny' && (konflikt.lokalny.usunietoAt || konflikt.zdalny.usunietoAt)) {
      throw new Error('Usunięcia nie można połączyć ręcznie.')
    }
    const rekord = structuredClone(konflikt.lokalny) as EncjaBazowa & Record<string, unknown>
    if (rozstrzygniecie.typ === 'reczny') {
      const lokalny = konflikt.lokalny as EncjaBazowa & Record<string, unknown>
      const zdalny = konflikt.zdalny as EncjaBazowa & Record<string, unknown>
      for (const [pole, wybor] of Object.entries(rozstrzygniecie.pola)) {
        const prosteWartosci = [lokalny[pole], zdalny[pole]]
          .every((wartosc) => wartosc === undefined || wartosc === null || ['string', 'number', 'boolean'].includes(typeof wartosc))
        if (!prosteWartosci || pole === 'usunietoAt' || pole === 'id' || pole === 'createdAt' || pole === 'updatedAt' || /Ids?$/i.test(pole)) {
          throw new Error('Tego pola nie można połączyć ręcznie.')
        }
        if (wybor !== 'zdalny') continue
        if (Object.prototype.hasOwnProperty.call(zdalny, pole)) rekord[pole] = structuredClone(zdalny[pole])
        else delete rekord[pole]
      }
    }
    rekord.updatedAt = updatedAt
    return rekord
  }

  private async wykonajSynchronizacje(
    repozytoriumZdalne: RepozytoriumZdalne,
    poKonflikcieSerwera = false,
  ): Promise<WynikSynchronizacji> {
    await this.zapiszStan({ ostatniaProba: this.teraz() })
    if (!this.czyOnline()) {
      await this.zapiszStan({ stan: 'offline', polaczenie: 'offline', ostatniBlad: undefined })
      return { wyslane: 0, pobrane: 0, konflikty: 0, stan: 'offline' }
    }

    const stanPrzed = await pobierzStanSynchronizacji()
    const od = repozytoriumZdalne.trwale === false
      ? POCZATEK_SYNCHRONIZACJI
      : stanPrzed.ostatniSync ?? POCZATEK_SYNCHRONIZACJI
    const synchronizowanoDo = this.teraz()
    await this.zapiszStan({ stan: 'synchronizacja', ostatniBlad: undefined })

    try {
      if (!czyKontoZgodneZDanymiLokalnymi()) throw new Error('Konto nie jest powiązane z lokalną bazą.')
      await uzupelnijKolejkePoMigracji()
      this.sprawdzKontekst()
      const finansowePrzed = new Map<string, string>()
      if (czyDostepFinansowWspolnych('odczyt')) for (const tabela of TABELE_FINANSOW_WSPOLNYCH) for (const rekord of await baza.tabela(tabela).toArray()) finansowePrzed.set(`${tabela}:${rekord.id}`, kanonicznyZapis(rekord))
      this.powiadomOEtapie('pobieranie')
      const installationId = this.installationId()
      const [lokalne, wszystkieZdalne] = await Promise.all([
        pobierzLokalneZmiany(installationId),
        this.zPonowieniami(() => repozytoriumZdalne.pobierzZmiany(od)),
      ])
      this.sprawdzKontekst()
      if (!czyKontoZgodneZDanymiLokalnymi()) throw new Error('Konto zmieniło się podczas synchronizacji.')
      walidujZmianyZdalne(wszystkieZdalne)
      const obslugujeFinanse = TABELE_FINANSOW_WSPOLNYCH.every((tabela) => repozytoriumZdalne.pobierzObslugiwaneTabeleFinansowe?.().includes(tabela))
      if (wszystkieZdalne.some((zmiana) => czyTabelaFinansowa(zmiana.tabela))) {
        sprawdzDostepFinansowWspolnych('odczyt')
        if (!obslugujeFinanse) throw new Error('Backend nie potwierdził obsługi finansów.')
        try { walidujObrazFinansowy(wszystkieZdalne) }
        catch (blad) { await this.zapiszStan({ finanseWspolneNiekompletne: true }); throw blad }
      }
      const ograniczenieFinansowWspolnych = !obslugujeFinanse && (finansowePrzed.size > 0 || lokalne.some((zmiana) => czyTabelaFinansowa(zmiana.tabela)))
        ? 'Serwer nie obsługuje wspólnych finansów. Oczekujące dane pozostają na urządzeniu; pozostałe moduły są synchronizowane.' : undefined
      const dozwoloneLokalne = lokalne.filter((zmiana) => !czyTabelaFinansowa(zmiana.tabela) || obslugujeFinanse)
      // Ochrona istniejącego dokumentu dociera na serwer także przed rozstrzygnięciem konfliktu treści.
      const klasyfikacje: ZmianaSynchronizacji[] = []
      for (const zmiana of wszystkieZdalne) {
        if (zmiana.tabela !== 'dokumenty') continue
        const lokalny = await baza.tabela('dokumenty').get(zmiana.rekord.id)
        const zabezpieczony = zachowajLokalneSamopoczucie('dokumenty', zmiana.rekord, lokalny)
        if (takieSame(zabezpieczony, zmiana.rekord)) continue
        klasyfikacje.push({ tabela: 'dokumenty', rekord: zabezpieczony, bazowyUpdatedAt: zmiana.rekord.updatedAt, installationId })
        zmiana.rekord = zabezpieczony
      }
      if (klasyfikacje.length) await this.zPonowieniami(() => {
        if (!czyKontoZgodneZDanymiLokalnymi()) throw new Error('Konto zmieniło się przed wysłaniem danych.')
        return repozytoriumZdalne.wyslijZmiany(klasyfikacje, od)
      })
      await this.zapiszStan({ ostatniPull: this.teraz(), polaczenie: 'dostepne', sesjaWymagaLogowania: false })
      const zdalne: ZmianaSynchronizacji[] = []
      const oczekujaceKlucze = new Set(dozwoloneLokalne.map(kluczZmiany))
      for (const zmiana of wszystkieZdalne) {
        if (!czyTabelaSynchronizowana(zmiana.tabela) || zmiana.installationId === installationId && !czyTabelaFinansowa(zmiana.tabela) || czyPrywatnaPsychoterapia(zmiana.tabela, zmiana.rekord)
          || czyPrywatnaPsychoterapia(zmiana.tabela, await tabelaLokalna(zmiana.tabela).get(zmiana.rekord.id))) continue
        if (czyTabelaFinansowa(zmiana.tabela) && !oczekujaceKlucze.has(kluczZmiany(zmiana)) && finansowePrzed.get(kluczZmiany(zmiana)) === kanonicznyZapis(zmiana.rekord)) continue
        zdalne.push(zmiana)
      }
      const lokalnePoKluczu = new Map(dozwoloneLokalne.map((zmiana) => [kluczZmiany(zmiana), zmiana]))
      const zdalnePoKluczu = new Map(zdalne.map((zmiana) => [kluczZmiany(zmiana), zmiana]))
      const konflikty: { lokalna: ZmianaSynchronizacji; zdalna: ZmianaSynchronizacji }[] = []
      const zgodneKlucze = new Set<string>()
      const bazoweKlucze = new Set<string>()

      for (const [klucz, lokalna] of lokalnePoKluczu) {
        const zdalna = zdalnePoKluczu.get(klucz)
        if (!zdalna) continue
        if (czyTabelaFinansowa(lokalna.tabela) && !takieSame(lokalna.rekord, zdalna.rekord)) {
          try {
            sprawdzKontynuacjeHistorii(lokalna.tabela, zdalna.rekord, lokalna.rekord)
            lokalna.bazowyUpdatedAt = zdalna.rekord.updatedAt
          } catch { /* Rozbieżne historie wymagają wyboru całej wersji. */ }
        }
        if (czyTabelaFinansowa(lokalna.tabela) ? kanonicznyZapis(lokalna.rekord) === kanonicznyZapis(zdalna.rekord) : takieSame(lokalna.rekord, zdalna.rekord)) zgodneKlucze.add(klucz)
        else if (lokalna.bazowyUpdatedAt === zdalna.rekord.updatedAt) bazoweKlucze.add(klucz)
        else konflikty.push({ lokalna, zdalna })
      }

      const konfliktoweKlucze = new Set(konflikty.map(({ lokalna }) => kluczZmiany(lokalna)))
      const doWyslania = dozwoloneLokalne.filter((zmiana) =>
        !konfliktoweKlucze.has(kluczZmiany(zmiana)) && !zgodneKlucze.has(kluczZmiany(zmiana)))
      const doPobrania = zdalne.filter((zmiana) =>
        !konfliktoweKlucze.has(kluczZmiany(zmiana))
        && !zgodneKlucze.has(kluczZmiany(zmiana))
        && !bazoweKlucze.has(kluczZmiany(zmiana)))

      await this.zapiszKonflikty(konflikty.filter(({ lokalna }) => czyTabelaFinansowa(lokalna.tabela)))
      try { await this.walidujLokalnyObraz(doPobrania) }
      catch (blad) { await this.zapiszStan({ finanseWspolneNiekompletne: true }); throw blad }

      if (doWyslania.length > 0) {
        this.powiadomOEtapie('wysylanie')
        await this.zPonowieniami(() => {
          if (!czyKontoZgodneZDanymiLokalnymi()) throw new Error('Konto zmieniło się przed wysłaniem danych.')
          this.sprawdzKontekst()
          if (doWyslania.some((zmiana) => czyTabelaFinansowa(zmiana.tabela))) sprawdzDostepFinansowWspolnych('edycja')
          return repozytoriumZdalne.wyslijZmiany(doWyslania, od)
        })
        this.sprawdzKontekst()
        await this.zapiszStan({ ostatniPush: this.teraz(), polaczenie: 'dostepne', sesjaWymagaLogowania: false })
        this.sprawdzKontekst()
        await usunWyslaneZmiany(doWyslania.flatMap((zmiana) => zmiana.zmianaId ? [zmiana.zmianaId] : []))
      }
      this.sprawdzKontekst()
      await usunWyslaneZmiany([...zgodneKlucze].flatMap((klucz) => lokalnePoKluczu.get(klucz)?.zmianaId ? [lokalnePoKluczu.get(klucz)!.zmianaId!] : []))
      try { await this.zapiszPobrane(doPobrania, finansowePrzed) }
      catch (blad) {
        if (doPobrania.some((zmiana) => czyTabelaFinansowa(zmiana.tabela))) await this.zapiszStan({ finanseWspolneNiekompletne: true })
        throw blad
      }
      await this.zapiszKonflikty(konflikty.filter(({ lokalna }) => !czyTabelaFinansowa(lokalna.tabela)))

      const stan = await this.ustawStanPoKonfliktach({
        ostatniSync: repozytoriumZdalne.pobierzKursor?.() ?? synchronizowanoDo,
        ograniczenieFinansowWspolnych,
        ...(obslugujeFinanse ? { finanseWspolneNiekompletne: undefined } : {}),
      })
      return { wyslane: doWyslania.length + klasyfikacje.length, pobrane: doPobrania.length, konflikty: konflikty.length, stan }
    } catch (blad) {
      this.sprawdzKontekst()
      if (blad instanceof BladDanychFinansowych) await this.zapiszStan({ finanseWspolneNiekompletne: true })
      const kod = sklasyfikujBladSynchronizacji(blad)
      const komunikat = komunikatyBledowSynchronizacji[kod]
      await this.zapiszStan({
        kodOstatniegoBledu: kod,
        czasOstatniegoBledu: this.teraz(),
        ...(kod === 'brak_polaczenia' ? { polaczenie: 'niedostepne' as const } : {}),
        ...(kod === 'sesja_wygasla' || kod === 'csrf' || kod === 'konflikt' ? { polaczenie: 'dostepne' as const } : {}),
        ...(kod === 'brak_sesji' || kod === 'sesja_wygasla' || kod === 'csrf' ? { sesjaWymagaLogowania: true } : {}),
      })
      if (blad instanceof BladKonfliktuSynchronizacji && !poKonflikcieSerwera) {
        return this.wykonajSynchronizacje(repozytoriumZdalne, true)
      }
      await zapiszBladKolejki((await pobierzKolejkeSynchronizacji()).map((zmiana) => zmiana.id), komunikat)
      await this.zapiszStan({
        stan: 'blad',
        ostatniBlad: komunikat,
        liczbaOczekujacych: await policzZmianyDoSynchronizacji(),
      })
      throw blad
    }
  }

  private async zapiszPobrane(zmiany: ZmianaSynchronizacji[], finansowePrzed: Map<string, string>): Promise<void> {
    this.sprawdzKontekst()
    const finansowe = zmiany.filter((zmiana) => czyTabelaFinansowa(zmiana.tabela))
    if (finansowe.length) await baza.transaction('rw', [...TABELE_FINANSOW_WSPOLNYCH.map((nazwa) => baza.table(nazwa)), baza.tabela('historiaZmian')], async () => {
      this.sprawdzKontekst()
      sprawdzDostepFinansowWspolnych('edycja')
      await this.walidujLokalnyObraz(finansowe)
      for (const zmiana of finansowe) {
        const obecny = await tabelaLokalna(zmiana.tabela).get(zmiana.rekord.id)
        if ((obecny ? kanonicznyZapis(obecny) : undefined) !== finansowePrzed.get(kluczZmiany(zmiana))) throw new Error('Dane finansowe zmieniły się podczas pobierania. Ponów synchronizację.')
        await tabelaLokalna(zmiana.tabela).put(structuredClone(zmiana.rekord))
        await this.zapiszHistorieFinansowa(zmiana.tabela, zmiana.rekord, obecny)
      }
      this.sprawdzKontekst()
    })
    const grupy = new Map<NazwaTabeliSynchronizowanej, EncjaBazowa[]>()
    for (const zmiana of zmiany) {
      if (czyTabelaFinansowa(zmiana.tabela)) { powiadomOZmianieDanych(zmiana.tabela); continue }
      grupy.set(zmiana.tabela, [...(grupy.get(zmiana.tabela) ?? []), structuredClone(zmiana.rekord)])
    }
    for (const [tabela, rekordy] of grupy) {
      await baza.transaction('rw', tabelaLokalna(tabela), async () => {
        if (!czyKontoZgodneZDanymiLokalnymi()) throw new Error('Konto zmieniło się przed zapisem danych.')
        const lokalne = await tabelaLokalna(tabela).bulkGet(rekordy.map((rekord) => rekord.id))
        await tabelaLokalna(tabela).bulkPut(rekordy.flatMap((rekord, indeks) => czyPrywatnaPsychoterapia(tabela, lokalne[indeks]) || czyPrywatnaPsychoterapia(tabela, rekord) ? [] : [zachowajLokalneSamopoczucie(tabela, rekord, lokalne[indeks])]))
      })
      powiadomOZmianieDanych(tabela)
    }
  }

  private async zapiszHistorieFinansowa(tabela: NazwaTabeliSynchronizowanej, rekord: EncjaBazowa, lokalny?: EncjaBazowa): Promise<void> {
    if (!czyTabelaFinansowa(tabela)) return
    const poprawny = schematyFinansowe[tabela].parse(rekord)
    const znane = new Set(lokalny ? schematyFinansowe[tabela].parse(lokalny).historiaWersji?.map(({ idZapisu }) => idZapisu) : [])
    for (const wersja of poprawny.historiaWersji ?? []) {
      if (znane.has(wersja.idZapisu)) continue
      const stan = (dane: typeof wersja.po) => ({ ...dane, id: rekord.id, createdAt: rekord.createdAt, updatedAt: wersja.znacznikCzasu })
      const wpis = zbudujWpisHistorii(tabela, wersja.przed ? stan(wersja.przed) : undefined, stan(wersja.po), wersja.operacja === 'przywrocenie' || wersja.operacja === 'rozstrzygniecie' ? 'aktualizacja' : wersja.operacja, wersja.znacznikCzasu)
      if (wpis) await baza.tabela('historiaZmian').put({ ...wpis, id: `finanse:${tabela}:${rekord.id}:${wersja.idZapisu}` })
    }
  }

  private async walidujLokalnyObraz(zmiany: ZmianaSynchronizacji[]): Promise<void> {
    if (!zmiany.some((zmiana) => czyTabelaFinansowa(zmiana.tabela))) return
    const obraz = new Map<string, { tabela: string; rekord: EncjaBazowa }>()
    for (const tabela of TABELE_FINANSOW_WSPOLNYCH) for (const rekord of await baza.tabela(tabela).toArray()) obraz.set(`${tabela}:${rekord.id}`, { tabela, rekord })
    for (const zmiana of zmiany.filter((zmiana) => czyTabelaFinansowa(zmiana.tabela))) obraz.set(kluczZmiany(zmiana), zmiana)
    walidujObrazFinansowy([...obraz.values()])
  }

  private powiadomOEtapie(etap: EtapOperacjiSynchronizacji) {
    try { this.obslugaEtapu?.(etap) } catch {
      // Błąd odbiorcy komunikatu nie może przerwać synchronizacji danych.
    }
  }

  private async zapiszKonflikty(
    konflikty: { lokalna: ZmianaSynchronizacji; zdalna: ZmianaSynchronizacji }[],
  ): Promise<void> {
    const wykrytoAt = this.teraz()
    const tabelaKonfliktow = baza.tabela('konfliktySynchronizacji')
    for (const { lokalna, zdalna } of konflikty) {
      this.sprawdzKontekst()
      const id = kluczZmiany(lokalna)
      const istniejacy = await tabelaKonfliktow.get(id)
      this.sprawdzKontekst()
      await tabelaKonfliktow.put({
        ...(istniejacy ?? utworzMetadane(id)),
        id,
        tabela: lokalna.tabela,
        rekordId: lokalna.rekord.id,
        lokalny: structuredClone(lokalna.rekord),
        zdalny: structuredClone(zdalna.rekord),
        wykrytoAt,
        lokalnaInstallationId: lokalna.installationId,
        zdalnaInstallationId: zdalna.installationId,
        updatedAt: wykrytoAt,
      })
    }
  }

  private async ustawStanPoKonfliktach(zmiany: Partial<StanSynchronizacji> = {}): Promise<WynikSynchronizacji['stan']> {
    this.sprawdzKontekst()
    const tabelaKonfliktow = baza.tabela('konfliktySynchronizacji')
    const kolejka = tabelaKolejki()
    const tabelaStanu = baza.tabela('stanSynchronizacji')
    return baza.transaction('rw', [tabelaKonfliktow, kolejka, tabelaStanu, ...nazwyTabelSynchronizowanych.map(tabelaLokalna)], async () => {
      const [liczbaKonfliktow, liczbaOczekujacych, zapisanyStan] = await Promise.all([
        tabelaKonfliktow.count(),
        policzZmianyDoSynchronizacji(),
        tabelaStanu.get('glowny'),
      ])
      const obecny = zapisanyStan ?? {
        ...utworzMetadane('glowny'),
        stan: 'zsynchronizowano' as const,
        liczbaKonfliktow: 0,
        liczbaOczekujacych: 0,
        kolejkaZmigrowana: false,
      }
      const stan = liczbaKonfliktow > 0
        ? 'konflikt'
        : liczbaOczekujacych > 0
          ? (this.czyOnline() ? 'oczekuje' : 'offline')
          : 'zsynchronizowano'
      await tabelaStanu.put({
        ...obecny,
        ...zmiany,
        stan,
        liczbaKonfliktow,
        liczbaOczekujacych,
        ostatniBlad: undefined,
        updatedAt: this.teraz(),
      })
      return stan
    })
  }

  private async zapiszStan(zmiany: Partial<StanSynchronizacji>): Promise<void> {
    this.sprawdzKontekst()
    const tabelaStanu = baza.tabela('stanSynchronizacji')
    const obecny = await pobierzStanSynchronizacji()
    this.sprawdzKontekst()
    await tabelaStanu.put({
      ...obecny,
      ...zmiany,
      id: 'glowny',
      liczbaOczekujacych: obecny.liczbaOczekujacych,
      updatedAt: this.teraz(),
    })
  }

  private async zPonowieniami<T>(operacja: () => Promise<T>): Promise<T> {
    let ostatniBlad: unknown
    for (let proba = 1; proba <= this.liczbaProb; proba += 1) {
      try {
        return await operacja()
      } catch (blad) {
        ostatniBlad = blad
        if (proba < this.liczbaProb && this.opoznieniePonowieniaMs > 0) {
          await new Promise((rozwiaz) => setTimeout(rozwiaz, this.opoznieniePonowieniaMs * proba))
        }
      }
    }
    throw ostatniBlad
  }
}
