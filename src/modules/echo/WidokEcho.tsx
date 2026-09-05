import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bot,
  Mic,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Volume2,
} from "lucide-react";
import {
  Karta,
  ModalPotwierdzenia,
  NaglowekWidoku,
  Znacznik,
} from "../../components/Interfejs";
import { useRepozytorium } from "../../hooks/useRepozytorium";
import { EchoService } from "../../services/EchoService";
import {
  KontrolerSesjiGlosowejEcho,
  type StanSesjiGlosowejEcho,
} from "../../services/echo/KontrolerSesjiGlosowejEcho";
import type {
  AkcjaDoPotwierdzeniaEcho,
  TrybEcho,
  WartoscDomyslnaEcho,
  ZrodloWejsciaEcho,
} from "../../services/echo/typyEcho";
import { platforma } from "../../platform/platforma";
import { Link } from "react-router-dom";
import type { WynikNarzedziaEcho } from "../../services/echo/typyEcho";
import { useAplikacja } from "../../app/KontekstAplikacji";
import {
  utworzDomyslnyRejestrNarzedziEcho,
  WykonawcaNarzedziEcho,
} from "../../services/echo/NarzedziaEcho";
import type { NazwaModulu } from "../../domain/typy";

interface Wiadomosc {
  id: string;
  autor: "uzytkownik" | "echo";
  tresc: string;
  ryzyko?: "niskie" | "umiarkowane" | "wysokie";
  wartosciDomyslne?: WartoscDomyslnaEcho[];
  wyniki?: WynikNarzedziaEcho[];
}

function elementyWyniku(
  wynik: WynikNarzedziaEcho,
): {
  id?: string;
  tytul: string;
  typ?: string;
  termin?: string;
  kwota?: number;
}[] {
  if (wynik.status !== "wykonane")
    return [{ tytul: wynik.komunikat ?? "Działanie nie zostało wykonane" }];
  const dane = Array.isArray(wynik.dane)
    ? wynik.dane
    : wynik.dane &&
        typeof wynik.dane === "object" &&
        Array.isArray((wynik.dane as { pozycje?: unknown }).pozycje)
      ? (wynik.dane as { pozycje: unknown[] }).pozycje
      : [wynik.dane];
  return dane
    .filter((x): x is Record<string, unknown> =>
      Boolean(x && typeof x === "object"),
    )
    .slice(0, 8)
    .map((x) => ({
      id: typeof x.id === "string" ? x.id : undefined,
      tytul: String(x.tytul ?? x.nazwa ?? wynik.nazwa),
      typ: typeof x.typ === "string" ? x.typ : undefined,
      termin:
        typeof x.termin === "string"
          ? x.termin
          : typeof x.data === "string"
            ? x.data
            : undefined,
      kwota: typeof x.kwota === "number" ? x.kwota : undefined,
    }));
}

function adresWyniku(element: {
  id?: string;
  typ?: string;
}): string | undefined {
  if (!element.id) return undefined;
  const sciezki: Record<string, string> = {
    zadanie: "/zadania",
    projekt: "/projekty",
    przypomnienie: "/przypomnienia",
    zakupy: "/zakupy",
    rachunek: "/rachunki",
    samochod: "/samochod",
    notatka: "/notatki",
    lek: "/zdrowie/leki",
    wizyta: "/zdrowie/wizyty",
    dokument: "/dokumenty",
  };
  const sciezka = element.typ ? sciezki[element.typ] : undefined;
  return sciezka ? `${sciezka}?element=${element.id}` : undefined;
}

function modulNarzedzia(nazwa: string): NazwaModulu | undefined {
  if (nazwa.includes("project")) return "projekty";
  if (nazwa.includes("inbox") || nazwa.includes("waiting")) return "skrzynka";
  if (nazwa.includes("plan")) return "planer";
  if (nazwa.includes("habit")) return "nawyki";
  if (nazwa.includes("shopping")) return "zakupy";
  if (/finance|transaction|bill|budget|subscription|installment/.test(nazwa)) return "finanse";
  if (/vehicle|refuel/.test(nazwa)) return "samochod";
  if (nazwa.includes("note") || nazwa.includes("knowledge")) return "notatki";
  if (nazwa.includes("later")) return "na_pozniej";
  if (nazwa.includes("document")) return "dokumenty";
  if (nazwa.includes("contact")) return "kontakty";
  if (nazwa.includes("expiry")) return "terminy";
  if (nazwa.includes("place") || nazwa.includes("errand")) return "miasto";
  if (nazwa.includes("reminder")) return "przypomnienia";
  if (nazwa.includes("task")) return "zadania";
  if (nazwa.includes("medication")) return "leki";
  if (/health|appointment|referral|prescription|therapy/.test(nazwa)) return "zdrowie";
  return undefined;
}

export function WidokEcho() {
  const [stan, ustawStan] = useState<StanSesjiGlosowejEcho>("bezczynny");
  const { ustawienia } = useAplikacja();
  const echo = useMemo(() => {
    const rejestr = utworzDomyslnyRejestrNarzedziEcho();
    const wykonawca = new WykonawcaNarzedziEcho(
      rejestr,
      undefined,
      undefined,
      (nazwa) => {
        if (nazwa === "current_external_data") return ustawienia.internetEcho;
        const modul = modulNarzedzia(nazwa);
        return !modul || ustawienia.modulyEcho.includes(modul);
      },
    );
    return new EchoService({ rejestr, wykonawca });
  }, [ustawienia.internetEcho, ustawienia.modulyEcho]);
  const [tekst, ustawTekst] = useState("");
  const [tryb, ustawTryb] = useState<TrybEcho>(echo.agent.provider.tryb);
  const [wiadomosci, ustawWiadomosci] = useState<Wiadomosc[]>([
    {
      id: "powitanie",
      autor: "echo",
      tresc:
        "Napisz albo powiedz, co masz na głowie. Z Echo możesz rozmawiać normalnie.",
    },
  ]);
  const [oczekujacaAkcja, ustawOczekujacaAkcje] =
    useState<AkcjaDoPotwierdzeniaEcho>();
  const [bladGlosu, ustawBladGlosu] = useState("");
  const [wysylanie, ustawWysylanie] = useState(false);
  const koniecRozmowy = useRef<HTMLDivElement>(null);
  const ostatnioOdczytana = useRef<string | undefined>(undefined);
  const { dane: dziennik } = useRepozytorium("dziennikEcho");

  useEffect(() => {
    koniecRozmowy.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [wiadomosci]);

  const dodajOdpowiedz = (
    odpowiedz: Awaited<ReturnType<EchoService["obsluz"]>>,
  ) => {
    ustawTryb(odpowiedz.tryb);
    ustawWiadomosci((obecne) => [
      ...obecne,
      {
        id: crypto.randomUUID(),
        autor: "echo",
        tresc: odpowiedz.tekst,
        ryzyko: odpowiedz.ryzyko,
        wartosciDomyslne: odpowiedz.wartosciDomyslne,
        wyniki: odpowiedz.wyniki,
      },
    ]);
    ustawOczekujacaAkcje(odpowiedz.akcjaDoPotwierdzenia);
  };

  const kontrolerGlosu = useMemo(
    () =>
      new KontrolerSesjiGlosowejEcho({
        glos: platforma.glosEcho,
        echo,
        cyklZycia: platforma.cyklZycia,
        obsluga: {
          zmienStan: ustawStan,
          zglosBlad: ustawBladGlosu,
          odebranoWypowiedz: (wypowiedz) =>
            ustawWiadomosci((obecne) => [
              ...obecne,
              {
                id: crypto.randomUUID(),
                autor: "uzytkownik",
                tresc: wypowiedz,
              },
            ]),
          odebranoOdpowiedz: dodajOdpowiedz,
        },
      }),
    [echo],
  );

  useEffect(() => {
    void kontrolerGlosu.inicjalizuj();
    return () => {
      void kontrolerGlosu.zniszcz();
    };
  }, [kontrolerGlosu]);

  const wyslij = async (
    wypowiedz: string,
    zrodlo: ZrodloWejsciaEcho = "tekst",
  ) => {
    if (!wypowiedz.trim() || wysylanie) return;
    ustawWiadomosci((obecne) => [
      ...obecne,
      { id: crypto.randomUUID(), autor: "uzytkownik", tresc: wypowiedz },
    ]);
    ustawTekst("");
    ustawWysylanie(true);
    try {
      dodajOdpowiedz(await echo.obsluz(wypowiedz, zrodlo));
    } finally {
      ustawWysylanie(false);
    }
  };

  const rozpocznijGlos = () => {
    void (stan === "mowienie"
      ? kontrolerGlosu.przerwijIMow()
      : kontrolerGlosu.rozpocznij());
  };

  const przeczytaj = async (tresc: string) => {
    await kontrolerGlosu.anuluj();
    ustawBladGlosu("");
    ustawStan("mowienie");
    try {
      await platforma.glosEcho.mow(tresc);
      ustawStan("bezczynny");
    } catch (blad) {
      ustawStan("blad");
      ustawBladGlosu(
        blad instanceof Error
          ? blad.message
          : "Nie udało się odczytać odpowiedzi.",
      );
    }
  };

  useEffect(() => {
    const ostatnia = wiadomosci.at(-1);
    if (
      ustawienia.automatycznyOdczytEcho &&
      ostatnia?.autor === "echo" &&
      ostatnia.id !== "powitanie" &&
      ostatnioOdczytana.current !== ostatnia.id
    ) {
      ostatnioOdczytana.current = ostatnia.id;
      void przeczytaj(ostatnia.tresc);
    }
  }, [ustawienia.automatycznyOdczytEcho, wiadomosci]);

  const potwierdz = async () => {
    if (!oczekujacaAkcja) return;
    const akcja = oczekujacaAkcja;
    ustawOczekujacaAkcje(undefined);
    dodajOdpowiedz(await echo.potwierdz(akcja));
  };

  const anulujPotwierdzenie = () => {
    echo.anulujPotwierdzenie();
    ustawOczekujacaAkcje(undefined);
  };

  const sugestie = [
    "Co mam jeszcze dzisiaj do zrobienia?",
    "Przypomnij mi jutro po pracy o zakupach.",
    "Czy dam radę wcisnąć jutro mechanika?",
    "Przełóż te mniej ważne rzeczy na weekend.",
    "Kiedy ostatnio byłem u dentysty?",
    "Mam w tym miesiącu jakieś większe wydatki?",
  ];

  const etykietyStanu: Record<StanSesjiGlosowejEcho, string> = {
    bezczynny: "Gotowy",
    sluchanie: "Słucham…",
    transkrypcja: "Rozpoznaję…",
    myslenie: "Myślę…",
    mowienie: "Mówię… Dotknij mikrofonu, aby mi przerwać.",
    oczekiwanie: "Czekam na dalszą wypowiedź…",
    blad: "Błąd rozmowy głosowej",
  };
  const sesjaAktywna = !["bezczynny", "blad"].includes(stan);

  return (
    <div className="widok widok-echo">
      <NaglowekWidoku
        tytul="Echo"
        opis="Napisz albo powiedz, co masz na głowie. Z Echo możesz rozmawiać normalnie."
      />
      <section className="siatka-echo">
        <Karta klasa="panel-rozmowy">
          <div className={`stan-glosu stan-glosu--${stan}`} aria-live="polite">
            {wysylanie ? "Układam odpowiedź…" : etykietyStanu[stan]}
          </div>
          <div
            className="wiadomosci"
            role="log"
            aria-live="polite"
            aria-label="Rozmowa z Echo"
          >
            {wiadomosci.map((wiadomosc) => (
              <article
                className={`wiadomosc wiadomosc--${wiadomosc.autor}`}
                key={wiadomosc.id}
              >
                {wiadomosc.autor === "echo" && <Bot aria-hidden="true" />}
                <div>
                  <small className="wiadomosc__autor">
                    {wiadomosc.autor === "echo" ? "Echo" : "Ty"}
                  </small>
                  <p>{wiadomosc.tresc}</p>
                  {wiadomosc.wyniki
                    ?.flatMap(elementyWyniku)
                    .map((element, indeks) => {
                      const adres = adresWyniku(element);
                      return (
                        <div
                          className="wartosc-domyslna"
                          key={`${element.id ?? element.tytul}-${indeks}`}
                        >
                          <Znacznik wariant="sukces">✓</Znacznik>
                          <strong>{element.tytul}</strong>
                          {element.typ && <span> · {element.typ}</span>}
                          {element.termin && <span> · {element.termin}</span>}
                          {element.kwota !== undefined && (
                            <span> · {element.kwota.toFixed(2)} zł</span>
                          )}
                          {adres && (
                            <Link
                              className="przycisk przycisk--maly"
                              to={adres}
                            >
                              Otwórz
                            </Link>
                          )}
                          <button
                            type="button"
                            className="przycisk przycisk--tekstowy"
                            onClick={() =>
                              ustawTekst(`Popraw ${element.tytul}: `)
                            }
                          >
                            Popraw
                          </button>
                        </div>
                      );
                    })}
                  {wiadomosc.wartosciDomyslne?.map((wartosc) => (
                    <div
                      className="wartosc-domyslna"
                      key={`${wartosc.pole}-${wartosc.wartosc}`}
                    >
                      <Znacznik wariant="informacja">
                        przyjęto automatycznie
                      </Znacznik>{" "}
                      {wartosc.opis}: <strong>{wartosc.wartosc}</strong>{" "}
                      <button
                        type="button"
                        className="przycisk przycisk--maly"
                        onClick={() =>
                          ustawTekst("A właściwie ustaw godzinę na ")
                        }
                      >
                        Popraw
                      </button>
                    </div>
                  ))}
                  {wiadomosc.ryzyko && wiadomosc.ryzyko !== "niskie" && (
                    <Znacznik
                      wariant={
                        wiadomosc.ryzyko === "wysokie" ? "blad" : "ostrzezenie"
                      }
                    >
                      wymaga uwagi
                    </Znacznik>
                  )}
                  {wiadomosc.autor === "echo" && ustawienia.glosEcho && (
                    <button
                      type="button"
                      className="przycisk-ikona"
                      title="Odczytaj odpowiedź"
                      onClick={() => void przeczytaj(wiadomosc.tresc)}
                    >
                      <Volume2 aria-hidden="true" />
                    </button>
                  )}
                </div>
              </article>
            ))}
            {wysylanie && (
              <article className="wiadomosc wiadomosc--echo wiadomosc--oczekiwanie">
                <Bot aria-hidden="true" />
                <div>
                  <small className="wiadomosc__autor">Echo</small>
                  <p>Chwila, sprawdzam kontekst rozmowy…</p>
                </div>
              </article>
            )}
            <div ref={koniecRozmowy} />
          </div>
          {bladGlosu && <p className="tekst-bledu">{bladGlosu}</p>}
          <form
            className="formularz-echo"
            onSubmit={(zdarzenie: FormEvent) => {
              zdarzenie.preventDefault();
              void wyslij(tekst);
            }}
          >
            {ustawienia.glosEcho && <button
              type="button"
              className="przycisk-ikona"
              title={
                stan === "mowienie" ? "Przerwij Echo i mów" : "Powiedz do Echo"
              }
              onClick={rozpocznijGlos}
            >
              <Mic aria-hidden="true" />
            </button>}
            <input
              value={tekst}
              onChange={(zdarzenie) => ustawTekst(zdarzenie.target.value)}
              placeholder="Co masz na głowie? Możesz też poprawić poprzednią odpowiedź."
              disabled={wysylanie}
            />
            <button
              type="submit"
              className="przycisk przycisk--glowny"
              disabled={wysylanie}
            >
              <Send aria-hidden="true" />
              Wyślij
            </button>
          </form>
          <div className="akcje-glosu">
            {!wysylanie && wiadomosci.length > 1 && (
              <button
                type="button"
                className="przycisk przycisk--tekstowy"
                onClick={() => ustawTekst("A właściwie ")}
              >
                Popraw poprzednią interpretację
              </button>
            )}
            {sesjaAktywna && (
              <button
                type="button"
                className="przycisk przycisk--drugorzedny"
                onClick={() => void kontrolerGlosu.anuluj()}
              >
                <Square aria-hidden="true" />
                Anuluj rozmowę
              </button>
            )}
            {stan === "blad" && (
              <button
                type="button"
                className="przycisk przycisk--drugorzedny"
                onClick={() => void kontrolerGlosu.ponow()}
              >
                <RotateCcw aria-hidden="true" />
                Spróbuj ponownie
              </button>
            )}
          </div>
        </Karta>
        <aside className="kolumna-echo">
          <Karta>
            <h2>Tryb rozmowy</h2>
            <Znacznik
              wariant={tryb === "pelny_agent" ? "sukces" : "ostrzezenie"}
            >
              {tryb === "pelny_agent" ? "Pełny agent" : "Tryb lokalny"}
            </Znacznik>
            {tryb === "ograniczony_lokalny" && (
              <p className="tekst-pomocniczy">
                Echo lokalnie obsługuje teraz naturalne dodawanie przypomnień i
                ich kontekstowe przekładanie.
              </p>
            )}
          </Karta>
          <Karta>
            <h2>Możesz powiedzieć na przykład</h2>
            <div className="sugestie-echo">
              {sugestie.map((sugestia) => (
                <button
                  type="button"
                  onClick={() => ustawTekst(sugestia)}
                  key={sugestia}
                >
                  {sugestia}
                </button>
              ))}
            </div>
          </Karta>
          <Karta>
            <h2>
              <ShieldCheck aria-hidden="true" /> Kontrola działań
            </h2>
            <p>
              Echo może proponować zmiany. Działania o podwyższonym ryzyku
              wykona dopiero po Twoim potwierdzeniu.
            </p>
          </Karta>
          <Karta>
            <h2>Ostatnie działania</h2>
            {dziennik.length === 0 ? (
              <p className="tekst-pomocniczy">
                Echo nie wykonało jeszcze żadnych działań.
              </p>
            ) : (
              dziennik.slice(0, 6).map((wpis) => (
                <div className="wpis-audytu" key={wpis.id}>
                  <strong>{wpis.opis}</strong>
                  <small>
                    {new Date(wpis.createdAt).toLocaleString("pl-PL")} ·{" "}
                    {wpis.wynik}
                  </small>
                </div>
              ))
            )}
          </Karta>
        </aside>
      </section>
      {oczekujacaAkcja && (
        <ModalPotwierdzenia
          tytul="Potwierdź działanie Echo"
          opis={oczekujacaAkcja.opis}
          etykietaAkcji="Potwierdź i wykonaj"
          niebezpieczne={oczekujacaAkcja.ryzyko === "wysokie"}
          anuluj={anulujPotwierdzenie}
          potwierdz={potwierdz}
        />
      )}
    </div>
  );
}
