import { pobierzRepozytorium, type Repozytorium } from '../data/Repozytorium'
import type { ElementOgarniacza, ZakresDat } from '../domain/elementyOgarniacza'
import type { Pojazd } from '../domain/typy'

type ZrodloListy<Encja extends { id: string; createdAt: string; updatedAt: string }> = Pick<Repozytorium<Encja>, 'lista'>
type RodzajTerminu = NonNullable<NonNullable<ElementOgarniacza<'samochod'>['dane']>['rodzajTerminu']>

export class DostawcaSamochoduPulpitu {
  readonly id = 'samochod'

  constructor(private readonly repozytoriumPojazdow: ZrodloListy<Pojazd> = pobierzRepozytorium('pojazdy')) {}

  async pobierzElementy(zakres: ZakresDat): Promise<ElementOgarniacza<'samochod'>[]> {
    const pojazdy = await this.repozytoriumPojazdow.lista()
    return pojazdy.flatMap((pojazd) => {
      const terminy: { rodzaj: RodzajTerminu; etykieta: string; data?: string; godzina?: string }[] = [
        { rodzaj: 'oc', etykieta: 'OC / polisa', data: pojazd.ocDo },
        { rodzaj: 'przeglad', etykieta: 'Przegląd', data: pojazd.przegladDo },
        { rodzaj: 'olej', etykieta: pojazd.przebieg !== undefined && pojazd.wymianaOlejuPrzebieg !== undefined && pojazd.przebieg >= pojazd.wymianaOlejuPrzebieg ? `Wymiana oleju — osiągnięto ${pojazd.wymianaOlejuPrzebieg.toLocaleString('pl-PL')} km` : 'Wymiana oleju', data: pojazd.przebieg !== undefined && pojazd.wymianaOlejuPrzebieg !== undefined && pojazd.przebieg >= pojazd.wymianaOlejuPrzebieg ? zakres.od : pojazd.wymianaOlejuDo },
        { rodzaj: 'serwis', etykieta: 'Planowany serwis', data: pojazd.planowanySerwisData, godzina: pojazd.planowanySerwisGodzina },
      ]
      return terminy
        .filter((termin): termin is typeof termin & { data: string } => Boolean(termin.data && termin.data >= zakres.od && termin.data <= zakres.do))
        .map((termin) => ({
          id: `samochod:${pojazd.id}:${termin.rodzaj}`,
          typ: 'samochod' as const,
          tytul: `${pojazd.nazwa} — ${termin.etykieta}`,
          opis: pojazd.notatka,
          referencjaZrodla: { modul: 'samochod' as const, encjaId: pojazd.id, wystapienieId: termin.rodzaj },
          data: termin.data,
          godzina: termin.godzina,
          trybTerminu: termin.godzina ? 'o_godzinie' as const : 'bez_godziny' as const,
          status: 'otwarty' as const,
          dane: {
            pojazdId: pojazd.id,
            rodzajTerminu: termin.rodzaj,
            pozostaloKm: termin.rodzaj === 'olej' && pojazd.przebieg !== undefined && pojazd.wymianaOlejuPrzebieg !== undefined
              ? pojazd.wymianaOlejuPrzebieg - pojazd.przebieg
              : undefined,
          },
          createdAt: pojazd.createdAt,
          updatedAt: pojazd.updatedAt,
        }))
    }).sort((a, b) => `${a.data}T${a.godzina ?? '99:99'}`.localeCompare(`${b.data}T${b.godzina ?? '99:99'}`) || a.id.localeCompare(b.id))
  }
}
