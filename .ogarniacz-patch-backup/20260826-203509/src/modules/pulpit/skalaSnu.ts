export const DOMYSLNY_POCZATEK_SNU = "22:30";
export const DOMYSLNY_KONIEC_SNU = "06:30";
export const KOMPRESJA_SNU = 0.5;

export interface UstawieniaSnuOsi {
  poczatek: string;
  koniec: string;
}

export const DOMYSLNE_USTAWIENIA_SNU_OSI: UstawieniaSnuOsi = {
  poczatek: DOMYSLNY_POCZATEK_SNU,
  koniec: DOMYSLNY_KONIEC_SNU,
};

const MINUTY_DOBY = 24 * 60;
const OSTATNIA_MINUTA_DOBY = MINUTY_DOBY - 1;
const KLUCZ_USTAWIEN_SNU = "ogarniacz:pulpit:sen-v1";

function ogranicz(minuty: number): number {
  if (!Number.isFinite(minuty)) return 0;
  return Math.max(0, Math.min(OSTATNIA_MINUTA_DOBY, minuty));
}

export function czasNaMinuty(wartosc: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(wartosc ?? "").trim());
  if (!match) return null;
  const godzina = Number(match[1]);
  const minuta = Number(match[2]);
  if (!Number.isInteger(godzina) || !Number.isInteger(minuta) || godzina < 0 || godzina > 23 || minuta < 0 || minuta > 59) {
    return null;
  }
  return godzina * 60 + minuta;
}

export function normalizujUstawieniaSnuOsi(input: unknown): UstawieniaSnuOsi {
  if (!input || typeof input !== "object") return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  const kandydat = input as Partial<UstawieniaSnuOsi>;
  const poczatek = typeof kandydat.poczatek === "string" && czasNaMinuty(kandydat.poczatek) !== null
    ? kandydat.poczatek
    : DOMYSLNY_POCZATEK_SNU;
  const koniec = typeof kandydat.koniec === "string" && czasNaMinuty(kandydat.koniec) !== null
    ? kandydat.koniec
    : DOMYSLNY_KONIEC_SNU;

  // Zakres o zerowej długości nie ma sensu. Wracamy wtedy do bezpiecznego 22:30–06:30.
  if (poczatek === koniec) return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  return { poczatek, koniec };
}

export function pobierzUstawieniaSnuOsi(): UstawieniaSnuOsi {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  }
  try {
    const surowe = window.localStorage.getItem(KLUCZ_USTAWIEN_SNU);
    return surowe ? normalizujUstawieniaSnuOsi(JSON.parse(surowe)) : { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  } catch {
    return { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
  }
}

export function zapiszUstawieniaSnuOsi(input: UstawieniaSnuOsi): UstawieniaSnuOsi {
  const ustawienia = normalizujUstawieniaSnuOsi(input);
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(KLUCZ_USTAWIEN_SNU, JSON.stringify(ustawienia));
  }
  return ustawienia;
}

function czyMinutaWSnie(minuta: number, poczatek: number, koniec: number): boolean {
  if (poczatek < koniec) return minuta >= poczatek && minuta < koniec;
  // Typowy sen przez północ, np. 22:30–06:30.
  return minuta >= poczatek || minuta < koniec;
}

function wagaZakresu(doMinuty: number, poczatek: number, koniec: number): number {
  const granica = Math.max(0, Math.min(MINUTY_DOBY, doMinuty));
  let wynik = 0;

  // 1440 iteracji jest wykonywane tylko dla obliczeń pozycji UI i pozostaje pomijalnie małym kosztem.
  // Użycie minutowej całki daje poprawną obsługę zakresów przechodzących przez północ.
  for (let minuta = 0; minuta < granica; minuta += 1) {
    wynik += czyMinutaWSnie(minuta, poczatek, koniec) ? KOMPRESJA_SNU : 1;
  }
  return wynik;
}

function minutyZWejscia(wartosc: unknown): number {
  if (typeof wartosc === "number") return ogranicz(wartosc);
  if (typeof wartosc === "string") return ogranicz(czasNaMinuty(wartosc) ?? 0);
  if (wartosc && typeof wartosc === "object") {
    const obj = wartosc as { minuty?: unknown; minuta?: unknown; godzina?: unknown; czas?: unknown };
    if (typeof obj.minuty === "number") return ogranicz(obj.minuty);
    if (typeof obj.minuta === "number") return ogranicz(obj.minuta);
    if (typeof obj.godzina === "string") return ogranicz(czasNaMinuty(obj.godzina) ?? 0);
    if (typeof obj.czas === "string") return ogranicz(czasNaMinuty(obj.czas) ?? 0);
  }
  return 0;
}

/**
 * Mapuje pełną dobę 00:00–23:59 na 0–100%.
 * TYLKO zaplanowany sen ma wagę 0.5; każda pozostała minuta ma wagę 1.0.
 * Parametry legacy są świadomie ignorowane, aby można było bezpiecznie podmienić
 * wcześniejszy mapper zależny od „aktywnej części dnia”.
 */
export function pozycjaNaOsiZeSnem(wartosc: unknown, ..._legacy: unknown[]): number {
  const ustawienia = pobierzUstawieniaSnuOsi();
  const poczatek = czasNaMinuty(ustawienia.poczatek) ?? czasNaMinuty(DOMYSLNY_POCZATEK_SNU)!;
  const koniec = czasNaMinuty(ustawienia.koniec) ?? czasNaMinuty(DOMYSLNY_KONIEC_SNU)!;
  const minuty = minutyZWejscia(wartosc);

  if (minuty <= 0) return 0;
  if (minuty >= OSTATNIA_MINUTA_DOBY) return 100;

  const calkowitaWaga = wagaZakresu(MINUTY_DOBY, poczatek, koniec);
  const wagaDoPunktu = wagaZakresu(minuty, poczatek, koniec);
  return (wagaDoPunktu / calkowitaWaga) * 100;
}

export function szerokoscPrzedzialuNaOsiZeSnem(od: unknown, do_: unknown, ..._legacy: unknown[]): number {
  return Math.max(0, pozycjaNaOsiZeSnem(do_) - pozycjaNaOsiZeSnem(od));
}

export function zakresSnuNaOsi(): Array<{ od: number; do: number }> {
  const ustawienia = pobierzUstawieniaSnuOsi();
  const poczatek = czasNaMinuty(ustawienia.poczatek) ?? 22 * 60 + 30;
  const koniec = czasNaMinuty(ustawienia.koniec) ?? 6 * 60 + 30;

  if (poczatek < koniec) {
    return [{ od: pozycjaNaOsiZeSnem(poczatek), do: pozycjaNaOsiZeSnem(koniec) }];
  }
  return [
    { od: 0, do: pozycjaNaOsiZeSnem(koniec) },
    { od: pozycjaNaOsiZeSnem(poczatek), do: 100 },
  ];
}
