import { z } from 'zod'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { utworzMetadane } from '../../domain/fabryki'
import type { DziennikEcho, Przypomnienie, Recepta, RyzykoDzialania, Skierowanie, Terapia, Wizyta, WpisTerapii } from '../../domain/typy'
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
const godzina = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

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
    schematArgumentow: z.object({ tytul: z.string().trim().min(1).max(160), opis: z.string().max(5000).optional(), priorytet: priorytet.optional(), termin: dataIso.optional(), godzina: godzina.optional() }),
    ryzyko: 'niskie',
    wykonaj: async (argumenty) => {
      const zadanie = { ...utworzZadanie({ ...argumenty, opis: argumenty.opis ?? '' }), ...(argumenty.godzina ? { dataElementu: argumenty.termin, godzinaElementu: argumenty.godzina, trybTerminuElementu: 'o_godzinie' as const } : {}) }
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
    nazwa: 'complete_task',
    opis: 'Oznacza jedno wskazane zadanie jako wykonane.',
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: 'niskie',
    wykonaj: async ({ id }) => {
      const repozytorium = pobierzRepozytorium('zadania')
      const zadanie = await repozytorium.pobierz(id)
      if (!zadanie) throw new Error('Nie znaleziono zadania.')
      const wykonane = { ...zadanie, status: 'wykonane' as const }
      await repozytorium.zapisz(wykonane)
      return { id, tytul: wykonane.tytul, status: wykonane.status, termin: wykonane.termin }
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

  rejestr.zarejestruj({
    nazwa: 'list_health', opis: 'Pobiera zapisane wizyty, skierowania, recepty, leki i terapie. Nie interpretuje medycznie danych.',
    schematArgumentow: z.object({ rodzaj: z.enum(['wizyty', 'skierowania', 'recepty', 'leki', 'terapie']).optional(), status: z.string().optional(), od: dataIso.optional(), do: dataIso.optional() }), ryzyko: 'niskie',
    wykonaj: async ({ rodzaj, status, od, do: doKiedy }) => {
      const filtrujDate = <T extends object>(lista: T[], pole: keyof T) => lista.filter((element) => { const wartosc = element[pole]; return !od || (typeof wartosc === 'string' && wartosc >= od) }).filter((element) => { const wartosc = element[pole]; return !doKiedy || (typeof wartosc === 'string' && wartosc <= doKiedy) })
      if (rodzaj === 'wizyty') return filtrujDate(await pobierzRepozytorium('wizyty').lista(), 'data').filter((x) => !status || x.status === status).map(({ id, nazwa, data, godzina: oGodzinie, status: stan }) => ({ id, tytul: nazwa, data, godzina: oGodzinie, status: stan, typ: 'wizyta' }))
      if (rodzaj === 'skierowania') return filtrujDate(await pobierzRepozytorium('skierowania').lista(), 'terminWaznosci').filter((x) => !status || x.status === status).map(({ id, nazwa, cel, terminWaznosci, status: stan }) => ({ id, tytul: nazwa, cel, terminWaznosci, status: stan, typ: 'skierowanie' }))
      if (rodzaj === 'recepty') return filtrujDate(await pobierzRepozytorium('recepty').lista(), 'terminRealizacji').filter((x) => !status || x.status === status).map(({ id, kod, status: stan, terminRealizacji, pozycje }) => ({ id, tytul: kod ? `Recepta ${kod}` : 'Recepta', status: stan, terminRealizacji, pozycje, typ: 'recepta' }))
      if (rodzaj === 'leki') return (await pobierzRepozytorium('leki').lista()).filter((x) => !status || String(x.aktywny) === status).map(({ id, nazwa, dawkaInstrukcja, godziny, aktywny }) => ({ id, tytul: nazwa, dawkaInstrukcja, godziny, aktywny, typ: 'lek' }))
      return (await pobierzRepozytorium('terapie').lista()).filter((x) => !status || x.status === status).map(({ id, nazwa, status: stan, rodzaj }) => ({ id, tytul: nazwa, status: stan, rodzaj, typ: 'terapia' }))
    },
  })

  rejestr.zarejestruj({ nazwa: 'create_appointment', opis: 'Dodaje wizytę do istniejącego rejestru wizyt; termin jest jednym wydarzeniem organizacyjnym.', schematArgumentow: z.object({ nazwa: z.string().trim().min(1).max(160), data: dataIso.optional(), godzina: godzina.optional(), miejsce: z.string().max(300).optional(), notatka: z.string().max(5000).optional() }), ryzyko: 'niskie', wykonaj: async (dane) => { const wizyta: Wizyta = { ...utworzMetadane(), nazwa: dane.nazwa, status: dane.data ? 'umowiona' : 'do_umowienia', data: dane.data, godzina: dane.godzina, miejsce: dane.miejsce, notatka: dane.notatka ?? '', pytania: [], dokumentyIds: [], checklista: [] }; await pobierzRepozytorium('wizyty').zapisz(wizyta); return { id: wizyta.id, tytul: wizyta.nazwa, data: wizyta.data, godzina: wizyta.godzina, typ: 'wizyta' } } })
  rejestr.zarejestruj({ nazwa: 'update_appointment', opis: 'Zmienia termin lub status istniejącej wizyty.', schematArgumentow: z.object({ id: z.string().min(1), zmiany: z.object({ data: dataIso.nullable().optional(), godzina: godzina.nullable().optional(), status: z.enum(['do_umowienia', 'umowiona', 'odbyta', 'anulowana']).optional(), nazwa: z.string().trim().min(1).max(160).optional() }).refine((x) => Object.keys(x).length > 0) }), ryzyko: 'niskie', wykonaj: async ({ id, zmiany }) => { const repo = pobierzRepozytorium('wizyty'); const obecna = await repo.pobierz(id); if (!obecna) return null; const wizyta = { ...obecna, ...zmiany, data: zmiany.data === null ? undefined : zmiany.data ?? obecna.data, godzina: zmiany.godzina === null ? undefined : zmiany.godzina ?? obecna.godzina }; await repo.zapisz(wizyta); return { id, tytul: wizyta.nazwa, data: wizyta.data, godzina: wizyta.godzina, typ: 'wizyta' } } })
  rejestr.zarejestruj({ nazwa: 'create_referral', opis: 'Dodaje skierowanie do rejestru zdrowia.', schematArgumentow: z.object({ nazwa: z.string().trim().min(1).max(160), cel: z.string().trim().min(1).max(500), typCelu: z.enum(['specjalista', 'badanie', 'zabieg', 'rehabilitacja', 'inne']).optional(), dataWystawienia: dataIso, terminWaznosci: dataIso.optional() }), ryzyko: 'niskie', wykonaj: async (dane) => { const skierowanie: Skierowanie = { ...utworzMetadane(), ...dane, typCelu: dane.typCelu ?? 'badanie', status: 'do_umowienia' }; await pobierzRepozytorium('skierowania').zapisz(skierowanie); return { id: skierowanie.id, tytul: skierowanie.nazwa, typ: 'skierowanie' } } })
  rejestr.zarejestruj({ nazwa: 'update_referral', opis: 'Zmienia status lub wiąże skierowanie z istniejącą wizytą.', schematArgumentow: z.object({ id: z.string().min(1), status: z.enum(['nowe', 'do_umowienia', 'umowiono', 'zrealizowano', 'anulowano', 'wygaslo']).optional(), wizytaId: z.string().min(1).nullable().optional() }).refine((x) => x.status !== undefined || x.wizytaId !== undefined), ryzyko: 'niskie', wykonaj: async ({ id, ...zmiany }) => { const repo = pobierzRepozytorium('skierowania'); const obecne = await repo.pobierz(id); if (!obecne) return null; const skierowanie = { ...obecne, ...zmiany, wizytaId: zmiany.wizytaId === null ? undefined : zmiany.wizytaId ?? obecne.wizytaId }; await repo.zapisz(skierowanie); return { id, tytul: skierowanie.nazwa, status: skierowanie.status, typ: 'skierowanie' } } })
  rejestr.zarejestruj({ nazwa: 'create_prescription', opis: 'Dodaje receptę z pozycjami do rejestru zdrowia.', schematArgumentow: z.object({ kod: z.string().trim().min(1).max(100).optional(), dataWystawienia: dataIso, terminRealizacji: dataIso.optional(), pozycje: z.array(z.object({ nazwaLeku: z.string().trim().min(1).max(160), ilosc: z.number().int().positive(), dawkowanie: z.string().max(500).optional() })) }), ryzyko: 'niskie', wykonaj: async (dane) => { const recepta: Recepta = { ...utworzMetadane(), kod: dane.kod, dataWystawienia: dane.dataWystawienia, terminRealizacji: dane.terminRealizacji, status: 'do_realizacji', pozycje: dane.pozycje.map((pozycja, indeks) => ({ id: `${Date.now()}-${indeks}`, ...pozycja, iloscZrealizowana: 0 })) }; await pobierzRepozytorium('recepty').zapisz(recepta); return { id: recepta.id, tytul: recepta.kod ? `Recepta ${recepta.kod}` : 'Recepta', pozycje: recepta.pozycje, typ: 'recepta' } } })
  rejestr.zarejestruj({ nazwa: 'add_prescription_item', opis: 'Dodaje pozycję do istniejącej recepty.', schematArgumentow: z.object({ receptaId: z.string().min(1), nazwaLeku: z.string().trim().min(1).max(160), ilosc: z.number().int().positive().optional() }), ryzyko: 'niskie', wykonaj: async ({ receptaId, nazwaLeku, ilosc = 1 }) => { const repo = pobierzRepozytorium('recepty'); const recepta = await repo.pobierz(receptaId); if (!recepta) return null; const pozycja = { id: `${Date.now()}-${recepta.pozycje.length}`, nazwaLeku, ilosc, iloscZrealizowana: 0 }; await repo.zapisz({ ...recepta, pozycje: [...recepta.pozycje, pozycja] }); return { id: recepta.id, tytul: recepta.kod ? `Recepta ${recepta.kod}` : 'Recepta', pozycje: [...recepta.pozycje, pozycja], typ: 'recepta' } } })
  rejestr.zarejestruj({ nazwa: 'realize_prescription_item', opis: 'Oznacza liczbę zrealizowanych sztuk pozycji recepty albo całą receptę.', schematArgumentow: z.object({ receptaId: z.string().min(1), pozycjaId: z.string().min(1).optional(), iloscZrealizowana: z.number().int().nonnegative().optional() }), ryzyko: 'niskie', wykonaj: async ({ receptaId, pozycjaId, iloscZrealizowana }) => { const repo = pobierzRepozytorium('recepty'); const recepta = await repo.pobierz(receptaId); if (!recepta) return null; const pozycje = recepta.pozycje.map((x) => !pozycjaId || x.id === pozycjaId ? { ...x, iloscZrealizowana: Math.min(x.ilosc, iloscZrealizowana ?? x.ilosc) } : x); const status = pozycje.length === 0 || pozycje.every((x) => x.iloscZrealizowana >= x.ilosc) ? 'zrealizowana' : pozycje.some((x) => x.iloscZrealizowana > 0) ? 'czesciowo_zrealizowana' : 'do_realizacji'; await repo.zapisz({ ...recepta, pozycje, status }); return { id: recepta.id, tytul: recepta.kod ? `Recepta ${recepta.kod}` : 'Recepta', pozycje, status, typ: 'recepta' } } })
  rejestr.zarejestruj({ nazwa: 'create_therapy_entry', opis: 'Dodaje organizacyjną notatkę do istniejącej terapii.', schematArgumentow: z.object({ terapiaId: z.string().min(1), tresc: z.string().trim().min(1).max(5000), dataCzas: z.string().datetime() }), ryzyko: 'niskie', wykonaj: async (dane) => { const wpis: WpisTerapii = { ...utworzMetadane(), ...dane }; await pobierzRepozytorium('wpisyTerapii').zapisz(wpis); return { id: wpis.id, tytul: wpis.tresc.slice(0, 80), terapiaId: wpis.terapiaId, typ: 'wpis_terapii' } } })
  rejestr.zarejestruj({ nazwa: 'create_therapy', opis: 'Dodaje terapię do rejestru zdrowia.', schematArgumentow: z.object({ nazwa: z.string().trim().min(1).max(160), rodzaj: z.enum(['psychoterapia', 'rehabilitacja', 'leczenie', 'inne']).optional(), dataRozpoczecia: dataIso.optional() }), ryzyko: 'niskie', wykonaj: async (dane) => { const terapia: Terapia = { ...utworzMetadane(), ...dane, status: 'aktywna' }; await pobierzRepozytorium('terapie').zapisz(terapia); return { id: terapia.id, tytul: terapia.nazwa, typ: 'terapia' } } })
  rejestr.zarejestruj({ nazwa: 'list_therapy_entries', opis: 'Pobiera ostatnie wpisy wskazanej terapii.', schematArgumentow: z.object({ terapiaId: z.string().min(1), limit: z.number().int().min(1).max(20).optional() }), ryzyko: 'niskie', wykonaj: async ({ terapiaId, limit = 5 }) => (await pobierzRepozytorium('wpisyTerapii').lista()).filter((x) => x.terapiaId === terapiaId).sort((a, b) => b.dataCzas.localeCompare(a.dataCzas)).slice(0, limit).map(({ id, tresc, dataCzas }) => ({ id, tytul: tresc, dataCzas, typ: 'wpis_terapii' })) })

  return rejestr
}
