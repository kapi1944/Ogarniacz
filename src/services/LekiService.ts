import { terazIso, utworzMetadane } from '../domain/fabryki'
import type { DziennikLeku, Lek } from '../domain/typy'

export interface DawkaDnia {
  idWystapienia: string
  lek: Lek
  data: string
  planowanaGodzina: string
  status: DziennikLeku['status']
  wpis?: DziennikLeku
}

export function idWystapieniaDawki(lekId: string, data: string, godzina: string): string {
  return `${lekId}:${data}:${godzina}`
}

export function generujDawkiDnia(leki: Lek[], wpisy: DziennikLeku[], data: string): DawkaDnia[] {
  const mapa = new Map(wpisy.filter((wpis) => wpis.data === data).map((wpis) => [idWystapieniaDawki(wpis.lekId, wpis.data, wpis.planowanaGodzina), wpis]))
  return leki
    .filter((lek) => lek.aktywny && !lek.usunietoAt)
    .flatMap((lek) => lek.godziny.map((godzina) => {
      const idWystapienia = idWystapieniaDawki(lek.id, data, godzina)
      const wpis = mapa.get(idWystapienia)
      return { idWystapienia, lek, data, planowanaGodzina: godzina, status: wpis?.status ?? 'oczekuje', wpis }
    }))
    .sort((a, b) => a.planowanaGodzina.localeCompare(b.planowanaGodzina))
}

export function zapiszStatusDawki(dawka: DawkaDnia, status: DziennikLeku['status'], odroczoneDo?: string): DziennikLeku {
  const obecny = dawka.wpis
  return {
    ...(obecny ?? utworzMetadane(dawka.idWystapienia)),
    id: dawka.idWystapienia,
    lekId: dawka.lek.id,
    data: dawka.data,
    planowanaGodzina: dawka.planowanaGodzina,
    status,
    reakcjaAt: terazIso(),
    odroczoneDo: status === 'odroczone' ? odroczoneDo : undefined,
    updatedAt: terazIso(),
  }
}
