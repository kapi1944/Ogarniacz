import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BellPlus,
  Download,
  FileUp,
  ListTodo,
  NotebookPen,
  PackageCheck,
  Share2,
  Trash2,
} from "lucide-react";
import { WidokRejestru } from "../../components/WidokRejestru";
import {
  Karta,
  Komunikat,
  Modal,
  NaglowekWidoku,
  PustyStan,
  Znacznik,
} from "../../components/Interfejs";
import { terazIso, utworzMetadane } from "../../domain/fabryki";
import type {
  Cel,
  Dokument,
  Kontakt,
  NaPozniej,
  Notatka,
  Pomysl,
  Projekt,
  Przypomnienie,
  TerminWaznosci,
} from "../../domain/typy";
import { usePodswietlenie } from "../../hooks/usePodswietlenie";
import { useRepozytorium } from "../../hooks/useRepozytorium";
import { utworzZadanie } from "../../services/ZadaniaService";
import { platforma } from "../../platform/platforma";
import { zapiszPowiazanePrzypomnienie } from "../../services/PrzypomnieniaService";
import { statystykaNawyku } from "../../services/NawykiService";

export function WidokCelow() {
  const { dane: cele, repozytorium } = useRepozytorium("cele");
  const { dane: projekty } = useRepozytorium("projekty");
  const { dane: nawyki } = useRepozytorium("nawyki");
  const { dane: wpisy } = useRepozytorium("dziennikNawykow");
  const znajdzIds = (tekst: string, opcje: { id: string; nazwa: string }[]) =>
    tekst
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map(
        (wartosc) =>
          opcje.find(
            (x) =>
              x.id === wartosc ||
              x.nazwa.toLocaleLowerCase("pl") ===
                wartosc.toLocaleLowerCase("pl"),
          )?.id,
      )
      .filter((x): x is string => Boolean(x));
  const wyliczPostepProjektu = (projekt: Projekt) =>
    projekt.status === "zakonczone" ? 100 : 0;
  return (
    <WidokRejestru
      tytul="Cele"
      opis="Kierunki powiązane z projektami i nawykami, które faktycznie prowadzą do postępu."
      etykietaDodawania="Nowy cel"
      dane={cele}
      repozytorium={repozytorium}
      pola={[
        { klucz: "nazwa", etykieta: "Nazwa", wymagane: true },
        { klucz: "opis", etykieta: "Opis", typ: "textarea" },
        {
          klucz: "status",
          etykieta: "Status",
          typ: "select",
          wymagane: true,
          opcje: [
            { wartosc: "aktywne", etykieta: "Aktywny" },
            { wartosc: "wstrzymane", etykieta: "Wstrzymany" },
            { wartosc: "zakonczone", etykieta: "Zakończony" },
          ],
        },
        { klucz: "horyzont", etykieta: "Horyzont", podpowiedz: "np. 2026 Q4" },
        {
          klucz: "projektyNazwy",
          etykieta: "Projekty",
          podpowiedz:
            projekty.map((x) => x.nazwa).join(", ") ||
            "najpierw utwórz projekt",
        },
        {
          klucz: "nawykiNazwy",
          etykieta: "Nawyki",
          podpowiedz:
            nawyki.map((x) => x.nazwa).join(", ") || "najpierw utwórz nawyk",
        },
        {
          klucz: "trybPostepu",
          etykieta: "Tryb postępu",
          typ: "select",
          wymagane: true,
          domyslnaWartosc: "reczny",
          opcje: [
            { wartosc: "reczny", etykieta: "Ręczny" },
            { wartosc: "miernik", etykieta: "Miernik liczbowy" },
            { wartosc: "projekty", etykieta: "Projekty" },
            { wartosc: "nawyki", etykieta: "Nawyki" },
          ],
        },
        {
          klucz: "postep",
          etykieta: "Postęp %",
          typ: "number",
          min: 0,
          widoczne: (f) => (f.trybPostepu || "reczny") === "reczny",
        },
        {
          klucz: "wartoscStartowa",
          etykieta: "Wartość startowa",
          typ: "number",
          widoczne: (f) => f.trybPostepu === "miernik",
        },
        {
          klucz: "wartoscBiezaca",
          etykieta: "Wartość bieżąca",
          typ: "number",
          widoczne: (f) => f.trybPostepu === "miernik",
        },
        {
          klucz: "wartoscDocelowa",
          etykieta: "Wartość docelowa",
          typ: "number",
          widoczne: (f) => f.trybPostepu === "miernik",
        },
        {
          klucz: "jednostka",
          etykieta: "Jednostka",
          widoczne: (f) => f.trybPostepu === "miernik",
        },
      ]}
      zbuduj={(formularz, istniejacy) => {
        const tryb = (formularz.trybPostepu || "reczny") as NonNullable<
          Cel["trybPostepu"]
        >;
        const projektyIds = formularz.projektyNazwy
          ? znajdzIds(formularz.projektyNazwy, projekty)
          : (istniejacy?.projektyIds ?? []);
        const nawykiIds = formularz.nawykiNazwy
          ? znajdzIds(formularz.nawykiNazwy, nawyki)
          : (istniejacy?.nawykiIds ?? []);
        const start = Number(formularz.wartoscStartowa) || 0;
        const biezaca = Number(formularz.wartoscBiezaca) || 0;
        const docelowa = Number(formularz.wartoscDocelowa) || 0;
        const postepProjektow = projektyIds.length
          ? projektyIds
              .map((id) => projekty.find((x) => x.id === id))
              .filter((x): x is Projekt => Boolean(x))
              .reduce((s, x) => s + wyliczPostepProjektu(x), 0) /
            projektyIds.length
          : 0;
        const postepNawykow = nawykiIds.length
          ? nawykiIds
              .map((id) => nawyki.find((x) => x.id === id))
              .filter((x): x is NonNullable<typeof x> => Boolean(x))
              .reduce(
                (s, x) =>
                  s +
                  statystykaNawyku(
                    x,
                    wpisy,
                    new Date().toISOString().slice(0, 10),
                    30,
                  ).regularnosc,
                0,
              ) / nawykiIds.length
          : 0;
        const postep =
          tryb === "miernik" && docelowa !== start
            ? ((biezaca - start) / (docelowa - start)) * 100
            : tryb === "projekty"
              ? postepProjektow
              : tryb === "nawyki"
                ? postepNawykow
                : Number(formularz.postep) || 0;
        return {
          ...(istniejacy ?? utworzMetadane()),
          nazwa: formularz.nazwa.trim(),
          opis: formularz.opis ?? "",
          status: (formularz.status || "aktywne") as Cel["status"],
          horyzont: formularz.horyzont || undefined,
          projektyIds,
          nawykiIds,
          trybPostepu: tryb,
          postep: Math.round(Math.min(100, Math.max(0, postep))),
          wartoscStartowa: tryb === "miernik" ? start : undefined,
          wartoscBiezaca: tryb === "miernik" ? biezaca : undefined,
          wartoscDocelowa: tryb === "miernik" ? docelowa : undefined,
          jednostka:
            tryb === "miernik" ? formularz.jednostka || undefined : undefined,
          updatedAt: terazIso(),
        };
      }}
      etykieta={(cel) => cel.nazwa}
      szczegoly={(cel) => (
        <>
          <Znacznik
            wariant={cel.status === "zakonczone" ? "sukces" : "neutralny"}
          >
            {cel.status}
          </Znacznik>
          <Znacznik>{cel.trybPostepu ?? "reczny"}</Znacznik>
          <span>Postęp: {cel.postep}%</span>
          {cel.trybPostepu === "miernik" && (
            <span>
              {cel.wartoscBiezaca ?? cel.wartoscStartowa ?? 0} /{" "}
              {cel.wartoscDocelowa ?? "—"} {cel.jednostka}
            </span>
          )}
          {cel.horyzont && <span>Horyzont: {cel.horyzont}</span>}
          <span>
            Projekty:{" "}
            {cel.projektyIds
              .map((id) => projekty.find((x) => x.id === id)?.nazwa)
              .filter(Boolean)
              .join(", ") || "brak"}
          </span>
          <span>
            Nawyki:{" "}
            {cel.nawykiIds
              .map((id) => nawyki.find((x) => x.id === id)?.nazwa)
              .filter(Boolean)
              .join(", ") || "brak"}
          </span>
          {cel.ostatniReviewAt && (
            <span>
              Ostatni przegląd:{" "}
              {new Date(cel.ostatniReviewAt).toLocaleDateString("pl-PL")}
            </span>
          )}
          {cel.opis && <p>{cel.opis}</p>}
        </>
      )}
      akcje={(cel) => (
        <button
          type="button"
          className="przycisk przycisk--maly"
          onClick={() =>
            repozytorium.zapisz({
              ...cel,
              ostatniReviewAt: terazIso(),
              updatedAt: terazIso(),
            })
          }
        >
          Zrób przegląd
        </button>
      )}
    />
  );
}

export function WidokNotatek() {
  const [parametry] = useSearchParams();
  const { dane, repozytorium } = useRepozytorium("notatki");
  const { dane: zadania, repozytorium: repoZadan } = useRepozytorium("zadania");
  const { dane: projekty } = useRepozytorium("projekty");
  const { dane: wizyty } = useRepozytorium("wizyty");
  const { dane: kontakty } = useRepozytorium("kontakty");
  const { dane: cele } = useRepozytorium("cele");
  const { dane: pojazdy } = useRepozytorium("pojazdy");
  const { dane: dokumenty } = useRepozytorium("dokumenty");
  const [tag, ustawTag] = useState("");
  const encje = [
    {
      typ: "zadania",
      dane: zadania.map((x) => ({ id: x.id, nazwa: x.tytul })),
    },
    { typ: "projekty", dane: projekty },
    { typ: "wizyty", dane: wizyty.map((x) => ({ id: x.id, nazwa: x.nazwa })) },
    { typ: "kontakty", dane: kontakty },
    { typ: "cele", dane: cele },
    { typ: "samochod", dane: pojazdy },
    { typ: "dokumenty", dane: dokumenty },
  ] as const;
  const wszystkieTagi = [...new Set(dane.flatMap((x) => x.tagi))].sort((a, b) =>
    a.localeCompare(b, "pl"),
  );
  const widoczne = tag ? dane.filter((x) => x.tagi.includes(tag)) : dane;
  usePodswietlenie(dane.length);
  return (
    <WidokRejestru
      tytul="Notatki"
      opis="Samodzielne treści, opcjonalnie przypięte lub jawnie zaplanowane."
      etykietaDodawania="Nowa notatka"
      dane={widoczne}
      repozytorium={repozytorium}
      wybranyElementId={parametry.get("element") ?? undefined}
      pola={[
        { klucz: "tytul", etykieta: "Tytuł", wymagane: true },
        { klucz: "tresc", etykieta: "Treść", typ: "textarea", wymagane: true },
        {
          klucz: "tagi",
          etykieta: "Tagi",
          podpowiedz: "oddzielone przecinkami",
        },
        { klucz: "data", etykieta: "Jawna data", typ: "date" },
        { klucz: "godzina", etykieta: "Jawna godzina", typ: "time" },
        {
          klucz: "przypieta",
          etykieta: "Przypięta",
          typ: "select",
          opcje: [
            { wartosc: "true", etykieta: "Tak" },
            { wartosc: "false", etykieta: "Nie" },
          ],
        },
        {
          klucz: "przypomnienieAt",
          etykieta: "Przypomnienie",
          podpowiedz: "YYYY-MM-DDTHH:mm",
        },
        {
          klucz: "powiazaniaIds",
          etykieta: "Powiązania (wybierz wiele)",
          typ: "multiselect",
          opcje: encje.flatMap((grupa) => grupa.dane.map((element) => ({
            wartosc: `${grupa.typ}:${element.id}`,
            etykieta: `${grupa.typ} — ${element.nazwa}`,
          }))),
        },
      ]}
      filtr={
        <div className="pasek-filtrow">
          <button
            type="button"
            className={!tag ? "aktywny" : ""}
            onClick={() => ustawTag("")}
          >
            Wszystkie
          </button>
          {wszystkieTagi.map((x) => (
            <button
              type="button"
              className={tag === x ? "aktywny" : ""}
              onClick={() => ustawTag(x)}
              key={x}
            >
              #{x}
            </button>
          ))}
        </div>
      }
      zbuduj={(formularz, istniejaca) => ({
        ...(istniejaca ?? utworzMetadane()),
        tytul: formularz.tytul.trim(),
        tresc: formularz.tresc,
        tagi: formularz.tagi
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        powiazania: formularz.powiazaniaIds
          .split(",")
          .filter(Boolean)
          .map((wartosc) => {
            const [typ, ...id] = wartosc.split(":");
            return { typ: typ as Notatka["powiazania"][number]["typ"], id: id.join(":") };
          }),
        data: formularz.data || undefined,
        godzina:
          formularz.data && formularz.godzina ? formularz.godzina : undefined,
        przypieta: formularz.przypieta === "true",
        przypomnienieAt: formularz.przypomnienieAt || undefined,
        updatedAt: terazIso(),
      })}
      uzupelnijFormularz={(notatka) => ({
        powiazaniaIds: notatka.powiazania.map((p) => `${p.typ}:${p.id}`).join(","),
      })}
      etykieta={(notatka) => notatka.tytul}
      szczegoly={(notatka) => (
        <>
          {notatka.przypieta && (
            <Znacznik wariant="informacja">przypięta</Znacznik>
          )}
          {notatka.tagi.map((tag) => (
            <Znacznik key={tag}>{tag}</Znacznik>
          ))}
          {notatka.data && (
            <span>
              {notatka.data}
              {notatka.godzina ? ` ${notatka.godzina}` : ""}
            </span>
          )}
          {notatka.przypomnienieAt && (
            <span>Przypomnienie: {notatka.przypomnienieAt}</span>
          )}
          {notatka.powiazania.length > 0 && (
            <span>Powiązania: {notatka.powiazania.length}</span>
          )}
          <p>{notatka.tresc}</p>
        </>
      )}
      akcje={(notatka) => (
        <>
          <button
            type="button"
            className="przycisk przycisk--maly"
            onClick={() => {
              const tresc = window.prompt("Treść zadania", notatka.tresc) ?? "";
              if (tresc.trim())
                void repoZadan.zapisz(
                  utworzZadanie({
                    tytul: tresc.trim().slice(0, 120),
                    opis: `Utworzono z notatki: ${notatka.tytul}`,
                    priorytet: "normalny",
                  }),
                );
            }}
          >
            Utwórz zadanie z notatki
          </button>
          {platforma.udostepnianie.dostepne() && (
            <button
              type="button"
              className="przycisk-ikona"
              title="Udostępnij notatkę"
              onClick={() =>
                platforma.udostepnianie.udostepnij({
                  tytul: notatka.tytul,
                  tekst: notatka.tresc,
                })
              }
            >
              <Share2 aria-hidden="true" />
            </button>
          )}
        </>
      )}
    />
  );
}

export function WidokPomyslow() {
  const { dane, repozytorium } = useRepozytorium("pomysly");
  const { repozytorium: repoZadan } = useRepozytorium("zadania");
  const { repozytorium: repoProjektow } = useRepozytorium("projekty");
  const { repozytorium: repoNotatek } = useRepozytorium("notatki");
  const [komunikat, ustawKomunikat] = useState("");
  const [filtr, ustawFiltr] = useState<
    "wszystkie" | Pomysl["status"] | "okazje"
  >("wszystkie");
  const widoczne = dane.filter((x) =>
    filtr === "wszystkie" || filtr === "okazje"
      ? filtr === "wszystkie" ||
        ((x.wartosc ?? 0) >= 4 && (x.wysilek ?? 5) <= 2)
      : x.status === filtr,
  );
  usePodswietlenie(dane.length);
  const konwertuj = async (
    pomysl: Pomysl,
    typ: "zadanie" | "projekt" | "notatka",
  ) => {
    if (typ === "zadanie")
      await repoZadan.zapisz(
        utworzZadanie({
          tytul: pomysl.tytul,
          opis: pomysl.opis,
          priorytet: "normalny",
        }),
      );
    if (typ === "projekt") {
      const projekt: Projekt = {
        ...utworzMetadane(),
        nazwa: pomysl.tytul,
        opis: pomysl.opis,
        status: "aktywne",
        blokady: "",
      };
      await repoProjektow.zapisz(projekt);
    }
    if (typ === "notatka") {
      const notatka: Notatka = {
        ...utworzMetadane(),
        tytul: pomysl.tytul,
        tresc: pomysl.opis || pomysl.tytul,
        tagi: [],
        powiazania: [],
      };
      await repoNotatek.zapisz(notatka);
    }
    await repozytorium.zapisz({ ...pomysl, status: "rozwiniety" });
    ustawKomunikat(`Pomysł przekształcono w: ${typ}.`);
  };
  return (
    <div className="widok">
      {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
      <WidokRejestru
        tytul="Pomysły"
        opis="Szybki zapis koncepcji bez obowiązku natychmiastowego planowania."
        etykietaDodawania="Nowy pomysł"
        dane={widoczne}
        repozytorium={repozytorium}
        filtr={
          <div className="segmenty">
            {(
              [
                "wszystkie",
                "nowy",
                "rozwiniety",
                "zrealizowany",
                "okazje",
              ] as const
            ).map((x) => (
              <button
                type="button"
                className={filtr === x ? "aktywny" : ""}
                onClick={() => ustawFiltr(x)}
                key={x}
              >
                {x === "okazje" ? "Wysoka wartość / niski wysiłek" : x}
              </button>
            ))}
          </div>
        }
        pola={[
          { klucz: "tytul", etykieta: "Pomysł", wymagane: true },
          { klucz: "opis", etykieta: "Opis", typ: "textarea" },
          {
            klucz: "status",
            etykieta: "Status",
            typ: "select",
            wymagane: true,
            opcje: [
              { wartosc: "nowy", etykieta: "Nowy" },
              { wartosc: "rozwiniety", etykieta: "Rozwinięty" },
              { wartosc: "zrealizowany", etykieta: "Zrealizowany" },
            ],
          },
          {
            klucz: "tagi",
            etykieta: "Tagi",
            podpowiedz: "oddzielone przecinkami",
          },
          { klucz: "wartosc", etykieta: "Wartość 1–5", typ: "number", min: 1 },
          { klucz: "wysilek", etykieta: "Wysiłek 1–5", typ: "number", min: 1 },
        ]}
        zbuduj={(f, e) => ({
          ...(e ?? utworzMetadane()),
          tytul: f.tytul.trim(),
          opis: f.opis ?? "",
          status: (f.status || "nowy") as Pomysl["status"],
          tagi: f.tagi
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          wartosc: f.wartosc ? Math.min(5, Number(f.wartosc)) : undefined,
          wysilek: f.wysilek ? Math.min(5, Number(f.wysilek)) : undefined,
          updatedAt: terazIso(),
        })}
        etykieta={(x) => x.tytul}
        szczegoly={(x) => (
          <>
            <Znacznik
              wariant={x.status === "zrealizowany" ? "sukces" : "neutralny"}
            >
              {x.status}
            </Znacznik>
            {x.wartosc && <span>Wartość: {x.wartosc}/5</span>}
            {x.wysilek && <span>Wysiłek: {x.wysilek}/5</span>}
            {x.tagi?.map((tag) => (
              <Znacznik key={tag}>{tag}</Znacznik>
            ))}
            {x.opis && <p>{x.opis}</p>}
          </>
        )}
        akcje={(x) => (
          <div className="menu-konwersji">
            <button
              type="button"
              title="Utwórz zadanie"
              onClick={() => konwertuj(x, "zadanie")}
            >
              <ListTodo aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Utwórz projekt"
              onClick={() => konwertuj(x, "projekt")}
            >
              <PackageCheck aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Utwórz notatkę"
              onClick={() => konwertuj(x, "notatka")}
            >
              <NotebookPen aria-hidden="true" />
            </button>
          </div>
        )}
      />
    </div>
  );
}

export function WidokNaPozniej() {
  const { dane, repozytorium } = useRepozytorium("naPozniej");
  const { repozytorium: repoZadan } = useRepozytorium("zadania");
  const [filtr, ustawFiltr] = useState<"aktywne" | "odlozone" | "wykonane">(
    "aktywne",
  );
  const dzisiaj = new Date().toISOString().slice(0, 10);
  const widoczne = dane.filter((x) =>
    filtr === "wykonane"
      ? x.status === "wykonane"
      : filtr === "odlozone"
        ? x.status === "oczekuje" &&
          Boolean(x.pokazPonownie && x.pokazPonownie > dzisiaj)
        : x.status === "oczekuje" &&
          (!x.pokazPonownie || x.pokazPonownie <= dzisiaj),
  );
  return (
    <WidokRejestru
      tytul="Na później"
      opis="Rzeczy do przeczytania, obejrzenia, sprawdzenia, kupienia lub rozważenia."
      etykietaDodawania="Dodaj na później"
      dane={widoczne}
      repozytorium={repozytorium}
      filtr={
        <div className="segmenty">
          {(["aktywne", "odlozone", "wykonane"] as const).map((x) => (
            <button
              type="button"
              className={filtr === x ? "aktywny" : ""}
              onClick={() => ustawFiltr(x)}
              key={x}
            >
              {x === "odlozone" ? "Odłożone" : x}
            </button>
          ))}
        </div>
      }
      pola={[
        { klucz: "tytul", etykieta: "Tytuł", wymagane: true },
        {
          klucz: "typ",
          etykieta: "Typ",
          typ: "select",
          wymagane: true,
          opcje: [
            { wartosc: "przeczytac", etykieta: "Do przeczytania" },
            { wartosc: "obejrzec", etykieta: "Do obejrzenia" },
            { wartosc: "sprawdzic", etykieta: "Do sprawdzenia" },
            { wartosc: "kupic", etykieta: "Do kupienia" },
            { wartosc: "rozwazyc", etykieta: "Do rozważenia" },
          ],
        },
        { klucz: "adres", etykieta: "Adres URL", typ: "url" },
        { klucz: "opis", etykieta: "Opis", typ: "textarea" },
        { klucz: "tagi", etykieta: "Tagi" },
        {
          klucz: "priorytet",
          etykieta: "Priorytet",
          typ: "select",
          opcje: [
            { wartosc: "niski", etykieta: "Niski" },
            { wartosc: "normalny", etykieta: "Normalny" },
            { wartosc: "wysoki", etykieta: "Wysoki" },
            { wartosc: "krytyczny", etykieta: "Krytyczny" },
          ],
        },
        {
          klucz: "przewidywanyCzasMin",
          etykieta: "Przewidywany czas (min)",
          typ: "number",
          min: 1,
        },
        { klucz: "pokazPonownie", etykieta: "Pokaż ponownie", typ: "date" },
        {
          klucz: "status",
          etykieta: "Status",
          typ: "select",
          wymagane: true,
          opcje: [
            { wartosc: "oczekuje", etykieta: "Oczekuje" },
            { wartosc: "wykonane", etykieta: "Wykonane" },
          ],
        },
      ]}
      zbuduj={(f, e) => ({
        ...(e ?? utworzMetadane()),
        tytul: f.tytul.trim(),
        typ: (f.typ || "sprawdzic") as NaPozniej["typ"],
        adres: f.adres || undefined,
        opis: f.opis || undefined,
        status: (f.status || "oczekuje") as NaPozniej["status"],
        tagi: f.tagi
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        priorytet: (f.priorytet as NaPozniej["priorytet"]) || undefined,
        przewidywanyCzasMin: f.przewidywanyCzasMin
          ? Number(f.przewidywanyCzasMin)
          : undefined,
        pokazPonownie: f.pokazPonownie || undefined,
        updatedAt: terazIso(),
      })}
      etykieta={(x) => x.tytul}
      szczegoly={(x) => (
        <>
          <Znacznik wariant={x.status === "wykonane" ? "sukces" : "neutralny"}>
            {x.typ.replaceAll("_", " ")}
          </Znacznik>
          {x.priorytet && <Znacznik>{x.priorytet}</Znacznik>}
          {x.przewidywanyCzasMin && <span>{x.przewidywanyCzasMin} min</span>}
          {x.pokazPonownie && <span>Pokaż ponownie: {x.pokazPonownie}</span>}
          {x.tagi?.map((tag) => (
            <Znacznik key={tag}>{tag}</Znacznik>
          ))}
          {x.adres && (
            <a href={x.adres} target="_blank" rel="noreferrer">
              Otwórz adres
            </a>
          )}
          {x.opis && <p>{x.opis}</p>}
        </>
      )}
      akcje={(x) => (
        <div className="menu-konwersji">
          {x.status === "oczekuje" && (
            <button
              type="button"
              className="przycisk przycisk--maly"
              onClick={async () => {
                await repoZadan.zapisz(
                  utworzZadanie({
                    tytul: x.tytul,
                    opis: x.opis ?? "",
                    priorytet: x.priorytet ?? "normalny",
                  }),
                );
                await repozytorium.zapisz({ ...x, status: "wykonane" });
              }}
            >
              Do zadań
            </button>
          )}
          {platforma.udostepnianie.dostepne() && (
            <button
              type="button"
              title="Udostępnij element"
              onClick={() =>
                platforma.udostepnianie.udostepnij({
                  tytul: x.tytul,
                  tekst: x.opis,
                  adres: x.adres,
                })
              }
            >
              <Share2 aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    />
  );
}

export function WidokKontaktow() {
  const { dane, repozytorium } = useRepozytorium("kontakty");
  const { dane: wizyty } = useRepozytorium("wizyty");
  const { dane: projekty } = useRepozytorium("projekty");
  const { dane: dokumenty } = useRepozytorium("dokumenty");
  const { dane: notatki } = useRepozytorium("notatki");
  const { dane: miejsca } = useRepozytorium("miejsca");
  const { repozytorium: repoZadan } = useRepozytorium("zadania");
  usePodswietlenie(dane.length);
  return (
    <WidokRejestru
      tytul="Kontakty"
      opis="Praktyczna baza lekarzy, serwisów, urzędów i usługodawców — nie pełna książka adresowa."
      etykietaDodawania="Nowy kontakt"
      dane={dane}
      repozytorium={repozytorium}
      pola={[
        { klucz: "nazwa", etykieta: "Nazwa", wymagane: true },
        { klucz: "rola", etykieta: "Rola" },
        { klucz: "telefon", etykieta: "Telefon" },
        { klucz: "email", etykieta: "E-mail", typ: "email" },
        { klucz: "adres", etykieta: "Adres" },
        {
          klucz: "miejsceId",
          etykieta: "Powiązane miejsce",
          typ: "select",
          opcje: miejsca.map((x) => ({ wartosc: x.id, etykieta: x.nazwa })),
        },
        { klucz: "strona", etykieta: "Strona", typ: "url" },
        { klucz: "notatki", etykieta: "Notatki", typ: "textarea" },
      ]}
      zbuduj={(f, e) =>
        ({
          ...(e ?? utworzMetadane()),
          nazwa: f.nazwa.trim(),
          rola: f.rola || undefined,
          telefon: f.telefon || undefined,
          email: f.email || undefined,
          adres: f.adres || undefined,
          miejsceId: f.miejsceId || undefined,
          strona: f.strona || undefined,
          notatki: f.notatki || undefined,
          updatedAt: terazIso(),
        }) as Kontakt
      }
      etykieta={(x) => x.nazwa}
      szczegoly={(x) => {
        const powiazaneNotatki = notatki.filter((n) =>
          n.powiazania.some((p) => p.typ === "kontakty" && p.id === x.id),
        );
        const powiazaneDokumenty = dokumenty.filter((d) =>
          d.powiazania.some((p) => p.typ === "kontakty" && p.id === x.id),
        );
        const powiazaneProjekty = projekty.filter((p) =>
          notatki.some(
            (n) =>
              n.powiazania.some((r) => r.typ === "kontakty" && r.id === x.id) &&
              n.powiazania.some((r) => r.typ === "projekty" && r.id === p.id),
          ),
        );
        return (
          <>
            {x.rola && <Znacznik>{x.rola}</Znacznik>}
            {x.telefon && (
              <a href={`tel:${x.telefon}`}>Zadzwoń · {x.telefon}</a>
            )}
            {x.email && <a href={`mailto:${x.email}`}>E-mail · {x.email}</a>}
            {(x.adres || x.miejsceId) && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(miejsca.find((m) => m.id === x.miejsceId)?.adres ?? x.adres ?? "")}`}
                target="_blank"
                rel="noreferrer"
              >
                Nawiguj
              </a>
            )}
            <span>
              Wizyty:{" "}
              {wizyty
                .filter((w) => w.kontaktId === x.id)
                .map((w) => w.nazwa)
                .join(", ") || "brak"}
            </span>
            <span>
              Projekty:{" "}
              {powiazaneProjekty.map((p) => p.nazwa).join(", ") || "brak"} ·
              Dokumenty:{" "}
              {powiazaneDokumenty.map((d) => d.nazwa).join(", ") || "brak"} ·
              Notatki:{" "}
              {powiazaneNotatki.map((n) => n.tytul).join(", ") || "brak"}
            </span>
            {x.notatki && <p>{x.notatki}</p>}
          </>
        );
      }}
      akcje={(x) => (
        <button
          type="button"
          className="przycisk przycisk--maly"
          onClick={() =>
            repoZadan.zapisz(
              utworzZadanie({
                tytul: `Skontaktuj się: ${x.nazwa}`,
                opis: x.rola ?? "",
                priorytet: "normalny",
              }),
            )
          }
        >
          Utwórz follow-up
        </button>
      )}
    />
  );
}

export function WidokDokumentow() {
  const { dane, repozytorium } = useRepozytorium("dokumenty");
  const { dane: terminy, repozytorium: repoTerminow } =
    useRepozytorium("terminyWaznosci");
  const [formularz, ustawFormularz] = useState<Dokument | null>();
  const [plik, ustawPlik] = useState<File>();
  const [synchronizujTermin, ustawSynchronizujTermin] = useState(true);
  usePodswietlenie(dane.length);
  const pobierz = (dokument: Dokument) => {
    if (!dokument.plik) return;
    const adres = URL.createObjectURL(dokument.plik);
    const link = document.createElement("a");
    link.href = adres;
    link.download = dokument.nazwaPliku ?? dokument.nazwa;
    link.click();
    URL.revokeObjectURL(adres);
  };
  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault();
    if (!formularz?.nazwa.trim()) return;
    const dokument: Dokument = {
      ...formularz,
      nazwa: formularz.nazwa.trim(),
      plik: plik ?? formularz.plik,
      nazwaPliku: plik?.name ?? formularz.nazwaPliku,
      mimeType: plik?.type ?? formularz.mimeType,
      rozmiar: plik?.size ?? formularz.rozmiar,
      updatedAt: terazIso(),
    };
    await repozytorium.zapisz(dokument);
    if (synchronizujTermin && dokument.terminWaznosci) {
      const istniejacy = terminy.find(
        (x) => x.dokumentId === dokument.id && x.status !== "odnowione",
      );
      await repoTerminow.zapisz({
        ...(istniejacy ?? utworzMetadane()),
        nazwa: `Ważność: ${dokument.nazwa}`,
        typ: dokument.typ ?? "dokument",
        dataWaznosci: dokument.terminWaznosci,
        status: "aktualne",
        dokumentId: dokument.id,
        updatedAt: terazIso(),
      });
    }
    ustawFormularz(null);
    ustawPlik(undefined);
  };
  return (
    <div className="widok">
      <NaglowekWidoku
        tytul="Dokumenty"
        opis="Pliki są przechowywane lokalnie jako Blob w IndexedDB i uwzględniane w backupie JSON."
        akcje={
          <button
            type="button"
            className="przycisk przycisk--glowny"
            onClick={() =>
              (ustawSynchronizujTermin(true),
              ustawFormularz({ ...utworzMetadane(), nazwa: "", powiazania: [] }))
            }
          >
            <FileUp aria-hidden="true" />
            Dodaj dokument
          </button>
        }
      />
      {dane.length === 0 ? (
        <PustyStan
          tytul="Brak dokumentów"
          opis="Dodaj pierwszy plik lub sam rekord dokumentu."
        />
      ) : (
        <div className="siatka-kart-modulow">
          {dane.map((dokument) => (
            <Karta key={dokument.id}>
              <div className="naglowek-karty">
                <div>
                  <h3>{dokument.nazwa}</h3>
                  <p>{dokument.nazwaPliku ?? "Rekord bez pliku"}</p>
                </div>
                <Znacznik>
                  {dokument.typ ?? dokument.mimeType ?? "dokument"}
                </Znacznik>
              </div>
              <p>
                {dokument.rozmiar
                  ? `${Math.round(dokument.rozmiar / 1024)} KB`
                  : "Brak danych o rozmiarze"}
                {dokument.terminWaznosci
                  ? ` · ważny do ${dokument.terminWaznosci}`
                  : ""}
              </p>
              <div className="akcje-karty">
                {dokument.plik && (
                  <button
                    type="button"
                    className="przycisk przycisk--maly"
                    onClick={() => pobierz(dokument)}
                  >
                    <Download aria-hidden="true" />
                    Pobierz
                  </button>
                )}
                <button
                  type="button"
                  className="przycisk przycisk--tekstowy"
                  onClick={() => {
                    ustawSynchronizujTermin(
                      Boolean(terminy.some((x) => x.dokumentId === dokument.id && x.status !== "odnowione")),
                    );
                    ustawFormularz(dokument);
                  }}
                >
                  Edytuj
                </button>
                <button
                  type="button"
                  className="przycisk-ikona przycisk-ikona--niebezpieczny"
                  onClick={() => repozytorium.usun(dokument.id)}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </Karta>
          ))}
        </div>
      )}
      {formularz && (
        <Modal
          tytul={formularz.nazwa ? "Edytuj dokument" : "Dodaj dokument"}
          zamknij={() => ustawFormularz(null)}
        >
          <form className="formularz" onSubmit={zapisz}>
            <label className="pole pole--pelne">
              <span>Nazwa *</span>
              <input
                required
                value={formularz.nazwa}
                onChange={(e) =>
                  ustawFormularz({ ...formularz, nazwa: e.target.value })
                }
              />
            </label>
            <label className="pole">
              <span>Typ</span>
              <input
                value={formularz.typ ?? ""}
                onChange={(e) =>
                  ustawFormularz({
                    ...formularz,
                    typ: e.target.value || undefined,
                  })
                }
              />
            </label>
            <label className="ustawienie-wiersz pole--pelne">
              <span>
                <strong>Utwórz / aktualizuj Termin ważności</strong>
                <small>Powiązany termin zostanie zaktualizowany bez tworzenia duplikatu.</small>
              </span>
              <input
                type="checkbox"
                checked={synchronizujTermin}
                onChange={(e) => ustawSynchronizujTermin(e.target.checked)}
              />
            </label>
            <label className="pole">
              <span>Termin ważności</span>
              <input
                type="date"
                value={formularz.terminWaznosci ?? ""}
                onChange={(e) =>
                  ustawFormularz({
                    ...formularz,
                    terminWaznosci: e.target.value || undefined,
                  })
                }
              />
            </label>
            <label className="pole pole--pelne">
              <span>Plik</span>
              <input
                type="file"
                onChange={(e) => ustawPlik(e.target.files?.[0])}
              />
              {formularz.nazwaPliku && (
                <small>Obecnie: {formularz.nazwaPliku}</small>
              )}
            </label>
            <div className="akcje-formularza pole--pelne">
              <button
                type="button"
                className="przycisk przycisk--drugorzedny"
                onClick={() => ustawFormularz(null)}
              >
                Anuluj
              </button>
              <button type="submit" className="przycisk przycisk--glowny">
                Zapisz
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function WidokTerminow() {
  const { dane, repozytorium } = useRepozytorium("terminyWaznosci");
  const { dane: przypomnienia, repozytorium: repoPrzypomnien } =
    useRepozytorium("przypomnienia");
  const { dane: dokumenty } = useRepozytorium("dokumenty");
  const { repozytorium: repoDokumentow } = useRepozytorium("dokumenty");
  const [komunikat, ustawKomunikat] = useState("");
  const dodajPrzypomnienie = async (termin: TerminWaznosci) => {
    const progi = [90, 30, 7, 1];
    const przygotowane: Przypomnienie[] = progi.map((dni) => ({
      ...utworzMetadane(),
      tytul: `Wygasa za ${dni} ${dni === 1 ? "dzień" : "dni"}: ${termin.nazwa}`,
      zrodlo: { typ: "terminy", id: termin.id },
      kluczDeduplikacji: `termin:${termin.id}:${dni}`,
      typ: "wzgledne",
      czas: `${termin.dataWaznosci}T09:00:00`,
      przesuniecieMin: dni * 24 * 60,
      priorytet: dni <= 7 ? "wysoki" : "normalny",
      stan: "nowe",
      eskalacja: dni <= 7,
    }));
    for (const przypomnienie of przygotowane) {
      await repoPrzypomnien.zapisz(
        zapiszPowiazanePrzypomnienie([...przypomnienia, ...przygotowane], przypomnienie),
      );
    }
    ustawKomunikat("Zapisano przypomnienia 90, 30, 7 i 1 dzień przed terminem.");
  };
  const odnow = async (termin: TerminWaznosci) => {
    const nowaData = window.prompt("Nowa data ważności (RRRR-MM-DD)", termin.dataWaznosci);
    if (!nowaData || !/^\d{4}-\d{2}-\d{2}$/.test(nowaData)) return;
    await repozytorium.zapisz({ ...termin, status: "odnowione", updatedAt: terazIso() });
    const nowyTermin: TerminWaznosci = {
      ...utworzMetadane(),
      nazwa: termin.nazwa,
      typ: termin.typ,
      dataWaznosci: nowaData,
      status: "aktualne",
      regulaOdnowienia: termin.regulaOdnowienia,
      dokumentId: termin.dokumentId,
    };
    await repozytorium.zapisz(nowyTermin);
    if (termin.dokumentId) {
      const dokument = dokumenty.find((x) => x.id === termin.dokumentId);
      if (dokument) await repoDokumentow.zapisz({ ...dokument, terminWaznosci: nowaData, updatedAt: terazIso() });
    }
    ustawKomunikat("Oznaczono poprzedni termin jako odnowiony i zapisano nową datę.");
  };
  return (
    <div className="widok">
      {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
      <WidokRejestru
        tytul="Terminy ważności"
        opis="Dokumenty, badania, ubezpieczenia, przeglądy, recepty i inne odnawialne sprawy."
        etykietaDodawania="Nowy termin"
        dane={dane}
        repozytorium={repozytorium}
        pola={[
          { klucz: "nazwa", etykieta: "Nazwa", wymagane: true },
          { klucz: "typ", etykieta: "Typ", wymagane: true },
          {
            klucz: "dataWaznosci",
            etykieta: "Data ważności",
            typ: "date",
            wymagane: true,
          },
          {
            klucz: "status",
            etykieta: "Status",
            typ: "select",
            wymagane: true,
            opcje: [
              { wartosc: "aktualne", etykieta: "Aktualne" },
              { wartosc: "do_odnowienia", etykieta: "Do odnowienia" },
              { wartosc: "odnowione", etykieta: "Odnowione" },
            ],
          },
          {
            klucz: "dokumentId",
            etykieta: "Dokument",
            typ: "select",
            opcje: dokumenty.map((x) => ({ wartosc: x.id, etykieta: x.nazwa })),
          },
          {
            klucz: "odnowienieTyp",
            etykieta: "Reguła odnowienia",
            typ: "select",
            opcje: [
              { wartosc: "brak", etykieta: "Brak" },
              { wartosc: "miesiecznie", etykieta: "Miesięcznie" },
              { wartosc: "rocznie", etykieta: "Rocznie" },
            ],
          },
        ]}
        zbuduj={(f, e) => ({
          ...(e ?? utworzMetadane()),
          nazwa: f.nazwa.trim(),
          typ: f.typ,
          dataWaznosci: f.dataWaznosci,
          status: (f.status || "aktualne") as TerminWaznosci["status"],
          dokumentId: f.dokumentId || undefined,
          regulaOdnowienia:
            f.odnowienieTyp && f.odnowienieTyp !== "brak"
              ? {
                  typ: f.odnowienieTyp as NonNullable<
                    TerminWaznosci["regulaOdnowienia"]
                  >["typ"],
                  coIle: 1,
                  dataStartu: f.dataWaznosci,
                }
              : undefined,
          updatedAt: terazIso(),
        })}
        etykieta={(x) => x.nazwa}
        szczegoly={(x) => (
          <>
            <Znacznik
              wariant={
                x.dataWaznosci < new Date().toISOString().slice(0, 10)
                  ? "blad"
                  : x.status === "odnowione"
                    ? "sukces"
                    : "ostrzezenie"
              }
            >
              {x.status.replaceAll("_", " ")}
            </Znacznik>
            <span>{x.typ}</span>
            <strong>{x.dataWaznosci}</strong>
            {x.dokumentId && (
              <span>
                Dokument: {dokumenty.find((d) => d.id === x.dokumentId)?.nazwa}
              </span>
            )}
          </>
        )}
        akcje={(x) => <>
          {x.status !== "odnowione" && <button type="button" className="przycisk przycisk--maly" onClick={() => odnow(x)}>Odnowiono</button>}
          <button type="button" className="przycisk-ikona" title="Dodaj przypomnienia 90, 30, 7 i 1 dzień wcześniej" onClick={() => dodajPrzypomnienie(x)}><BellPlus aria-hidden="true" /></button>
        </>}
      />
    </div>
  );
}
