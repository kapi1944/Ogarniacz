import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns'
import { noweId, terazIso, utworzMetadane } from '../domain/fabryki'
import { baza } from '../data/BazaOgarniacza'
import { dodajDoKolejkiSynchronizacji, tabelaKolejki } from '../data/KolejkaSynchronizacji'
import { powiadomOZmianieDanych } from '../data/ZdarzeniaDanych'
import type { DawkaLeku, DziennikLeku, Lek, RuchApteczkiLeku, TrybDawkowaniaLeku, KonfiguracjaDawkowaniaLeku, WersjaDawkowaniaLeku } from '../domain/typy'

export interface DawkaDnia {
  idWystapienia: string
  lek: Lek
  dawka: DawkaLeku
  data: string
  planowanaGodzina: string
  status: DziennikLeku['status']
  wpis?: DziennikLeku
  wersjaDawkowaniaId?: string
  jednostkaDawki?: string
  planowanyCzas?: string
}

interface ZaplanowanaDawka {
  dawka: DawkaLeku
  kluczWystapienia?: string
  planowanyCzas?: string
}

interface ZaplanowaneWystapienie extends ZaplanowanaDawka {
  idWystapienia: string
}

const polaDawkowania = ['dawkaInstrukcja', 'godziny', 'dawki', 'trybDawkowania', 'liczbaDawekDziennie', 'oknoAktywnosciOd', 'oknoAktywnosciDo', 'interwalGodzin', 'pierwszaGodzina', 'jednostka', 'jednostkaLubPostac', 'dniTygodnia', 'coIleDni', 'dataOd', 'dataDo', 'zuzycieNaDawke', 'dodatkoweInstrukcje'] as const

function konfiguracjaDawkowania(lek: KonfiguracjaDawkowaniaLeku): KonfiguracjaDawkowaniaLeku {
  return structuredClone(Object.fromEntries(polaDawkowania.map((pole) => [pole, lek[pole]]))) as KonfiguracjaDawkowaniaLeku
}

export function aktualnySchematLeku(lek: Lek, czas = new Date()): Lek | undefined {
  const wersja = lek.historiaDawkowania?.filter((element) => Date.parse(element.obowiazujeOd) <= czas.getTime()).at(-1)
  return wersja ? { ...lek, ...konfiguracjaDawkowania(wersja.konfiguracja) } : lek.historiaDawkowania?.length ? undefined : lek
}

export function jednostkaZapasuLeku(lek: Lek): string | undefined {
  if (lek.jednostkaZapasu === null) return undefined
  return lek.jednostkaZapasu ?? lek.jednostka ?? lek.jednostkaLubPostac
}

export interface ZmianaDawkowaniaLeku {
  obowiazujeOd?: string
  notatka?: string
}

/** Lokalne pole formularza może wskazywać dwie chwile podczas cofnięcia zegara. */
export function mozliweChwileSchematu(termin: string): Date[] {
  const pierwsza = parseISO(termin)
  if (!Number.isFinite(pierwsza.getTime()) || format(pierwsza, "yyyy-MM-dd'T'HH:mm") !== termin) return []
  return [0, 30, 60, 120].map((minuty) => new Date(pierwsza.getTime() + minuty * 60_000)).filter((chwila) => format(chwila, "yyyy-MM-dd'T'HH:mm") === termin)
}

function nowaWersjaDawkowania(lek: Lek, zmiana: ZmianaDawkowaniaLeku, teraz: string, poczatekNieznany = false): WersjaDawkowaniaLeku {
  const konfiguracja = konfiguracjaDawkowania(lek)
  const poczatek = zmiana.obowiazujeOd ?? teraz
  const obowiazujeOd = parseISO(poczatek)
  if (!poczatek.includes('T') || !Number.isFinite(obowiazujeOd.getTime())) throw new Error('Podaj prawidłową datę i godzinę początku schematu.')
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(poczatek)) {
    const chwile = mozliweChwileSchematu(poczatek.slice(0, 16))
    if (chwile.length === 0) throw new Error('Ta godzina nie istnieje w lokalnej strefie czasu. Wybierz inną godzinę.')
    if (chwile.length > 1) throw new Error('Ta godzina występuje dwukrotnie. Wybierz konkretne wystąpienie z przesunięciem czasu.')
  }
  const godzina = lek.pierwszaGodzina ?? dawkiLeku(lek)[0]?.godzina
  return { id: noweId(), obowiazujeOd: obowiazujeOd.toISOString(), zapisanoAt: teraz, konfiguracja, notatka: zmiana.notatka?.trim() || undefined, poczatekNieznany: poczatekNieznany || undefined,
    poczatekInterwalu: trybDawkowania(lek) === 'co_x_godzin' && godzina ? new Date(`${lek.dataOd ?? format(obowiazujeOd, 'yyyy-MM-dd')}T${godzina}:00`).toISOString() : undefined }
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
export function dawkiLeku(lek: Pick<Lek, 'id' | 'dawki' | 'godziny' | 'zuzycieNaDawke' | 'dawkaInstrukcja'>): DawkaLeku[] {
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

function dawkiInterwalowe(lek: Lek, data: string, poczatekInterwalu?: string): ZaplanowanaDawka[] {
  const definicja = dawkiLeku(lek)[0]
  const interwal = lek.interwalGodzin
  const pierwszaGodzina = lek.pierwszaGodzina ?? definicja?.godzina
  if (!definicja || !interwal || interwal < 1 || !pierwszaGodzina || !poprawnaGodzina(pierwszaGodzina)) return []
  const poczatek = new Date(poczatekInterwalu ?? `${lek.dataOd ?? data}T${pierwszaGodzina}:00`).getTime()
  const graniceDnia = graniceLokalnegoDnia(data)
  if (!graniceDnia) return []
  const dzienOd = graniceDnia.od.getTime()
  const dzienDo = graniceDnia.do.getTime()
  const krok = interwal * 60 * 60_000
  const pierwszyIndeks = Math.max(0, Math.ceil((dzienOd - poczatek) / krok))
  const wynik: ZaplanowanaDawka[] = []
  for (let indeks = pierwszyIndeks; poczatek + indeks * krok < dzienDo; indeks += 1) {
    const czas = poczatek + indeks * krok
    if (czas >= dzienOd) wynik.push({ dawka: { ...definicja, godzina: format(new Date(czas), 'HH:mm') }, kluczWystapienia: `interwal-${indeks}`, planowanyCzas: new Date(czas).toISOString() })
  }
  return wynik
}

function zaplanowaneDawki(lek: Lek, data: string, poczatekInterwalu?: string): ZaplanowanaDawka[] {
  return trybDawkowania(lek) === 'co_x_godzin' ? dawkiInterwalowe(lek, data, poczatekInterwalu) : dawkiLeku(lek).map((dawka) => ({ dawka }))
}

function wystapieniaSchematow(lek: Lek, data: string): (ZaplanowaneWystapienie & { wersjaDawkowaniaId?: string; jednostkaDawki?: string })[] {
  const wersje = lek.historiaDawkowania
  // JSON pomija undefined; brak pola w starszej wersji nie może dziedziczyć wartości z nowszej.
  const konfiguracje = wersje?.length ? wersje.map((wersja, indeks) => ({ lek: { ...lek, ...konfiguracjaDawkowania(wersja.konfiguracja) }, wersja, indeks })) : [{ lek, wersja: undefined, indeks: 0 }]
  return konfiguracje.flatMap(({ lek: wedlugWersji, wersja, indeks }) => {
    if (!czyLekZaplanowanyNaDzien(wedlugWersji, data)) return []
    const dawki = zaplanowaneDawki(wedlugWersji, data, wersja?.poczatekInterwalu)
    return dawki.flatMap(({ dawka, kluczWystapienia, planowanyCzas }) => {
      const czas = planowanyCzas ?? new Date(`${data}T${dawka.godzina}:00`).toISOString()
      // Nie przesuwamy nieistniejącej godziny podczas wiosennej zmiany czasu.
      if (!planowanyCzas && format(new Date(czas), 'HH:mm') !== dawka.godzina) return []
      if (wersja && (Date.parse(czas) < Date.parse(wersja.obowiazujeOd) || wersje?.[indeks + 1] && Date.parse(czas) >= Date.parse(wersje[indeks + 1].obowiazujeOd))) return []
      const idBazowe = idWystapieniaDawki(lek.id, data, dawka.id, kluczWystapienia)
      return [{ dawka, kluczWystapienia, planowanyCzas: czas, idWystapienia: indeks === 0 ? idBazowe : `${idBazowe}:wersja-${wersja!.id}`, wersjaDawkowaniaId: wersja?.id, jednostkaDawki: wedlugWersji.jednostka ?? wedlugWersji.jednostkaLubPostac }]
    })
  })
}

export function dawkiZaplanowaneNaDzien(lek: Lek, data: string): DawkaLeku[] {
  return wystapieniaSchematow(lek, data).map(({ dawka }) => dawka)
}

function zuzycieDnia(lek: Lek, data: string): number | undefined {
  const wystapienia = wystapieniaSchematow(lek, data)
  if (wystapienia.some((wystapienie) => wystapienie.jednostkaDawki !== jednostkaZapasuLeku(lek) || !wystapienie.dawka.ilosc || wystapienie.dawka.ilosc < 0)) return undefined
  return wystapienia.reduce((suma, wystapienie) => suma + wystapienie.dawka.ilosc!, 0)
}

export function przewidywanaDataWyczerpania(lek: Lek, odDnia: string): string | undefined {
  const zapas = stanApteczki(lek)
  if (!zapas || zapas <= 0 || Number.isNaN(parseISO(odDnia).getTime())) return undefined
  let pozostalo = zapas
  let data = odDnia
  for (let indeks = 0; indeks < 3660; indeks += 1) {
    const zuzycie = zuzycieDnia(lek, data)
    if (zuzycie === undefined) return undefined
    if (zuzycie > 0) {
      pozostalo -= zuzycie
      if (pozostalo <= 0) return data
    }
    data = format(addDays(parseISO(data), 1), 'yyyy-MM-dd')
    if (!lek.historiaDawkowania?.length && lek.dataDo && data > lek.dataDo) return undefined
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

export async function zapiszLekZDodanymZapasem(lek: Lek, dodanyZapas?: number, zmiana?: ZmianaDawkowaniaLeku): Promise<void> {
  if (dodanyZapas !== undefined && (!Number.isFinite(dodanyZapas) || dodanyZapas < 0)) throw new Error('Podaj nieujemną ilość zapasu.')
  const tabelaLekow = baza.tabela('leki')
  await baza.transaction('rw', [tabelaLekow, tabelaKolejki()], async () => {
    const poprzedni = await tabelaLekow.get(lek.id)
    const teraz = terazIso()
    if (poprzedni?.historiaDawkowania && JSON.stringify(lek.historiaDawkowania) !== JSON.stringify(poprzedni.historiaDawkowania)) throw new Error('Historia schematów uległa zmianie. Odśwież formularz.')
    let historia = poprzedni?.historiaDawkowania
    const poprzedniaKonfiguracja = historia?.at(-1)?.konfiguracja ?? (poprzedni && konfiguracjaDawkowania(poprzedni))
    const zmieniony = poprzedniaKonfiguracja && JSON.stringify(konfiguracjaDawkowania(poprzedniaKonfiguracja)) !== JSON.stringify(konfiguracjaDawkowania(lek))
    if (!poprzedni || zmieniony) {
      const nowa = nowaWersjaDawkowania(lek, zmiana ?? { obowiazujeOd: teraz }, teraz)
      if (poprzedni && Date.parse(nowa.obowiazujeOd) < Date.parse(teraz)) throw new Error('Nowy schemat nie może zmieniać przeszłości. Wskaż bieżący lub przyszły początek.')
      if (historia?.length && Date.parse(nowa.obowiazujeOd) <= Date.parse(historia.at(-1)!.obowiazujeOd)) throw new Error('Nowy schemat musi zaczynać się po ostatniej zapisanej wersji.')
      historia = [...(historia ?? (poprzedni ? [nowaWersjaDawkowania(poprzedni, { obowiazujeOd: teraz, notatka: 'Schemat uchwycony przed pierwszą zmianą; wcześniejszy początek nieznany.' }, teraz, true)] : [])), nowa]
    }
    const ruchy = ruchyApteczki(poprzedni ?? lek)
    const zDodaniem = dodanyZapas && dodanyZapas > 0
      ? [...ruchy, { id: `dodanie:${noweId()}`, typ: 'dodanie' as const, ilosc: dodanyZapas, data: new Date().toISOString().slice(0, 10), createdAt: terazIso() }]
      : ruchy
    // null zachowuje nieznaną jednostkę starego bilansu po późniejszym uzupełnieniu dawkowania.
    const jednostkaZapasu = poprzedni
      ? poprzedni.jednostkaZapasu !== undefined ? poprzedni.jednostkaZapasu : jednostkaZapasuLeku(poprzedni) ?? null
      : lek.jednostka ?? lek.jednostkaLubPostac ?? null
    const zapisany = lekZRuchami({ ...lek, historiaDawkowania: historia, jednostkaZapasu, ruchyApteczki: zDodaniem }, zDodaniem)
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
      if (element.wersjaDawkowaniaId || element.idWystapienia || wystapienie.idWystapienia.includes(':wersja-')) return false
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
  return leki.filter((lek) => !lek.usunietoAt).flatMap((lek) => {
    const wystapienia = lek.aktywny ? wystapieniaSchematow(lek, data) : []
    const dopasowane = dopasujWpisyDziennika(lek, data, wystapienia, wpisy.filter((wpis) => !wpis.usunietoAt))
    const wykorzystane = new Set([...dopasowane.values()].map((wpis) => wpis.id))
    const wynik: DawkaDnia[] = wystapienia.map((wystapienie) => {
      const wpis = dopasowane.get(wystapienie.idWystapienia)
      const nieznanaHistoria = wpis && lek.historiaDawkowania?.length && !wpis.planowanaDawka
      return { ...wystapienie, lek, dawka: wpis?.planowanaDawka ?? (nieznanaHistoria ? { id: wystapienie.dawka.id, godzina: wpis.planowanaGodzina } : wystapienie.dawka), planowanaGodzina: wpis?.planowanaGodzina ?? wystapienie.dawka.godzina, data, status: wpis?.status ?? 'oczekuje', wpis,
        wersjaDawkowaniaId: wpis ? wpis.wersjaDawkowaniaId : wystapienie.wersjaDawkowaniaId, jednostkaDawki: nieznanaHistoria ? wpis.planowanaJednostka : wpis?.planowanaJednostka ?? wystapienie.jednostkaDawki, planowanyCzas: nieznanaHistoria ? wpis.planowanyCzas : wpis?.planowanyCzas ?? wystapienie.planowanyCzas }
    })
    // Wpisy spoza znanych schematów pozostają historią, bez zgadywania dawnej ilości.
    for (const wpis of wpisy.filter((element) => element.lekId === lek.id && element.data === data && !element.usunietoAt && !wykorzystane.has(element.id))) {
      wynik.push({ idWystapienia: wpis.idWystapienia ?? wpis.id, lek, dawka: wpis.planowanaDawka ?? { id: wpis.dawkaId ?? `starsza-dawka:${lek.id}:${wpis.planowanaGodzina}`, godzina: wpis.planowanaGodzina }, data, planowanaGodzina: wpis.planowanaGodzina, status: wpis.status, wpis, wersjaDawkowaniaId: wpis.wersjaDawkowaniaId, jednostkaDawki: wpis.planowanaJednostka, planowanyCzas: wpis.planowanyCzas })
    }
    return wynik
  }).sort((a, b) => a.planowanaGodzina.localeCompare(b.planowanaGodzina) || a.idWystapienia.localeCompare(b.idWystapienia))
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
    wersjaDawkowaniaId: obecny ? obecny.wersjaDawkowaniaId : dawka.wersjaDawkowaniaId,
    planowanaDawka: obecny?.planowanaDawka ?? (obecny && !obecny.wersjaDawkowaniaId ? undefined : structuredClone(dawka.dawka)),
    planowanaJednostka: obecny?.planowanaJednostka ?? (obecny && !obecny.wersjaDawkowaniaId ? undefined : dawka.jednostkaDawki),
    planowanyCzas: obecny?.planowanyCzas ?? (obecny && !obecny.wersjaDawkowaniaId ? undefined : dawka.planowanyCzas),
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
    if (!aktualna || !lek.aktywny) throw new Error('Harmonogram dawki uległ zmianie. Odśwież widok.')
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
      const jednostka = dane.przyjetaJednostka?.trim() ?? (juzPrzyjeta ? poprzedniWpis.przyjetaJednostka : undefined) ?? aktualna.jednostkaDawki
      wpis.przyjetaIlosc = ilosc
      wpis.przyjetaJednostka = jednostka
      // Powtórzenie potwierdzenia zachowuje wcześniejsze rozliczenie, także niedobór.
      const zmienionoIlosc = dane.przyjetaIlosc !== undefined && dane.przyjetaIlosc !== poprzedniWpis?.przyjetaIlosc
      const zmienionoJednostke = dane.przyjetaJednostka !== undefined && jednostka !== poprzedniWpis?.przyjetaJednostka
      if (!juzPrzyjeta || zmienionoIlosc || zmienionoJednostke) {
        const stan = stanApteczki(lek)
        const dostepne = Math.max(0, (stan ?? 0) + (istniejaceZuzycie && !istniejaceZuzycie.cofnietoAt ? istniejaceZuzycie.ilosc : 0))
        const jednostkaZapasu = jednostkaZapasuLeku(lek)
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
  const czasDawki = (dawka: DawkaDnia) => dawka.status === 'odroczone' && dawka.wpis?.odroczoneDo ? new Date(dawka.wpis.odroczoneDo).getTime() : new Date(dawka.planowanyCzas ?? `${dawka.data}T${dawka.planowanaGodzina}:00`).getTime()
  return [...dawki]
    .filter((dawka) => dawka.status === 'oczekuje' || dawka.status === 'odroczone')
    .filter((dawka) => Number.isFinite(czasDawki(dawka)) && czasDawki(dawka) >= czasTeraz)
    .sort((a, b) => czasDawki(a) - czasDawki(b) || a.idWystapienia.localeCompare(b.idWystapienia))[0]
}
