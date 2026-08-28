import type { TypSzybkiegoDodawania, UstawieniaSzybkiegoDodawania } from './typy'

export interface KontekstParseraSzybkiegoDodawania {
  referenceDate: Date
}

export interface SugestiaSzybkiegoDodawania {
  originalText: string
  cleanedTitle: string
  suggestedType: TypSzybkiegoDodawania
  suggestedDate?: string
  suggestedTime?: string
  confidence: 'wysoka' | 'srednia' | 'niska'
  alternatives: TypSzybkiegoDodawania[]
  matches: string[]
}

export interface ParserSzybkiegoDodawania {
  parse(input: string, context: KontekstParseraSzybkiegoDodawania): SugestiaSzybkiegoDodawania
}

const typy: TypSzybkiegoDodawania[] = ['zadanie', 'notatka', 'wizyta', 'lek', 'wydatek', 'samochod']
const dni: Record<string, number> = { poniedzialek: 1, poniedzialku: 1, wtorek: 2, wtorku: 2, sroda: 3, srode: 3, srody: 3, czwartek: 4, czwartku: 4, piatek: 5, piatku: 5, sobota: 6, sobote: 6, soboty: 6, niedziela: 0, niedziele: 0, niedzieli: 0 }
const miesiace: Record<string, number> = { stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7, sierpnia: 8, wrzesnia: 9, pazdziernika: 10, listopada: 11, grudnia: 12 }

function bezPolskichZnakow(tekst: string): string {
  return tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function dataIso(rok: number, miesiac: number, dzien: number): string | undefined {
  const data = new Date(rok, miesiac - 1, dzien)
  return data.getFullYear() === rok && data.getMonth() === miesiac - 1 && data.getDate() === dzien ? `${rok}-${String(miesiac).padStart(2, '0')}-${String(dzien).padStart(2, '0')}` : undefined
}

function przesunDate(referenceDate: Date, roznica: number): string {
  const data = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + roznica)
  return dataIso(data.getFullYear(), data.getMonth() + 1, data.getDate())!
}

function najblizszyRok(referenceDate: Date, miesiac: number, dzien: number): string | undefined {
  const dzis = dataIso(referenceDate.getFullYear(), referenceDate.getMonth() + 1, referenceDate.getDate())!
  const wTymRoku = dataIso(referenceDate.getFullYear(), miesiac, dzien)
  if (!wTymRoku) return undefined
  return wTymRoku >= dzis ? wTymRoku : dataIso(referenceDate.getFullYear() + 1, miesiac, dzien)
}

function rozpoznajDate(tekst: string, referenceDate: Date): { data?: string; fragment?: string } {
  const normalny = bezPolskichZnakow(tekst)
  const wzgledna = normalny.match(/\b(dzis|dzisiaj|jutro|pojutrze)\b/)
  if (wzgledna) return { data: przesunDate(referenceDate, wzgledna[1] === 'jutro' ? 1 : wzgledna[1] === 'pojutrze' ? 2 : 0), fragment: wzgledna[0] }
  const numeryczna = normalny.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?\.?\b/)
  if (numeryczna) {
    const rok = numeryczna[3] ? (numeryczna[3].length === 2 ? 2000 + Number(numeryczna[3]) : Number(numeryczna[3])) : undefined
    return { data: rok ? dataIso(rok, Number(numeryczna[2]), Number(numeryczna[1])) : najblizszyRok(referenceDate, Number(numeryczna[2]), Number(numeryczna[1])), fragment: numeryczna[0] }
  }
  const slowna = normalny.match(/\b(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrzesnia|pazdziernika|listopada|grudnia)(?:\s+(\d{2}|\d{4}))?\b/)
  if (slowna) {
    const rok = slowna[3] ? (slowna[3].length === 2 ? 2000 + Number(slowna[3]) : Number(slowna[3])) : undefined
    return { data: rok ? dataIso(rok, miesiace[slowna[2]], Number(slowna[1])) : najblizszyRok(referenceDate, miesiace[slowna[2]], Number(slowna[1])), fragment: slowna[0] }
  }
  const dzien = normalny.match(new RegExp(`\\b(?:w\\s+)?(${Object.keys(dni).join('|')})\\b`))
  if (!dzien) return {}
  const roznica = (dni[dzien[1]] - referenceDate.getDay() + 7) % 7 || 7
  return { data: przesunDate(referenceDate, roznica), fragment: dzien[0] }
}

function rozpoznajGodzine(tekst: string): { godzina?: string; fragment?: string } {
  const dopasowanie = tekst.match(/\b(?:o\s+|godz\.?\s*|godzina\s+)([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\b|\b([01]?\d|2[0-3]):([0-5]\d)\b/i)
  if (!dopasowanie) return {}
  const godzina = Number(dopasowanie[1] ?? dopasowanie[3])
  const minuta = Number(dopasowanie[2] ?? dopasowanie[4] ?? 0)
  return { godzina: `${String(godzina).padStart(2, '0')}:${String(minuta).padStart(2, '0')}`, fragment: dopasowanie[0] }
}

function rankingTypow(tekst: string): { typ: TypSzybkiegoDodawania; confidence: SugestiaSzybkiegoDodawania['confidence']; alternatives: TypSzybkiegoDodawania[] } {
  const normalny = bezPolskichZnakow(tekst)
  const punkty: Record<TypSzybkiegoDodawania, number> = { zadanie: 0, notatka: 0, wizyta: 0, lek: 0, wydatek: 0, samochod: 0 }
  const dodaj = (typ: TypSzybkiegoDodawania, wzorzec: RegExp, wartosc = 2) => { if (wzorzec.test(normalny)) punkty[typ] += wartosc }
  dodaj('wizyta', /\b(dentysta|lekarz|fryzjer|wizyta|stomatolog|okulista|badanie|konsultacja)\b/)
  dodaj('lek', /\b(lek|tabletka|tabletki|zazyj|dawka)\b/); dodaj('lek', /\bwez\b(?=.*\b(lek|tabletka|tabletki|dawka)\b)/)
  dodaj('wydatek', /\b(zaplac|oplac|rachunek|faktura|internet|czynsz|rata|subskrypcja)\b/)
  dodaj('samochod', /\b(auto|auta|samochod|olej|oc|opony|serwis|mechanik\w*)\b/)
  dodaj('notatka', /\b(zanotuj|notatka|zapisz sobie|pamietaj ze)\b/)
  const uporzadkowane = [...typy].sort((a, b) => punkty[b] - punkty[a] || typy.indexOf(a) - typy.indexOf(b))
  const najlepszy = uporzadkowane[0]
  const confidence = punkty[najlepszy] >= 2 && (punkty[najlepszy] > punkty[uporzadkowane[1]] || ['wizyta', 'lek', 'wydatek', 'notatka'].includes(najlepszy)) ? 'wysoka' : punkty[najlepszy] ? 'srednia' : 'niska'
  return { typ: najlepszy, confidence, alternatives: uporzadkowane.slice(1, 3) }
}

function oczyscTytul(tekst: string, fragmenty: string[]): string {
  const wynik = fragmenty.reduce((wartosc, fragment) => wartosc.replace(fragment, ' '), tekst).replace(/\s+/g, ' ').trim()
  return wynik ? wynik.charAt(0).toLocaleUpperCase('pl-PL') + wynik.slice(1) : tekst.trim()
}

export const parserRegulowySzybkiegoDodawania: ParserSzybkiegoDodawania = {
  parse(input, context) {
    const data = rozpoznajDate(input, context.referenceDate)
    const godzina = rozpoznajGodzine(input)
    const typ = rankingTypow(input)
    const matches = [data.fragment, godzina.fragment].filter((fragment): fragment is string => Boolean(fragment))
    return { originalText: input, cleanedTitle: oczyscTytul(input, matches), suggestedType: typ.typ, suggestedDate: data.data, suggestedTime: godzina.godzina, confidence: typ.confidence, alternatives: typ.alternatives, matches }
  },
}

export function uporzadkujTypySzybkiegoDodawania(ustawienia: UstawieniaSzybkiegoDodawania): TypSzybkiegoDodawania[] {
  const kolejnosc = [...ustawienia.kolejnoscTypow, ...typy.filter((typ) => !ustawienia.kolejnoscTypow.includes(typ))]
  return ustawienia.uczKolejnosci ? [...kolejnosc].sort((a, b) => ustawienia.licznikiUzyc[b] - ustawienia.licznikiUzyc[a] || kolejnosc.indexOf(a) - kolejnosc.indexOf(b)) : kolejnosc
}

