import type { ElementOgarniacza } from '../domain/elementyOgarniacza'
import type { WpisHistoriiZmian } from '../domain/typy'

export type RodzajBriefinguDnia = 'poranny' | 'wieczorny'
export type TrybBriefinguDnia = 'szybki' | 'swobodny'

export interface PrzypomnienieBriefinguDnia {
  tytul: string
  czas: string
}

export interface DaneBriefinguDnia {
  data: string
  elementyDzisiaj: readonly ElementOgarniacza[]
  elementyJutro: readonly ElementOgarniacza[]
  przypomnienia?: readonly PrzypomnienieBriefinguDnia[]
  historia?: readonly WpisHistoriiZmian[]
  praca?: { od: string; do: string }
}

export interface WynikBriefinguDnia {
  rodzaj: RodzajBriefinguDnia
  tekst: string
  skrot?: string
  niewykonaneIds: string[]
}

const wagaPriorytetu = { normalny: 0, pilny: 1, asap: 2 }

function minuty(godzina: string): number {
  const [godziny, minutyWGodzinie] = godzina.split(':').map(Number)
  return godziny * 60 + minutyWGodzinie
}

function waznosc(element: ElementOgarniacza): number {
  return wagaPriorytetu[element.priorytet ?? 'normalny'] * 100
    + (element.terminGraniczny ? 30 : 0)
    + (element.godzina ? 10 : 0)
}

function najwazniejsze(elementy: readonly ElementOgarniacza[], limit: number): ElementOgarniacza[] {
  return [...elementy].sort((a, b) => waznosc(b) - waznosc(a)
    || `${a.data ?? '9999'}T${a.godzina ?? '99:99'}`.localeCompare(`${b.data ?? '9999'}T${b.godzina ?? '99:99'}`)
    || a.tytul.localeCompare(b.tytul, 'pl')).slice(0, limit)
}

function pierwszyKonflikt(elementy: readonly ElementOgarniacza[]): [ElementOgarniacza, ElementOgarniacza] | undefined {
  const zaplanowane = elementy
    .filter((element) => element.status === 'otwarty' && element.godzina && (element.czasTrwaniaMinuty ?? 0) > 0)
    .sort((a, b) => minuty(a.godzina!) - minuty(b.godzina!))
  for (let indeks = 1; indeks < zaplanowane.length; indeks += 1) {
    const poprzedni = zaplanowane[indeks - 1]
    const biezacy = zaplanowane[indeks]
    if (minuty(poprzedni.godzina!) + (poprzedni.czasTrwaniaMinuty ?? 0) > minuty(biezacy.godzina!)) return [poprzedni, biezacy]
  }
  return undefined
}

function etykietaListy(elementy: readonly ElementOgarniacza[]): string {
  return elementy.map((element) => element.tytul).join(', ')
}

function tytulyPrzeniesionych(dane: DaneBriefinguDnia): string[] {
  const tytuly = new Map([...dane.elementyDzisiaj, ...dane.elementyJutro].map((element) => [element.id, element.tytul]))
  return [...new Set((dane.historia ?? [])
    .filter((wpis) => wpis.modul === 'zadania' && wpis.znacznikCzasu.slice(0, 10) === dane.data)
    .filter((wpis) => ['dataElementu', 'termin'].some((pole) => wpis.zmienionePola.includes(pole)))
    .filter((wpis) => JSON.stringify(wpis.przed) !== JSON.stringify(wpis.po))
    .map((wpis) => String(wpis.po?.tytul ?? wpis.przed?.tytul ?? tytuly.get(wpis.encjaId) ?? 'Zadanie')))]
}

export function utworzBriefingDnia(dane: DaneBriefinguDnia, rodzaj: RodzajBriefinguDnia, tryb: TrybBriefinguDnia = 'szybki'): WynikBriefinguDnia {
  const otwarte = dane.elementyDzisiaj.filter((element) => element.status === 'otwarty')
  const niewykonane = otwarte.filter((element) => element.typ === 'zadanie')
  if (rodzaj === 'poranny') {
    const punkty: string[] = []
    if (dane.praca) punkty.push(`Pracujesz ${dane.praca.od}–${dane.praca.do}.`)
    const pierwszeWydarzenie = [...otwarte]
      .filter((element) => element.typ !== 'zadanie' && element.godzina)
      .sort((a, b) => a.godzina!.localeCompare(b.godzina!))[0]
    if (pierwszeWydarzenie) punkty.push(`O ${pierwszeWydarzenie.godzina} masz ${pierwszeWydarzenie.tytul}.`)
    const zadania = najwazniejsze(niewykonane, 2)
    if (zadania.length) punkty.push(`Najważniejsze: ${etykietaListy(zadania)}.`)
    const deadline = najwazniejsze(niewykonane.filter((element) => element.terminGraniczny?.slice(0, 10) === dane.data), 1)[0]
    if (deadline) punkty.push(`Termin dzisiaj ma „${deadline.tytul}”${deadline.terminGraniczny?.includes('T') ? ` o ${deadline.terminGraniczny.slice(11, 16)}` : ''}.`)
    const konflikt = pierwszyKonflikt(otwarte)
    if (konflikt) punkty.push(`Konflikt: „${konflikt[0].tytul}” nakłada się na „${konflikt[1].tytul}”. Warto przeplanować jeden z tych elementów.`)
    const przypomnienie = [...(dane.przypomnienia ?? [])].sort((a, b) => a.czas.localeCompare(b.czas))[0]
    if (przypomnienie && punkty.length < 5) punkty.push(`Przypomnienie: ${przypomnienie.tytul} o ${przypomnienie.czas.slice(11, 16)}.`)
    const wybrane = punkty.slice(0, 5)
    const tekst = wybrane.length ? wybrane.join(' ') : 'Dzisiaj nie masz zapisanych ważnych wydarzeń ani zadań.'
    return {
      rodzaj,
      tekst: tryb === 'swobodny' && wybrane.length ? `Dzień wygląda tak: ${tekst}` : tekst,
      skrot: (pierwszeWydarzenie || zadania.some((element) => (element.priorytet ?? 'normalny') !== 'normalny') || deadline || konflikt)
        ? wybrane.slice(0, 2).join(' ')
        : undefined,
      niewykonaneIds: niewykonane.map((element) => element.id),
    }
  }

  const wykonane = najwazniejsze(dane.elementyDzisiaj.filter((element) => element.status === 'wykonany'), 2)
  const pozostale = najwazniejsze(niewykonane, 2)
  const przeniesione = tytulyPrzeniesionych(dane).slice(0, 2)
  const jutro = najwazniejsze(dane.elementyJutro.filter((element) => element.status === 'otwarty'), 2)
  const punkty = [
    wykonane.length ? `Wykonane: ${etykietaListy(wykonane)}.` : 'Brak oznaczonych ważnych zakończeń.',
    pozostale.length ? `Zostało: ${etykietaListy(pozostale)}.` : 'Na dziś nic ważnego nie zostało.',
    ...(przeniesione.length ? [`Przeniesione: ${przeniesione.join(', ')}.`] : []),
    ...(jutro.length ? [`Jutro najważniejsze: ${etykietaListy(jutro)}.`] : []),
    ...(pozostale.length ? [`Przenieść ${pozostale.length === 1 ? 'to zadanie' : `te ${pozostale.length} zadania`} na jutro?`] : []),
  ].slice(0, 5)
  const tekst = punkty.join(' ')
  return {
    rodzaj,
    tekst: tryb === 'swobodny' ? `Podsumowanie dnia: ${tekst}` : tekst,
    niewykonaneIds: pozostale.map((element) => element.id),
  }
}
