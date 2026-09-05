import { z } from "zod";
import { pobierzRepozytorium } from "../../data/Repozytorium";
import { utworzMetadane } from "../../domain/fabryki";
import type {
  DziennikEcho,
  DziennikNawyku,
  Projekt,
  Przypomnienie,
  Recepta,
  RyzykoDzialania,
  Skierowanie,
  Terapia,
  Wizyta,
  WpisTerapii,
} from "../../domain/typy";
import {
  czyZadanieZablokowane,
  czyZadanieZalegle,
  odroczZadanie,
  utworzZadanie,
} from "../ZadaniaService";
import {
  obliczWykorzystanieBudzetow,
  podsumujCashFlow,
  przygotujWydatekZeZrodla,
} from "../FinanseService";
import {
  generujDawkiDnia,
  przewidywanaDataWyczerpania,
  zapiszStatusDawki,
} from "../LekiService";
import { statystykaNawyku } from "../NawykiService";
import { statystykaPaliwa } from "../MotoryzacjaService";
import { pobierzSprawyWedlugMiejsca } from "../MiejscaService";
import {
  DOMYSLNE_PREFERENCJE_PLANOWANIA,
  generujPlan,
  zatwierdzPlan,
} from "../PlanerService";
import { DOMYSLNE_USTAWIENIA } from "../../domain/ustawienia";
import { utworzHarmonogramDnia } from "../../modules/pulpit/logikaOsiCzasu";
import { repozytoriumElementowZadan } from "../../data/RepozytoriumElementowZadan";
import { zaproponujPodzialPoczekalni } from "../PoczekalniaService";
import { PolitykaDzialanEcho } from "./PolitykaDzialanEcho";
import type {
  DefinicjaNarzedziaEcho,
  WynikNarzedziaEcho,
  WywolanieNarzedziaEcho,
} from "./typyEcho";

export interface NarzedzieEcho<TArgumenty, TWynik> {
  nazwa: string;
  opis: string;
  schematArgumentow: z.ZodType<TArgumenty>;
  ryzyko: RyzykoDzialania;
  wykonaj(argumenty: TArgumenty): Promise<TWynik>;
}

interface NarzedzieWykonywalneEcho {
  nazwa: string;
  opis: string;
  schematArgumentow: z.ZodType;
  ryzyko: RyzykoDzialania;
  wykonaj(argumenty: unknown): Promise<unknown>;
}

export class RejestrNarzedziEcho {
  private readonly narzedzia = new Map<string, NarzedzieWykonywalneEcho>();

  zarejestruj<TArgumenty, TWynik>(
    narzedzie: NarzedzieEcho<TArgumenty, TWynik>,
  ): this {
    if (this.narzedzia.has(narzedzie.nazwa))
      throw new Error(
        `Narzędzie Echo „${narzedzie.nazwa}” jest już zarejestrowane.`,
      );
    this.narzedzia.set(narzedzie.nazwa, narzedzie as NarzedzieWykonywalneEcho);
    return this;
  }

  pobierz(nazwa: string): NarzedzieWykonywalneEcho | undefined {
    return this.narzedzia.get(nazwa);
  }

  definicje(): DefinicjaNarzedziaEcho[] {
    return [...this.narzedzia.values()].map((narzedzie) => ({
      nazwa: narzedzie.nazwa,
      opis: narzedzie.opis,
      schematArgumentow: z.toJSONSchema(narzedzie.schematArgumentow),
      ryzyko: narzedzie.ryzyko,
    }));
  }
}

type ZapisDziennikaEcho = (
  opis: string,
  dzialanie: string,
  ryzyko: RyzykoDzialania,
  wynik: DziennikEcho["wynik"],
) => Promise<void>;

async function zapiszDziennikEcho(
  opis: string,
  dzialanie: string,
  ryzyko: RyzykoDzialania,
  wynik: DziennikEcho["wynik"],
): Promise<void> {
  await pobierzRepozytorium("dziennikEcho").zapisz({
    ...utworzMetadane(),
    opis,
    dzialanie,
    ryzyko,
    wymagaloPotwierdzenia: ryzyko !== "niskie",
    wynik,
  });
}

export class WykonawcaNarzedziEcho {
  constructor(
    private readonly rejestr: RejestrNarzedziEcho,
    private readonly polityka = new PolitykaDzialanEcho(),
    private readonly zapiszDziennik: ZapisDziennikaEcho = zapiszDziennikEcho,
    private readonly czyDozwolone: (nazwa: string) => boolean = () => true,
  ) {}

  async wykonaj(
    wywolanie: WywolanieNarzedziaEcho,
    potwierdzone = false,
  ): Promise<WynikNarzedziaEcho> {
    const narzedzie = this.rejestr.pobierz(wywolanie.nazwa);
    if (!narzedzie)
      return {
        wywolanieId: wywolanie.id,
        nazwa: wywolanie.nazwa,
        status: "zablokowane",
        komunikat: "Narzędzie nie istnieje lub nie jest dostępne.",
      };
    if (!this.czyDozwolone(narzedzie.nazwa))
      return {
        wywolanieId: wywolanie.id,
        nazwa: wywolanie.nazwa,
        status: "zablokowane",
        komunikat: "Echo nie ma uprawnienia do tego modułu.",
      };

    const walidacja = narzedzie.schematArgumentow.safeParse(
      wywolanie.argumenty,
    );
    if (!walidacja.success)
      return {
        wywolanieId: wywolanie.id,
        nazwa: wywolanie.nazwa,
        status: "zablokowane",
        komunikat: "Argumenty narzędzia są niepoprawne.",
      };

    const decyzja = this.polityka.ocen(narzedzie.ryzyko, potwierdzone);
    if (!decyzja.dozwolone)
      return {
        wywolanieId: wywolanie.id,
        nazwa: wywolanie.nazwa,
        status: "wymaga_potwierdzenia",
        komunikat: narzedzie.opis,
      };

    try {
      const dane = await narzedzie.wykonaj(walidacja.data);
      await this.zapiszDziennik(
        `Echo wykonało narzędzie ${narzedzie.nazwa}.`,
        narzedzie.nazwa,
        narzedzie.ryzyko,
        "wykonane",
      );
      return {
        wywolanieId: wywolanie.id,
        nazwa: wywolanie.nazwa,
        status: "wykonane",
        dane,
      };
    } catch {
      await this.zapiszDziennik(
        `Błąd narzędzia Echo ${narzedzie.nazwa}.`,
        narzedzie.nazwa,
        narzedzie.ryzyko,
        "blad",
      );
      return {
        wywolanieId: wywolanie.id,
        nazwa: wywolanie.nazwa,
        status: "blad",
        komunikat: "Narzędzie nie mogło zakończyć działania.",
      };
    }
  }
}

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const priorytet = z.enum(["niski", "normalny", "wysoki", "krytyczny"]);
const godzina = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

function uproscDoWyszukiwania(tekst: string): string[] {
  return tekst
    .toLocaleLowerCase("pl-PL")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .split(/[^a-z0-9]+/)
    .filter((slowo) => slowo.length > 2);
}

function pasujaOdmiany(lewe: string, prawe: string): boolean {
  if (lewe.includes(prawe) || prawe.includes(lewe)) return true;
  const dlugoscRdzenia = Math.min(lewe.length, prawe.length) - 1;
  return (
    dlugoscRdzenia >= 4 &&
    lewe.slice(0, dlugoscRdzenia) === prawe.slice(0, dlugoscRdzenia)
  );
}

export function utworzDomyslnyRejestrNarzedziEcho(): RejestrNarzedziEcho {
  const rejestr = new RejestrNarzedziEcho();

  rejestr.zarejestruj({
    nazwa: "search_tasks",
    opis: "Wyszukuje zadania po słowach z tytułu i opisu. Nie modyfikuje danych.",
    schematArgumentow: z.object({ fraza: z.string().trim().min(2).max(160) }),
    ryzyko: "niskie",
    wykonaj: async ({ fraza }) => {
      const szukane = uproscDoWyszukiwania(fraza);
      return (await pobierzRepozytorium("zadania").lista())
        .filter((zadanie) =>
          szukane.every((slowo) =>
            uproscDoWyszukiwania(`${zadanie.tytul} ${zadanie.opis}`).some(
              (wartosc) => pasujaOdmiany(wartosc, slowo),
            ),
          ),
        )
        .map(({ id, tytul, status, termin }) => ({
          id,
          tytul,
          status,
          termin,
        }));
    },
  });

  rejestr.zarejestruj({
    nazwa: "list_tasks",
    opis: "Pobiera zadania pasujące do jawnych filtrów. Nie modyfikuje danych.",
    schematArgumentow: z.object({
      status: z.enum(["otwarte", "w_toku", "wykonane"]).optional(),
      terminOd: dataIso.optional(),
      terminDo: dataIso.optional(),
      zalegle: z.boolean().optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async (argumenty) =>
      (await pobierzRepozytorium("zadania").lista())
        .filter(
          (zadanie) => !argumenty.status || zadanie.status === argumenty.status,
        )
        .filter(
          (zadanie) =>
            !argumenty.terminOd ||
            Boolean(zadanie.termin && zadanie.termin >= argumenty.terminOd),
        )
        .filter(
          (zadanie) =>
            !argumenty.terminDo ||
            Boolean(zadanie.termin && zadanie.termin <= argumenty.terminDo),
        )
        .filter((zadanie) => !argumenty.zalegle || czyZadanieZalegle(zadanie))
        .map(
          ({
            id,
            tytul,
            status,
            priorytet: poziom,
            termin,
            szacowanyCzasMin,
          }) => ({
            id,
            tytul,
            status,
            priorytet: poziom,
            termin,
            szacowanyCzasMin,
          }),
        ),
  });

  rejestr.zarejestruj({
    nazwa: "get_task",
    opis: "Pobiera jedno zadanie po identyfikatorze. Nie modyfikuje danych.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ id }) => {
      const zadanie = await pobierzRepozytorium("zadania").pobierz(id);
      if (!zadanie) return null;
      const {
        tytul,
        opis,
        status,
        priorytet: poziom,
        termin,
        szacowanyCzasMin,
      } = zadanie;
      return {
        id,
        tytul,
        opis,
        status,
        priorytet: poziom,
        termin,
        szacowanyCzasMin,
      };
    },
  });

  rejestr.zarejestruj({
    nazwa: "create_task",
    opis: "Tworzy zwykłe zadanie na podstawie zweryfikowanych pól.",
    schematArgumentow: z.object({
      tytul: z.string().trim().min(1).max(160),
      opis: z.string().max(5000).optional(),
      priorytet: priorytet.optional(),
      termin: dataIso.optional(),
      godzina: godzina.optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async (argumenty) => {
      const zadanie = {
        ...utworzZadanie({ ...argumenty, opis: argumenty.opis ?? "" }),
        ...(argumenty.godzina
          ? {
              dataElementu: argumenty.termin,
              godzinaElementu: argumenty.godzina,
              trybTerminuElementu: "o_godzinie" as const,
            }
          : {}),
      };
      await pobierzRepozytorium("zadania").zapisz(zadanie);
      return { id: zadanie.id, tytul: zadanie.tytul };
    },
  });

  rejestr.zarejestruj({
    nazwa: "update_task",
    opis: "Zmienia wskazane pola istniejącego zadania.",
    schematArgumentow: z.object({
      id: z.string().min(1),
      zmiany: z
        .object({
          tytul: z.string().trim().min(1).max(160).optional(),
          opis: z.string().max(5000).optional(),
          status: z.enum(["otwarte", "w_toku", "wykonane"]).optional(),
          priorytet: priorytet.optional(),
          termin: dataIso.nullable().optional(),
        })
        .refine((zmiany) => Object.keys(zmiany).length > 0),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ id, zmiany }) => {
      const repozytorium = pobierzRepozytorium("zadania");
      const zadanie = await repozytorium.pobierz(id);
      if (!zadanie) return null;
      const termin =
        zmiany.termin === null ? undefined : (zmiany.termin ?? zadanie.termin);
      const polaczone = { ...zadanie, ...zmiany, termin };
      const zaktualizowane =
        typeof zmiany.termin === "string"
          ? odroczZadanie(polaczone, zmiany.termin)
          : polaczone;
      await repozytorium.zapisz(zaktualizowane);
      return {
        id,
        tytul: zaktualizowane.tytul,
        status: zaktualizowane.status,
        termin: zaktualizowane.termin,
      };
    },
  });

  rejestr.zarejestruj({
    nazwa: "complete_task",
    opis: "Oznacza jedno wskazane zadanie jako wykonane.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ id }) => {
      const repozytorium = pobierzRepozytorium("zadania");
      const zadanie = await repozytorium.pobierz(id);
      if (!zadanie) throw new Error("Nie znaleziono zadania.");
      const wykonane = { ...zadanie, status: "wykonane" as const };
      await repozytorium.zapisz(wykonane);
      return {
        id,
        tytul: wykonane.tytul,
        status: wykonane.status,
        termin: wykonane.termin,
      };
    },
  });

  rejestr.zarejestruj({
    nazwa: "delete_task",
    opis: "Usuwa jedno wskazane zadanie. Usunięcie można cofnąć w standardowej warstwie danych.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ id }) => {
      const repozytorium = pobierzRepozytorium("zadania");
      const zadanie = await repozytorium.pobierz(id);
      if (!zadanie) throw new Error("Nie znaleziono zadania.");
      await repozytorium.usun(id);
      return { id, tytul: zadanie.tytul, usunieto: true };
    },
  });

  rejestr.zarejestruj({
    nazwa: "delete_tasks_bulk",
    opis: "Usunięcie wielu zadań z podanego zakresu dat.",
    schematArgumentow: z.object({ terminOd: dataIso, terminDo: dataIso }),
    ryzyko: "wysokie",
    wykonaj: async ({ terminOd, terminDo }) => {
      const repozytorium = pobierzRepozytorium("zadania");
      const zadania = (await repozytorium.lista()).filter(
        (zadanie) =>
          zadanie.termin &&
          zadanie.termin >= terminOd &&
          zadanie.termin <= terminDo,
      );
      for (const zadanie of zadania) await repozytorium.usun(zadanie.id);
      return {
        liczba: zadania.length,
        tytuly: zadania.map(({ tytul }) => tytul),
      };
    },
  });

  rejestr.zarejestruj({
    nazwa: "list_reminders",
    opis: "Pobiera przypomnienia z opcjonalnego zakresu czasu. Nie modyfikuje danych.",
    schematArgumentow: z.object({
      od: z.string().datetime().optional(),
      do: z.string().datetime().optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ od, do: doKiedy }) =>
      (await pobierzRepozytorium("przypomnienia").lista())
        .filter(
          (przypomnienie) =>
            !od || Boolean(przypomnienie.czas && przypomnienie.czas >= od),
        )
        .filter(
          (przypomnienie) =>
            !doKiedy ||
            Boolean(przypomnienie.czas && przypomnienie.czas <= doKiedy),
        )
        .map(({ id, tytul, czas, priorytet: poziom, stan }) => ({
          id,
          tytul,
          czas,
          priorytet: poziom,
          stan,
        })),
  });

  rejestr.zarejestruj({
    nazwa: "create_reminder",
    opis: "Tworzy przypomnienie na konkretny czas wybrany przez model po ustaleniu go z użytkownikiem.",
    schematArgumentow: z.object({
      tytul: z.string().trim().min(1).max(160),
      czas: z.string().datetime(),
      priorytet: priorytet.optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ tytul, czas, priorytet: poziom }) => {
      const przypomnienie: Przypomnienie = {
        ...utworzMetadane(),
        tytul,
        typ: "absolutne",
        czas,
        priorytet: poziom ?? "normalny",
        stan: "nowe",
        eskalacja: false,
      };
      await pobierzRepozytorium("przypomnienia").zapisz(przypomnienie);
      return { id: przypomnienie.id, tytul, czas };
    },
  });

  rejestr.zarejestruj({
    nazwa: "reschedule_reminder",
    opis: "Przenosi jedno wskazane przypomnienie na nowy termin.",
    schematArgumentow: z.object({
      id: z.string().min(1),
      czas: z.string().datetime(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ id, czas }) => {
      const repozytorium = pobierzRepozytorium("przypomnienia");
      const przypomnienie = await repozytorium.pobierz(id);
      if (!przypomnienie) throw new Error("Nie znaleziono przypomnienia.");
      const zaktualizowane: Przypomnienie = {
        ...przypomnienie,
        czas,
        odroczoneDo: undefined,
        stan: "nowe",
      };
      await repozytorium.zapisz(zaktualizowane);
      return { id, tytul: zaktualizowane.tytul, czas };
    },
  });

  rejestr.zarejestruj({
    nazwa: "list_health",
    opis: "Pobiera zapisane wizyty, skierowania, recepty, leki i terapie. Nie interpretuje medycznie danych.",
    schematArgumentow: z.object({
      rodzaj: z
        .enum(["wizyty", "skierowania", "recepty", "leki", "terapie"])
        .optional(),
      status: z.string().optional(),
      od: dataIso.optional(),
      do: dataIso.optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ rodzaj, status, od, do: doKiedy }) => {
      const filtrujDate = <T extends object>(lista: T[], pole: keyof T) =>
        lista
          .filter((element) => {
            const wartosc = element[pole];
            return !od || (typeof wartosc === "string" && wartosc >= od);
          })
          .filter((element) => {
            const wartosc = element[pole];
            return (
              !doKiedy || (typeof wartosc === "string" && wartosc <= doKiedy)
            );
          });
      if (rodzaj === "wizyty")
        return filtrujDate(await pobierzRepozytorium("wizyty").lista(), "data")
          .filter((x) => !status || x.status === status)
          .map(({ id, nazwa, data, godzina: oGodzinie, status: stan }) => ({
            id,
            tytul: nazwa,
            data,
            godzina: oGodzinie,
            status: stan,
            typ: "wizyta",
          }));
      if (rodzaj === "skierowania")
        return filtrujDate(
          await pobierzRepozytorium("skierowania").lista(),
          "terminWaznosci",
        )
          .filter((x) => !status || x.status === status)
          .map(({ id, nazwa, cel, terminWaznosci, status: stan }) => ({
            id,
            tytul: nazwa,
            cel,
            terminWaznosci,
            status: stan,
            typ: "skierowanie",
          }));
      if (rodzaj === "recepty")
        return filtrujDate(
          await pobierzRepozytorium("recepty").lista(),
          "terminRealizacji",
        )
          .filter((x) => !status || x.status === status)
          .map(({ id, kod, status: stan, terminRealizacji, pozycje }) => ({
            id,
            tytul: kod ? `Recepta ${kod}` : "Recepta",
            status: stan,
            terminRealizacji,
            pozycje,
            typ: "recepta",
          }));
      if (rodzaj === "leki")
        return (await pobierzRepozytorium("leki").lista())
          .filter((x) => !status || String(x.aktywny) === status)
          .map(({ id, nazwa, dawkaInstrukcja, godziny, aktywny }) => ({
            id,
            tytul: nazwa,
            dawkaInstrukcja,
            godziny,
            aktywny,
            typ: "lek",
          }));
      return (await pobierzRepozytorium("terapie").lista())
        .filter((x) => !status || x.status === status)
        .map(({ id, nazwa, status: stan, rodzaj }) => ({
          id,
          tytul: nazwa,
          status: stan,
          rodzaj,
          typ: "terapia",
        }));
    },
  });

  rejestr.zarejestruj({
    nazwa: "create_appointment",
    opis: "Dodaje wizytę do istniejącego rejestru wizyt; termin jest jednym wydarzeniem organizacyjnym.",
    schematArgumentow: z.object({
      nazwa: z.string().trim().min(1).max(160),
      data: dataIso.optional(),
      godzina: godzina.optional(),
      miejsce: z.string().max(300).optional(),
      notatka: z.string().max(5000).optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async (dane) => {
      const wizyta: Wizyta = {
        ...utworzMetadane(),
        nazwa: dane.nazwa,
        status: dane.data ? "umowiona" : "do_umowienia",
        data: dane.data,
        godzina: dane.godzina,
        miejsce: dane.miejsce,
        notatka: dane.notatka ?? "",
        pytania: [],
        dokumentyIds: [],
        checklista: [],
      };
      await pobierzRepozytorium("wizyty").zapisz(wizyta);
      return {
        id: wizyta.id,
        tytul: wizyta.nazwa,
        data: wizyta.data,
        godzina: wizyta.godzina,
        typ: "wizyta",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "update_appointment",
    opis: "Zmienia termin lub status istniejącej wizyty.",
    schematArgumentow: z.object({
      id: z.string().min(1),
      zmiany: z
        .object({
          data: dataIso.nullable().optional(),
          godzina: godzina.nullable().optional(),
          status: z
            .enum(["do_umowienia", "umowiona", "odbyta", "anulowana"])
            .optional(),
          nazwa: z.string().trim().min(1).max(160).optional(),
        })
        .refine((x) => Object.keys(x).length > 0),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ id, zmiany }) => {
      const repo = pobierzRepozytorium("wizyty");
      const obecna = await repo.pobierz(id);
      if (!obecna) return null;
      const wizyta = {
        ...obecna,
        ...zmiany,
        data: zmiany.data === null ? undefined : (zmiany.data ?? obecna.data),
        godzina:
          zmiany.godzina === null
            ? undefined
            : (zmiany.godzina ?? obecna.godzina),
      };
      await repo.zapisz(wizyta);
      return {
        id,
        tytul: wizyta.nazwa,
        data: wizyta.data,
        godzina: wizyta.godzina,
        typ: "wizyta",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "create_referral",
    opis: "Dodaje skierowanie do rejestru zdrowia.",
    schematArgumentow: z.object({
      nazwa: z.string().trim().min(1).max(160),
      cel: z.string().trim().min(1).max(500),
      typCelu: z
        .enum(["specjalista", "badanie", "zabieg", "rehabilitacja", "inne"])
        .optional(),
      dataWystawienia: dataIso,
      terminWaznosci: dataIso.optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async (dane) => {
      const skierowanie: Skierowanie = {
        ...utworzMetadane(),
        ...dane,
        typCelu: dane.typCelu ?? "badanie",
        status: "do_umowienia",
      };
      await pobierzRepozytorium("skierowania").zapisz(skierowanie);
      return {
        id: skierowanie.id,
        tytul: skierowanie.nazwa,
        typ: "skierowanie",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "update_referral",
    opis: "Zmienia status lub wiąże skierowanie z istniejącą wizytą.",
    schematArgumentow: z
      .object({
        id: z.string().min(1),
        status: z
          .enum([
            "nowe",
            "do_umowienia",
            "umowiono",
            "zrealizowano",
            "anulowano",
            "wygaslo",
          ])
          .optional(),
        wizytaId: z.string().min(1).nullable().optional(),
      })
      .refine((x) => x.status !== undefined || x.wizytaId !== undefined),
    ryzyko: "niskie",
    wykonaj: async ({ id, ...zmiany }) => {
      const repo = pobierzRepozytorium("skierowania");
      const obecne = await repo.pobierz(id);
      if (!obecne) return null;
      const skierowanie = {
        ...obecne,
        ...zmiany,
        wizytaId:
          zmiany.wizytaId === null
            ? undefined
            : (zmiany.wizytaId ?? obecne.wizytaId),
      };
      await repo.zapisz(skierowanie);
      return {
        id,
        tytul: skierowanie.nazwa,
        status: skierowanie.status,
        typ: "skierowanie",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "create_prescription",
    opis: "Dodaje receptę z pozycjami do rejestru zdrowia.",
    schematArgumentow: z.object({
      kod: z.string().trim().min(1).max(100).optional(),
      dataWystawienia: dataIso,
      terminRealizacji: dataIso.optional(),
      pozycje: z.array(
        z.object({
          nazwaLeku: z.string().trim().min(1).max(160),
          ilosc: z.number().int().positive(),
          dawkowanie: z.string().max(500).optional(),
        }),
      ),
    }),
    ryzyko: "niskie",
    wykonaj: async (dane) => {
      const recepta: Recepta = {
        ...utworzMetadane(),
        kod: dane.kod,
        dataWystawienia: dane.dataWystawienia,
        terminRealizacji: dane.terminRealizacji,
        status: "do_realizacji",
        pozycje: dane.pozycje.map((pozycja, indeks) => ({
          id: `${Date.now()}-${indeks}`,
          ...pozycja,
          iloscZrealizowana: 0,
        })),
      };
      await pobierzRepozytorium("recepty").zapisz(recepta);
      return {
        id: recepta.id,
        tytul: recepta.kod ? `Recepta ${recepta.kod}` : "Recepta",
        pozycje: recepta.pozycje,
        typ: "recepta",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "add_prescription_item",
    opis: "Dodaje pozycję do istniejącej recepty.",
    schematArgumentow: z.object({
      receptaId: z.string().min(1),
      nazwaLeku: z.string().trim().min(1).max(160),
      ilosc: z.number().int().positive().optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ receptaId, nazwaLeku, ilosc = 1 }) => {
      const repo = pobierzRepozytorium("recepty");
      const recepta = await repo.pobierz(receptaId);
      if (!recepta) return null;
      const pozycja = {
        id: `${Date.now()}-${recepta.pozycje.length}`,
        nazwaLeku,
        ilosc,
        iloscZrealizowana: 0,
      };
      await repo.zapisz({ ...recepta, pozycje: [...recepta.pozycje, pozycja] });
      return {
        id: recepta.id,
        tytul: recepta.kod ? `Recepta ${recepta.kod}` : "Recepta",
        pozycje: [...recepta.pozycje, pozycja],
        typ: "recepta",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "realize_prescription_item",
    opis: "Oznacza liczbę zrealizowanych sztuk pozycji recepty albo całą receptę.",
    schematArgumentow: z.object({
      receptaId: z.string().min(1),
      pozycjaId: z.string().min(1).optional(),
      iloscZrealizowana: z.number().int().nonnegative().optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ receptaId, pozycjaId, iloscZrealizowana }) => {
      const repo = pobierzRepozytorium("recepty");
      const recepta = await repo.pobierz(receptaId);
      if (!recepta) return null;
      const pozycje = recepta.pozycje.map((x) =>
        !pozycjaId || x.id === pozycjaId
          ? {
              ...x,
              iloscZrealizowana: Math.min(
                x.ilosc,
                iloscZrealizowana ?? x.ilosc,
              ),
            }
          : x,
      );
      const status =
        pozycje.length === 0 ||
        pozycje.every((x) => x.iloscZrealizowana >= x.ilosc)
          ? "zrealizowana"
          : pozycje.some((x) => x.iloscZrealizowana > 0)
            ? "czesciowo_zrealizowana"
            : "do_realizacji";
      await repo.zapisz({ ...recepta, pozycje, status });
      return {
        id: recepta.id,
        tytul: recepta.kod ? `Recepta ${recepta.kod}` : "Recepta",
        pozycje,
        status,
        typ: "recepta",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "create_therapy_entry",
    opis: "Dodaje organizacyjną notatkę do istniejącej terapii.",
    schematArgumentow: z.object({
      terapiaId: z.string().min(1),
      tresc: z.string().trim().min(1).max(5000),
      dataCzas: z.string().datetime(),
    }),
    ryzyko: "niskie",
    wykonaj: async (dane) => {
      const wpis: WpisTerapii = { ...utworzMetadane(), ...dane };
      await pobierzRepozytorium("wpisyTerapii").zapisz(wpis);
      return {
        id: wpis.id,
        tytul: wpis.tresc.slice(0, 80),
        terapiaId: wpis.terapiaId,
        typ: "wpis_terapii",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "create_therapy",
    opis: "Dodaje terapię do rejestru zdrowia.",
    schematArgumentow: z.object({
      nazwa: z.string().trim().min(1).max(160),
      rodzaj: z
        .enum(["psychoterapia", "rehabilitacja", "leczenie", "inne"])
        .optional(),
      dataRozpoczecia: dataIso.optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async (dane) => {
      const terapia: Terapia = {
        ...utworzMetadane(),
        ...dane,
        status: "aktywna",
      };
      await pobierzRepozytorium("terapie").zapisz(terapia);
      return { id: terapia.id, tytul: terapia.nazwa, typ: "terapia" };
    },
  });
  rejestr.zarejestruj({
    nazwa: "list_therapy_entries",
    opis: "Pobiera ostatnie wpisy wskazanej terapii.",
    schematArgumentow: z.object({
      terapiaId: z.string().min(1),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ terapiaId, limit = 5 }) =>
      (await pobierzRepozytorium("wpisyTerapii").lista())
        .filter((x) => x.terapiaId === terapiaId)
        .sort((a, b) => b.dataCzas.localeCompare(a.dataCzas))
        .slice(0, limit)
        .map(({ id, tresc, dataCzas }) => ({
          id,
          tytul: tresc,
          dataCzas,
          typ: "wpis_terapii",
        })),
  });

  rejestr.zarejestruj({
    nazwa: "list_shopping",
    opis: "Pobiera listy zakupów oraz ich niekupione pozycje.",
    schematArgumentow: z.object({ listaId: z.string().min(1).optional() }),
    ryzyko: "niskie",
    wykonaj: async ({ listaId }) => {
      const [listy, pozycje] = await Promise.all([
        pobierzRepozytorium("listyZakupow").lista(),
        pobierzRepozytorium("pozycjeZakupow").lista(),
      ]);
      return listy
        .filter((lista) => !listaId || lista.id === listaId)
        .map((lista) => ({
          id: lista.id,
          tytul: lista.nazwa,
          aktywna: lista.aktywna,
          sklep: lista.sklep,
          pozycje: pozycje
            .filter(
              (pozycja) => pozycja.listaId === lista.id && !pozycja.kupione,
            )
            .map((pozycja) => ({
              id: pozycja.id,
              nazwa: pozycja.nazwa,
              ilosc: pozycja.ilosc,
            })),
          typ: "zakupy",
        }));
    },
  });
  rejestr.zarejestruj({
    nazwa: "add_shopping_item",
    opis: "Dodaje pozycję do istniejącej listy zakupów.",
    schematArgumentow: z.object({
      listaId: z.string().min(1),
      nazwa: z.string().trim().min(1).max(160),
      ilosc: z.string().trim().max(40).optional(),
      kategoria: z.string().trim().max(80).optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ listaId, nazwa, ilosc, kategoria }) => {
      const lista = await pobierzRepozytorium("listyZakupow").pobierz(listaId);
      if (!lista) return null;
      const pozycja = {
        ...utworzMetadane(),
        listaId,
        nazwa,
        ilosc: ilosc ?? "1",
        kategoria,
        kupione: false,
      };
      await pobierzRepozytorium("pozycjeZakupow").zapisz(pozycja);
      return { id: pozycja.id, tytul: pozycja.nazwa, listaId, typ: "zakupy" };
    },
  });

  rejestr.zarejestruj({
    nazwa: "finance_period_summary",
    opis: "Wylicza cash flow wyłącznie z zapisanych transakcji, rachunków, płatności stałych i rat.",
    schematArgumentow: z.object({ miesiac: z.string().regex(/^\d{4}-\d{2}$/) }),
    ryzyko: "niskie",
    wykonaj: async ({ miesiac }) =>
      podsumujCashFlow(
        miesiac,
        await pobierzRepozytorium("wydatki").lista(),
        await pobierzRepozytorium("rachunki").lista(),
        await pobierzRepozytorium("platnosciStale").lista(),
        await pobierzRepozytorium("raty").lista(),
      ),
  });
  rejestr.zarejestruj({
    nazwa: "create_transaction",
    opis: "Zapisuje przychód, wydatek lub transfer w obecnym rejestrze finansowym.",
    schematArgumentow: z.object({
      opis: z.string().trim().min(1).max(160),
      kwota: z.number().positive(),
      data: dataIso,
      kategoria: z.string().trim().min(1).max(80),
      rodzaj: z.enum(["wydatek", "przychod", "transfer"]).optional(),
    }),
    ryzyko: "umiarkowane",
    wykonaj: async (dane) => {
      const transakcja = {
        ...utworzMetadane(),
        ...dane,
        rodzaj: dane.rodzaj ?? "wydatek",
      };
      await pobierzRepozytorium("wydatki").zapisz(transakcja);
      return {
        id: transakcja.id,
        tytul: transakcja.opis,
        kwota: transakcja.kwota,
        data: transakcja.data,
        typ: "finanse",
      };
    },
  });

  rejestr.zarejestruj({
    nazwa: "vehicle_status",
    opis: "Pobiera przebieg, terminy serwisowe i ostatnie tankowania zapisanych pojazdów.",
    schematArgumentow: z.object({ pojazdId: z.string().min(1).optional() }),
    ryzyko: "niskie",
    wykonaj: async ({ pojazdId }) =>
      (await pobierzRepozytorium("pojazdy").lista())
        .filter((pojazd) => !pojazdId || pojazd.id === pojazdId)
        .map((pojazd) => ({
          id: pojazd.id,
          tytul: pojazd.nazwa,
          przebieg: pojazd.przebieg,
          serwis: pojazd.planowanySerwisData ?? pojazd.wymianaOlejuDo,
          ostatnieTankowanie: pojazd.tankowania?.at(-1),
          typ: "samochod",
        })),
  });
  rejestr.zarejestruj({
    nazwa: "add_refuel",
    opis: "Dodaje tankowanie do historii wskazanego samochodu i opcjonalnie księguje wydatek.",
    schematArgumentow: z.object({
      pojazdId: z.string().min(1),
      data: dataIso,
      przebieg: z.number().nonnegative(),
      litry: z.number().positive(),
      koszt: z.number().positive(),
      pelnyBak: z.boolean().optional(),
      zaksieguj: z.boolean().optional(),
    }),
    ryzyko: "umiarkowane",
    wykonaj: async ({ pojazdId, zaksieguj, ...dane }) => {
      const repo = pobierzRepozytorium("pojazdy");
      const pojazd = await repo.pobierz(pojazdId);
      if (!pojazd) return null;
      const tankowanie = {
        id: crypto.randomUUID(),
        data: dane.data,
        przebieg: dane.przebieg,
        litry: dane.litry,
        cena: dane.koszt,
        pelnyBak: dane.pelnyBak,
      };
      await repo.zapisz({
        ...pojazd,
        przebieg: Math.max(pojazd.przebieg ?? 0, dane.przebieg),
        tankowania: [...(pojazd.tankowania ?? []), tankowanie],
      });
      if (zaksieguj) {
        const repoWydatkow = pobierzRepozytorium("wydatki");
        const wydatek = przygotujWydatekZeZrodla(await repoWydatkow.lista(), {
          opis: `Tankowanie: ${pojazd.nazwa}`,
          kwota: dane.koszt,
          data: dane.data,
          kategoria: "Paliwo",
          powiazanie: { typ: "samochod", id: tankowanie.id },
        });
        if (wydatek) await repoWydatkow.zapisz(wydatek);
      }
      return {
        id: pojazd.id,
        tytul: pojazd.nazwa,
        tankowanie,
        typ: "samochod",
      };
    },
  });

  rejestr.zarejestruj({
    nazwa: "list_medication_doses",
    opis: "Pobiera dzisiejsze dawki i przewidywane wyczerpanie zapasu leków.",
    schematArgumentow: z.object({ data: dataIso }),
    ryzyko: "niskie",
    wykonaj: async ({ data }) => {
      const [leki, wpisy] = await Promise.all([
        pobierzRepozytorium("leki").lista(),
        pobierzRepozytorium("dziennikLekow").lista(),
      ]);
      return generujDawkiDnia(leki, wpisy, data).map((dawka) => ({
        id: dawka.idWystapienia,
        lekId: dawka.lek.id,
        tytul: dawka.lek.nazwa,
        godzina: dawka.planowanaGodzina,
        status: dawka.status,
        wyczerpanie: przewidywanaDataWyczerpania(dawka.lek, data),
        typ: "lek",
      }));
    },
  });
  rejestr.zarejestruj({
    nazwa: "mark_medication_dose",
    opis: "Oznacza pojedynczą dawkę jako zażytą, odroczoną albo pominiętą.",
    schematArgumentow: z.object({
      lekId: z.string().min(1),
      data: dataIso,
      godzina,
      status: z.enum(["zazyte", "odroczone", "pominiete"]),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ lekId, data, godzina: oGodzinie, status }) => {
      const [lek, wpisy] = await Promise.all([
        pobierzRepozytorium("leki").pobierz(lekId),
        pobierzRepozytorium("dziennikLekow").lista(),
      ]);
      if (!lek) return null;
      const dawka = generujDawkiDnia([lek], wpisy, data).find(
        (element) => element.planowanaGodzina === oGodzinie,
      );
      if (!dawka) return null;
      const wpis = zapiszStatusDawki(dawka, status);
      await pobierzRepozytorium("dziennikLekow").zapisz(wpis);
      return { id: wpis.id, tytul: lek.nazwa, status, typ: "lek" };
    },
  });

  rejestr.zarejestruj({
    nazwa: "list_habits",
    opis: "Pobiera nawyki i ich regularność w ostatnich 30 dniach.",
    schematArgumentow: z.object({ data: dataIso.optional() }),
    ryzyko: "niskie",
    wykonaj: async ({ data }) => {
      const doDnia = data ?? new Date().toISOString().slice(0, 10);
      const [nawyki, wpisy] = await Promise.all([
        pobierzRepozytorium("nawyki").lista(),
        pobierzRepozytorium("dziennikNawykow").lista(),
      ]);
      return nawyki
        .filter((nawyk) => nawyk.aktywny)
        .map((nawyk) => ({
          id: nawyk.id,
          tytul: nawyk.nazwa,
          ...statystykaNawyku(nawyk, wpisy, doDnia, 30),
          typ: "nawyk",
        }));
    },
  });

  rejestr.zarejestruj({
    nazwa: "search_knowledge",
    opis: "Wyszukuje notatki, dokumenty, pomysły i kontakty w lokalnych danych Ogarniacza.",
    schematArgumentow: z.object({ fraza: z.string().trim().min(2).max(160) }),
    ryzyko: "niskie",
    wykonaj: async ({ fraza }) => {
      const slowa = uproscDoWyszukiwania(fraza);
      const pasuje = (tekst: string) =>
        slowa.every((slowo) =>
          uproscDoWyszukiwania(tekst).some((wartosc) =>
            pasujaOdmiany(wartosc, slowo),
          ),
        );
      const [notatki, dokumenty, pomysly, kontakty] = await Promise.all([
        pobierzRepozytorium("notatki").lista(),
        pobierzRepozytorium("dokumenty").lista(),
        pobierzRepozytorium("pomysly").lista(),
        pobierzRepozytorium("kontakty").lista(),
      ]);
      return [
        ...notatki
          .filter((x) => pasuje(`${x.tytul} ${x.tresc}`))
          .map((x) => ({ id: x.id, tytul: x.tytul, typ: "notatka" })),
        ...dokumenty
          .filter((x) => pasuje(x.nazwa))
          .map((x) => ({ id: x.id, tytul: x.nazwa, typ: "dokument" })),
        ...pomysly
          .filter((x) => pasuje(`${x.tytul} ${x.opis}`))
          .map((x) => ({ id: x.id, tytul: x.tytul, typ: "pomysl" })),
        ...kontakty
          .filter((x) => pasuje(x.nazwa))
          .map((x) => ({ id: x.id, tytul: x.nazwa, typ: "kontakt" })),
      ];
    },
  });

  rejestr.zarejestruj({
    nazwa: "list_projects",
    opis: "Pobiera projekty.",
    schematArgumentow: z.object({
      status: z.enum(["aktywne", "wstrzymane", "zakonczone"]).optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ status }) =>
      (await pobierzRepozytorium("projekty").lista())
        .filter((x) => !status || x.status === status)
        .map((x) => ({
          id: x.id,
          tytul: x.nazwa,
          status: x.status,
          termin: x.termin,
          typ: "projekt",
        })),
  });
  rejestr.zarejestruj({
    nazwa: "get_project",
    opis: "Pobiera projekt i jego zadania.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ id }) => {
      const projekt = await pobierzRepozytorium("projekty").pobierz(id);
      if (!projekt) return null;
      return {
        ...projekt,
        tytul: projekt.nazwa,
        zadania: (await pobierzRepozytorium("zadania").lista()).filter(
          (x) => x.projektId === id,
        ),
        typ: "projekt",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "create_project",
    opis: "Tworzy projekt.",
    schematArgumentow: z.object({
      nazwa: z.string().trim().min(1),
      opis: z.string().optional(),
      termin: dataIso.optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async (dane) => {
      const projekt: Projekt = {
        ...utworzMetadane(),
        nazwa: dane.nazwa,
        opis: dane.opis ?? "",
        termin: dane.termin,
        status: "aktywne",
        blokady: "",
      };
      await pobierzRepozytorium("projekty").zapisz(projekt);
      return { id: projekt.id, tytul: projekt.nazwa, typ: "projekt" };
    },
  });
  rejestr.zarejestruj({
    nazwa: "update_project",
    opis: "Aktualizuje projekt.",
    schematArgumentow: z.object({
      id: z.string().min(1),
      nazwa: z.string().trim().min(1).optional(),
      opis: z.string().optional(),
      status: z.enum(["aktywne", "wstrzymane", "zakonczone"]).optional(),
      termin: dataIso.optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ id, ...zmiany }) => {
      const repo = pobierzRepozytorium("projekty");
      const projekt = await repo.pobierz(id);
      if (!projekt) return null;
      const wynik = { ...projekt, ...zmiany };
      await repo.zapisz(wynik);
      return { id, tytul: wynik.nazwa, typ: "projekt" };
    },
  });

  rejestr.zarejestruj({
    nazwa: "list_inbox",
    opis: "Pobiera nieprzetworzoną Poczekalnię.",
    schematArgumentow: z.object({}),
    ryzyko: "niskie",
    wykonaj: async () =>
      (await pobierzRepozytorium("skrzynka").lista())
        .filter((x) => x.status === "nowe")
        .map((x) => ({ id: x.id, tytul: x.tresc, typ: "poczekalnia" })),
  });
  rejestr.zarejestruj({
    nazwa: "list_waiting_room",
    opis: "Alias listy Poczekalni.",
    schematArgumentow: z.object({}),
    ryzyko: "niskie",
    wykonaj: async () =>
      (await pobierzRepozytorium("skrzynka").lista()).filter(
        (x) => x.status === "nowe",
      ),
  });
  rejestr.zarejestruj({
    nazwa: "preview_process_inbox",
    opis: "Pokazuje podział Poczekalni bez zapisu.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ id }) => {
      const element = await pobierzRepozytorium("skrzynka").pobierz(id);
      return element
        ? {
            id,
            propozycje: zaproponujPodzialPoczekalni(element.tresc),
            zapisano: false,
          }
        : null;
    },
  });
  rejestr.zarejestruj({
    nazwa: "process_inbox",
    opis: "Zatwierdza podział Poczekalni do zadań.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "umiarkowane",
    wykonaj: async ({ id }) => {
      const repo = pobierzRepozytorium("skrzynka");
      const element = await repo.pobierz(id);
      if (!element) return null;
      const utworzone = zaproponujPodzialPoczekalni(element.tresc).map((x) =>
        utworzZadanie({ tytul: x.tresc, opis: "", priorytet: "normalny" }),
      );
      await pobierzRepozytorium("zadania").zapiszWiele(utworzone);
      await repo.zapisz({ ...element, status: "przetworzone" });
      return utworzone.map((x) => ({
        id: x.id,
        tytul: x.tytul,
        typ: "zadanie",
      }));
    },
  });

  const zbudujDanePlanu = async (data: string, odGodziny?: string) => {
    const [zadania, ustawienia, wyjatki, bloki, wizyty] = await Promise.all([
      pobierzRepozytorium("zadania").lista(),
      pobierzRepozytorium("ustawienia").lista(),
      pobierzRepozytorium("wyjatkiGrafiku").lista(),
      pobierzRepozytorium("blokiCzasu").lista(),
      pobierzRepozytorium("wizyty").lista(),
    ]);
    const ustawienie = ustawienia[0] ?? DOMYSLNE_USTAWIENIA;
    const wyjatek = [...wyjatki]
      .filter((x) => x.data === data)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const wydarzenia = [
      ...bloki
        .filter((x) => x.status !== "odrzucony" && x.poczatek.startsWith(data))
        .map((x) => ({
          id: `blok:${x.id}`,
          typ: "planer" as const,
          tytul: x.tytul,
          data,
          godzina: x.poczatek.slice(11, 16),
          czasTrwaniaMinuty: Math.max(
            1,
            (new Date(x.koniec).getTime() - new Date(x.poczatek).getTime()) /
              60_000,
          ),
          trybTerminu: "o_godzinie" as const,
          status:
            x.status === "wykonany"
              ? ("wykonany" as const)
              : ("otwarty" as const),
          createdAt: x.createdAt,
          updatedAt: x.updatedAt,
        })),
      ...wizyty
        .filter(
          (x) =>
            x.data === data &&
            x.godzina &&
            !["odbyta", "anulowana"].includes(x.status),
        )
        .map((x) => ({
          id: `wizyta:${x.id}`,
          typ: "wizyta" as const,
          tytul: x.nazwa,
          data,
          godzina: x.godzina,
          czasTrwaniaMinuty: 60,
          trybTerminu: "o_godzinie" as const,
          status: "otwarty" as const,
          createdAt: x.createdAt,
          updatedAt: x.updatedAt,
        })),
    ];
    return {
      data,
      zadania,
      wydarzenia,
      harmonogram: utworzHarmonogramDnia(data, ustawienie.harmonogram, wyjatek),
      odGodziny,
      preferencje: DOMYSLNE_PREFERENCJE_PLANOWANIA,
    };
  };
  const podgladPlanu = async (data: string, odGodziny?: string) => ({
    ...generujPlan(await zbudujDanePlanu(data, odGodziny)),
    zapisano: false,
  });
  rejestr.zarejestruj({
    nazwa: "preview_day_plan",
    opis: "Tworzy podgląd planu bez zapisu.",
    schematArgumentow: z.object({ data: dataIso }),
    ryzyko: "niskie",
    wykonaj: async ({ data }) => podgladPlanu(data),
  });
  rejestr.zarejestruj({
    nazwa: "preview_replan_from_now",
    opis: "Tworzy podgląd przeplanowania bez zapisu.",
    schematArgumentow: z.object({ data: dataIso, odGodziny: godzina }),
    ryzyko: "niskie",
    wykonaj: async ({ data, odGodziny }) => podgladPlanu(data, odGodziny),
  });
  rejestr.zarejestruj({
    nazwa: "explain_planning_conflict",
    opis: "Wyjaśnia blokadę lub konflikt zadania.",
    schematArgumentow: z.object({ zadanieId: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ zadanieId }) => {
      const zadania = await pobierzRepozytorium("zadania").lista();
      const zadanie = zadania.find((x) => x.id === zadanieId);
      return zadanie
        ? {
            id: zadanie.id,
            tytul: zadanie.tytul,
            zablokowane: czyZadanieZablokowane(zadanie, zadania),
            blokowanePrzez: zadanie.blokowanePrzezIds ?? [],
          }
        : null;
    },
  });
  rejestr.zarejestruj({
    nazwa: "accept_plan_selection",
    opis: "Zapisuje zaakceptowane pozycje planu w źródłowych Zadaniach.",
    schematArgumentow: z.object({
      data: dataIso,
      zadaniaIds: z.array(z.string().min(1)),
      godzinaStartu: godzina.optional(),
    }),
    ryzyko: "umiarkowane",
    wykonaj: async ({ data, zadaniaIds, godzinaStartu }) => {
      const dane = await zbudujDanePlanu(data, godzinaStartu);
      const plan = generujPlan(dane);
      const liczba = await zatwierdzPlan(
        plan,
        repozytoriumElementowZadan,
        zadaniaIds,
      );
      return {
        tytul: `Zapisano ${liczba} pozycji planu`,
        liczba,
        typ: "planer",
      };
    },
  });

  const oznaczNawyk =
    (status: DziennikNawyku["status"]) =>
    async ({
      nawykId,
      data,
      powod,
    }: {
      nawykId: string;
      data: string;
      powod?: string;
    }) => {
      const repo = pobierzRepozytorium("dziennikNawykow");
      const istniejacy = (await repo.lista()).find(
        (x) => x.nawykId === nawykId && x.data === data,
      );
      const wpis: DziennikNawyku = {
        ...(istniejacy ?? utworzMetadane(`${nawykId}:${data}`)),
        nawykId,
        data,
        status,
        powodPominiecia: status === "pominieta" ? powod : undefined,
      };
      await repo.zapisz(wpis);
      return { id: wpis.id, tytul: "Nawyk", status, typ: "nawyk" };
    };
  const schematNawyku = z.object({
    nawykId: z.string().min(1),
    data: dataIso,
    powod: z.string().optional(),
  });
  rejestr.zarejestruj({
    nazwa: "mark_habit_full",
    opis: "Oznacza pełną realizację nawyku.",
    schematArgumentow: schematNawyku,
    ryzyko: "niskie",
    wykonaj: oznaczNawyk("pelna"),
  });
  rejestr.zarejestruj({
    nazwa: "mark_habit_minimum",
    opis: "Oznacza minimalną realizację nawyku.",
    schematArgumentow: schematNawyku,
    ryzyko: "niskie",
    wykonaj: oznaczNawyk("minimalna"),
  });
  rejestr.zarejestruj({
    nazwa: "mark_habit_skipped",
    opis: "Oznacza pominięcie nawyku z powodem.",
    schematArgumentow: schematNawyku,
    ryzyko: "niskie",
    wykonaj: oznaczNawyk("pominieta"),
  });

  rejestr.zarejestruj({
    nazwa: "create_shopping_list",
    opis: "Tworzy listę zakupów.",
    schematArgumentow: z.object({
      nazwa: z.string().trim().min(1),
      sklep: z.string().optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async (dane) => {
      const lista = {
        ...utworzMetadane(),
        nazwa: dane.nazwa,
        sklep: dane.sklep,
        aktywna: true,
      };
      await pobierzRepozytorium("listyZakupow").zapisz(lista);
      return { id: lista.id, tytul: lista.nazwa, typ: "zakupy" };
    },
  });
  rejestr.zarejestruj({
    nazwa: "complete_shopping_item",
    opis: "Oznacza pozycję zakupów jako kupioną.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ id }) => {
      const repo = pobierzRepozytorium("pozycjeZakupow");
      const pozycja = await repo.pobierz(id);
      if (!pozycja) return null;
      await repo.zapisz({ ...pozycja, kupione: true });
      return { id, tytul: pozycja.nazwa, typ: "zakupy" };
    },
  });
  rejestr.zarejestruj({
    nazwa: "finish_shopping_list",
    opis: "Kończy listę bez automatycznego księgowania.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ id }) => {
      const repo = pobierzRepozytorium("listyZakupow");
      const lista = await repo.pobierz(id);
      if (!lista) return null;
      await repo.zapisz({ ...lista, aktywna: false });
      return { id, tytul: lista.nazwa, typ: "zakupy" };
    },
  });

  rejestr.zarejestruj({
    nazwa: "upcoming_bills",
    opis: "Pobiera nieopłacone rachunki.",
    schematArgumentow: z.object({ do: dataIso.optional() }),
    ryzyko: "niskie",
    wykonaj: async ({ do: koniec }) =>
      (await pobierzRepozytorium("rachunki").lista())
        .filter(
          (x) => x.status === "niezaplacony" && (!koniec || x.termin <= koniec),
        )
        .map((x) => ({
          id: x.id,
          tytul: x.nazwa,
          kwota: x.kwota,
          termin: x.termin,
          typ: "rachunek",
        })),
  });
  rejestr.zarejestruj({
    nazwa: "budget_state",
    opis: "Pobiera wykorzystanie budżetów.",
    schematArgumentow: z.object({ miesiac: z.string().regex(/^\d{4}-\d{2}$/) }),
    ryzyko: "niskie",
    wykonaj: async ({ miesiac }) =>
      obliczWykorzystanieBudzetow(
        await pobierzRepozytorium("budzety").lista(),
        await pobierzRepozytorium("wydatki").lista(),
        miesiac,
      ),
  });
  rejestr.zarejestruj({
    nazwa: "list_subscriptions",
    opis: "Pobiera subskrypcje.",
    schematArgumentow: z.object({}),
    ryzyko: "niskie",
    wykonaj: async () =>
      (await pobierzRepozytorium("platnosciStale").lista()).filter(
        (x) => x.rodzaj === "subskrypcja",
      ),
  });
  rejestr.zarejestruj({
    nazwa: "list_installments",
    opis: "Pobiera plany i raty.",
    schematArgumentow: z.object({}),
    ryzyko: "niskie",
    wykonaj: async () => ({
      plany: await pobierzRepozytorium("planyRat").lista(),
      raty: await pobierzRepozytorium("raty").lista(),
    }),
  });
  rejestr.zarejestruj({
    nazwa: "pay_bill",
    opis: "Opłaca rachunek i opcjonalnie księguje jedno powiązane źródło.",
    schematArgumentow: z.object({
      id: z.string().min(1),
      zaksieguj: z.boolean().optional(),
    }),
    ryzyko: "umiarkowane",
    wykonaj: async ({ id, zaksieguj }) => {
      const repo = pobierzRepozytorium("rachunki");
      const rachunek = await repo.pobierz(id);
      if (!rachunek) return null;
      const platnosc = {
        ...utworzMetadane(),
        rachunekId: id,
        kwota: rachunek.kwota,
        zaplaconoAt: new Date().toISOString(),
      };
      if (zaksieguj) {
        const repoWydatkow = pobierzRepozytorium("wydatki");
        const wydatek = przygotujWydatekZeZrodla(await repoWydatkow.lista(), {
          opis: rachunek.nazwa,
          kwota: rachunek.kwota,
          data: new Date().toISOString().slice(0, 10),
          kategoria: rachunek.kategoria ?? "Rachunki",
          powiazanie: { typ: "rachunki", id },
        });
        if (wydatek) {
          await repoWydatkow.zapisz(wydatek);
          Object.assign(platnosc, { transakcjaId: wydatek.id });
        }
      }
      await pobierzRepozytorium("platnosciRachunkow").zapisz(platnosc);
      await repo.zapisz({ ...rachunek, status: "zaplacony" });
      return { id, tytul: rachunek.nazwa, typ: "rachunek" };
    },
  });

  rejestr.zarejestruj({
    nazwa: "update_vehicle_mileage",
    opis: "Aktualizuje przebieg samochodu.",
    schematArgumentow: z.object({
      pojazdId: z.string().min(1),
      przebieg: z.number().nonnegative(),
      data: dataIso.optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ pojazdId, przebieg, data }) => {
      const repo = pobierzRepozytorium("pojazdy");
      const pojazd = await repo.pobierz(pojazdId);
      if (!pojazd) return null;
      await repo.zapisz({
        ...pojazd,
        przebieg,
        historiaPrzebiegu: [
          ...(pojazd.historiaPrzebiegu ?? []),
          { data: data ?? new Date().toISOString().slice(0, 10), przebieg },
        ],
      });
      return { id: pojazdId, tytul: pojazd.nazwa, przebieg, typ: "samochod" };
    },
  });
  rejestr.zarejestruj({
    nazwa: "upcoming_vehicle_service",
    opis: "Pobiera terminy i progi serwisu.",
    schematArgumentow: z.object({ pojazdId: z.string().optional() }),
    ryzyko: "niskie",
    wykonaj: async ({ pojazdId }) =>
      (await pobierzRepozytorium("pojazdy").lista())
        .filter((x) => !pojazdId || x.id === pojazdId)
        .map((x) => ({
          id: x.id,
          tytul: x.nazwa,
          data: x.planowanySerwisData ?? x.wymianaOlejuDo,
          przebiegDocelowy: x.wymianaOlejuPrzebieg,
          przebieg: x.przebieg,
          typ: "samochod",
        })),
  });
  rejestr.zarejestruj({
    nazwa: "vehicle_service_history",
    opis: "Pobiera historię serwisową.",
    schematArgumentow: z.object({ pojazdId: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ pojazdId }) =>
      (await pobierzRepozytorium("pojazdy").pobierz(pojazdId))
        ?.historiaSerwisowa ?? [],
  });
  rejestr.zarejestruj({
    nazwa: "add_vehicle_service",
    opis: "Dodaje wpis serwisowy.",
    schematArgumentow: z.object({
      pojazdId: z.string().min(1),
      opis: z.string().trim().min(1),
      data: dataIso,
      koszt: z.number().nonnegative().optional(),
      przebieg: z.number().nonnegative().optional(),
    }),
    ryzyko: "umiarkowane",
    wykonaj: async ({ pojazdId, ...dane }) => {
      const repo = pobierzRepozytorium("pojazdy");
      const pojazd = await repo.pobierz(pojazdId);
      if (!pojazd) return null;
      const wpis = { id: crypto.randomUUID(), typ: "serwis" as const, ...dane };
      await repo.zapisz({
        ...pojazd,
        historiaSerwisowa: [...(pojazd.historiaSerwisowa ?? []), wpis],
      });
      return { id: wpis.id, tytul: dane.opis, typ: "samochod" };
    },
  });
  rejestr.zarejestruj({
    nazwa: "vehicle_cost_summary",
    opis: "Podsumowuje koszty samochodu.",
    schematArgumentow: z.object({ pojazdId: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ pojazdId }) => {
      const pojazd = await pobierzRepozytorium("pojazdy").pobierz(pojazdId);
      return pojazd
        ? {
            paliwo: statystykaPaliwa(pojazd).kosztPaliwa,
            serwis: (pojazd.historiaSerwisowa ?? []).reduce(
              (s, x) => s + (x.koszt ?? 0),
              0,
            ),
            zrodlo: "dane zapisane w Ogarniaczu",
          }
        : null;
    },
  });

  rejestr.zarejestruj({
    nazwa: "get_note",
    opis: "Pobiera notatkę.",
    schematArgumentow: z.object({ id: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async ({ id }) => pobierzRepozytorium("notatki").pobierz(id),
  });
  rejestr.zarejestruj({
    nazwa: "create_note",
    opis: "Tworzy notatkę.",
    schematArgumentow: z.object({
      tytul: z.string().trim().min(1),
      tresc: z.string().trim().min(1),
      tagi: z.array(z.string()).optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async (dane) => {
      const notatka = {
        ...utworzMetadane(),
        ...dane,
        tagi: dane.tagi ?? [],
        powiazania: [],
      };
      await pobierzRepozytorium("notatki").zapisz(notatka);
      return { id: notatka.id, tytul: notatka.tytul, typ: "notatka" };
    },
  });
  rejestr.zarejestruj({
    nazwa: "list_later",
    opis: "Pobiera Na później.",
    schematArgumentow: z.object({}),
    ryzyko: "niskie",
    wykonaj: async () => pobierzRepozytorium("naPozniej").lista(),
  });
  rejestr.zarejestruj({
    nazwa: "list_documents",
    opis: "Pobiera dokumenty.",
    schematArgumentow: z.object({}),
    ryzyko: "niskie",
    wykonaj: async () =>
      (await pobierzRepozytorium("dokumenty").lista()).map(
        ({ plik: _plik, ...x }) => x,
      ),
  });
  rejestr.zarejestruj({
    nazwa: "list_contacts",
    opis: "Pobiera kontakty.",
    schematArgumentow: z.object({}),
    ryzyko: "niskie",
    wykonaj: async () => pobierzRepozytorium("kontakty").lista(),
  });
  rejestr.zarejestruj({
    nazwa: "list_expiry_dates",
    opis: "Pobiera terminy ważności.",
    schematArgumentow: z.object({}),
    ryzyko: "niskie",
    wykonaj: async () => pobierzRepozytorium("terminyWaznosci").lista(),
  });
  rejestr.zarejestruj({
    nazwa: "list_places",
    opis: "Pobiera zapisane miejsca.",
    schematArgumentow: z.object({ typ: z.string().optional() }),
    ryzyko: "niskie",
    wykonaj: async ({ typ }) =>
      (await pobierzRepozytorium("miejsca").lista()).filter(
        (x) =>
          !typ ||
          x.typ?.toLocaleLowerCase("pl").includes(typ.toLocaleLowerCase("pl")),
      ),
  });
  rejestr.zarejestruj({
    nazwa: "list_errands_by_place",
    opis: "Pobiera sprawy według miejsca lub typu miejsca.",
    schematArgumentow: z.object({
      miejsceId: z.string().optional(),
      typMiejsca: z.string().optional(),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ miejsceId, typMiejsca }) => {
      const miejsca = await pobierzRepozytorium("miejsca").lista();
      return pobierzSprawyWedlugMiejsca(
        await pobierzRepozytorium("zadania").lista(),
        miejsca,
        { miejsceId, typMiejsca },
      ).map((x) => ({ id: x.id, tytul: x.tytul, typ: "zadanie" }));
    },
  });
  rejestr.zarejestruj({
    nazwa: "assess_mechanic_trip",
    opis: "Ocenia miejsce na wizytę u mechanika z grafiku, zadań, wydarzeń i Planera.",
    schematArgumentow: z.object({ data: dataIso, odGodziny: godzina }),
    ryzyko: "niskie",
    wykonaj: async ({ data, odGodziny }) => {
      const plan = await podgladPlanu(data, odGodziny);
      const [miejsca, kontakty] = await Promise.all([
        pobierzRepozytorium("miejsca").lista(),
        pobierzRepozytorium("kontakty").lista(),
      ]);
      const mechanik = [
        ...miejsca.map((x) => x.nazwa),
        ...kontakty.map((x) => x.nazwa),
      ].find((nazwa) => /mechanik|warsztat/i.test(nazwa));
      return {
        mozliwe: plan.minutyDostepne >= 60,
        minutyDostepne: plan.minutyDostepne,
        konflikty: plan.pozycje.filter((x) => x.status === "konflikt").length,
        mechanik,
        zrodlo: "dane zapisane w Ogarniaczu",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "assess_purchase_affordability",
    opis: "Ocenia planowany wydatek na podstawie cash flow, budżetów i zobowiązań.",
    schematArgumentow: z.object({
      kwota: z.number().positive(),
      kategoria: z.string().trim().min(1),
      miesiac: z.string().regex(/^\d{4}-\d{2}$/),
    }),
    ryzyko: "niskie",
    wykonaj: async ({ kwota, kategoria, miesiac }) => {
      const [wydatki, rachunki, platnosciStale, raty, budzety] =
        await Promise.all([
          pobierzRepozytorium("wydatki").lista(),
          pobierzRepozytorium("rachunki").lista(),
          pobierzRepozytorium("platnosciStale").lista(),
          pobierzRepozytorium("raty").lista(),
          pobierzRepozytorium("budzety").lista(),
        ]);
      const cashFlow = podsumujCashFlow(
        miesiac,
        wydatki,
        rachunki,
        platnosciStale,
        raty,
      );
      const kategoriaUproszczona = kategoria.toLocaleLowerCase("pl-PL");
      const budzet = obliczWykorzystanieBudzetow(
        budzety,
        wydatki,
        miesiac,
      ).find(
        (x) =>
          x.budzet.nazwa
            .toLocaleLowerCase("pl-PL")
            .includes(kategoriaUproszczona) ||
          x.budzet.kategoria
            ?.toLocaleLowerCase("pl-PL")
            .includes(kategoriaUproszczona),
      );
      const pozostaloWBudzecie = budzet?.pozostalo;
      return {
        mozliwe:
          cashFlow.prognozowanyBilans >= kwota &&
          (pozostaloWBudzecie === undefined || pozostaloWBudzecie >= kwota),
        prognozowanyBilansPo: cashFlow.prognozowanyBilans - kwota,
        pozostaloWBudzecie,
        zobowiazania: cashFlow.zobowiazania,
        zrodlo: "dane zapisane w Ogarniaczu",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "pharmacy_overview",
    opis: "Łączy jutrzejsze zadania w aptece, zakupy i zapisane sprawy zdrowotne.",
    schematArgumentow: z.object({ data: dataIso }),
    ryzyko: "niskie",
    wykonaj: async ({ data }) => {
      const [zadania, miejsca, listy, pozycje, recepty, leki] =
        await Promise.all([
          pobierzRepozytorium("zadania").lista(),
          pobierzRepozytorium("miejsca").lista(),
          pobierzRepozytorium("listyZakupow").lista(),
          pobierzRepozytorium("pozycjeZakupow").lista(),
          pobierzRepozytorium("recepty").lista(),
          pobierzRepozytorium("leki").lista(),
        ]);
      const zadaniaApteka = pobierzSprawyWedlugMiejsca(zadania, miejsca, {
        typMiejsca: "apteka",
      })
        .filter((x) => !x.termin || x.termin.slice(0, 10) === data)
        .map((x) => ({ id: x.id, tytul: x.tytul }));
      const listyApteczne = new Set(
        listy
          .filter(
            (x) =>
              x.aktywna &&
              (!x.planowanaData || x.planowanaData === data) &&
              /apte/i.test(
                `${x.nazwa} ${x.sklep ?? ""} ${x.lokalizacja ?? ""}`,
              ),
          )
          .map((x) => x.id),
      );
      const zakupy = pozycje
        .filter((x) => !x.kupione && listyApteczne.has(x.listaId))
        .map((x) => ({ id: x.id, tytul: x.nazwa }));
      const zdrowie = [
        ...recepty
          .filter((x) => x.status !== "zrealizowana")
          .map((x) => ({ id: x.id, tytul: `Recepta ${x.kod ?? x.id}` })),
        ...leki
          .filter((x) => {
            const wyczerpanie = przewidywanaDataWyczerpania(x, data);
            return x.aktywny && Boolean(wyczerpanie && wyczerpanie <= data);
          })
          .map((x) => ({ id: x.id, tytul: `Kończy się ${x.nazwa}` })),
      ];
      return {
        zadania: zadaniaApteka,
        zakupy,
        zdrowie,
        zrodlo: "dane zapisane w Ogarniaczu",
      };
    },
  });
  rejestr.zarejestruj({
    nazwa: "current_external_data",
    opis: "Kontrakt dla aktualnych danych internetowych; provider nie jest skonfigurowany.",
    schematArgumentow: z.object({ zapytanie: z.string().min(1) }),
    ryzyko: "niskie",
    wykonaj: async () => ({
      skonfigurowano: false,
      komunikat: "Aktualne dane internetowe nie są skonfigurowane.",
    }),
  });

  return rejestr;
}
