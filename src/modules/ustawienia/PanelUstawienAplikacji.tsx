import { useEffect, useState, type ReactNode } from 'react'
import { Save, Undo2 } from 'lucide-react'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat } from '../../components/Interfejs'
import { DOMYSLNE_USTAWIENIA, normalizujUstawienia } from '../../domain/ustawienia'
import type { TypSzybkiegoDodawania, Ustawienia } from '../../domain/typy'

type NazwaSekcji = 'wyglad' | 'nawigacja' | 'pulpit' | 'harmonogram' | 'zadania' | 'szybkieDodawanie' | 'dostepnosc'

const dniTygodnia = [
  { wartosc: 1, etykieta: 'Pon' },
  { wartosc: 2, etykieta: 'Wt' },
  { wartosc: 3, etykieta: 'Śr' },
  { wartosc: 4, etykieta: 'Czw' },
  { wartosc: 5, etykieta: 'Pt' },
  { wartosc: 6, etykieta: 'Sob' },
  { wartosc: 0, etykieta: 'Niedz' },
]

const typySzybkiegoDodawania: { wartosc: TypSzybkiegoDodawania; etykieta: string }[] = [
  { wartosc: 'zadanie', etykieta: 'Zadanie' },
  { wartosc: 'notatka', etykieta: 'Notatka' },
  { wartosc: 'wizyta', etykieta: 'Wizyta' },
  { wartosc: 'lek', etykieta: 'Lek' },
  { wartosc: 'wydatek', etykieta: 'Wydatek' },
  { wartosc: 'samochod', etykieta: 'Samochód' },
]

export function PanelUstawienAplikacji() {
  const {
    zapisaneUstawienia,
    zapiszUstawienia,
    ustawPodgladUstawien,
    wyczyscPodgladUstawien,
  } = useAplikacja()
  const [szkic, ustawSzkic] = useState(() => normalizujUstawienia(zapisaneUstawienia))
  const [komunikat, ustawKomunikat] = useState('')

  useEffect(() => {
    ustawSzkic(normalizujUstawienia(zapisaneUstawienia))
  }, [zapisaneUstawienia])

  useEffect(() => () => wyczyscPodgladUstawien(), [wyczyscPodgladUstawien])

  const aktualizujSzkic = (nowySzkic: Ustawienia) => {
    const znormalizowany = normalizujUstawienia(nowySzkic)
    ustawSzkic(znormalizowany)
    ustawPodgladUstawien(znormalizowany)
    ustawKomunikat('')
  }

  const resetujSekcje = (sekcja: NazwaSekcji) => {
    aktualizujSzkic({ ...szkic, [sekcja]: DOMYSLNE_USTAWIENIA[sekcja] })
  }

  const resetujWszystko = () => {
    aktualizujSzkic({
      ...DOMYSLNE_USTAWIENIA,
      id: zapisaneUstawienia.id,
      createdAt: zapisaneUstawienia.createdAt,
      updatedAt: zapisaneUstawienia.updatedAt,
    })
    ustawKomunikat('Przywrócono domyślne wartości w szkicu. Użyj „Zapisz ustawienia”, aby je utrwalić.')
  }

  const zapisz = async () => {
    await zapiszUstawienia(szkic)
    ustawKomunikat('Ustawienia zostały zapisane.')
  }

  const zmienWidocznoscTypu = (typ: TypSzybkiegoDodawania, widoczny: boolean) => {
    const widoczneTypy = widoczny
      ? [...szkic.szybkieDodawanie.widoczneTypy, typ]
      : szkic.szybkieDodawanie.widoczneTypy.filter((element) => element !== typ)
    aktualizujSzkic({ ...szkic, szybkieDodawanie: { ...szkic.szybkieDodawanie, widoczneTypy } })
  }

  return <section className="panel-ustawien-aplikacji" aria-labelledby="ustawienia-aplikacji-tytul">
    <div className="naglowek-karty panel-ustawien-aplikacji__naglowek">
      <div>
        <h2 id="ustawienia-aplikacji-tytul">Ustawienia aplikacji</h2>
        <p>Zmiany wizualne są widoczne od razu. Pozostałe wartości zostaną utrwalone dopiero po zapisaniu.</p>
      </div>
      <div className="akcje-formularza">
        <button type="button" className="przycisk przycisk--drugorzedny" onClick={resetujWszystko}><Undo2 aria-hidden="true" />Resetuj wszystkie</button>
        <button type="button" className="przycisk przycisk--glowny" onClick={zapisz}><Save aria-hidden="true" />Zapisz ustawienia</button>
      </div>
    </div>
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}

    <div className="siatka-sekcji-ustawien">
      <SekcjaUstawien tytul="Wygląd" resetuj={() => resetujSekcje('wyglad')}>
        <label className="pole"><span>Motyw</span><select value={szkic.wyglad.motyw} onChange={(e) => aktualizujSzkic({ ...szkic, wyglad: { ...szkic.wyglad, motyw: e.target.value as Ustawienia['wyglad']['motyw'] } })}><option value="systemowy">Systemowy</option><option value="jasny">Jasny</option><option value="ciemny">Ciemny</option></select></label>
        <label className="pole"><span>Gęstość</span><select value={szkic.wyglad.gestosc} onChange={(e) => aktualizujSzkic({ ...szkic, wyglad: { ...szkic.wyglad, gestosc: e.target.value as Ustawienia['wyglad']['gestosc'] } })}><option value="komfortowa">Komfortowa</option><option value="zwarta">Zwarta</option></select></label>
        <label className="pole"><span>Promień kart: {szkic.wyglad.promienKart}px</span><input type="range" min="0" max="24" value={szkic.wyglad.promienKart} onChange={(e) => aktualizujSzkic({ ...szkic, wyglad: { ...szkic.wyglad, promienKart: Number(e.target.value) } })} /></label>
        <label className="pole"><span>Promień pól: {szkic.wyglad.promienPol}px</span><input type="range" min="0" max="16" value={szkic.wyglad.promienPol} onChange={(e) => aktualizujSzkic({ ...szkic, wyglad: { ...szkic.wyglad, promienPol: Number(e.target.value) } })} /></label>
        <label className="pole pole--pelne"><span>Czas animacji: {szkic.wyglad.czasAnimacjiMs} ms</span><input type="range" min="0" max="600" step="20" value={szkic.wyglad.czasAnimacjiMs} onChange={(e) => aktualizujSzkic({ ...szkic, wyglad: { ...szkic.wyglad, czasAnimacjiMs: Number(e.target.value) } })} /></label>
      </SekcjaUstawien>

      <SekcjaUstawien tytul="Nawigacja" resetuj={() => resetujSekcje('nawigacja')}>
        <label className="pole"><span>Szerokość menu: {szkic.nawigacja.szerokoscMenu}px</span><input type="range" min="220" max="360" value={szkic.nawigacja.szerokoscMenu} onChange={(e) => aktualizujSzkic({ ...szkic, nawigacja: { ...szkic.nawigacja, szerokoscMenu: Number(e.target.value) } })} /></label>
        <label className="pole"><span>Wysokość pozycji: {szkic.nawigacja.wysokoscPozycji}px</span><input type="range" min="32" max="52" value={szkic.nawigacja.wysokoscPozycji} onChange={(e) => aktualizujSzkic({ ...szkic, nawigacja: { ...szkic.nawigacja, wysokoscPozycji: Number(e.target.value) } })} /></label>
        <Przelacznik etykieta="Domyślnie zwiń menu" opis="Zapamiętuje stan menu bez bezpośredniego użycia storage przez UI." zaznaczony={szkic.nawigacja.menuDomyslnieZwiniete} zmien={(menuDomyslnieZwiniete) => aktualizujSzkic({ ...szkic, nawigacja: { ...szkic.nawigacja, menuDomyslnieZwiniete } })} />
        <Przelacznik etykieta="Przypnij menu" opis="Preferencja dla docelowego zachowania na dużym ekranie." zaznaczony={szkic.nawigacja.przypiete} zmien={(przypiete) => aktualizujSzkic({ ...szkic, nawigacja: { ...szkic.nawigacja, przypiete } })} />
      </SekcjaUstawien>

      <SekcjaUstawien tytul="Pulpit" resetuj={() => resetujSekcje('pulpit')}>
        <Przelacznik etykieta="Alerty" opis="Pokazuj ograniczony miks najważniejszych alertów." zaznaczony={szkic.pulpit.pokazAlerty} zmien={(pokazAlerty) => aktualizujSzkic({ ...szkic, pulpit: { ...szkic.pulpit, pokazAlerty } })} />
        <Przelacznik etykieta="Kafelki" opis="Pokazuj podsumowania modułów." zaznaczony={szkic.pulpit.pokazKafelki} zmien={(pokazKafelki) => aktualizujSzkic({ ...szkic, pulpit: { ...szkic.pulpit, pokazKafelki } })} />
        <Przelacznik etykieta="Oś czasu" opis="Preferencja dla osi wdrażanej w Etapie 3." zaznaczony={szkic.pulpit.pokazOsCzasu} zmien={(pokazOsCzasu) => aktualizujSzkic({ ...szkic, pulpit: { ...szkic.pulpit, pokazOsCzasu } })} />
        <Przelacznik etykieta="Miniatury" opis="Pokazuj zasoby przy elementach Pulpitu." zaznaczony={szkic.pulpit.pokazMiniatury} zmien={(pokazMiniatury) => aktualizujSzkic({ ...szkic, pulpit: { ...szkic.pulpit, pokazMiniatury } })} />
        <label className="pole pole--pelne"><span>Limit alertów</span><input type="number" min="1" max="10" value={szkic.pulpit.limitAlertow} onChange={(e) => aktualizujSzkic({ ...szkic, pulpit: { ...szkic.pulpit, limitAlertow: Number(e.target.value) } })} /></label>
      </SekcjaUstawien>

      <SekcjaUstawien tytul="Harmonogram" resetuj={() => resetujSekcje('harmonogram')}>
        <div className="pole pole--pelne"><span>Dni pracy</span><div className="dni-tygodnia">{dniTygodnia.map((dzien) => <label key={dzien.wartosc}><input type="checkbox" checked={szkic.harmonogram.dniPracy.includes(dzien.wartosc)} onChange={(e) => { const dniPracy = e.target.checked ? [...szkic.harmonogram.dniPracy, dzien.wartosc] : szkic.harmonogram.dniPracy.filter((x) => x !== dzien.wartosc); aktualizujSzkic({ ...szkic, harmonogram: { ...szkic.harmonogram, dniPracy } }) }} /><span>{dzien.etykieta}</span></label>)}</div></div>
        <label className="pole"><span>Początek pracy</span><input type="time" value={szkic.harmonogram.godzinaRozpoczecia} onChange={(e) => aktualizujSzkic({ ...szkic, harmonogram: { ...szkic.harmonogram, godzinaRozpoczecia: e.target.value } })} /></label>
        <label className="pole"><span>Koniec pracy</span><input type="time" value={szkic.harmonogram.godzinaZakonczenia} onChange={(e) => aktualizujSzkic({ ...szkic, harmonogram: { ...szkic.harmonogram, godzinaZakonczenia: e.target.value } })} /></label>
        <label className="pole"><span>Dojazd (min)</span><input type="number" min="0" max="180" value={szkic.harmonogram.dojazdDoPracyMinuty} onChange={(e) => aktualizujSzkic({ ...szkic, harmonogram: { ...szkic.harmonogram, dojazdDoPracyMinuty: Number(e.target.value) } })} /></label>
        <label className="pole"><span>Powrót z pracy (min)</span><input type="number" min="0" max="180" value={szkic.harmonogram.powrotZPracyMinuty} onChange={(e) => aktualizujSzkic({ ...szkic, harmonogram: { ...szkic.harmonogram, powrotZPracyMinuty: Number(e.target.value) } })} /></label>
        <label className="pole pole--pelne"><span>Dostępność podczas dojazdu</span><select value={szkic.harmonogram.dostepnoscDojazdu} onChange={(e) => aktualizujSzkic({ ...szkic, harmonogram: { ...szkic.harmonogram, dostepnoscDojazdu: e.target.value as Ustawienia['harmonogram']['dostepnoscDojazdu'] } })}><option value="czesciowa">Częściowa</option><option value="pelna">Pełna</option></select><small>Domyślnie częściowa. Ręczne przełączenie na pełną dostępność pozostaje możliwe.</small></label>
        <label className="pole pole--pelne"><span>Zakres zmiany harmonogramu</span><select value={szkic.harmonogram.domyslnyZakresZmiany} onChange={(e) => aktualizujSzkic({ ...szkic, harmonogram: { ...szkic.harmonogram, domyslnyZakresZmiany: e.target.value as Ustawienia['harmonogram']['domyslnyZakresZmiany'] } })}><option value="tylko_ten_dzien">Tylko ten dzień</option><option value="nowa_regula">Zapisz jako nową regułę</option></select></label>
      </SekcjaUstawien>

      <SekcjaUstawien tytul="Zadania" resetuj={() => resetujSekcje('zadania')}>
        <label className="pole"><span>Domyślny priorytet</span><select value={szkic.zadania.domyslnyPriorytet} onChange={(e) => aktualizujSzkic({ ...szkic, zadania: { ...szkic.zadania, domyslnyPriorytet: e.target.value as Ustawienia['zadania']['domyslnyPriorytet'] } })}><option value="niski">Niski</option><option value="normalny">Normalny</option><option value="wysoki">Wysoki</option><option value="krytyczny">Krytyczny</option></select></label>
        <label className="pole"><span>Domyślny tryb terminu</span><select value={szkic.zadania.domyslnyTrybTerminu} onChange={(e) => aktualizujSzkic({ ...szkic, zadania: { ...szkic.zadania, domyslnyTrybTerminu: e.target.value as Ustawienia['zadania']['domyslnyTrybTerminu'] } })}><option value="o_godzinie">O godzinie</option><option value="koniec_dnia">Do końca dnia</option><option value="bez_godziny">Bez godziny</option></select></label>
        <Przelacznik etykieta="Pokazuj po wykonaniu" opis="Zachowaj wykonane elementy w widocznej sekcji." zaznaczony={szkic.zadania.pokazPoWykonaniu} zmien={(pokazPoWykonaniu) => aktualizujSzkic({ ...szkic, zadania: { ...szkic.zadania, pokazPoWykonaniu } })} />
      </SekcjaUstawien>

      <SekcjaUstawien tytul="Szybkie dodawanie" resetuj={() => resetujSekcje('szybkieDodawanie')}>
        <div className="pole pole--pelne"><span>Widoczne typy</span><div className="lista-typow-szybkich">{typySzybkiegoDodawania.map((typ) => <label key={typ.wartosc}><input type="checkbox" checked={szkic.szybkieDodawanie.widoczneTypy.includes(typ.wartosc)} onChange={(e) => zmienWidocznoscTypu(typ.wartosc, e.target.checked)} />{typ.etykieta}</label>)}</div></div>
        <Przelacznik etykieta="Ucz kolejności" opis="Najczęściej używane typy mogą przesuwać się wyżej." zaznaczony={szkic.szybkieDodawanie.uczKolejnosci} zmien={(uczKolejnosci) => aktualizujSzkic({ ...szkic, szybkieDodawanie: { ...szkic.szybkieDodawanie, uczKolejnosci } })} />
        <Przelacznik etykieta="Parser lokalny" opis="Włącza deterministyczne rozpoznawanie typu, daty i godziny." zaznaczony={szkic.szybkieDodawanie.parserWlaczony} zmien={(parserWlaczony) => aktualizujSzkic({ ...szkic, szybkieDodawanie: { ...szkic.szybkieDodawanie, parserWlaczony } })} />
      </SekcjaUstawien>

      <SekcjaUstawien tytul="Dostępność" resetuj={() => resetujSekcje('dostepnosc')}>
        <Przelacznik etykieta="Ogranicz ruch" opis="Wyłącza animacje i przejścia interfejsu." zaznaczony={szkic.dostepnosc.ograniczRuch} zmien={(ograniczRuch) => aktualizujSzkic({ ...szkic, dostepnosc: { ...szkic.dostepnosc, ograniczRuch } })} />
        <Przelacznik etykieta="Wysoki kontrast" opis="Wzmacnia obramowania i czytelność aktywnych elementów." zaznaczony={szkic.dostepnosc.wysokiKontrast} zmien={(wysokiKontrast) => aktualizujSzkic({ ...szkic, dostepnosc: { ...szkic.dostepnosc, wysokiKontrast } })} />
        <Przelacznik etykieta="Nie tylko kolor" opis="Stany powinny zachowywać tekst lub ikonę obok koloru." zaznaczony={szkic.dostepnosc.nieTylkoKolor} zmien={(nieTylkoKolor) => aktualizujSzkic({ ...szkic, dostepnosc: { ...szkic.dostepnosc, nieTylkoKolor } })} />
      </SekcjaUstawien>
    </div>
  </section>
}

function SekcjaUstawien({ tytul, resetuj, children }: { tytul: string; resetuj: () => void; children: ReactNode }) {
  return <Karta klasa="sekcja-ustawien">
    <div className="naglowek-karty"><h3>{tytul}</h3><button type="button" className="przycisk przycisk--tekstowy przycisk--maly" onClick={resetuj}>Resetuj sekcję</button></div>
    <div className="formularz">{children}</div>
  </Karta>
}

function Przelacznik({ etykieta, opis, zaznaczony, zmien }: { etykieta: string; opis: string; zaznaczony: boolean; zmien: (wartosc: boolean) => void }) {
  return <label className="ustawienie-wiersz pole--pelne"><span><strong>{etykieta}</strong><small>{opis}</small></span><input type="checkbox" checked={zaznaczony} onChange={(e) => zmien(e.target.checked)} /></label>
}
