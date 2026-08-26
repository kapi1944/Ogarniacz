import { noweId, terazIso, utworzMetadane } from './fabryki'
import type { ElementZadania, PriorytetElementu, StatusElementu, TrybTerminuElementu } from './elementyOgarniacza'
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

function daneTerminu(termin: unknown): { data?: string; godzina?: string; tryb: TrybTerminuElementu } {
  if (typeof termin !== 'string') return { tryb: 'bez_godziny' }
  const dopasowanie = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(termin)
  if (!dopasowanie) return { tryb: 'bez_godziny' }
  return {
    data: dopasowanie[1],
    ...(dopasowanie[2] ? { godzina: dopasowanie[2] } : {}),
    tryb: dopasowanie[2] ? 'o_godzinie' : 'koniec_dnia',
  }
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
  const termin = daneTerminu(rekord.termin)
  const data = maPole(rekord, 'dataElementu') ? opcjonalnyTekst(rekord.dataElementu) : termin.data
  const godzina = maPole(rekord, 'godzinaElementu') ? opcjonalnyTekst(rekord.godzinaElementu) : termin.godzina
  const terminGraniczny = maPole(rekord, 'terminGranicznyElementu')
    ? opcjonalnyTekst(rekord.terminGranicznyElementu)
    : opcjonalnyTekst(rekord.termin)
  const trybTerminu = rekord.trybTerminuElementu === 'o_godzinie'
    || rekord.trybTerminuElementu === 'koniec_dnia'
    || rekord.trybTerminuElementu === 'bez_godziny'
    ? rekord.trybTerminuElementu
    : termin.tryb
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
  const metadane = istniejacy ?? utworzMetadane(element.id)
  const termin = element.terminGraniczny
    ?? (element.data ? `${element.data}${element.godzina ? `T${element.godzina}` : ''}` : undefined)
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
    godzinaElementu: element.godzina,
    terminGranicznyElementu: element.terminGraniczny,
    trybTerminuElementu: element.trybTerminu,
    statusElementu: element.status,
    przypomnieniaElementu: element.przypomnienia?.map((przypomnienie) => ({ ...przypomnienie })),
    dostepnoscPlanistyczna: element.dostepnoscPlanistyczna,
    pokazNaPulpicie: element.pokazNaPulpicie,
    zasobyIds: [...(element.zasobyIds ?? [])],
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
  }
}
