// OGARNIACZ_URLOPY_SWIETA_PL_2026_08_NODE_V2
import type { Urlop } from '../domain/typy'

export const ETYKIETY_TYPOW_URLOPU: Record<Urlop['typ'], string> = {
  wypoczynkowy: 'Urlop wypoczynkowy',
  na_zadanie: 'Urlop na żądanie',
  bezplatny: 'Urlop bezpłatny',
  okolicznosciowy: 'Urlop okolicznościowy',
  opieka: 'Opieka / zwolnienie opiekuńcze',
  chorobowe: 'Chorobowe / L4',
  inny: 'Inny dzień wolny',
}

export const ETYKIETY_STATUSOW_URLOPU: Record<Urlop['status'], string> = {
  planowany: 'Planowany',
  potwierdzony: 'Potwierdzony',
  anulowany: 'Anulowany',
}

export function czyDataWUrlopie(urlop: Urlop, data: string): boolean {
  return urlop.status !== 'anulowany' && urlop.dataOd <= data && data <= urlop.dataDo
}

export function urlopyDnia(urlopy: Urlop[], data: string): Urlop[] {
  return urlopy.filter((urlop) => czyDataWUrlopie(urlop, data))
}

export function czyZakresySieNakladaja(
  a: Pick<Urlop, 'dataOd' | 'dataDo'>,
  b: Pick<Urlop, 'dataOd' | 'dataDo'>,
): boolean {
  return a.dataOd <= b.dataDo && b.dataOd <= a.dataDo
}
