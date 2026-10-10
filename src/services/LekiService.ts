import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns'
import { noweId, terazIso, utworzMetadane } from '../domain/fabryki'
import { baza } from '../data/BazaOgarniacza'
import { dodajDoKolejkiSynchronizacji, tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'
import type { DawkaLeku, DziennikLeku, Lek, RuchApteczkiLeku, TrybDawkowaniaLeku } from '../domain/typy'

export interface DawkaDnia {
  idWystapienia: string
  lek: Lek
  dawka: DawkaLeku
  data: string
  planowanaGodzina: string
  status: DziennikLeku['status']
  wpis?: DziennikLeku
}

interface ZaplanowanaDawka {
  dawka: DawkaLeku
  kluczWystapienia?: string
}

interface ZaplanowaneWystapienie extends ZaplanowanaDawka {
  idWystapienia: string
}

function poprawnaGodzina(godzina: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(godzina)
}

function minutyDnia(godzina: string): number {
  const [godziny, minuty] = godzina.split(':').map(Number)
  return godziny * 60 + minuty
}

function godzinaZMinut(minuty: number): string {
  const wartosc = ((minuty % 1440) + 1440) % 1440
  return `${String(Math.floor(wartosc / 60)).padStart(2, '0')}:${String(wartosc % 60).padStart(2, '0')}`
}

export function trybDawkowania(lek: Lek): TrybDawkowaniaLeku {
  return lek.trybDawkowania ?? 'konkretne_godziny'
}

/** Zamienia stary zapis godzin na dawki z deterministycznym, trwałym id. */
export function dawkiLeku(lek: Lek): DawkaLeku[] {
  if (lek.dawki?.length) return lek.dawki.filter((dawka) => poprawnaGodzina(dawka.godzina)).sort((a, b) => a.godzina.localeCompare(b.godzina))
  return lek.godziny
    .filter(poprawnaGodzina)
    .map((godzina) => ({ id: `starsza-dawka:${lek.id}:${godzina}`, godzina, ilosc: lek.zuzycieNaDawke, instrukcja: lek.dawkaInstrukcja || undefined }))
}

export function proponujGodzinyDawek(liczbaDawek: number, od: string, doGodziny: string): string[] {
  if (!poprawnaGodzina(od) || !poprawnaGodzina(doGodziny) || !Number.isInteger(liczbaDawek) || liczbaDawek < 1) return []
  const poczatek = minutyDnia(od)
  const koniec = minutyDnia(doGodziny)
  if (koniec <= poczatek) return []
  if (liczbaDawek === 1) return [od]
  return Array.from({ length: liczbaDawek }, (_, indeks) => godzinaZMinut(Math.round(poczatek + (koniec - poczatek) * indeks / (liczbaDawek - 1))))
}

export function idWystapieniaDawki(lekId: string, data: string, dawkaId: string, kluczWystapienia?: string): string {
  const prefiksStarszejDawki = `starsza-dawka:${lekId}:`
  const idBazowy = dawkaId.startsWith(prefiksStarszejDawki) ? `${lekId}:${data}:${dawkaId.slice(prefiksStarszejDawki.length)}` : `${lekId}:${data}:${dawkaId}`
  return kluczWystapienia ? `${idBazowy}:${kluczWystapienia}` : idBazowy
}

export function czyLekZaplanowanyNaDzien(lek: Lek, data: string): boolean {
  if (lek.dataOd && data < lek.dataOd) return false
  if (lek.dataDo && data > lek.dataDo) return false
  const dzien = parseISO(data)
  if (Number.isNaN(dzien.getTime())) return false
  if (lek.dniTygodnia?.length && !lek.dniTygodnia.includes(getDay(dzien))) return false
  if (lek.coIleDni && lek.coIleDni > 1 && lek.dataOd) return differenceInCalendarDays(dzien, parseISO(lek.dataOd)) % lek.coIleDni === 0
  return true
}

export function graniceLokalnegoDnia(data: string): { od: Date; do: Date } | undefined {
  const od = parseISO(data)
  if (Number.isNaN(od.getTime())) return undefined
  return { od, do: addDays(od, 1) }
}

function dawkiInterwalowe(lek: Lek, data: string): ZaplanowanaDawka[] {
  const definicja = dawkiLeku(lek)[0]
  const interwal = lek.interwalGodzin
  const pierwszaGodzina = lek.pierwszaGodzina ?? definicja?.godzina
  if (!definicja || !interwal || interwal < 1 || !pierwszaGodzina || !poprawnaGodzina(pierwszaGodzina)) return []
  const poczatek = new Date(`${lek.dataOd ?? data}T${pierwszaGodzina}:00`).getTime()
  const graniceDnia = graniceLokalnegoDnia(data)
  if (!graniceDnia) return []
  const dzienOd = graniceDnia.od.getTime()
  const dzienDo = graniceDnia.do.getTime()
  const krok = interwal * 60 * 60_000
  const pierwszyIndeks = Math.max(0, Math.ceil((dzienOd - poczatek) / krok))
  const wynik: ZaplanowanaDawka[] = []
  for (let indeks = pierwszyIndeks; poczatek + indeks * krok < dzienDo; indeks += 1) {
    const czas = poczatek + indeks * krok
    if (czas >= dzienOd) wynik.push({ dawka: { ...definicja, godzina: format(new Date(czas), 'HH:mm') }, kluczWystapienia: `interwal-${indeks}` })
  }
  return wynik
}

function zaplanowaneDawki(lek: Lek, data: string): ZaplanowanaDawka[] {
  return trybDawkowania(lek) === 'co_x_godzin' ? dawkiInterwalowe(lek, data) : dawkiLeku(lek).map((dawka) => ({ dawka }))
}

export function dawkiZaplanowaneNaDzien(lek: Lek, data: string): DawkaLeku[] {
  return zaplanowaneDawki(lek, data).map(({ dawka }) => dawka)
}

function zuzycieDnia(lek: Lek, data: string): number {
  if (!czyLekZaplanowanyNaDzien(lek, data)) return 0
  return dawkiZaplanowaneNaDzien(lek, data).reduce((suma, dawka) => suma + (typeof dawka.ilosc === 'number' && dawka.ilosc > 0 ? dawka.ilosc : 0), 0)
}

export function przewidywanaDataWyczerpania(lek: Lek, odDnia: string): string | undefined {
  const zapas = stanApteczki(lek)
  if (!zapas || zapas <= 0 || Number.isNaN(parseISO(odDnia).getTime())) return undefined
  let pozostalo = zapas
  let data = odDnia
  for (let indeks = 0; indeks < 3660; indeks += 1) {
    const zuzycie = zuzycieDnia(lek, data)
    if (zuzycie > 0) {
      pozostalo -= zuzycie
      if (pozostalo <= 0) return data
    }
    data = format(addDays(parseISO(data), 1), 'yyyy-MM-dd')
    if (lek.dataDo && data > lek.dataDo) return undefined
  }
  return undefined
}

/** Projekcja dla starszych leków oraz bilans niecofniętych ruchów apteczki. */
export function ruchyApteczki(lek: Lek): RuchApteczkiLeku[] {
  if (Array.isArray(lek.ruchyApteczki)) return lek.ruchyApteczki
  if (typeof lek.zapasJednostek !== 'number') return []
  return [{ id: `stan-poczatkowy:${lek.id}`, typ: 'dodanie', ilosc: lek.zapasJednostek, data: lek.dataOtwarcia ?? lek.createdAt.slice(0, 10), createdAt: lek.createdAt }]
}

export function stanApteczki(lek: Lek): number | undefined {
  const ruchy = ruchyApteczki(lek)
  if (ruchy.length === 0) return undefined
  return ruchy.reduce((suma, ruch) => ruch.cofnietoAt ? suma : suma + (ruch.typ === 'dodanie' ? ruch.ilosc : -ruch.ilosc), 0)
}

function lekZRuchami(lek: Lek, ruchy: RuchApteczkiLeku[]): Lek {
  return { ...lek, ruchyApteczki: ruchy, zapasJednostek: ruchy.reduce((suma, ruch) => ruch.cofnietoAt ? suma : suma + (ruch.typ === 'dodanie' ? ruch.ilosc : -ruch.ilosc), 0) }
}

export async function zapiszLekZDodanymZapasem(lek: Lek, dodanyZapas?: number): Promise<void> {
  if (dodanyZapas !== undefined && (!Number.isFinite(dodanyZapas) || dodanyZapas < 0)) throw new Error('Podaj nieujemną ilość zapasu.')
  const tabelaLekow = baza.tabela('leki')
  await baza.transaction('rw', [tabelaLekow, tabelaKolejki()], async () => {
    const poprzedni = await tabelaLekow.get(lek.id)
    const ruchy = ruchyApteczki(poprzedni ?? lek)
    const zDodaniem = dodanyZapas && dodanyZapas > 0
      ? [...ruchy, { id: `dodanie:${noweId()}`, typ: 'dodanie' as const, ilosc: dodanyZapas, data: new Date().toISOString().slice(0, 10), createdAt: terazIso() }]
      : ruchy
    const zapisany = lekZRuchami({ ...lek, ruchyApteczki: zDodaniem }, zDodaniem)
    zapisany.updatedAt = terazIso()
    await tabelaLekow.put(zapisany)
    await dodajDoKolejkiSynchronizacji('leki', zapisany, poprzedni)
  })
  powiadomOZmianieDanych('leki')
}

function dopasujWpisyDziennika(
  lek: Lek,
  data: string,
  wystapienia: readonly ZaplanowaneWystapienie[],
  wpisy: readonly DziennikLeku[],
): Map<string, DziennikLeku> {
  const niewykorzystane = new Set(wpisy.filter((wpis) => wpis.lekId === lek.id && wpis.data === data))
  const dopasowane = new Map<string, DziennikLeku>()

  for (const wystapienie of wystapienia) {
    const wpis = [...niewykorzystane].find((element) => element.id === wystapienie.idWystapienia || element.idWystapienia === wystapienie.idWystapienia)
    if (!wpis) continue
    dopasowane.set(wystapienie.idWystapienia, wpis)
    niewykorzystane.delete(wpis)
  }

  for (const wystapienie of wystapienia) {
    if (dopasowane.has(wystapienie.idWystapienia)) continue
    const { dawka, kluczWystapienia } = wystapienie
    const wadliweIdInterwalowe = idWystapieniaDawki(lek.id, data, dawka.id)
    const wpis = [...niewykorzystane].find((element) => {
      if (element.planowanaGodzina !== dawka.godzina) return false
      if (!element.dawkaId) return true
      return Boolean(kluczWystapienia) && element.dawkaId === dawka.id && element.id === wadliweIdInterwalowe
    })
    if (!wpis) continue
    dopasowane.set(wystapienie.idWystapienia, wpis)
    niewykorzystane.delete(wpis)
  }

  return dopasowane
}

export function generujDawkiDnia(leki: Lek[], wpisy: DziennikLeku[], data: string): DawkaDnia[] {
  return leki
    .filter((lek) => lek.aktywny && !lek.usunietoAt && czyLekZaplanowanyNaDzien(lek, data))
    .flatMap((lek) => {
      const wystapienia = zaplanowaneDawki(lek, data).map(({ dawka, kluczWystapienia }) => ({ dawka, kluczWystapienia, idWystapienia: idWystapieniaDawki(lek.id, data, dawka.id, kluczWystapienia) }))
      const dopasowane = dopasujWpisyDziennika(lek, data, wystapienia, wpisy)
      return wystapienia.map(({ dawka, idWystapienia }) => {
        const wpis = dopasowane.get(idWystapienia)
        return { idWystapienia, lek, dawka, data, planowanaGodzina: dawka.godzina, status: wpis?.status ?? 'oczekuje', wpis }
      })
    })
    .sort((a, b) => a.planowanaGodzina.localeCompare(b.planowanaGodzina) || a.idWystapienia.localeCompare(b.idWystapienia))
}

/** Buduje wpis bez zapisu. Zachowany dla starszych odbiorców; zapis domenowy wykonuje zapiszStatusDawkiZApteczka. */
export function zapiszStatusDawki(dawka: DawkaDnia, status: DziennikLeku['status'], odroczoneDo?: string): DziennikLeku {
  const obecny = dawka.wpis
  return {
    ...(obecny ?? utworzMetadane(dawka.idWystapienia)),
    id: obecny?.id ?? dawka.idWystapienia,
    lekId: dawka.lek.id,
    dawkaId: dawka.dawka.id,
    idWystapienia: dawka.idWystapienia,
    data: dawka.data,
    planowanaGodzina: obecny?.planowanaGodzina ?? dawka.planowanaGodzina,
    status,
    reakcjaAt: terazIso(),
    odroczoneDo: status === 'odroczone' ? odroczoneDo : undefined,
    updatedAt: terazIso(),
  }
}

export interface DanePrzyjeciaDawki {
  przyjetoAt?: string
  przyjetaIlosc?: number
  przyjetaJednostka?: string
  potwierdzRozbieznosc?: boolean
}

export class RozbieznoscApteczki extends Error {}

/** Jedyny zapis domenowy dawki: dziennik, apteczka i kolejka w jednej transakcji. */
export async function zapiszStatusDawkiZApteczka(dawka: DawkaDnia, status: DziennikLeku['status'], odroczoneDo?: string, dane: DanePrzyjeciaDawki = {}): Promise<void> {
  const tabelaLekow = baza.tabela('leki')
  const tabelaDziennika = baza.tabela('dziennikLekow')
  await baza.transaction('rw', [tabelaLekow, tabelaDziennika, tabelaKolejki()], async () => {
    const lek = await tabelaLekow.get(dawka.lek.id)
    if (!lek || lek.usunietoAt) throw new Error('Nie znaleziono leku dla tej dawki.')
    const wpisy = (await tabelaDziennika.where('lekId').equals(lek.id).toArray()).filter((wpis) => !wpis.usunietoAt)
    const aktualna = generujDawkiDnia([lek], wpisy, dawka.data).find((element) => element.idWystapienia === dawka.idWystapienia)
    if (!aktualna) throw new Error('Harmonogram dawki uległ zmianie. Odśwież widok.')
    const poprzedniWpis = aktualna.wpis
    const teraz = terazIso()
    const poprawnyTermin = (termin: string | undefined) => Boolean(termin && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(termin) && Number.isFinite(parseISO(termin).getTime()))
    if (status === 'odroczone' && (!poprawnyTermin(odroczoneDo) || new Date(odroczoneDo!).getTime() <= new Date(teraz).getTime())) {
      throw new Error('Podaj prawidłowy przyszły termin odroczenia.')
    }
    if (dane.przyjetoAt !== undefined && (!poprawnyTermin(dane.przyjetoAt) || new Date(dane.przyjetoAt).getTime() > new Date(teraz).getTime())) throw new Error('Podaj prawidłową datę i godzinę faktycznego przyjęcia (nie w przyszłości).')
    if (dane.przyjetaIlosc !== undefined && (!Number.isFinite(dane.przyjetaIlosc) || dane.przyjetaIlosc <= 0)) throw new Error('Podaj dodatnią rzeczywistą ilość dawki.')
    if (dane.przyjetaJednostka !== undefined && !dane.przyjetaJednostka.trim()) throw new Error('Podaj jednostkę przyjętej dawki.')
    const wpis = zapiszStatusDawki(aktualna, status, status === 'odroczone' ? new Date(odroczoneDo!).toISOString() : undefined)
    const ruchy = ruchyApteczki(lek)
    // Starszy wpis może mieć inne ID niż aktualne wystąpienie.
    const idZuzycia = `zuzycie:${aktualna.idWystapienia}`
    const istniejaceZuzycie = ruchy.find((ruch) => ruch.id === idZuzycia) ?? (poprzedniWpis && ruchy.find((ruch) => ruch.id === `zuzycie:${poprzedniWpis.id}`))
    let zaktualizowaneRuchy = ruchy
    if (status === 'zazyte') {
      const juzPrzyjeta = poprzedniWpis?.status === 'zazyte'
      wpis.przyjetoAt = dane.przyjetoAt ? new Date(dane.przyjetoAt).toISOString() : juzPrzyjeta ? poprzedniWpis.przyjetoAt : teraz
      const ilosc = dane.przyjetaIlosc ?? (juzPrzyjeta ? poprzedniWpis.przyjetaIlosc ?? istniejaceZuzycie?.ilosc : aktualna.dawka.ilosc)
      if (ilosc !== undefined && (!Number.isFinite(ilosc) || ilosc <= 0)) throw new Error('Podaj dodatnią rzeczywistą ilość dawki.')
      const jednostka = dane.przyjetaJednostka?.trim() ?? (juzPrzyjeta ? poprzedniWpis.przyjetaJednostka : undefined) ?? lek.jednostka ?? lek.jednostkaLubPostac
      wpis.przyjetaIlosc = ilosc
      wpis.przyjetaJednostka = jednostka
      // Powtórzenie potwierdzenia zachowuje wcześniejsze rozliczenie, także niedobór.
      const zmienionoIlosc = dane.przyjetaIlosc !== undefined && dane.przyjetaIlosc !== poprzedniWpis?.przyjetaIlosc
      const zmienionoJednostke = dane.przyjetaJednostka !== undefined && jednostka !== poprzedniWpis?.przyjetaJednostka
      if (!juzPrzyjeta || zmienionoIlosc || zmienionoJednostke) {
        const stan = stanApteczki(lek)
        const dostepne = Math.max(0, (stan ?? 0) + (istniejaceZuzycie && !istniejaceZuzycie.cofnietoAt ? istniejaceZuzycie.ilosc : 0))
        const jednostkaZapasu = lek.jednostka ?? lek.jednostkaLubPostac
        const moznaRozliczyc = ilosc !== undefined && stan !== undefined && jednostka === jednostkaZapasu
        const rozliczone = moznaRozliczyc ? Math.min(ilosc, dostepne) : 0
        const nierozliczone = ilosc === undefined ? undefined : ilosc - rozliczone
        const powod = ilosc === undefined ? 'Nie podano ilości dawki.' : stan === undefined ? 'Nie prowadzisz zapasu tego leku.' : jednostka !== jednostkaZapasu ? 'Jednostka przyjęcia różni się od jednostki zapasu; brak przelicznika.' : nierozliczone! > 0 ? `Niedobór zapasu: dostępne ${dostepne}, przyjęte ${ilosc} ${jednostka ?? ''}.` : undefined
        if (powod && !dane.potwierdzRozbieznosc) throw new RozbieznoscApteczki(`${powod} Fakt przyjęcia zostanie zapisany z jawnym nierozliczonym zapasem. Potwierdź rozbieżność.`)
        wpis.nierozliczonaIlosc = nierozliczone
        wpis.rozbieznoscApteczki = powod
        if (istniejaceZuzycie || rozliczone > 0) zaktualizowaneRuchy = ruchy.filter((ruch) => ruch !== istniejaceZuzycie)
        if (rozliczone > 0) zaktualizowaneRuchy.push({ id: istniejaceZuzycie?.id ?? idZuzycia, typ: 'zuzycie', ilosc: rozliczone, data: wpis.przyjetoAt?.slice(0, 10) ?? aktualna.data, idWystapienia: aktualna.idWystapienia, createdAt: istniejaceZuzycie?.createdAt ?? teraz })
        else if (istniejaceZuzycie) zaktualizowaneRuchy.push({ ...istniejaceZuzycie, cofnietoAt: teraz })
      }
    } else {
      wpis.przyjetoAt = undefined
      wpis.przyjetaIlosc = undefined
      wpis.przyjetaJednostka = undefined
      wpis.nierozliczonaIlosc = undefined
      wpis.rozbieznoscApteczki = undefined
      if (istniejaceZuzycie && !istniejaceZuzycie.cofnietoAt) zaktualizowaneRuchy = ruchy.map((ruch) => ruch === istniejaceZuzycie ? { ...ruch, cofnietoAt: teraz } : ruch)
    }
    await tabelaDziennika.put(wpis)
    await dodajDoKolejkiSynchronizacji('dziennikLekow', wpis, poprzedniWpis)
    if (zaktualizowaneRuchy !== ruchy) {
      const zapisanyLek = { ...lekZRuchami(lek, zaktualizowaneRuchy), updatedAt: teraz }
      await tabelaLekow.put(zapisanyLek)
      await dodajDoKolejkiSynchronizacji('leki', zapisanyLek, lek)
    }
  })
  powiadomOZmianieDanych('dziennikLekow')
  powiadomOZmianieDanych('leki')
}

export function czasDawkiDoUwagi(data: string, godzina: string, status: DziennikLeku['status'], odroczoneDo?: string): number {
  return status === 'odroczone' && odroczoneDo ? new Date(odroczoneDo).getTime() : new Date(`${data}T${godzina}:00`).getTime()
}

export function wyznaczNastepnaDawke(dawki: readonly DawkaDnia[], teraz = new Date()): DawkaDnia | undefined {
  const czasTeraz = teraz.getTime()
  const czasDawki = (dawka: DawkaDnia) => dawka.status === 'odroczone' && dawka.wpis?.odroczoneDo ? new Date(dawka.wpis.odroczoneDo).getTime() : new Date(`${dawka.data}T${dawka.planowanaGodzina}:00`).getTime()
  return [...dawki]
    .filter((dawka) => dawka.status === 'oczekuje' || dawka.status === 'odroczone')
    .filter((dawka) => Number.isFinite(czasDawki(dawka)) && czasDawki(dawka) >= czasTeraz)
    .sort((a, b) => czasDawki(a) - czasDawki(b) || a.idWystapienia.localeCompare(b.idWystapienia))[0]
}
