import { pobierzRepozytorium } from '../../data/Repozytorium'
import { DOMYSLNE_USTAWIENIA } from '../../domain/ustawienia'
import { utworzHarmonogramDnia } from '../../modules/pulpit/logikaOsiCzasu'
import { utworzWydarzeniaPlanera, wyznaczDaneCzasuDniaPlanera } from '../PlanerService'
import type { BlokCzasu, Ustawienia, Wizyta, WyjatekGrafiku } from '../../domain/typy'
import type { KandydatPamieciEcho, KontekstCzasuEcho, KontekstPlanowaniaEcho } from './typyEcho'

function czas(data: string, godzina: string): string {
  return `${data}T${godzina}:00`
}

function czasZaGodzine(data: string, godzina: string): string {
  const [rok, miesiac, dzien] = data.split('-').map(Number)
  const [godziny, minuty] = godzina.split(':').map(Number)
  return new Date(Date.UTC(rok, miesiac - 1, dzien, godziny, minuty + 60)).toISOString().slice(0, 19)
}

function dataJutra(data: string): string {
  const [rok, miesiac, dzien] = data.split('-').map(Number)
  return new Date(Date.UTC(rok, miesiac - 1, dzien + 1)).toISOString().slice(0, 10)
}

function wybierzWyjatek(wyjatki: readonly WyjatekGrafiku[], data: string): WyjatekGrafiku | undefined {
  return [...wyjatki]
    .filter((wyjatek) => wyjatek.data === data)
    .sort((lewy, prawy) => prawy.updatedAt.localeCompare(lewy.updatedAt))[0]
}

function zajetePrzedzialyDnia(data: string, bloki: readonly BlokCzasu[], wizyty: readonly Wizyta[]) {
  return [
    ...bloki
      .filter((blok) => blok.poczatek.slice(0, 10) === data && blok.status !== 'odrzucony')
      .map((blok) => ({ tytul: blok.tytul, od: blok.poczatek, do: blok.koniec, zrodlo: 'blok_czasu' as const })),
    ...wizyty
      .filter((wizyta) => wizyta.data === data && wizyta.godzina && !['odbyta', 'anulowana'].includes(wizyta.status))
      .map((wizyta) => ({
        tytul: wizyta.nazwa,
        od: czas(data, wizyta.godzina!),
        do: czasZaGodzine(data, wizyta.godzina!),
        zrodlo: 'wizyta' as const,
      })),
  ]
}

function zbudujKontekstDnia(
  data: string,
  ustawienie: Ustawienia,
  wyjatki: readonly WyjatekGrafiku[],
  bloki: readonly BlokCzasu[],
  wizyty: readonly Wizyta[],
): NonNullable<KontekstPlanowaniaEcho['dni']>[number] {
  const wyjatek = wybierzWyjatek(wyjatki, data)
  const harmonogram = utworzHarmonogramDnia(data, ustawienie.harmonogram, wyjatek)
  const zajetePrzedzialy = zajetePrzedzialyDnia(data, bloki, wizyty)
  const daneCzasu = wyznaczDaneCzasuDniaPlanera({
    data,
    zadania: [],
    wydarzenia: utworzWydarzeniaPlanera(data, bloki, wizyty),
    harmonogram,
  })
  const zrodlo = wyjatek ? 'wyjatek' as const : 'grafik' as const
  return {
    data,
    pracuje: harmonogram.pracuje,
    jestWyjatkiem: harmonogram.jestWyjatkiem,
    ...(daneCzasu.praca ? { praca: { ...daneCzasu.praca, zrodlo } } : {}),
    ...(daneCzasu.przedPraca ? { przedPraca: daneCzasu.przedPraca } : {}),
    ...(daneCzasu.poPracy ? { poPracy: daneCzasu.poPracy } : {}),
    wolneOkna: daneCzasu.wolneOkna,
    zajetePrzedzialy,
  }
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
  const dni = [data, dataJutra(data)].map((dataDnia) => zbudujKontekstDnia(dataDnia, ustawienie, wyjatki, bloki, wizyty))
  const dzisiaj = dni[0]
  const praca = dzisiaj.praca
    ? {
        od: dzisiaj.praca.od.slice(11, 16),
        do: dzisiaj.praca.do.slice(11, 16),
        polowa: dzisiaj.praca.polowa.slice(11),
        zrodlo: dzisiaj.praca.zrodlo,
      }
    : undefined
  const godzinaObiadu = godzinaZPreferencji(preferencje)
  return {
    praca,
    zajetePrzedzialy: dzisiaj.zajetePrzedzialy,
    dni,
    ...(godzinaObiadu ? { preferowanaGodzinaObiadu: { godzina: godzinaObiadu, zrodlo: 'preferencja' as const } } : {}),
  }
}
