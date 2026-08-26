import {
  DOMYSLNY_ZAKRES_SNU,
  type ZakresSnuDnia,
} from './logikaOsiCzasu'

const KLUCZ_USTAWIEN_SNU = 'ogarniacz:pulpit:zakres-snu-v1'

function poprawnaGodzina(godzina: unknown): godzina is string {
  return typeof godzina === 'string'
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(godzina)
}

export function normalizujZakresSnu(wartosc: unknown): ZakresSnuDnia {
  if (!wartosc || typeof wartosc !== 'object') {
    return { ...DOMYSLNY_ZAKRES_SNU }
  }

  const kandydat = wartosc as Partial<ZakresSnuDnia>

  if (
    !poprawnaGodzina(kandydat.od)
    || !poprawnaGodzina(kandydat.do)
    || kandydat.od === kandydat.do
  ) {
    return { ...DOMYSLNY_ZAKRES_SNU }
  }

  return {
    od: kandydat.od,
    do: kandydat.do,
  }
}

export function wczytajZakresSnuOsi(): ZakresSnuDnia {
  if (typeof window === 'undefined') {
    return { ...DOMYSLNY_ZAKRES_SNU }
  }

  try {
    const zapis = window.localStorage.getItem(KLUCZ_USTAWIEN_SNU)

    return zapis
      ? normalizujZakresSnu(JSON.parse(zapis))
      : { ...DOMYSLNY_ZAKRES_SNU }
  } catch {
    return { ...DOMYSLNY_ZAKRES_SNU }
  }
}

export function zapiszZakresSnuOsi(
  zakres: ZakresSnuDnia,
): ZakresSnuDnia {
  const zapis = normalizujZakresSnu(zakres)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KLUCZ_USTAWIEN_SNU, JSON.stringify(zapis))
  }

  return zapis
}

export function przywrocDomyslnyZakresSnuOsi(): ZakresSnuDnia {
  const zakres = { ...DOMYSLNY_ZAKRES_SNU }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KLUCZ_USTAWIEN_SNU, JSON.stringify(zakres))
  }

  return zakres
}
