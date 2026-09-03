import type { Table } from 'dexie'
import { baza, nazwyTabel } from '../data/BazaOgarniacza'
import type {
  DostawcaSynchronizacji,
  NazwaTabeliSynchronizowanej,
  RepozytoriumZdalne,
  WynikSynchronizacji,
  ZmianaSynchronizacji,
} from '../data/DostawcaSynchronizacji'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'
import { utworzMetadane } from '../domain/fabryki'
import type { EncjaBazowa, KonfliktSynchronizacji, StanSynchronizacji } from '../domain/typy'
import { pobierzInstallationId } from './InstallationService'

const POCZATEK_SYNCHRONIZACJI = '1970-01-01T00:00:00.000Z'
const TABELE_NIESYNCHRONIZOWANE = new Set([
  'stanSynchronizacji',
  'konfliktySynchronizacji',
  'pamiecEcho',
  'dziennikEcho',
])

export const nazwyTabelSynchronizowanych = nazwyTabel.filter(
  (nazwa): nazwa is NazwaTabeliSynchronizowanej => !TABELE_NIESYNCHRONIZOWANE.has(nazwa),
)

interface OpcjeSyncEngine {
  teraz?: () => string
  czyOnline?: () => boolean
  installationId?: () => string
  liczbaProb?: number
  opoznieniePonowieniaMs?: number
}

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
  const dozwoloneTabele = new Set<string>(nazwyTabelSynchronizowanych)
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

async function pobierzLokalneZmiany(od: string, installationId: string): Promise<ZmianaSynchronizacji[]> {
  const paczki = await Promise.all(nazwyTabelSynchronizowanych.map(async (tabela) =>
    (await tabelaLokalna(tabela).where('updatedAt').above(od).toArray())
      .map((rekord) => ({ tabela, rekord, installationId })),
  ))
  return paczki.flat()
}

export async function pobierzStanSynchronizacji(): Promise<StanSynchronizacji> {
  return (await baza.tabela('stanSynchronizacji').get('glowny')) ?? {
    ...utworzMetadane('glowny'),
    stan: 'zsynchronizowano',
    liczbaKonfliktow: 0,
  }
}

export async function pobierzKonfliktySynchronizacji(): Promise<KonfliktSynchronizacji[]> {
  return baza.tabela('konfliktySynchronizacji').orderBy('wykrytoAt').reverse().toArray()
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

export async function odtworzOczekujacaSynchronizacje(online = typeof navigator === 'undefined' || navigator.onLine): Promise<boolean> {
  const obecny = await pobierzStanSynchronizacji()
  if (obecny.stan === 'synchronizacja' || obecny.stan === 'konflikt') return false
  const od = obecny.ostatniSync ?? POCZATEK_SYNCHRONIZACJI
  const wyniki = await Promise.all(nazwyTabelSynchronizowanych.map((tabela) =>
    tabelaLokalna(tabela).where('updatedAt').above(od).limit(1).count(),
  ))
  if (!wyniki.some(Boolean)) return false
  await oznaczOczekujacaSynchronizacje(online)
  return true
}

export class SyncEngine implements DostawcaSynchronizacji {
  private readonly teraz: () => string
  private readonly czyOnline: () => boolean
  private readonly installationId: () => string
  private readonly liczbaProb: number
  private readonly opoznieniePonowieniaMs: number
  private trwajacaSynchronizacja?: Promise<WynikSynchronizacji>

  constructor(opcje: OpcjeSyncEngine = {}) {
    this.teraz = opcje.teraz ?? (() => new Date().toISOString())
    this.czyOnline = opcje.czyOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine)
    this.installationId = opcje.installationId ?? pobierzInstallationId
    this.liczbaProb = Math.max(1, opcje.liczbaProb ?? 3)
    this.opoznieniePonowieniaMs = Math.max(0, opcje.opoznieniePonowieniaMs ?? 250)
  }

  synchronizuj(repozytoriumZdalne: RepozytoriumZdalne): Promise<WynikSynchronizacji> {
    this.trwajacaSynchronizacja ??= this.wykonajSynchronizacje(repozytoriumZdalne)
      .finally(() => { this.trwajacaSynchronizacja = undefined })
    return this.trwajacaSynchronizacja
  }

  async rozstrzygnijKonflikt(id: string, wybor: 'lokalny' | 'zdalny'): Promise<void> {
    const konflikt = await baza.tabela('konfliktySynchronizacji').get(id)
    if (!konflikt) return
    const tabela = konflikt.tabela as NazwaTabeliSynchronizowanej
    const stan = await pobierzStanSynchronizacji()
    const teraz = this.teraz()
    const znacznikLokalnegoWyboru = stan.ostatniSync && teraz <= stan.ostatniSync
      ? new Date(new Date(stan.ostatniSync).getTime() + 1).toISOString()
      : teraz
    const rekord = wybor === 'lokalny'
      ? { ...konflikt.lokalny, updatedAt: znacznikLokalnegoWyboru }
      : structuredClone(konflikt.zdalny)
    await baza.transaction('rw', [tabelaLokalna(tabela), baza.tabela('konfliktySynchronizacji')], async () => {
      await tabelaLokalna(tabela).put(rekord)
      await baza.tabela('konfliktySynchronizacji').delete(id)
    })
    powiadomOZmianieDanych(tabela)
    await this.ustawStanPoKonfliktach()
  }

  private async wykonajSynchronizacje(repozytoriumZdalne: RepozytoriumZdalne): Promise<WynikSynchronizacji> {
    if (!this.czyOnline()) {
      await this.zapiszStan({ stan: 'offline', ostatniBlad: undefined })
      return { wyslane: 0, pobrane: 0, konflikty: 0, stan: 'offline' }
    }

    const stanPrzed = await pobierzStanSynchronizacji()
    const od = repozytoriumZdalne.trwale === false
      ? POCZATEK_SYNCHRONIZACJI
      : stanPrzed.ostatniSync ?? POCZATEK_SYNCHRONIZACJI
    const synchronizowanoDo = this.teraz()
    await this.zapiszStan({ stan: 'synchronizacja', ostatniBlad: undefined })

    try {
      const [lokalne, zdalne] = await Promise.all([
        pobierzLokalneZmiany(od, this.installationId()),
        this.zPonowieniami(() => repozytoriumZdalne.pobierzZmiany(od)),
      ])
      walidujZmianyZdalne(zdalne)
      const lokalnePoKluczu = new Map(lokalne.map((zmiana) => [kluczZmiany(zmiana), zmiana]))
      const zdalnePoKluczu = new Map(zdalne.map((zmiana) => [kluczZmiany(zmiana), zmiana]))
      const konflikty: { lokalna: ZmianaSynchronizacji; zdalna: ZmianaSynchronizacji }[] = []
      const zgodneKlucze = new Set<string>()

      for (const [klucz, lokalna] of lokalnePoKluczu) {
        const zdalna = zdalnePoKluczu.get(klucz)
        if (!zdalna) continue
        if (takieSame(lokalna.rekord, zdalna.rekord)) zgodneKlucze.add(klucz)
        else konflikty.push({ lokalna, zdalna })
      }

      const konfliktoweKlucze = new Set(konflikty.map(({ lokalna }) => kluczZmiany(lokalna)))
      const doWyslania = lokalne.filter((zmiana) =>
        !konfliktoweKlucze.has(kluczZmiany(zmiana)) && !zgodneKlucze.has(kluczZmiany(zmiana)))
      const doPobrania = zdalne.filter((zmiana) =>
        !konfliktoweKlucze.has(kluczZmiany(zmiana)) && !zgodneKlucze.has(kluczZmiany(zmiana)))

      if (doWyslania.length > 0) {
        await this.zPonowieniami(() => repozytoriumZdalne.wyslijZmiany(doWyslania, od))
      }
      await this.zapiszPobrane(doPobrania)
      await this.zapiszKonflikty(konflikty)

      const liczbaKonfliktow = await baza.tabela('konfliktySynchronizacji').count()
      const stan = liczbaKonfliktow > 0 ? 'konflikt' : 'zsynchronizowano'
      await this.zapiszStan({
        stan,
        ostatniSync: synchronizowanoDo,
        ostatniBlad: undefined,
        liczbaKonfliktow,
      })
      return { wyslane: doWyslania.length, pobrane: doPobrania.length, konflikty: konflikty.length, stan }
    } catch (blad) {
      await this.zapiszStan({
        stan: 'blad',
        ostatniBlad: blad instanceof Error ? blad.message : 'Nieznany błąd synchronizacji.',
      })
      throw blad
    }
  }

  private async zapiszPobrane(zmiany: ZmianaSynchronizacji[]): Promise<void> {
    const grupy = new Map<NazwaTabeliSynchronizowanej, EncjaBazowa[]>()
    for (const zmiana of zmiany) {
      grupy.set(zmiana.tabela, [...(grupy.get(zmiana.tabela) ?? []), structuredClone(zmiana.rekord)])
    }
    for (const [tabela, rekordy] of grupy) {
      await tabelaLokalna(tabela).bulkPut(rekordy)
      powiadomOZmianieDanych(tabela)
    }
  }

  private async zapiszKonflikty(
    konflikty: { lokalna: ZmianaSynchronizacji; zdalna: ZmianaSynchronizacji }[],
  ): Promise<void> {
    const wykrytoAt = this.teraz()
    for (const { lokalna, zdalna } of konflikty) {
      const id = kluczZmiany(lokalna)
      const istniejacy = await baza.tabela('konfliktySynchronizacji').get(id)
      await baza.tabela('konfliktySynchronizacji').put({
        ...(istniejacy ?? utworzMetadane(id)),
        id,
        tabela: lokalna.tabela,
        rekordId: lokalna.rekord.id,
        lokalny: structuredClone(lokalna.rekord),
        zdalny: structuredClone(zdalna.rekord),
        wykrytoAt,
        updatedAt: wykrytoAt,
      })
    }
  }

  private async ustawStanPoKonfliktach(): Promise<void> {
    const liczbaKonfliktow = await baza.tabela('konfliktySynchronizacji').count()
    await this.zapiszStan({
      stan: liczbaKonfliktow > 0 ? 'konflikt' : 'zsynchronizowano',
      liczbaKonfliktow,
      ostatniBlad: undefined,
    })
  }

  private async zapiszStan(zmiany: Partial<StanSynchronizacji>): Promise<void> {
    const obecny = await pobierzStanSynchronizacji()
    await baza.tabela('stanSynchronizacji').put({
      ...obecny,
      ...zmiany,
      id: 'glowny',
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
