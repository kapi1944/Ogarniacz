import { pobierzRepozytorium } from '../../data/Repozytorium'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import { utworzHarmonogramDnia } from '../../modules/pulpit/logikaOsiCzasu'
import type { KandydatPamieciEcho, KontekstCzasuEcho } from './typyEcho'

export type ZrodloKontekstuPlanowaniaEcho = 'grafik' | 'blok_czasu' | 'wizyta' | 'preferencja'

export interface PrzedzialPlanowaniaEcho {
  tytul: string
  od: string
  do: string
  zrodlo: Exclude<ZrodloKontekstuPlanowaniaEcho, 'preferencja' | 'grafik'>
}

export interface KontekstPlanowaniaEcho {
  praca?: { od: string; do: string; zrodlo: 'grafik' }
  zajetePrzedzialy: PrzedzialPlanowaniaEcho[]
  preferowanaGodzinaObiadu?: { godzina: string; zrodlo: 'preferencja' }
}

function czas(data: string, godzina: string): string {
  return `${data}T${godzina}:00`
}

function godzinaZPreferencji(preferencje: readonly KandydatPamieciEcho[]): string | undefined {
  for (const preferencja of preferencje) {
    const dopasowanie = preferencja.tresc
      .toLocaleLowerCase('pl-PL')
      .match(/(?:obiad|lunch).{0,40}?\b([01]?\d|2[0-3])(?::([0-5]\d))?\b/)
    if (dopasowanie) return `${dopasowanie[1].padStart(2, '0')}:${dopasowanie[2] ?? '00'}`
  }
  return undefined
}

export async function pobierzKontekstPlanowaniaEcho(
  kontekstCzasu: KontekstCzasuEcho,
  preferencje: readonly KandydatPamieciEcho[],
): Promise<KontekstPlanowaniaEcho> {
  const data = kontekstCzasu.dataLokalna
  const [ustawienia, wyjatki, bloki, wizyty] = await Promise.all([
    pobierzRepozytorium('ustawienia').lista(),
    pobierzRepozytorium('wyjatkiGrafiku').lista(),
    pobierzRepozytorium('blokiCzasu').lista(),
    pobierzRepozytorium('wizyty').lista(),
  ])
  const ustawienie = ustawienia[0] ?? DOMYSLNE_USTAWIENIA
  const wyjatek = wyjatki.find((element) => element.data === data)
  const harmonogram = utworzHarmonogramDnia(data, ustawienie.harmonogram, wyjatek)
  const praca = harmonogram.pracuje
    ? { od: harmonogram.odPracy, do: harmonogram.doPracy, zrodlo: 'grafik' as const }
    : undefined
  const zajetePrzedzialy: PrzedzialPlanowaniaEcho[] = [
    ...bloki
      .filter((blok) => blok.poczatek.slice(0, 10) === data && blok.status !== 'odrzucony')
      .map((blok) => ({ tytul: blok.tytul, od: blok.poczatek, do: blok.koniec, zrodlo: 'blok_czasu' as const })),
    ...wizyty
      .filter((wizyta) => wizyta.data === data && wizyta.godzina && wizyta.status !== 'anulowana')
      .map((wizyta) => ({
        tytul: wizyta.nazwa,
        od: czas(data, wizyta.godzina!),
        do: czas(data, `${String(Math.min(23, Number(wizyta.godzina!.slice(0, 2)) + 1)).padStart(2, '0')}:${wizyta.godzina!.slice(3)}`),
        zrodlo: 'wizyta' as const,
      })),
  ]
  const godzinaObiadu = godzinaZPreferencji(preferencje)
  return {
    praca,
    zajetePrzedzialy,
    ...(godzinaObiadu ? { preferowanaGodzinaObiadu: { godzina: godzinaObiadu, zrodlo: 'preferencja' as const } } : {}),
  }
}
