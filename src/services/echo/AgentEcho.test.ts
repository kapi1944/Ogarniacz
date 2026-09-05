import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { baza } from "../../data/BazaOgarniacza";
import { pobierzRepozytorium } from "../../data/Repozytorium";
import { utworzMetadane } from "../../domain/fabryki";
import { utworzZadanie } from "../ZadaniaService";
import { AgentEcho } from "./AgentEcho";
import { LokalnySemantycznyProviderEcho } from "./LokalnySemantycznyProviderEcho";
import {
  RejestrNarzedziEcho,
  utworzDomyslnyRejestrNarzedziEcho,
  WykonawcaNarzedziEcho,
} from "./NarzedziaEcho";
import type {
  DecyzjaModeluEcho,
  ProviderModeluEcho,
  ZadanieModeluEcho,
} from "./typyEcho";

class ProviderSkryptowy implements ProviderModeluEcho {
  readonly nazwa = "testowy";
  readonly tryb = "pelny_agent" as const;
  readonly zadania: ZadanieModeluEcho[] = [];

  constructor(private readonly decyzje: DecyzjaModeluEcho[]) {}

  async odpowiedz(
    zadanie: ZadanieModeluEcho,
    _sygnal: AbortSignal,
  ): Promise<DecyzjaModeluEcho> {
    this.zadania.push(zadanie);
    const decyzja = this.decyzje.shift();
    if (!decyzja) throw new Error("Brak decyzji testowej");
    return decyzja;
  }
}

function utworzWykonawce(rejestr: RejestrNarzedziEcho): WykonawcaNarzedziEcho {
  return new WykonawcaNarzedziEcho(rejestr, undefined, async () => undefined);
}

function utworzAgentaRozmowy() {
  let licznik = 0;
  const utworz = vi.fn(
    async ({ tytul, czas }: { tytul: string; czas: string }) => ({
      id: `przypomnienie-${++licznik}`,
      tytul,
      czas,
    }),
  );
  const przeloz = vi.fn(async ({ id, czas }: { id: string; czas: string }) => ({
    id,
    tytul: id === "przypomnienie-1" ? "Telefon do mechanika" : "Odebrać paczkę",
    czas,
  }));
  const rejestr = new RejestrNarzedziEcho()
    .zarejestruj({
      nazwa: "create_reminder",
      opis: "Utwórz przypomnienie",
      schematArgumentow: z.object({
        tytul: z.string(),
        czas: z.string().datetime(),
      }),
      ryzyko: "niskie",
      wykonaj: utworz,
    })
    .zarejestruj({
      nazwa: "reschedule_reminder",
      opis: "Przełóż przypomnienie",
      schematArgumentow: z.object({
        id: z.string(),
        czas: z.string().datetime(),
      }),
      ryzyko: "niskie",
      wykonaj: przeloz,
    });
  const agent = new AgentEcho({
    provider: new LokalnySemantycznyProviderEcho(),
    rejestr,
    wykonawca: utworzWykonawce(rejestr),
    pobierzCzas: () => ({
      teraz: "2026-08-31T10:00:00.000Z",
      dataLokalna: "2026-08-31",
      strefaCzasowa: "Europe/Warsaw",
    }),
  });
  return { agent, utworz, przeloz };
}

describe("Agent Echo", () => {
  it("udostępnia narzędzia przekrojowe bez omijania istniejących repozytoriów", () => {
    const nazwy = utworzDomyslnyRejestrNarzedziEcho()
      .definicje()
      .map((narzedzie) => narzedzie.nazwa);
    expect(nazwy).toEqual(
      expect.arrayContaining([
        "list_projects",
        "get_project",
        "create_project",
        "update_project",
        "list_inbox",
        "preview_process_inbox",
        "process_inbox",
        "preview_day_plan",
        "preview_replan_from_now",
        "explain_planning_conflict",
        "accept_plan_selection",
        "mark_habit_full",
        "mark_habit_minimum",
        "mark_habit_skipped",
        "list_shopping",
        "add_shopping_item",
        "create_shopping_list",
        "complete_shopping_item",
        "finance_period_summary",
        "create_transaction",
        "upcoming_bills",
        "budget_state",
        "list_subscriptions",
        "list_installments",
        "pay_bill",
        "vehicle_status",
        "add_refuel",
        "update_vehicle_mileage",
        "upcoming_vehicle_service",
        "vehicle_service_history",
        "add_vehicle_service",
        "vehicle_cost_summary",
        "search_knowledge",
        "get_note",
        "create_note",
        "list_later",
        "list_documents",
        "list_contacts",
        "list_expiry_dates",
        "list_places",
        "list_errands_by_place",
        "assess_mechanic_trip",
        "assess_purchase_affordability",
        "pharmacy_overview",
        "current_external_data",
      ]),
    );
  });

  it("lokalnie dodaje dwie pozycje zakupów i przypomnienie w jednej intencji", async () => {
    await Promise.all([
      baza.tabela("listyZakupow").clear(),
      baza.tabela("pozycjeZakupow").clear(),
      baza.tabela("przypomnienia").clear(),
    ]);
    await pobierzRepozytorium("listyZakupow").zapisz({
      ...utworzMetadane("lista-test"),
      nazwa: "Bieżące zakupy",
      aktywna: true,
    });
    const agent = new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(),
      pobierzCzas: () => ({
        teraz: "2026-08-31T10:00:00.000Z",
        dataLokalna: "2026-08-31",
        strefaCzasowa: "Europe/Warsaw",
      }),
    });

    const odpowiedz = await agent.obsluz(
      "Dodaj mleko i płyn do spryskiwaczy do zakupów i przypomnij mi o tym jutro.",
    );

    expect(odpowiedz.tekst).toContain("Dodałem mleko i płyn do spryskiwaczy");
    expect(
      (await pobierzRepozytorium("pozycjeZakupow").lista()).map((x) => x.nazwa),
    ).toEqual(expect.arrayContaining(["mleko", "płyn do spryskiwaczy"]));
    expect(
      (await pobierzRepozytorium("przypomnienia").lista())[0]?.czas,
    ).toContain("2026-09-01");
    expect(odpowiedz.wyniki).toHaveLength(4);
  });

  it.each([
    [
      "Czy dam radę jutro po pracy pojechać do mechanika?",
      "Na podstawie danych zapisanych w Ogarniaczu",
    ],
    [
      "Czy mogę wydać 500 zł na opony?",
      "Na podstawie danych zapisanych w Ogarniaczu",
    ],
    ["Mam jutro coś w aptece?", "Na podstawie danych zapisanych w Ogarniaczu"],
  ])(
    "odpowiada lokalnie na pytanie przekrojowe: %s",
    async (pytanie, fragment) => {
      const agent = new AgentEcho({
        provider: new LokalnySemantycznyProviderEcho(),
        pobierzCzas: () => ({
          teraz: "2026-08-31T10:00:00.000Z",
          dataLokalna: "2026-08-31",
          strefaCzasowa: "Europe/Warsaw",
        }),
      });
      expect((await agent.obsluz(pytanie)).tekst).toContain(fragment);
    },
  );

  it("podglądy Poczekalni i Planera nie zapisują danych przed akceptacją", async () => {
    await Promise.all([
      baza.tabela("zadania").clear(),
      baza.tabela("skrzynka").clear(),
      baza.tabela("blokiCzasu").clear(),
    ]);
    const zadanie = utworzZadanie({
      tytul: "Raport",
      opis: "",
      priorytet: "normalny",
      szacowanyCzasMin: 30,
    });
    await pobierzRepozytorium("zadania").zapisz(zadanie);
    const element = {
      ...utworzMetadane("inbox-test"),
      tresc: "Kupić mleko i zadzwonić do dentysty",
      status: "nowe" as const,
      zrodlo: "tekst" as const,
    };
    await pobierzRepozytorium("skrzynka").zapisz(element);
    const wykonawca = utworzWykonawce(utworzDomyslnyRejestrNarzedziEcho());
    const zadaniaPrzed = await pobierzRepozytorium("zadania").lista();

    const podgladPoczekalni = await wykonawca.wykonaj({
      id: "inbox-preview",
      nazwa: "preview_process_inbox",
      argumenty: { id: element.id },
    });
    const podgladPlanera = await wykonawca.wykonaj({
      id: "plan-preview",
      nazwa: "preview_day_plan",
      argumenty: { data: "2026-09-07" },
    });

    expect(podgladPoczekalni.status).toBe("wykonane");
    expect(podgladPlanera.status).toBe("wykonane");
    expect(await pobierzRepozytorium("zadania").lista()).toEqual(zadaniaPrzed);
    expect(await pobierzRepozytorium("blokiCzasu").lista()).toEqual([]);
  });

  it("realizuje model request -> tool call -> wynik -> odpowiedź", async () => {
    const wykonaj = vi.fn(async ({ dzien }: { dzien: string }) => [
      { id: "1", tytul: "Raport", termin: dzien },
    ]);
    const rejestr = new RejestrNarzedziEcho().zarejestruj({
      nazwa: "list_tasks",
      opis: "Lista zadań",
      schematArgumentow: z.object({ dzien: z.string() }),
      ryzyko: "niskie",
      wykonaj,
    });
    const provider = new ProviderSkryptowy([
      {
        typ: "narzedzia",
        wywolania: [
          { id: "w1", nazwa: "list_tasks", argumenty: { dzien: "2026-09-01" } },
        ],
      },
      { typ: "odpowiedz", tresc: "Jutro masz raport." },
    ]);
    const agent = new AgentEcho({
      provider,
      rejestr,
      wykonawca: utworzWykonawce(rejestr),
    });

    const odpowiedz = await agent.obsluz("Co mam jutro?");

    expect(odpowiedz.tekst).toBe("Jutro masz raport.");
    expect(wykonaj).toHaveBeenCalledWith({ dzien: "2026-09-01" });
    expect(
      provider.zadania[1]?.kontekstRozmowy.ostatnieWynikiNarzedzi[0]?.dane,
    ).toEqual([{ id: "1", tytul: "Raport", termin: "2026-09-01" }]);
  });

  it("wykonuje kilka narzędzi w jednej turze", async () => {
    const pierwsze = vi.fn(async () => ["zadanie"]);
    const drugie = vi.fn(async () => ["przypomnienie"]);
    const rejestr = new RejestrNarzedziEcho()
      .zarejestruj({
        nazwa: "list_tasks",
        opis: "Zadania",
        schematArgumentow: z.object({}),
        ryzyko: "niskie",
        wykonaj: pierwsze,
      })
      .zarejestruj({
        nazwa: "list_reminders",
        opis: "Przypomnienia",
        schematArgumentow: z.object({}),
        ryzyko: "niskie",
        wykonaj: drugie,
      });
    const provider = new ProviderSkryptowy([
      {
        typ: "narzedzia",
        wywolania: [
          { id: "w1", nazwa: "list_tasks", argumenty: {} },
          { id: "w2", nazwa: "list_reminders", argumenty: {} },
        ],
      },
      { typ: "odpowiedz", tresc: "Sprawdziłem oba źródła." },
    ]);
    const agent = new AgentEcho({
      provider,
      rejestr,
      wykonawca: utworzWykonawce(rejestr),
    });

    await agent.obsluz("Jak wygląda jutro?");

    expect(pierwsze).toHaveBeenCalledOnce();
    expect(drugie).toHaveBeenCalledOnce();
  });

  it("przekazuje follow-up razem z ograniczonym kontekstem wcześniejszych tur", async () => {
    const provider = new ProviderSkryptowy([
      { typ: "odpowiedz", tresc: "Plan na jutro." },
      { typ: "odpowiedz", tresc: "Plan na pojutrze." },
    ]);
    const agent = new AgentEcho({
      provider,
      rejestr: new RejestrNarzedziEcho(),
    });

    await agent.obsluz("Co mam jutro?");
    await agent.obsluz("A pojutrze?");

    expect(
      provider.zadania[1]?.kontekstRozmowy.tury.map((tura) => tura.tresc),
    ).toEqual(["Co mam jutro?", "Plan na jutro.", "A pojutrze?"]);
  });

  it("blokuje niepoprawne argumenty i nieistniejące narzędzie", async () => {
    const wykonaj = vi.fn(async () => "ok");
    const rejestr = new RejestrNarzedziEcho().zarejestruj({
      nazwa: "get_task",
      opis: "Zadanie",
      schematArgumentow: z.object({ id: z.string().min(1) }),
      ryzyko: "niskie",
      wykonaj,
    });
    const wykonawca = utworzWykonawce(rejestr);

    const zleArgumenty = await wykonawca.wykonaj({
      id: "w1",
      nazwa: "get_task",
      argumenty: {},
    });
    const obceNarzedzie = await wykonawca.wykonaj({
      id: "w2",
      nazwa: "run_sql",
      argumenty: { sql: "DELETE" },
    });

    expect(zleArgumenty.status).toBe("zablokowane");
    expect(obceNarzedzie.status).toBe("zablokowane");
    expect(wykonaj).not.toHaveBeenCalled();
  });

  it("wymaga potwierdzenia działania wysokiego ryzyka", async () => {
    const wykonaj = vi.fn(async () => ({ usunieto: true }));
    const rejestr = new RejestrNarzedziEcho().zarejestruj({
      nazwa: "delete_important",
      opis: "Usunięcie ważnych danych",
      schematArgumentow: z.object({ id: z.string() }),
      ryzyko: "wysokie",
      wykonaj,
    });
    const provider = new ProviderSkryptowy([
      {
        typ: "narzedzia",
        wywolania: [
          { id: "w1", nazwa: "delete_important", argumenty: { id: "1" } },
        ],
      },
      { typ: "odpowiedz", tresc: "Usunąłem wskazany element." },
    ]);
    const agent = new AgentEcho({
      provider,
      rejestr,
      wykonawca: utworzWykonawce(rejestr),
    });

    const przed = await agent.obsluz("Usuń to");
    expect(przed.wymagaPotwierdzenia).toBe(true);
    expect(wykonaj).not.toHaveBeenCalled();

    const po = await agent.potwierdz(przed.akcjaDoPotwierdzenia!);
    expect(wykonaj).toHaveBeenCalledOnce();
    expect(po.tekst).toBe("Usunąłem wskazany element.");
  });

  it("kończy bezpiecznie po błędzie, timeoutcie i limicie kroków", async () => {
    const providerBledu: ProviderModeluEcho = {
      nazwa: "blad",
      tryb: "pelny_agent",
      odpowiedz: async () => {
        throw new Error("awaria");
      },
    };
    const providerTimeoutu: ProviderModeluEcho = {
      nazwa: "timeout",
      tryb: "pelny_agent",
      odpowiedz: async () => new Promise(() => undefined),
    };
    const providerPetli: ProviderModeluEcho = {
      nazwa: "petla",
      tryb: "pelny_agent",
      odpowiedz: async () => ({ typ: "narzedzia", wywolania: [] }),
    };

    expect(
      (await new AgentEcho({ provider: providerBledu }).obsluz("Test")).tekst,
    ).toContain("nie zostały zmienione");
    expect(
      (
        await new AgentEcho({
          provider: providerTimeoutu,
          limitCzasuMs: 5,
        }).obsluz("Test")
      ).tekst,
    ).toContain("Przerwałem");
    expect(
      (
        await new AgentEcho({ provider: providerPetli, limitKrokow: 2 }).obsluz(
          "Test",
        )
      ).tekst,
    ).toContain("zbyt wielu kroków");
  });

  it("przekazuje brak danych do modelu zamiast uzupełniać wynik", async () => {
    const rejestr = new RejestrNarzedziEcho().zarejestruj({
      nazwa: "get_task",
      opis: "Zadanie",
      schematArgumentow: z.object({ id: z.string() }),
      ryzyko: "niskie",
      wykonaj: async () => null,
    });
    const provider = new ProviderSkryptowy([
      {
        typ: "narzedzia",
        wywolania: [{ id: "w1", nazwa: "get_task", argumenty: { id: "brak" } }],
      },
      { typ: "odpowiedz", tresc: "Nie mam zapisanej takiej informacji." },
    ]);
    const agent = new AgentEcho({
      provider,
      rejestr,
      wykonawca: utworzWykonawce(rejestr),
    });

    const odpowiedz = await agent.obsluz("Pokaż zadanie");

    expect(
      provider.zadania[1]?.kontekstRozmowy.ostatnieWynikiNarzedzi[0]?.dane,
    ).toBeNull();
    expect(odpowiedz.tekst).toBe("Nie mam zapisanej takiej informacji.");
  });

  it("prowadzi tekst i transkrypcję STT przez ten sam agent i kontekst", async () => {
    const provider = new ProviderSkryptowy([
      { typ: "odpowiedz", tresc: "Pierwsza odpowiedź." },
      { typ: "odpowiedz", tresc: "Druga odpowiedź." },
    ]);
    const agent = new AgentEcho({
      provider,
      rejestr: new RejestrNarzedziEcho(),
    });

    await agent.obsluz("Wiadomość tekstowa", "tekst");
    await agent.obsluz("Dalsza wypowiedź", "stt");

    expect(
      provider.zadania[1]?.kontekstRozmowy.tury.map((tura) => tura.tresc),
    ).toContain("Wiadomość tekstowa");
    expect(
      provider.zadania[1]?.kontekstRozmowy.tury.map((tura) => tura.tresc),
    ).toContain("Dalsza wypowiedź");
  });

  it.each([
    "Przypomnij mi jutro rano zadzwonić do mechanika.",
    "Ej, jutro rano muszę zadzwonić do mechanika, przypomnij mi.",
    "Dopisz mi na jutro rano telefon do mechanika.",
  ])(
    "interpretuje naturalne utworzenie przypomnienia: %s",
    async (wypowiedz) => {
      const utworz = vi.fn(
        async ({ tytul, czas }: { tytul: string; czas: string }) => ({
          id: "przypomnienie-1",
          tytul,
          czas,
        }),
      );
      const rejestr = new RejestrNarzedziEcho().zarejestruj({
        nazwa: "create_reminder",
        opis: "Utwórz przypomnienie",
        schematArgumentow: z.object({
          tytul: z.string(),
          czas: z.string().datetime(),
        }),
        ryzyko: "niskie",
        wykonaj: utworz,
      });
      const agent = new AgentEcho({
        provider: new LokalnySemantycznyProviderEcho(),
        rejestr,
        wykonawca: utworzWykonawce(rejestr),
        pobierzCzas: () => ({
          teraz: "2026-08-31T10:00:00.000Z",
          dataLokalna: "2026-08-31",
          strefaCzasowa: "Europe/Warsaw",
        }),
      });

      const odpowiedz = await agent.obsluz(wypowiedz);

      expect(utworz).toHaveBeenCalledOnce();
      const argumenty = utworz.mock.calls[0][0];
      expect(argumenty.tytul.toLocaleLowerCase("pl-PL")).toContain("mechanika");
      expect(new Date(argumenty.czas).getFullYear()).toBe(2026);
      expect(new Date(argumenty.czas).getMonth()).toBe(8);
      expect(new Date(argumenty.czas).getDate()).toBe(1);
      expect(new Date(argumenty.czas).getHours()).toBe(8);
      expect(odpowiedz.tekst).toMatch(/^Jasne, dodałem/);
    },
  );

  it("przekłada poprzednio utworzone przypomnienie wskazane przez „to”", async () => {
    await baza.tabela("przypomnienia").clear();
    await baza.tabela("dziennikEcho").clear();
    const agent = new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(),
      pobierzCzas: () => ({
        teraz: "2026-08-31T10:00:00.000Z",
        dataLokalna: "2026-08-31",
        strefaCzasowa: "Europe/Warsaw",
      }),
    });

    await agent.obsluz("Przypomnij mi jutro rano zadzwonić do mechanika.");
    const odpowiedz = await agent.obsluz("Jednak przełóż to na czwartek.");

    const zapisane = await pobierzRepozytorium("przypomnienia").lista();
    expect(zapisane).toHaveLength(1);
    expect(zapisane[0].tytul).toBe("Zadzwonić do mechanika");
    expect(new Date(zapisane[0].czas!).getMonth()).toBe(8);
    expect(new Date(zapisane[0].czas!).getDate()).toBe(3);
    expect(new Date(zapisane[0].czas!).getHours()).toBe(8);
    expect(odpowiedz.tekst).toMatch(/^Jasne, przełożyłem/);
  });

  it("zbiera dwie brakujące informacje pojedynczymi pytaniami w jednej intencji", async () => {
    const { agent, utworz } = utworzAgentaRozmowy();

    const pierwsza = await agent.obsluz("Dodaj przypomnienie.");
    expect(pierwsza.tekst).toBe(
      "Potrzebuję jeszcze dwóch informacji. Czego mam Ci przypomnieć?",
    );
    expect(
      agent.kontekst.migawka().oczekujaceDoprecyzowanie?.brakujacePola,
    ).toEqual(["tytul", "data"]);

    const druga = await agent.obsluz("Telefon do mechanika.");
    expect(druga.tekst).toBe("Na kiedy mam ustawić przypomnienie?");
    expect(
      agent.kontekst.migawka().oczekujaceDoprecyzowanie?.zebrane.tytul,
    ).toBe("Telefon do mechanika");

    const trzecia = await agent.obsluz("Jutro rano.");
    expect(trzecia.tekst).toMatch(/^Jasne, dodałem/);
    expect(utworz).toHaveBeenCalledOnce();
    expect(agent.kontekst.migawka().oczekujaceDoprecyzowanie).toBeUndefined();
    expect(agent.kontekst.migawka().tury).toHaveLength(6);
  });

  it("wybiera ostatnią korektę czasu z tej samej wypowiedzi", async () => {
    const { agent, utworz } = utworzAgentaRozmowy();

    await agent.obsluz(
      "Dodaj to na jutro rano… nie, czekaj, na czwartek: telefon do mechanika.",
    );

    const czas = new Date(utworz.mock.calls[0][0].czas);
    expect(czas.getMonth()).toBe(8);
    expect(czas.getDate()).toBe(3);
    expect(utworz.mock.calls[0][0].tytul).toBe("Telefon do mechanika");
  });

  it("rozumie „godzinę później” i przywraca poprzedni termin korektą", async () => {
    const { agent, przeloz } = utworzAgentaRozmowy();
    await agent.obsluz("Dodaj mi jutro rano telefon do mechanika.");
    await agent.obsluz("Właściwie przełóż to na czwartek.");
    await agent.obsluz("Godzinę później.");

    expect(new Date(przeloz.mock.calls[1][0].czas).getHours()).toBe(9);
    const odpowiedz = await agent.obsluz("Nie, ten poprzedni.");
    expect(new Date(przeloz.mock.calls[2][0].czas).getHours()).toBe(8);
    expect(odpowiedz.tekst).toContain("przywróciłem poprzedni termin");
  });

  it("dopytuje o encję i rozumie odpowiedź „ten poprzedni”", async () => {
    const { agent, przeloz } = utworzAgentaRozmowy();
    await agent.obsluz("Dodaj jutro o 8 telefon do mechanika.");
    await agent.obsluz("Dodaj jutro o 9 odebrać paczkę.");

    const pytanie = await agent.obsluz("Przełóż na piątek.");
    expect(pytanie.tekst).toBe("Którego przypomnienia dotyczy zmiana?");
    expect(przeloz).not.toHaveBeenCalled();

    await agent.obsluz("Nie, ten poprzedni.");
    expect(przeloz).toHaveBeenCalledOnce();
    expect(przeloz.mock.calls[0][0].id).toBe("przypomnienie-1");
  });

  it("ujawnia automatyczną godzinę i pozwala zmienić ją kolejną wypowiedzią", async () => {
    const { agent, przeloz } = utworzAgentaRozmowy();
    const utworzenie = await agent.obsluz("Dodaj jutro telefon do mechanika.");

    expect(utworzenie.wartosciDomyslne).toEqual([
      { pole: "godzina", wartosc: "08:00", opis: "brak podanej godziny" },
    ]);
    const zmiana = await agent.obsluz("Zmień godzinę na 9.");
    expect(new Date(przeloz.mock.calls[0][0].czas).getHours()).toBe(9);
    expect(zmiana.wartosciDomyslne).toEqual([]);
  });

  it("przyjmuje potoczną korektę ostatniego przypomnienia bez ponownego wskazywania go", async () => {
    const { agent, przeloz } = utworzAgentaRozmowy();
    await agent.obsluz("Przypomnij mi jutro po pracy kupić karmę.");

    const odpowiedz = await agent.obsluz("A właściwie zrób to o 18.");

    expect(new Date(przeloz.mock.calls[0][0].czas).getHours()).toBe(18);
    expect(odpowiedz.tekst).toMatch(/^Jasne, przełożyłem/);
  });

  it("czyta, wyszukuje, przekłada i usuwa pojedyncze zadanie przez domain tools", async () => {
    await baza.tabela("zadania").clear();
    await baza.tabela("dziennikEcho").clear();
    const repozytorium = pobierzRepozytorium("zadania");
    const mechanik = utworzZadanie({
      tytul: "Telefon do mechanika",
      opis: "",
      termin: "2026-09-01",
    });
    const zakupy = utworzZadanie({
      tytul: "Zrobić zakupy",
      opis: "",
      termin: "2026-09-01",
    });
    await repozytorium.zapisz(mechanik);
    await repozytorium.zapisz(zakupy);
    const agent = new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(),
      pobierzCzas: () => ({
        teraz: "2026-08-31T10:00:00.000Z",
        dataLokalna: "2026-08-31",
        strefaCzasowa: "Europe/Warsaw",
      }),
    });

    const odczyt = await agent.obsluz("Co mam jutro?");
    expect(odczyt.tekst).toContain("Telefon do mechanika");
    expect(odczyt.tekst).toContain("Zrobić zakupy");

    const wyszukiwanie = await agent.obsluz(
      "Znajdź mi to zadanie o mechaniku.",
    );
    expect(wyszukiwanie.tekst).toBe("Znalazłem „Telefon do mechanika”.");

    const edycja = await agent.obsluz("Przenieś mechanika na piątek.");
    expect(edycja.tekst).toMatch(/^Gotowe\. Przeniosłem/);
    expect((await repozytorium.pobierz(mechanik.id))?.termin).toBe(
      "2026-09-04",
    );

    const usuniecie = await agent.obsluz("Usuń to zadanie.");
    expect(usuniecie.wymagaPotwierdzenia).not.toBe(true);
    expect(usuniecie.tekst).toMatch(/^Gotowe\. Usunąłem/);
    expect(await repozytorium.pobierz(mechanik.id)).toBeUndefined();
  });

  it("wymaga potwierdzenia przed masowym usunięciem z tygodnia", async () => {
    await baza.tabela("zadania").clear();
    await baza.tabela("dziennikEcho").clear();
    const repozytorium = pobierzRepozytorium("zadania");
    const zadanie = utworzZadanie({
      tytul: "Raport tygodniowy",
      opis: "",
      termin: "2026-09-02",
    });
    await repozytorium.zapisz(zadanie);
    const agent = new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(),
      pobierzCzas: () => ({
        teraz: "2026-09-02T10:00:00.000Z",
        dataLokalna: "2026-09-02",
        strefaCzasowa: "Europe/Warsaw",
      }),
    });

    const przed = await agent.obsluz("Usuń wszystkie zadania z tego tygodnia.");
    expect(przed.wymagaPotwierdzenia).toBe(true);
    expect(await repozytorium.pobierz(zadanie.id)).toBeDefined();

    const po = await agent.potwierdz(przed.akcjaDoPotwierdzenia!);
    expect(po.tekst).toBe("Gotowe. Usunąłem zadania z tego tygodnia.");
    expect(await repozytorium.pobierz(zadanie.id)).toBeUndefined();
  });

  it("prowadzi wizytę przez jedno doprecyzowanie, narzędzie i korektę kontekstową", async () => {
    await baza.tabela("wizyty").clear();
    const agent = new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(),
      rejestr: utworzDomyslnyRejestrNarzedziEcho(),
      pobierzCzas: () => ({
        teraz: "2026-08-31T10:00:00.000Z",
        dataLokalna: "2026-08-31",
        strefaCzasowa: "Europe/Warsaw",
      }),
    });
    expect((await agent.obsluz("Umów dermatologa.")).tekst).toBe("Na kiedy?");
    expect((await agent.obsluz("Jutro.")).tekst).toBe("O której?");
    await agent.obsluz("O 16.");
    expect((await pobierzRepozytorium("wizyty").lista())[0]).toMatchObject({
      nazwa: "dermatologa",
      data: "2026-09-01",
      godzina: "16:00",
    });
    await agent.obsluz("Przełóż tę wizytę na czwartek.");
    await agent.obsluz("Jednak o 15.");
    expect((await pobierzRepozytorium("wizyty").lista())[0]).toMatchObject({
      data: "2026-09-03",
      godzina: "15:00",
    });
  });

  it("obsługuje potoczne dodawanie danych zdrowia oraz referencje recepty i terapii", async () => {
    await Promise.all([
      baza.tabela("wizyty").clear(),
      baza.tabela("skierowania").clear(),
      baza.tabela("recepty").clear(),
      baza.tabela("terapie").clear(),
      baza.tabela("wpisyTerapii").clear(),
    ]);
    const agent = new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(),
      rejestr: utworzDomyslnyRejestrNarzedziEcho(),
      pobierzCzas: () => ({
        teraz: "2026-08-31T10:00:00.000Z",
        dataLokalna: "2026-08-31",
        strefaCzasowa: "Europe/Warsaw",
      }),
    });

    await agent.obsluz("Dodaj mi dentystę w przyszły wtorek o 16.");
    expect((await pobierzRepozytorium("wizyty").lista())[0]).toMatchObject({
      nazwa: "dentystę",
      data: "2026-09-01",
      godzina: "16:00",
    });

    await agent.obsluz("Mam skierowanie na RTG kolana.");
    expect((await pobierzRepozytorium("skierowania").lista())[0]).toMatchObject(
      { cel: "RTG kolana" },
    );

    await agent.obsluz("Dodaj receptę, kod 1234.");
    await agent.obsluz("Dodaj do niej Ibuprofen.");
    await agent.obsluz("Ten pierwszy lek już wykupiłem.");
    expect((await pobierzRepozytorium("recepty").lista())[0]).toMatchObject({
      kod: "1234",
      status: "zrealizowana",
      pozycje: [{ nazwaLeku: "Ibuprofen", iloscZrealizowana: 1 }],
    });

    await agent.obsluz("Dodaj rehabilitację kolana.");
    await agent.obsluz(
      "Zapisz w rehabilitacji kolana, że dzisiaj było lepiej.",
    );
    expect(
      (await pobierzRepozytorium("wpisyTerapii").lista())[0],
    ).toMatchObject({ tresc: "dzisiaj było lepiej" });
  });
  it("tworzy zadanie po pracy i oznacza je jako wykonane przez kontekst", async () => {
    await baza.tabela("zadania").clear();
    const agent = new AgentEcho({
      provider: new LokalnySemantycznyProviderEcho(),
      pobierzCzas: () => ({
        teraz: "2026-08-31T10:00:00.000Z",
        dataLokalna: "2026-08-31",
        strefaCzasowa: "Europe/Warsaw",
      }),
    });

    const utworzenie = await agent.obsluz(
      "Dodaj mi na jutro po pracy kupić płyn do spryskiwaczy.",
    );
    const zadanie = (await pobierzRepozytorium("zadania").lista())[0];
    expect(utworzenie.tekst).toMatch(/^Gotowe\. Dodałem zadanie/);
    expect(zadanie).toMatchObject({
      termin: "2026-09-01",
      godzinaElementu: "17:00",
    });

    const wykonanie = await agent.obsluz("Oznacz to jako wykonane.");
    expect(wykonanie.tekst).toMatch(/^Gotowe\. Oznaczyłem/);
    expect(
      (await pobierzRepozytorium("zadania").pobierz(zadanie.id))?.status,
    ).toBe("wykonane");
  });
});
