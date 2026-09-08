import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import type { AlertPulpitu } from './logikaKafelkow'

export interface SugestiaEchoPulpitu {
  id: string
  tresc: string
  priorytet: number
  zrodlo: 'alert' | 'harmonogram'
}

function minuty(godzina: string): number {
  const [godziny, minuty] = godzina.split(':').map(Number)
  return godziny * 60 + minuty
}

function odlegloscDoGodziny(teraz: Date, godzina: string): number {
  return minuty(godzina) - (teraz.getHours() * 60 + teraz.getMinutes())
}

export function kandydaciSugestiiEchoPulpitu(
  alerty: readonly AlertPulpitu[],
  elementyDnia: readonly ElementOgarniacza[],
  harmonogram: { pracuje: boolean; doPracy: string },
  teraz: Date,
): SugestiaEchoPulpitu[] {
  const sugestie: SugestiaEchoPulpitu[] = alerty.flatMap((alert): SugestiaEchoPulpitu[] => {
    const opis = alert.opis ?? ''
    if (alert.typ === 'asap' && /nakłada/i.test(opis)) return [{
      id: `konflikt:${alert.id}:${alert.termin ?? ''}:${opis}`,
      tresc: `Masz konflikt w planie: „${alert.tytul}” ${opis.toLocaleLowerCase('pl-PL')}. Mogę pomóc go przełożyć.`,
      priorytet: 100,
      zrodlo: 'alert',
    }]
    if (alert.typ === 'overdue') return [{
      id: `zalegle:${alert.id}:${alert.termin ?? ''}:${opis}`,
      tresc: `„${alert.tytul}” wymaga decyzji${opis ? `: ${opis.toLocaleLowerCase('pl-PL')}` : ''}.`,
      priorytet: alert.severity === 'critical' ? 90 : 70,
      zrodlo: 'alert',
    }]
    return []
  })
  const pozostalo = odlegloscDoGodziny(teraz, harmonogram.doPracy)
  const otwarteZadania = elementyDnia.filter((element) => element.typ === 'zadanie' && element.status === 'otwarty')
  if (harmonogram.pracuje && pozostalo > 0 && pozostalo <= 60 && otwarteZadania.length >= 3) sugestie.push({
    id: `koniec-pracy:${harmonogram.doPracy}:${otwarteZadania.map((element) => `${element.id}:${element.updatedAt}`).join(',')}`,
    tresc: `Do końca pracy zostało ${pozostalo} min, a masz jeszcze ${otwarteZadania.length} otwarte zadania. Mogę zaproponować, co przełożyć.`,
    priorytet: 80,
    zrodlo: 'harmonogram',
  })
  return [...new Map(sugestie.map((sugestia) => [sugestia.id, sugestia])).values()]
    .sort((a, b) => b.priorytet - a.priorytet || a.id.localeCompare(b.id, 'pl'))
}

export function widoczneSugestieEchoPulpitu(
  kandydaci: readonly SugestiaEchoPulpitu[],
  odrzucone: readonly string[],
  limit = 3,
): SugestiaEchoPulpitu[] {
  const odrzuconeIds = new Set(odrzucone)
  return kandydaci.filter((sugestia) => !odrzuconeIds.has(sugestia.id)).slice(0, limit)
}
