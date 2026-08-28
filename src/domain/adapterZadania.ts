import { noweId, terazIso, utworzMetadane } from './fabryki'
import type { ElementZadania, PriorytetElementu, StatusElementu } from './elementyOgarniacza'
import { normalizujTerminZadania, odczytajTerminZadania } from './logikaTerminuZadania'
import type { Priorytet, RegulaPowtarzania, Zadanie } from './typy'

type NieznanyRekord = Record<string, unknown>

function jakoRekord(wartosc: unknown): NieznanyRekord {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc)
    ? wartosc as NieznanyRekord
    : {}
}

function maPole(rekord: NieznanyRekord, nazwa: string): boolean {
  return Object.prototype.hasOwnProperty.call(rekord, nazwa)
}

function tekst(wartosc: unknown, domyslny = ''): string {
  return typeof wartosc === 'string' ? wartosc : domyslny
}

function opcjonalnyTekst(wartosc: unknown): string | undefined {
  return typeof wartosc === 'string' && wartosc.length > 0 ? wartosc : undefined
}

function listaTekstow(wartosc: unknown): string[] {
  return Array.isArray(wartosc) ? wartosc.filter((element): element is string => typeof element === 'string') : []
}

function przypomnieniaElementu(wartosc: unknown): ElementZadania['przypomnienia'] {
  if (!Array.isArray(wartosc)) return []
  return wartosc.flatMap((element) => {
    const rekord = jakoRekord(element)
    const id = opcjonalnyTekst(rekord.id)
    if (!id) return []
    const czas = opcjonalnyTekst(rekord.czas)
    const przesuniecieMinuty = liczbaCalkowita(rekord.przesuniecieMinuty)
    return [{
      id,
      ...(czas ? { czas } : {}),
      ...(przesuniecieMinuty !== undefined ? { przesuniecieMinuty } : {}),
    }]
  })
}

function poprawnaLiczba(wartosc: unknown): number | undefined {
  return typeof wartosc === 'number' && Number.isFinite(wartosc) && wartosc > 0
    ? Math.round(wartosc)
    : undefined
}

function liczbaCalkowita(wartosc: unknown): number | undefined {
  return typeof wartosc === 'number' && Number.isFinite(wartosc)
    ? Math.round(wartosc)
    : undefined
}

function priorytetElementu(priorytet: unknown): PriorytetElementu {
  if (priorytet === 'krytyczny') return 'asap'
  if (priorytet === 'wysoki') return 'pilny'
  return 'normalny'
}

function priorytetZadania(priorytet: PriorytetElementu | undefined, istniejacy?: Zadanie): Priorytet {
  if (istniejacy && priorytetElementu(istniejacy.priorytet) === priorytet) return istniejacy.priorytet
  if (priorytet === 'asap') return 'krytyczny'
  if (priorytet === 'pilny') return 'wysoki'
  return 'normalny'
}

function statusElementu(status: unknown): StatusElementu {
  if (status === 'otwarty' || status === 'wykonany' || status === 'anulowany' || status === 'pominiety') return status
  return status === 'wykonane' ? 'wykonany' : 'otwarty'
}

function statusZadania(status: StatusElementu | undefined, istniejacy?: Zadanie): Zadanie['status'] {
  if (istniejacy && statusElementu(istniejacy.status) === status) return istniejacy.status
  return status === 'wykonany' ? 'wykonane' : 'otwarte'
}

function powtarzanie(wartosc: unknown): RegulaPowtarzania | undefined {
  const rekord = jakoRekord(wartosc)
  const typy = ['brak', 'codziennie', 'co_x_dni', 'tygodniowo', 'dni_tygodnia', 'miesiecznie', 'rocznie']
  if (typeof rekord.typ !== 'string' || !typy.includes(rekord.typ)) return undefined
  return {
    typ: rekord.typ as RegulaPowtarzania['typ'],
    ...(poprawnaLiczba(rekord.coIle) ? { coIle: poprawnaLiczba(rekord.coIle) } : {}),
    ...(Array.isArray(rekord.dniTygodnia) ? { dniTygodnia: rekord.dniTygodnia.filter((dzien): dzien is number => Number.isInteger(dzien)) } : {}),
    ...(opcjonalnyTekst(rekord.dataStartu) ? { dataStartu: opcjonalnyTekst(rekord.dataStartu) } : {}),
  }
}

export function zadanieLegacyNaElement(wartosc: unknown): ElementZadania {
  const rekord = jakoRekord(wartosc)
  const id = opcjonalnyTekst(rekord.id) ?? noweId()
  const teraz = terazIso()
  const termin = odczytajTerminZadania(rekord)
  const data = termin.data
  const godzina = termin.godzina
  const terminGraniczny = maPole(rekord, 'terminGranicznyElementu')
    ? opcjonalnyTekst(rekord.terminGranicznyElementu)
    : opcjonalnyTekst(rekord.termin)
  const trybTerminu = termin.tryb
  const opis = opcjonalnyTekst(rekord.opis)
  const projektId = opcjonalnyTekst(rekord.projektId)
  const regula = powtarzanie(rekord.powtarzanie)

  return {
    id,
    typ: 'zadanie',
    tytul: tekst(rekord.tytul).trim() || 'Bez tytułu',
    ...(opis ? { opis } : {}),
    referencjaZrodla: { modul: 'zadania', encjaId: id },
    ...(data ? { data } : {}),
    ...(godzina ? { godzina } : {}),
    ...(poprawnaLiczba(rekord.szacowanyCzasMin) ? { czasTrwaniaMinuty: poprawnaLiczba(rekord.szacowanyCzasMin) } : {}),
    ...(terminGraniczny ? { terminGraniczny } : {}),
    trybTerminu,
    priorytet: priorytetElementu(rekord.priorytet),
    status: statusElementu(rekord.statusElementu ?? rekord.status),
    ...(regula ? { powtarzanie: regula } : {}),
    przypomnienia: przypomnieniaElementu(rekord.przypomnieniaElementu),
    ...(rekord.dostepnoscPlanistyczna === 'czesciowa' || rekord.dostepnoscPlanistyczna === 'pelna'
      ? { dostepnoscPlanistyczna: rekord.dostepnoscPlanistyczna }
      : {}),
    ...(opcjonalnyTekst(rekord.kontekst) ? { kontekstPlanowania: opcjonalnyTekst(rekord.kontekst) } : {}),
    tagi: listaTekstow(rekord.tagi),
    pokazNaPulpicie: rekord.pokazNaPulpicie !== false,
    zasobyIds: listaTekstow(rekord.zasobyIds),
    ...(projektId ? { dane: { projektId } } : {}),
    createdAt: opcjonalnyTekst(rekord.createdAt) ?? teraz,
    updatedAt: opcjonalnyTekst(rekord.updatedAt) ?? teraz,
  }
}

export function elementNaZadanieLegacy(element: ElementZadania, istniejacy?: Zadanie): Zadanie {
  const {
    deadlineMode: _deadlineMode,
    time: _time,
    godzinaElementu: _godzinaElementu,
    ...metadane
  } = (istniejacy ?? utworzMetadane(element.id)) as Zadanie & { deadlineMode?: unknown; time?: unknown }
  const termin = element.data
  const terminElementu = normalizujTerminZadania(
    element.trybTerminu ?? (element.godzina ? 'o_godzinie' : element.data ? 'koniec_dnia' : 'bez_godziny'),
    element.godzina,
  )
  return {
    ...metadane,
    id: element.id,
    tytul: element.tytul.trim(),
    opis: element.opis ?? '',
    status: statusZadania(element.status, istniejacy),
    priorytet: priorytetZadania(element.priorytet, istniejacy),
    termin,
    szacowanyCzasMin: element.czasTrwaniaMinuty,
    projektId: element.dane?.projektId,
    kontekst: element.kontekstPlanowania,
    tagi: [...(element.tagi ?? [])],
    podzadania: [...(istniejacy?.podzadania ?? [])],
    powtarzanie: element.powtarzanie,
    powiazania: [...(istniejacy?.powiazania ?? [])],
    wykonanoAt: element.status === 'wykonany' ? (istniejacy?.wykonanoAt ?? terazIso()) : undefined,
    dataElementu: element.data,
    ...(terminElementu.godzina ? { godzinaElementu: terminElementu.godzina } : {}),
    terminGranicznyElementu: element.terminGraniczny,
    trybTerminuElementu: terminElementu.tryb,
    statusElementu: element.status,
    przypomnieniaElementu: element.przypomnienia?.map((przypomnienie) => ({ ...przypomnienie })),
    dostepnoscPlanistyczna: element.dostepnoscPlanistyczna,
    pokazNaPulpicie: element.pokazNaPulpicie,
    zasobyIds: [...(element.zasobyIds ?? [])],
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
  }
}

// OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V3: AT_TIME przekazuje deadline zadania na oś czasu.
