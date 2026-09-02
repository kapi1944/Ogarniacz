import { z } from 'zod'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import type { DziennikEcho, Przypomnienie, RyzykoDzialania } from '../../domain/typy'
import { czyZadanieZalegle, odroczZadanie, utworzZadanie } from '../ZadaniaService'
import { PolitykaDzialanEcho } from './PolitykaDzialanEcho'
import type { DefinicjaNarzedziaEcho, WynikNarzedziaEcho, WywolanieNarzedziaEcho } from './typyEcho'

export interface NarzedzieEcho<TArgumenty, TWynik> {
  nazwa: string
  opis: string
  schematArgumentow: z.ZodType<TArgumenty>
  ryzyko: RyzykoDzialania
  wykonaj(argumenty: TArgumenty): Promise<TWynik>
}

interface NarzedzieWykonywalneEcho {
  nazwa: string
  opis: string
  schematArgumentow: z.ZodType
  ryzyko: RyzykoDzialania
  wykonaj(argumenty: unknown): Promise<unknown>
}

export class RejestrNarzedziEcho {
  private readonly narzedzia = new Map<string, NarzedzieWykonywalneEcho>()

  zarejestruj<TArgumenty, TWynik>(narzedzie: NarzedzieEcho<TArgumenty, TWynik>): this {
    if (this.narzedzia.has(narzedzie.nazwa)) throw new Error(`Narzędzie Echo „${narzedzie.nazwa}” jest już zarejestrowane.`)
    this.narzedzia.set(narzedzie.nazwa, narzedzie as NarzedzieWykonywalneEcho)
    return this
  }

  pobierz(nazwa: string): NarzedzieWykonywalneEcho | undefined {
    return this.narzedzia.get(nazwa)
  }

  definicje(): DefinicjaNarzedziaEcho[] {
    return [...this.narzedzia.values()].map((narzedzie) => ({
      nazwa: narzedzie.nazwa,
      opis: narzedzie.opis,
      schematArgumentow: z.toJSONSchema(narzedzie.schematArgumentow),
      ryzyko: narzedzie.ryzyko,
    }))
  }
}

type ZapisDziennikaEcho = (opis: string, dzialanie: string, ryzyko: RyzykoDzialania, wynik: DziennikEcho['wynik']) => Promise<void>

async function zapiszDziennikEcho(opis: string, dzialanie: string, ryzyko: RyzykoDzialania, wynik: DziennikEcho['wynik']): Promise<void> {
  await pobierzRepozytorium('dziennikEcho').zapisz({
    ...utworzMetadane(),
    opis,
    dzialanie,
    ryzyko,
    wymagaloPotwierdzenia: ryzyko !== 'niskie',
    wynik,
  })
}

export class WykonawcaNarzedziEcho {
  constructor(
    private readonly rejestr: RejestrNarzedziEcho,
    private readonly polityka = new PolitykaDzialanEcho(),
    private readonly zapiszDziennik: ZapisDziennikaEcho = zapiszDziennikEcho,
  ) {}

  async wykonaj(wywolanie: WywolanieNarzedziaEcho, potwierdzone = false): Promise<WynikNarzedziaEcho> {
    const narzedzie = this.rejestr.pobierz(wywolanie.nazwa)
    if (!narzedzie) return { wywolanieId: wywolanie.id, nazwa: wywolanie.nazwa, status: 'zablokowane', komunikat: 'Narzędzie nie istnieje lub nie jest dostępne.' }

    const walidacja = narzedzie.schematArgumentow.safeParse(wywolanie.argumenty)
    if (!walidacja.success) return { wywolanieId: wywolanie.id, nazwa: wywolanie.nazwa, status: 'zablokowane', komunikat: 'Argumenty narzędzia są niepoprawne.' }

    const decyzja = this.polityka.ocen(narzedzie.ryzyko, potwierdzone)
    if (!decyzja.dozwolone) return { wywolanieId: wywolanie.id, nazwa: wywolanie.nazwa, status: 'wymaga_potwierdzenia', komunikat: narzedzie.opis }

    try {
      const dane = await narzedzie.wykonaj(walidacja.data)
      await this.zapiszDziennik(`Echo wykonało narzędzie ${narzedzie.nazwa}.`, narzedzie.nazwa, narzedzie.ryzyko, 'wykonane')
      return { wywolanieId: wywolanie.id, nazwa: wywolanie.nazwa, status: 'wykonane', dane }
    } catch {
      await this.zapiszDziennik(`Błąd narzędzia Echo ${narzedzie.nazwa}.`, narzedzie.nazwa, narzedzie.ryzyko, 'blad')
      return { wywolanieId: wywolanie.id, nazwa: wywolanie.nazwa, status: 'blad', komunikat: 'Narzędzie nie mogło zakończyć działania.' }
    }
  }
}

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const priorytet = z.enum(['niski', 'normalny', 'wysoki', 'krytyczny'])

function uproscDoWyszukiwania(tekst: string): string[] {
  return tekst.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
    .split(/[^a-z0-9]+/).filter((slowo) => slowo.length > 2)
}

function pasujaOdmiany(lewe: string, prawe: string): boolean {
  if (lewe.includes(prawe) || prawe.includes(lewe)) return true
  const dlugoscRdzenia = Math.min(lewe.length, prawe.length) - 1
  return dlugoscRdzenia >= 4 && lewe.slice(0, dlugoscRdzenia) === prawe.slice(0, dlugoscRdzenia)
}

export function utworzDomyslnyRejestrNarzedziEcho(): RejestrNarzedziEcho {
  const rejestr = new RejestrNarzedziEcho()

  rejestr.zarejestruj({
    nazwa: 'search_tasks',
    opis: 'Wyszukuje zadania po słowach z tytułu i opisu. Nie modyfikuje danych.',
    schematArgumentow: z.object({ fraza: z.string().trim().min(2).max(160) }),
    ryzyko: 'niskie',
    wykonaj: async ({ fraza }) => {
      const szukane = uproscDoWyszukiwania(fraza)
      return (await pobierzRepozytorium('zadania').lista())
        .filter((zadanie) => szukane.every((slowo) => uproscDoWyszukiwania(`${zadanie.tytul} ${zadanie.opis}`).some((wartosc) => pasujaOdmiany(wartosc, slowo))))
        .map(({ id, tytul, status, termin }) => ({ id, tytul, status, termin }))
    },
  })

  rejestr.zarejestruj({
    nazwa: 'list_tasks',
    opis: 'Pobiera zadania pasujące do jawnych filtrów. Nie modyfikuje danych.',
    schematArgumentow: z.object({ status: z.enum(['otwarte', 'w_toku', 'wykonane']).optional(), terminOd: dataIso.optional(), terminDo: dataIso.optional(), zalegle: z.boolean().optional() }),
    ryzyko: 'niskie',
    wykonaj: async (argumenty) => (await pobierzRepozytorium('zadania').lista())
      .filter((zadanie) => !argumenty.status || zadanie.status === argumenty.status)
      .filter((zadanie) => !argumenty.terminOd || Boolean(zadanie.termin && zadanie.termin >= argumenty.terminOd))
      .filter((zadanie) => !argumenty.terminDo || Boolean(zadanie.termin && zadanie.termin <= argumenty.terminDo))
      .filter((zadanie) => !argumenty.zalegle || czyZadanieZalegle(zadanie))
      .map(({ id, tytul, status, priorytet: poziom, termin, szacowanyCzasMin }) => ({ id, tytul, status, priorytet: poziom, termin, szacowanyCzasMin })),
  })

  rejestr.zarejestruj({
    nazwa: 'get_task',
    opis: 'Pobiera jedno zadanie po identyfikatorze. Nie modyfikuje danych.',
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: 'niskie',
    wykonaj: async ({ id }) => {
      const zadanie = await pobierzRepozytorium('zadania').pobierz(id)
      if (!zadanie) return null
      const { tytul, opis, status, priorytet: poziom, termin, szacowanyCzasMin } = zadanie
      return { id, tytul, opis, status, priorytet: poziom, termin, szacowanyCzasMin }
    },
  })

  rejestr.zarejestruj({
    nazwa: 'create_task',
    opis: 'Tworzy zwykłe zadanie na podstawie zweryfikowanych pól.',
    schematArgumentow: z.object({ tytul: z.string().trim().min(1).max(160), opis: z.string().max(5000).optional(), priorytet: priorytet.optional(), termin: dataIso.optional() }),
    ryzyko: 'niskie',
    wykonaj: async (argumenty) => {
      const zadanie = utworzZadanie({ ...argumenty, opis: argumenty.opis ?? '' })
      await pobierzRepozytorium('zadania').zapisz(zadanie)
      return { id: zadanie.id, tytul: zadanie.tytul }
    },
  })

  rejestr.zarejestruj({
    nazwa: 'update_task',
    opis: 'Zmienia wskazane pola istniejącego zadania.',
    schematArgumentow: z.object({ id: z.string().min(1), zmiany: z.object({ tytul: z.string().trim().min(1).max(160).optional(), opis: z.string().max(5000).optional(), status: z.enum(['otwarte', 'w_toku', 'wykonane']).optional(), priorytet: priorytet.optional(), termin: dataIso.nullable().optional() }).refine((zmiany) => Object.keys(zmiany).length > 0) }),
    ryzyko: 'niskie',
    wykonaj: async ({ id, zmiany }) => {
      const repozytorium = pobierzRepozytorium('zadania')
      const zadanie = await repozytorium.pobierz(id)
      if (!zadanie) return null
      const termin = zmiany.termin === null ? undefined : (zmiany.termin ?? zadanie.termin)
      const polaczone = { ...zadanie, ...zmiany, termin }
      const zaktualizowane = typeof zmiany.termin === 'string' ? odroczZadanie(polaczone, zmiany.termin) : polaczone
      await repozytorium.zapisz(zaktualizowane)
      return { id, tytul: zaktualizowane.tytul, status: zaktualizowane.status, termin: zaktualizowane.termin }
    },
  })

  rejestr.zarejestruj({
    nazwa: 'delete_task',
    opis: 'Usuwa jedno wskazane zadanie. Usunięcie można cofnąć w standardowej warstwie danych.',
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: 'niskie',
    wykonaj: async ({ id }) => {
      const repozytorium = pobierzRepozytorium('zadania')
      const zadanie = await repozytorium.pobierz(id)
      if (!zadanie) throw new Error('Nie znaleziono zadania.')
      await repozytorium.usun(id)
      return { id, tytul: zadanie.tytul, usunieto: true }
    },
  })

  rejestr.zarejestruj({
    nazwa: 'delete_tasks_bulk',
    opis: 'Usunięcie wielu zadań z podanego zakresu dat.',
    schematArgumentow: z.object({ terminOd: dataIso, terminDo: dataIso }),
    ryzyko: 'wysokie',
    wykonaj: async ({ terminOd, terminDo }) => {
      const repozytorium = pobierzRepozytorium('zadania')
      const zadania = (await repozytorium.lista()).filter((zadanie) => zadanie.termin && zadanie.termin >= terminOd && zadanie.termin <= terminDo)
      for (const zadanie of zadania) await repozytorium.usun(zadanie.id)
      return { liczba: zadania.length, tytuly: zadania.map(({ tytul }) => tytul) }
    },
  })

  rejestr.zarejestruj({
    nazwa: 'list_reminders',
    opis: 'Pobiera przypomnienia z opcjonalnego zakresu czasu. Nie modyfikuje danych.',
    schematArgumentow: z.object({ od: z.string().datetime().optional(), do: z.string().datetime().optional() }),
    ryzyko: 'niskie',
    wykonaj: async ({ od, do: doKiedy }) => (await pobierzRepozytorium('przypomnienia').lista())
      .filter((przypomnienie) => !od || Boolean(przypomnienie.czas && przypomnienie.czas >= od))
      .filter((przypomnienie) => !doKiedy || Boolean(przypomnienie.czas && przypomnienie.czas <= doKiedy))
      .map(({ id, tytul, czas, priorytet: poziom, stan }) => ({ id, tytul, czas, priorytet: poziom, stan })),
  })

  rejestr.zarejestruj({
    nazwa: 'create_reminder',
    opis: 'Tworzy przypomnienie na konkretny czas wybrany przez model po ustaleniu go z użytkownikiem.',
    schematArgumentow: z.object({ tytul: z.string().trim().min(1).max(160), czas: z.string().datetime(), priorytet: priorytet.optional() }),
    ryzyko: 'niskie',
    wykonaj: async ({ tytul, czas, priorytet: poziom }) => {
      const przypomnienie: Przypomnienie = { ...utworzMetadane(), tytul, typ: 'absolutne', czas, priorytet: poziom ?? 'normalny', stan: 'nowe', eskalacja: false }
      await pobierzRepozytorium('przypomnienia').zapisz(przypomnienie)
      return { id: przypomnienie.id, tytul, czas }
    },
  })

  rejestr.zarejestruj({
    nazwa: 'reschedule_reminder',
    opis: 'Przenosi jedno wskazane przypomnienie na nowy termin.',
    schematArgumentow: z.object({ id: z.string().min(1), czas: z.string().datetime() }),
    ryzyko: 'niskie',
    wykonaj: async ({ id, czas }) => {
      const repozytorium = pobierzRepozytorium('przypomnienia')
      const przypomnienie = await repozytorium.pobierz(id)
      if (!przypomnienie) throw new Error('Nie znaleziono przypomnienia.')
      const zaktualizowane: Przypomnienie = { ...przypomnienie, czas, odroczoneDo: undefined, stan: 'nowe' }
      await repozytorium.zapisz(zaktualizowane)
      return { id, tytul: zaktualizowane.tytul, czas }
    },
  })

  return rejestr
}
