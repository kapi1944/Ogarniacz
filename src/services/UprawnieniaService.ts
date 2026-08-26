import type { NazwaModulu, Uprawnienie } from '../domain/typy'

export function czyDozwolone(
  rola: 'wlasciciel' | 'edytor',
  uprawnienia: Uprawnienie[],
  modul: NazwaModulu,
  operacja: 'odczyt' | 'edycja',
  editorId?: string,
  sekcja?: string,
): boolean {
  if (rola === 'wlasciciel') return true
  if (modul === 'ustawienia' || modul === 'echo') return false
  if (!editorId) return false
  return uprawnienia.some((uprawnienie) =>
    uprawnienie.status === 'aktywne'
      && uprawnienie.editorId === editorId
      && uprawnienie.modul === modul
      && (!uprawnienie.sekcja || uprawnienie.sekcja === sekcja)
      && (operacja === 'odczyt' ? uprawnienie.odczyt : uprawnienie.edycja),
  )
}
