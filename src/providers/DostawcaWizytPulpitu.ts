import { pobierzRepozytorium, type Repozytorium } from '../data/Repozytorium'
import type { DostawcaElementowPulpitu, ElementOgarniacza, ZakresDat } from '../domain/elementyOgarniacza'
import type { Przypomnienie, Wizyta } from '../domain/typy'
import { czasUruchomienia } from '../services/PrzypomnieniaService'

type ZrodloListy<Encja extends { id: string; createdAt: string; updatedAt: string }> = Pick<Repozytorium<Encja>, 'lista'>

function statusElementu(status: Wizyta['status']): ElementOgarniacza<'wizyta'>['status'] {
  if (status === 'odbyta') return 'wykonany'
  if (status === 'anulowana') return 'anulowany'
  return 'otwarty'
}

function przypomnieniaWizyty(przypomnienia: readonly Przypomnienie[], wizytaId: string) {
  return przypomnienia
    .filter((przypomnienie) => przypomnienie.zrodlo?.typ === 'wizyty' && przypomnienie.zrodlo.id === wizytaId)
    .map((przypomnienie) => ({
      id: przypomnienie.id,
      czas: czasUruchomienia(przypomnienie)?.toISOString(),
      aktywne: ['nowe', 'dostarczone', 'odroczone', 'eskalowane'].includes(przypomnienie.stan),
    }))
}

export class DostawcaWizytPulpitu implements DostawcaElementowPulpitu {
  readonly id = 'wizyty'

  constructor(
    private readonly repozytoriumWizyt: ZrodloListy<Wizyta> = pobierzRepozytorium('wizyty'),
    private readonly repozytoriumPrzypomnien: ZrodloListy<Przypomnienie> = pobierzRepozytorium('przypomnienia'),
  ) {}

  async pobierzElementy(zakres: ZakresDat): Promise<ElementOgarniacza<'wizyta'>[]> {
    const [wizyty, przypomnienia] = await Promise.all([
      this.repozytoriumWizyt.lista(),
      this.repozytoriumPrzypomnien.lista(),
    ])

    return wizyty
      .filter((wizyta) => wizyta.data && wizyta.data >= zakres.od && wizyta.data <= zakres.do)
      .map((wizyta) => ({
        id: `wizyta:${wizyta.id}`,
        typ: 'wizyta' as const,
        tytul: wizyta.nazwa,
        opis: wizyta.notatka || undefined,
        referencjaZrodla: { modul: 'wizyty' as const, encjaId: wizyta.id },
        data: wizyta.data,
        godzina: wizyta.godzina,
        trybTerminu: wizyta.godzina ? 'o_godzinie' as const : 'bez_godziny' as const,
        status: statusElementu(wizyta.status),
        przypomnienia: przypomnieniaWizyty(przypomnienia, wizyta.id),
        dane: {
          miejsce: wizyta.miejsce,
          lekarzPlacowka: wizyta.lekarzPlacowka,
          statusWizyty: wizyta.status,
          liczbaElementowChecklisty: wizyta.checklista.length,
        },
        createdAt: wizyta.createdAt,
        updatedAt: wizyta.updatedAt,
      }))
      .sort((a, b) => `${a.data}T${a.godzina ?? '99:99'}`.localeCompare(`${b.data}T${b.godzina ?? '99:99'}`)
        || a.tytul.localeCompare(b.tytul, 'pl') || a.id.localeCompare(b.id))
  }
}
