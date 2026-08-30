import type { DostepnoscPlanistyczna, DziennikLeku, Id, NazwaModulu, RegulaPowtarzania } from './typy'

export type TypElementuOgarniacza =
  | 'zadanie'
  | 'notatka'
  | 'wizyta'
  | 'lek'
  | 'wydatek'
  | 'platnosc'
  | 'samochod'
  | 'zakupy'
  | 'planer'
  | 'wydarzenie'

export type TrybTerminuElementu = 'o_godzinie' | 'koniec_dnia' | 'bez_godziny'
export type PriorytetElementu = 'normalny' | 'pilny' | 'asap'
export type StatusElementu = 'otwarty' | 'wykonany' | 'anulowany' | 'pominiety'

export interface ReferencjaZrodla {
  modul: NazwaModulu
  encjaId: Id
  wystapienieId?: Id
}

export interface PrzypomnienieElementu {
  id: Id
  czas?: string
  przesuniecieMinuty?: number
  aktywne?: boolean
}

export interface RdzenElementuOgarniacza {
  id: Id
  tytul: string
  opis?: string
  referencjaZrodla?: ReferencjaZrodla
  data?: string
  godzina?: string
  czasTrwaniaMinuty?: number
  terminGraniczny?: string
  trybTerminu?: TrybTerminuElementu
  priorytet?: PriorytetElementu
  status?: StatusElementu
  powtarzanie?: RegulaPowtarzania
  przypomnienia?: PrzypomnienieElementu[]
  dostepnoscPlanistyczna?: DostepnoscPlanistyczna
  kontekstPlanowania?: string
  tagi?: string[]
  pokazNaPulpicie?: boolean
  zasobyIds?: Id[]
  createdAt: string
  updatedAt: string
}

export interface MapaDanychElementu {
  zadanie: { projektId?: Id }
  notatka: { tresc?: string }
  wizyta: { miejsce?: string; lekarzPlacowka?: string; statusWizyty?: string; liczbaElementowChecklisty?: number }
  lek: { lekId?: Id; idWystapienia?: Id; statusDawki?: DziennikLeku['status']; odroczoneDo?: string }
  wydatek: { kwota?: number; waluta?: string; rodzaj?: 'budzet'; okres?: string; limit?: number; wydano?: number }
  platnosc: { kwota?: number; waluta?: string; rodzaj?: 'rachunek' | 'subskrypcja'; oplacona?: boolean }
  samochod: { pojazdId?: Id; rodzajTerminu?: 'oc' | 'przeglad' | 'olej' | 'serwis'; pozostaloKm?: number }
  zakupy: { listaId?: Id; liczbaPozycji?: number; kupione?: number; pozostalo?: number }
  planer: { elastyczny?: boolean }
  wydarzenie: { lokalizacja?: string }
}

export type ElementOgarniacza<Typ extends TypElementuOgarniacza = TypElementuOgarniacza> = {
  [BiezacyTyp in Typ]: RdzenElementuOgarniacza & {
    typ: BiezacyTyp
    dane?: MapaDanychElementu[BiezacyTyp]
  }
}[Typ]

export type ElementZadania = ElementOgarniacza<'zadanie'>

export type DaneNowegoElementu<Typ extends TypElementuOgarniacza> =
  Pick<ElementOgarniacza<Typ>, 'typ' | 'tytul'> &
  Partial<Omit<ElementOgarniacza<Typ>, 'id' | 'typ' | 'tytul' | 'createdAt' | 'updatedAt' | 'referencjaZrodla'>>

export type ZmianyElementu<Typ extends TypElementuOgarniacza> =
  Partial<Omit<ElementOgarniacza<Typ>, 'id' | 'typ' | 'createdAt' | 'updatedAt' | 'referencjaZrodla'>>

export interface ZakresDat {
  od: string
  do: string
}

export interface RepozytoriumElementow<Typ extends TypElementuOgarniacza> {
  lista(zakres?: ZakresDat): Promise<ElementOgarniacza<Typ>[]>
  pobierz(id: Id): Promise<ElementOgarniacza<Typ> | undefined>
  utworz(dane: DaneNowegoElementu<Typ>): Promise<ElementOgarniacza<Typ>>
  aktualizuj(id: Id, zmiany: ZmianyElementu<Typ>): Promise<ElementOgarniacza<Typ>>
  usun(id: Id): Promise<void>
}

export interface DostawcaElementowPulpitu {
  id: string
  pobierzElementy(zakres: ZakresDat): Promise<ElementOgarniacza[]>
}
