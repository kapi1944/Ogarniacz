import { endOfMonth, format, parseISO } from 'date-fns'
import { pobierzRepozytorium, type Repozytorium } from '../data/Repozytorium'
import type { ElementOgarniacza, ZakresDat } from '../domain/elementyOgarniacza'
import type { Budzet, Rachunek, Wydatek } from '../domain/typy'
import { obliczWykorzystanieBudzetow } from '../services/FinanseService'

type ZrodloListy<Encja extends { id: string; createdAt: string; updatedAt: string }> = Pick<Repozytorium<Encja>, 'lista'>

function czesciTerminu(termin: string) {
  const [data, czas] = termin.split('T')
  const godzina = czas?.slice(0, 5)
  return { data, godzina: /^\d{2}:\d{2}$/.test(godzina ?? '') ? godzina : undefined }
}

function okresyZakresu(zakres: ZakresDat): string[] {
  const okresy = new Set<string>()
  let biezacy = parseISO(`${zakres.od.slice(0, 7)}-01`)
  const koniec = parseISO(`${zakres.do.slice(0, 7)}-01`)
  while (biezacy <= koniec) {
    okresy.add(format(biezacy, 'yyyy-MM'))
    biezacy = new Date(biezacy.getFullYear(), biezacy.getMonth() + 1, 1)
  }
  return [...okresy]
}

export class DostawcaFinansowPulpitu {
  readonly id = 'finanse'

  constructor(
    private readonly repozytoriumRachunkow: ZrodloListy<Rachunek> = pobierzRepozytorium('rachunki'),
    private readonly repozytoriumWydatkow: ZrodloListy<Wydatek> = pobierzRepozytorium('wydatki'),
    private readonly repozytoriumBudzetow: ZrodloListy<Budzet> = pobierzRepozytorium('budzety'),
  ) {}

  async pobierzElementy(zakres: ZakresDat): Promise<ElementOgarniacza<'platnosc' | 'wydatek'>[]> {
    const [rachunki, wydatki, budzety] = await Promise.all([
      this.repozytoriumRachunkow.lista(),
      this.repozytoriumWydatkow.lista(),
      this.repozytoriumBudzetow.lista(),
    ])
    const platnosci: ElementOgarniacza<'platnosc'>[] = rachunki
      .filter((rachunek) => rachunek.status === 'niezaplacony')
      .filter((rachunek) => {
        const { data } = czesciTerminu(rachunek.termin)
        return data >= zakres.od && data <= zakres.do
      })
      .map((rachunek) => {
        const { data, godzina } = czesciTerminu(rachunek.termin)
        return {
          id: `platnosc:${rachunek.id}`,
          typ: 'platnosc',
          tytul: rachunek.nazwa,
          opis: rachunek.powtarzanie ? 'Płatność cykliczna' : 'Płatność jednorazowa',
          referencjaZrodla: { modul: 'rachunki', encjaId: rachunek.id },
          data,
          godzina,
          terminGraniczny: rachunek.termin,
          trybTerminu: godzina ? 'o_godzinie' : 'bez_godziny',
          status: 'otwarty',
          dane: { kwota: rachunek.kwota, waluta: 'PLN', rodzaj: rachunek.powtarzanie ? 'subskrypcja' : 'rachunek', oplacona: false },
          createdAt: rachunek.createdAt,
          updatedAt: rachunek.updatedAt,
        }
      })
    const wykorzystanie: ElementOgarniacza<'wydatek'>[] = okresyZakresu(zakres)
      .flatMap((okres) => obliczWykorzystanieBudzetow(budzety, wydatki, okres))
      .filter(({ budzet, wydano }) => wydano >= budzet.limit * 0.8)
      .map(({ budzet, wydano }) => ({
        id: `budzet:${budzet.id}:${budzet.okres}`,
        typ: 'wydatek',
        tytul: budzet.nazwa,
        opis: `Wydano ${wydano.toFixed(2)} zł z limitu ${budzet.limit.toFixed(2)} zł (${Math.round(wydano / budzet.limit * 100)}%).`,
        referencjaZrodla: { modul: 'finanse', encjaId: budzet.id },
        data: format(endOfMonth(parseISO(`${budzet.okres}-01`)), 'yyyy-MM-dd'),
        trybTerminu: 'bez_godziny',
        priorytet: wydano > budzet.limit ? 'asap' : wydano >= budzet.limit * 0.9 ? 'pilny' : 'normalny',
        status: 'otwarty',
        dane: { rodzaj: 'budzet', okres: budzet.okres, limit: budzet.limit, wydano, waluta: 'PLN' },
        createdAt: budzet.createdAt,
        updatedAt: budzet.updatedAt,
      }))
    return [...platnosci, ...wykorzystanie]
      .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '') || a.tytul.localeCompare(b.tytul, 'pl') || a.id.localeCompare(b.id))
  }
}
