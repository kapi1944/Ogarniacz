import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'

export interface ElementTeraz {
  element: ElementOgarniacza
  stan: 'trwa' | 'najblizszy'
}

export function czyElementOtwarty(element: ElementOgarniacza): boolean {
  return element.status === undefined || element.status === 'otwarty'
}

export function etykietaStatusuElementu(element: ElementOgarniacza): string {
  if (element.typ === 'lek') {
    if (element.dane?.statusDawki === 'zazyte') return 'Przyjęto'
    if (element.dane?.statusDawki === 'pominiete') return 'Pominięto'
    if (element.dane?.statusDawki === 'odroczone') return 'Odroczono'
  }
  return element.status === 'wykonany' ? 'Wykonano' : element.status === 'anulowany' ? 'Anulowano'
    : element.status === 'pominiety' ? 'Pominięto' : 'Do zrobienia'
}

export function stanCzasuElementu(element: ElementOgarniacza, data: string, teraz: Date): 'teraz' | 'przeszly' | 'pozniej' {
  if (!czyElementOtwarty(element) || !element.data || !element.godzina) return 'pozniej'
  const poczatek = minutyElementu(element)
  if (poczatek === null || element.data > data) return 'pozniej'
  if (element.data < data) return 'przeszly'
  const minutyTeraz = teraz.getHours() * 60 + teraz.getMinutes()
  if (poczatek <= minutyTeraz && minutyTeraz < poczatek + (element.czasTrwaniaMinuty ?? 0)) return 'teraz'
  return poczatek < minutyTeraz ? 'przeszly' : 'pozniej'
}

function minutyGodziny(godzina: string): number | null {
  const dopasowanie = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(godzina)
  if (!dopasowanie) return null
  const [godziny, minuty] = godzina.split(':').map(Number)
  return godziny * 60 + minuty
}

function priorytet(element: ElementOgarniacza): number {
  return element.priorytet === 'asap' ? 2 : element.priorytet === 'pilny' ? 1 : 0
}

function minutyElementu(element: ElementOgarniacza): number | null {
  return element.godzina ? minutyGodziny(element.godzina) : null
}

export function wybierzElementTeraz(
  elementy: readonly ElementOgarniacza[],
  dzisiaj: string,
  teraz: Date,
): ElementTeraz | null {
  const minutyTeraz = teraz.getHours() * 60 + teraz.getMinutes()
  const aktywne = elementy
    .filter((element) => element.data === dzisiaj && czyElementOtwarty(element))
    .filter((element) => {
      const poczatek = minutyElementu(element)
      return poczatek !== null && (element.czasTrwaniaMinuty ?? 0) > 0
        && poczatek <= minutyTeraz && minutyTeraz < poczatek + element.czasTrwaniaMinuty!
    })
    .sort((a, b) => priorytet(b) - priorytet(a) || (minutyElementu(a)! - minutyElementu(b)!) || a.tytul.localeCompare(b.tytul, 'pl'))

  if (aktywne[0]) return { element: aktywne[0], stan: 'trwa' }

  const najblizsze = elementy
    .filter((element) => element.data === dzisiaj && czyElementOtwarty(element))
    .filter((element) => (minutyElementu(element) ?? -1) >= minutyTeraz)
    .sort((a, b) => (minutyElementu(a)! - minutyElementu(b)!) || priorytet(b) - priorytet(a) || a.tytul.localeCompare(b.tytul, 'pl'))

  if (najblizsze[0]) return { element: najblizsze[0], stan: 'najblizszy' }

  const bezGodziny = elementy
    .filter((element) => element.data === dzisiaj && czyElementOtwarty(element) && !element.godzina)
    .sort((a, b) => priorytet(b) - priorytet(a) || a.tytul.localeCompare(b.tytul, 'pl'))

  return bezGodziny[0] ? { element: bezGodziny[0], stan: 'najblizszy' } : null
}

export function sortujElementyDzisiaj(elementy: readonly ElementOgarniacza[], dzisiaj: string): ElementOgarniacza[] {
  return elementy
    .filter((element) => element.data === dzisiaj && czyElementOtwarty(element))
    .sort((a, b) => priorytet(b) - priorytet(a)
      || (minutyElementu(a) ?? Number.POSITIVE_INFINITY) - (minutyElementu(b) ?? Number.POSITIVE_INFINITY)
      || a.tytul.localeCompare(b.tytul, 'pl'))
}
