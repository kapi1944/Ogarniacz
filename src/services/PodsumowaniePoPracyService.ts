import { addDays, format } from 'date-fns'
import { baza } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { repozytoriumUstawien } from '../data/RepozytoriumUstawien'
import { dodajDoKolejkiSynchronizacji, tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'
import { pobierzAktywnyProfil, pobierzSygnalProfilu } from '../data/ProfileLokalne'
import { zadanieLegacyNaElement } from '../domain/adapterZadania'
import { normalizujUstawienia } from '../domain/ustawienia'
import type { ElementZadania } from '../domain/elementyOgarniacza'
import type { Priorytet, Przypomnienie, Urlop, Ustawienia, WyjatekGrafiku, Zadanie } from '../domain/typy'
import { utworzHarmonogramDnia } from '../modules/pulpit/logikaOsiCzasu'
import { czyKontoZgodneZDanymiLokalnymi, pobierzKontoOffline } from './KontaService'
import { czyBiezacyDostep } from './UprawnieniaService'

export interface ZadaniePodsumowania {
  element: ElementZadania
  priorytet: Priorytet
}

export interface PodsumowaniePoPracy {
  data: string
  termin: string
  zalegle: ZadaniePodsumowania[]
  dzisiaj: ZadaniePodsumowania[]
  liczbaZaleglych: number
  liczbaNaDzisiaj: number
  liczbaRazem: number
}

export interface DanePodsumowaniaPoPracy {
  ustawienia: Ustawienia
  zadania: Zadanie[]
  wyjatki: WyjatekGrafiku[]
  urlopy: Urlop[]
}

export function profilPodsumowaniaPoPracy(): string {
  return pobierzAktywnyProfil()?.wlascicielId ?? pobierzKontoOffline()?.wlascicielId ?? baza.name
}

export function czyDostepPodsumowaniaPoPracy(): boolean {
  return !pobierzSygnalProfilu().aborted && czyKontoZgodneZDanymiLokalnymi()
    && czyBiezacyDostep('echo', 'odczyt') && czyBiezacyDostep('zadania', 'odczyt')
    && czyBiezacyDostep('grafik', 'odczyt')
}

export function czyPodsumowaniePoPracyWlaczone(ustawienia: Ustawienia): boolean {
  return ustawienia.proaktywnoscEcho && !ustawienia.echoWyciszone
    && ustawienia.modulyEcho.includes('zadania') && ustawienia.podsumowaniePoPracy.wlaczone
}

export function terminPodsumowaniaPoPracy(data: string, dane: Pick<DanePodsumowaniaPoPracy, 'ustawienia' | 'wyjatki' | 'urlopy'>): string | undefined {
  const harmonogram = utworzHarmonogramDnia(data, dane.ustawienia.harmonogram,
    dane.wyjatki.find((wyjatek) => !wyjatek.usunietoAt && wyjatek.data === data), dane.urlopy.filter((urlop) => !urlop.usunietoAt))
  const powrot = harmonogram.przedzialy.find((przedzial) => przedzial.id === 'powrot')
  const koniec = powrot?.koniecAt && Date.parse(powrot.koniecAt)
  if (!koniec || !Number.isFinite(koniec)) return undefined
  return new Date(koniec + dane.ustawienia.podsumowaniePoPracy.opoznienieMinuty * 60_000).toISOString()
}

/** Wyłącznie istniejące rekordy; bez generowania wystąpień i zapisu zadań. */
export function utworzPodsumowaniePoPracy(data: string, dane: DanePodsumowaniaPoPracy, terminHistoryczny?: string): PodsumowaniePoPracy | undefined {
  const termin = terminHistoryczny ?? terminPodsumowaniaPoPracy(data, dane)
  if (!termin) return undefined
  const konfiguracja = dane.ustawienia.podsumowaniePoPracy
  const unikalne = new Map<string, Zadanie>()
  for (const zadanie of dane.zadania) {
    const poprzednie = unikalne.get(zadanie.id)
    if (!poprzednie || zadanie.updatedAt > poprzednie.updatedAt) unikalne.set(zadanie.id, zadanie)
  }
  const zalegle: ZadaniePodsumowania[] = []
  const dzisiaj: ZadaniePodsumowania[] = []
  for (const zadanie of unikalne.values()) {
    // Prywatne ćwiczenia mają własny chroniony ekran i repozytorium.
    if (zadanie.usunietoAt || 'sesjaTerapiiId' in zadanie) continue
    if (['anulowane', 'anulowany', 'pominiete', 'pominiety'].includes(String(zadanie.status))) continue
    const element = zadanieLegacyNaElement(zadanie)
    if (element.status !== 'otwarty') continue
    const dataZadania = element.data ?? element.terminGraniczny?.slice(0, 10)
    if (!dataZadania || !/^\d{4}-\d{2}-\d{2}$/.test(dataZadania)) continue
    const pozycja = { element, priorytet: zadanie.priorytet }
    if (dataZadania < data && konfiguracja.zalegle) zalegle.push(pozycja)
    else if (dataZadania === data && konfiguracja.dzisiaj) dzisiaj.push(pozycja)
  }
  const wagi = { niski: 0, normalny: 1, wysoki: 2, krytyczny: 3 }
  const porownaj = (pierwsze: ZadaniePodsumowania, drugie: ZadaniePodsumowania) =>
    (konfiguracja.priorytety ? (wagi[drugie.priorytet] ?? 1) - (wagi[pierwsze.priorytet] ?? 1) : 0)
    || `${pierwsze.element.data ?? pierwsze.element.terminGraniczny?.slice(0, 10)}T${pierwsze.element.godzina ?? '23:59'}`
      .localeCompare(`${drugie.element.data ?? drugie.element.terminGraniczny?.slice(0, 10)}T${drugie.element.godzina ?? '23:59'}`)
    || pierwsze.element.id.localeCompare(drugie.element.id)
  zalegle.sort(porownaj)
  dzisiaj.sort(porownaj)
  return { data, termin, zalegle, dzisiaj, liczbaZaleglych: zalegle.length, liczbaNaDzisiaj: dzisiaj.length, liczbaRazem: zalegle.length + dzisiaj.length }
}

export async function pobierzDanePodsumowaniaPoPracy(ustawienia?: Ustawienia): Promise<DanePodsumowaniaPoPracy | undefined> {
  if (!czyDostepPodsumowaniaPoPracy()) return undefined
  const sygnal = pobierzSygnalProfilu()
  const [zapisane, zadania, wyjatki, urlopy] = await Promise.all([
    ustawienia ?? repozytoriumUstawien.wczytaj(), pobierzRepozytorium('zadania').lista(),
    pobierzRepozytorium('wyjatkiGrafiku').lista(), pobierzRepozytorium('urlopy').lista(),
  ])
  if (sygnal.aborted || !czyDostepPodsumowaniaPoPracy()) return undefined
  return { ustawienia: zapisane, zadania, wyjatki, urlopy }
}

export function planPodsumowanPoPracy(dane: DanePodsumowaniaPoPracy, teraz: Date): PodsumowaniePoPracy[] {
  if (!czyPodsumowaniePoPracyWlaczone(dane.ustawienia)) return []
  // Wczorajszy dzień pracy może kończyć się powrotem po północy.
  return Array.from({ length: 16 }, (_, indeks) => format(addDays(teraz, indeks - 1), 'yyyy-MM-dd'))
    .flatMap((data) => {
      const podsumowanie = utworzPodsumowaniePoPracy(data, dane)
      return podsumowanie?.liczbaRazem && Date.parse(podsumowanie.termin) >= teraz.getTime() - 60 * 60_000 ? [podsumowanie] : []
    })
}

export function sciezkaPodsumowaniaPoPracy(data: string): string {
  return `/dzisiaj?poPracy=${encodeURIComponent(data)}`
}

export function czyZakonczonePodsumowanie(przypomnienie: Przypomnienie): boolean {
  return Boolean(przypomnienie.echoPoPracy && (przypomnienie.echoPoPracy.dostarczonoAt || przypomnienie.echoPoPracy.zamknietoOknoAt || ['dostarczone', 'wykonane'].includes(przypomnienie.stan)))
}

/** Transakcja i stabilny klucz chronią również przed równoległymi uzgodnieniami. */
export async function uzgodnijPodsumowaniaPoPracy(teraz: Date, natywna: boolean, dostarczoneIds: string[] = []): Promise<Przypomnienie[]> {
  const sygnal = pobierzSygnalProfilu()
  const dane = await pobierzDanePodsumowaniaPoPracy()
  const profilId = profilPodsumowaniaPoPracy()
  const plan = dane ? planPodsumowanPoPracy(dane, teraz) : []
  const tabela = baza.tabela('przypomnienia')
  let zmieniono = false
  const wynik = await baza.transaction('rw', [tabela, tabelaKolejki()], async () => {
    if (sygnal.aborted) return []
    const istniejace = await tabela.toArray()
    const docelowe = new Map<string, Przypomnienie>()
    for (const stare of istniejace) {
      if (!stare.echoPoPracy || stare.usunietoAt) continue
      let nowe = stare
      if (!czyZakonczonePodsumowanie(stare) && stare.echoPoPracy.profilId === profilId) {
        if (dostarczoneIds.includes(stare.id)) nowe = { ...stare, stan: 'dostarczone', echoPoPracy: { ...stare.echoPoPracy, dostarczonoAt: teraz.toISOString() } }
        else if (natywna && stare.echoPoPracy.zaplanowanoNa && Date.parse(stare.echoPoPracy.zaplanowanoNa) <= teraz.getTime()) {
          // Alarm mógł zostać odebrany i usunięty przy wyłączonym JS. Nie udajemy potwierdzenia.
          nowe = { ...stare, stan: 'pominiete', echoPoPracy: { ...stare.echoPoPracy, zamknietoOknoAt: teraz.toISOString() } }
        }
      }
      if (!czyZakonczonePodsumowanie(nowe)) nowe = { ...nowe, stan: 'pominiete', echoPoPracy: { ...nowe.echoPoPracy!, zaplanowanoNa: undefined } }
      docelowe.set(stare.id, nowe)
    }
    for (const podsumowanie of plan) {
      const id = `echo-po-pracy:${profilId}:${podsumowanie.data}`
      const stare = istniejace.find((element) => element.id === id)
      const uzgodnione = docelowe.get(id)
      if (stare?.usunietoAt || uzgodnione && czyZakonczonePodsumowanie(uzgodnione)) continue
      docelowe.set(id, {
        ...(stare ?? { id, createdAt: teraz.toISOString(), updatedAt: teraz.toISOString() }),
        tytul: 'Sprawdź zadania pozostałe po pracy', typ: 'absolutne', czas: podsumowanie.termin,
        priorytet: 'normalny', stan: 'nowe', eskalacja: false, kluczDeduplikacji: id,
        echoPoPracy: { ...stare?.echoPoPracy, profilId, data: podsumowanie.data },
      })
    }
    for (const nowe of docelowe.values()) {
      const stare = istniejace.find((element) => element.id === nowe.id)
      if (JSON.stringify(stare) === JSON.stringify(nowe)) continue
      nowe.updatedAt = teraz.toISOString()
      await tabela.put(nowe)
      await dodajDoKolejkiSynchronizacji('przypomnienia', nowe, stare)
      zmieniono = true
    }
    return (await tabela.toArray()).filter((element) => !element.usunietoAt && (!element.echoPoPracy || element.echoPoPracy.profilId === profilId && Boolean(dane)))
  })
  if (zmieniono) powiadomOZmianieDanych('przypomnienia')
  return wynik
}

export async function oznaczStanPodsumowaniaPoPracy(id: string, rodzaj: 'dostarczone' | 'zaplanowane', teraz = new Date()): Promise<boolean> {
  if (!czyDostepPodsumowaniaPoPracy()) return false
  const tabela = baza.tabela('przypomnienia')
  const zmieniono = await baza.transaction('rw', [tabela, tabelaKolejki(), baza.tabela('zadania'), baza.tabela('ustawienia'), baza.tabela('wyjatkiGrafiku'), baza.tabela('urlopy')], async () => {
    const stare = await tabela.get(id)
    if (!stare?.echoPoPracy || stare.usunietoAt || stare.stan !== 'nowe' || czyZakonczonePodsumowanie(stare)
      || stare.echoPoPracy.profilId !== profilPodsumowaniaPoPracy()) return false
    if (rodzaj === 'dostarczone') {
      const ustawienia = normalizujUstawienia(await baza.tabela('ustawienia').get('glowne'))
      if (!czyPodsumowaniePoPracyWlaczone(ustawienia)) return false
      const podsumowanie = utworzPodsumowaniePoPracy(stare.echoPoPracy.data, { ustawienia,
        zadania: await pobierzRepozytorium('zadania').lista(),
        wyjatki: await baza.tabela('wyjatkiGrafiku').toArray(), urlopy: await baza.tabela('urlopy').toArray() })
      const opoznienie = podsumowanie && teraz.getTime() - Date.parse(podsumowanie.termin)
      if (!podsumowanie?.liczbaRazem || podsumowanie.termin !== stare.czas || opoznienie === undefined || opoznienie < 0 || opoznienie > 60 * 60_000) return false
    }
    if (rodzaj === 'zaplanowane' && stare.echoPoPracy.zaplanowanoNa === stare.czas) return false
    const nowe: Przypomnienie = { ...stare, updatedAt: teraz.toISOString(),
      stan: rodzaj === 'dostarczone' ? 'dostarczone' : stare.stan,
      echoPoPracy: { ...stare.echoPoPracy, ...(rodzaj === 'dostarczone' ? { dostarczonoAt: teraz.toISOString() } : { zaplanowanoNa: stare.czas }) } }
    if (rodzaj === 'zaplanowane') nowe.updatedAt = stare.updatedAt
    await tabela.put(nowe)
    if (rodzaj === 'dostarczone') await dodajDoKolejkiSynchronizacji('przypomnienia', nowe, stare)
    return true
  })
  if (zmieniono) powiadomOZmianieDanych('przypomnienia')
  return zmieniono
}
