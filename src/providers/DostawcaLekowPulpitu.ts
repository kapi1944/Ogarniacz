import { eachDayOfInterval, format, parseISO } from 'date-fns'
import { pobierzRepozytorium, type Repozytorium } from '../data/Repozytorium'
import type { DostawcaElementowPulpitu, ElementOgarniacza, ZakresDat } from '../domain/elementyOgarniacza'
import type { DziennikLeku, Lek, Przypomnienie } from '../domain/typy'
import { generujDawkiDnia, przewidywanaDataWyczerpania } from '../services/LekiService'
import { czasUruchomienia } from '../services/PrzypomnieniaService'

type ZrodloListy<Encja extends { id: string; createdAt: string; updatedAt: string }> = Pick<Repozytorium<Encja>, 'lista'>

function statusElementu(status: DziennikLeku['status']): ElementOgarniacza<'lek'>['status'] {
  if (status === 'zazyte') return 'wykonany'
  if (status === 'pominiete') return 'pominiety'
  return 'otwarty'
}

function przypomnieniaDawki(przypomnienia: readonly Przypomnienie[], lekId: string, data: string, godzina: string) {
  const poczatekTerminu = `${data}T${godzina}`
  return przypomnienia
    .filter((przypomnienie) => przypomnienie.zrodlo?.typ === 'leki' && przypomnienie.zrodlo.id === lekId)
    .filter((przypomnienie) => przypomnienie.czas?.startsWith(poczatekTerminu))
    .map((przypomnienie) => ({
      id: przypomnienie.id,
      czas: czasUruchomienia(przypomnienie)?.toISOString(),
      aktywne: ['nowe', 'dostarczone', 'odroczone', 'eskalowane'].includes(przypomnienie.stan),
    }))
}

export class DostawcaLekowPulpitu implements DostawcaElementowPulpitu {
  readonly id = 'leki'

  constructor(
    private readonly repozytoriumLekow: ZrodloListy<Lek> = pobierzRepozytorium('leki'),
    private readonly repozytoriumDziennika: ZrodloListy<DziennikLeku> = pobierzRepozytorium('dziennikLekow'),
    private readonly repozytoriumPrzypomnien: ZrodloListy<Przypomnienie> = pobierzRepozytorium('przypomnienia'),
  ) {}

  async pobierzElementy(zakres: ZakresDat): Promise<ElementOgarniacza<'lek'>[]> {
    const [leki, wpisy, przypomnienia] = await Promise.all([
      this.repozytoriumLekow.lista(),
      this.repozytoriumDziennika.lista(),
      this.repozytoriumPrzypomnien.lista(),
    ])
    const dni = eachDayOfInterval({ start: parseISO(zakres.od), end: parseISO(zakres.do) })

    const dawki = dni.flatMap((dzien) => generujDawkiDnia(leki, wpisy, format(dzien, 'yyyy-MM-dd')).map((dawka) => ({
      id: `lek:${dawka.idWystapienia}`,
      typ: 'lek' as const,
      tytul: dawka.lek.nazwa,
      opis: dawka.lek.dawkaInstrukcja,
      referencjaZrodla: {
        modul: 'leki' as const,
        encjaId: dawka.lek.id,
        wystapienieId: dawka.idWystapienia,
      },
      data: dawka.data,
      godzina: dawka.planowanaGodzina,
      trybTerminu: 'o_godzinie' as const,
      status: statusElementu(dawka.status),
      przypomnienia: przypomnieniaDawki(przypomnienia, dawka.lek.id, dawka.data, dawka.planowanaGodzina),
      dane: {
        lekId: dawka.lek.id,
        idWystapienia: dawka.idWystapienia,
        statusDawki: dawka.status,
        odroczoneDo: dawka.wpis?.odroczoneDo,
        rodzaj: 'dawka' as const,
      },
      createdAt: dawka.lek.createdAt,
      updatedAt: dawka.wpis?.updatedAt ?? dawka.lek.updatedAt,
    })))
    const granicaZapasu = format(new Date(parseISO(zakres.od).getTime() + 7 * 24 * 60 * 60_000), 'yyyy-MM-dd')
    const zapasy: ElementOgarniacza<'lek'>[] = leki.flatMap((lek) => {
      const dataWyczerpania = lek.aktywny ? przewidywanaDataWyczerpania(lek, zakres.od) : undefined
      if (!dataWyczerpania || dataWyczerpania > granicaZapasu) return []
      return [{
        id: `lek-zapas:${lek.id}`,
        typ: 'lek',
        tytul: `Kończy się: ${lek.nazwa}`,
        opis: `Zapas ${lek.zapasJednostek} jednostek wystarczy do ${dataWyczerpania}.`,
        referencjaZrodla: { modul: 'leki', encjaId: lek.id },
        data: dataWyczerpania,
        trybTerminu: 'bez_godziny',
        priorytet: dataWyczerpania <= zakres.od ? 'asap' : 'pilny',
        status: 'otwarty',
        dane: { lekId: lek.id, rodzaj: 'zapas', zapasJednostek: lek.zapasJednostek },
        createdAt: lek.createdAt,
        updatedAt: lek.updatedAt,
      }]
    })
    return [...dawki, ...zapasy]
  }
}
