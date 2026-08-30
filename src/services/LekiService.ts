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

export function czasDawkiDoUwagi(data: string, godzina: string, status: DziennikLeku['status'], odroczoneDo?: string): number {
  return status === 'odroczone' && odroczoneDo
    ? new Date(odroczoneDo).getTime()
    : new Date(`${data}T${godzina}:00`).getTime()
}
export function wyznaczNastepnaDawke(dawki: readonly DawkaDnia[], teraz = new Date()): DawkaDnia | undefined {
  const czasTeraz = teraz.getTime()
  const czasDawki = (dawka: DawkaDnia) => dawka.status === 'odroczone' && dawka.wpis?.odroczoneDo
    ? new Date(dawka.wpis.odroczoneDo).getTime()
    : new Date(`${dawka.data}T${dawka.planowanaGodzina}:00`).getTime()

  return [...dawki]
    .filter((dawka) => dawka.status === 'oczekuje' || dawka.status === 'odroczone')
    .filter((dawka) => Number.isFinite(czasDawki(dawka)) && czasDawki(dawka) >= czasTeraz)
    .sort((a, b) => czasDawki(a) - czasDawki(b) || a.idWystapienia.localeCompare(b.idWystapienia))[0]
}
