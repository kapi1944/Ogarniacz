import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Bell, CalendarPlus, Car, Check, ListTodo, NotebookPen, Pill, Receipt, SlidersHorizontal, Stethoscope, Undo2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { dzisiajIso, utworzMetadane } from '../domain/fabryki'
import { parserRegulowySzybkiegoDodawania, uporzadkujTypySzybkiegoDodawania } from '../domain/parserSzybkiegoDodawania'
import type { BlokCzasu, DaneSzybkiegoDodawania, Lek, NazwaModulu, Notatka, Pojazd, Priorytet, Przypomnienie, TypSzybkiegoDodawania, Wizyta, Wydatek } from '../domain/typy'
import { utworzZadanie } from '../services/ZadaniaService'
import { Komunikat, Modal, Znacznik } from '../components/Interfejs'
import { platforma } from '../platform/platforma'
import { useAplikacja } from './KontekstAplikacji'

const typy: { typ: TypSzybkiegoDodawania; etykieta: string; ikona: typeof ListTodo; modul?: NazwaModulu }[] = [
  { typ: 'zadanie', etykieta: 'Zadanie', ikona: ListTodo, modul: 'zadania' }, { typ: 'notatka', etykieta: 'Notatka', ikona: NotebookPen, modul: 'notatki' },
  { typ: 'wydarzenie', etykieta: 'Wydarzenie', ikona: CalendarPlus, modul: 'planer' }, { typ: 'przypomnienie', etykieta: 'Przypomnienie', ikona: Bell, modul: 'przypomnienia' },
  { typ: 'wizyta', etykieta: 'Wizyta', ikona: Stethoscope, modul: 'wizyty' }, { typ: 'lek', etykieta: 'Lek', ikona: Pill, modul: 'leki' },
  { typ: 'wydatek', etykieta: 'Wydatek', ikona: Receipt, modul: 'finanse' }, { typ: 'samochod', etykieta: 'Samochód', ikona: Car, modul: 'samochod' },
]

const sciezkiTypow: Record<TypSzybkiegoDodawania, string> = { zadanie: '/zadania', notatka: '/notatki', wydarzenie: '/planer', przypomnienie: '/przypomnienia', wizyta: '/zdrowie/wizyty', lek: '/zdrowie/leki', wydatek: '/finanse', samochod: '/samochod' }

function koniecWydarzenia(data: string, godzina: string) {
  const koniec = new Date(`${data}T${godzina}:00`)
  koniec.setMinutes(koniec.getMinutes() + 60)
  const dwaZnaki = (wartosc: number) => String(wartosc).padStart(2, '0')
  return `${koniec.getFullYear()}-${dwaZnaki(koniec.getMonth() + 1)}-${dwaZnaki(koniec.getDate())}T${dwaZnaki(koniec.getHours())}:${dwaZnaki(koniec.getMinutes())}:00`
}

function etykietaTerminu(data: string, godzina: string) {
  if (!data) return 'bez terminu'
  return godzina ? `${data}, ${godzina}` : data
}

async function usunUtworzony(typ: TypSzybkiegoDodawania, id: string) {
  if (typ === 'zadanie') return pobierzRepozytorium('zadania').usun(id)
  if (typ === 'notatka') return pobierzRepozytorium('notatki').usun(id)
  if (typ === 'wydarzenie') return pobierzRepozytorium('blokiCzasu').usun(id)
  if (typ === 'przypomnienie') return pobierzRepozytorium('przypomnienia').usun(id)
  if (typ === 'wizyta') return pobierzRepozytorium('wizyty').usun(id)
  if (typ === 'lek') return pobierzRepozytorium('leki').usun(id)
  if (typ === 'wydatek') return pobierzRepozytorium('wydatki').usun(id)
  return pobierzRepozytorium('pojazdy').usun(id)
}

export function SzybkieDodawanie({ zamknij, moze, danePoczatkowe = {} }: { zamknij: () => void; moze: (modul: NazwaModulu, operacja?: 'odczyt' | 'edycja') => boolean; danePoczatkowe?: DaneSzybkiegoDodawania }) {
  const { ustawienia, zapiszUstawienia } = useAplikacja()
  const nawiguj = useNavigate()
  const [typ, ustawTyp] = useState<TypSzybkiegoDodawania>(danePoczatkowe.typ ?? 'zadanie')
  const [tresc, ustawTresc] = useState(danePoczatkowe.tresc ?? '')
  const [tytul, ustawTytul] = useState(danePoczatkowe.tytul ?? '')
  const [data, ustawDate] = useState('')
  const [godzina, ustawGodzine] = useState('')
  const [priorytet, ustawPriorytet] = useState<Priorytet>(ustawienia.zadania.domyslnyPriorytet)
  const [kwota, ustawKwote] = useState('')
  const [instrukcja, ustawInstrukcje] = useState('')
  const [blad, ustawBlad] = useState('')
  const [szczegoly, ustawSzczegoly] = useState(Boolean(danePoczatkowe.typ))
  const [wiecejTypow, ustawWiecejTypow] = useState(false)
  const [utworzony, ustawUtworzony] = useState<{ id: string; typ: TypSzybkiegoDodawania; nazwa: string; termin: string } | null>(null)
  const [nadpisane, ustawNadpisane] = useState({ typ: Boolean(danePoczatkowe.typ), tytul: Boolean(danePoczatkowe.tytul), data: false, godzina: false })
  const sugestia = useMemo(() => ustawienia.szybkieDodawanie.parserWlaczony ? parserRegulowySzybkiegoDodawania.parse(tresc, { referenceDate: new Date() }) : undefined, [tresc, ustawienia.szybkieDodawanie.parserWlaczony])
  const uporzadkowane = useMemo(() => uporzadkujTypySzybkiegoDodawania(ustawienia.szybkieDodawanie).map((wartosc) => typy.find((element) => element.typ === wartosc)!).filter((element) => !element.modul || moze(element.modul, 'edycja')), [moze, ustawienia.szybkieDodawanie])
  const bezposrednie = uporzadkowane.filter((element) => ustawienia.szybkieDodawanie.widoczneTypy.includes(element.typ))
  const pozostale = uporzadkowane.filter((element) => !bezposrednie.includes(element))

  useEffect(() => {
    if (!sugestia) return
    if (!nadpisane.typ) ustawTyp(sugestia.suggestedType)
    if (!nadpisane.tytul) ustawTytul(sugestia.cleanedTitle)
    if (!nadpisane.data) ustawDate(sugestia.suggestedDate ?? '')
    if (!nadpisane.godzina) ustawGodzine(sugestia.suggestedTime ?? '')
  }, [sugestia, nadpisane])

  const wybierzTyp = (nowy: TypSzybkiegoDodawania) => {
    ustawTyp(nowy)
    ustawSzczegoly(true)
    ustawNadpisane((stan) => ({ ...stan, typ: true }))
  }

  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    const nazwa = tytul.trim() || tresc.trim()
    if (!nazwa) return ustawBlad('Wpisz, co chcesz ogarnąć.')
    try {
      let id = ''
      if (typ === 'zadanie') {
        const zadanie = { ...utworzZadanie({ tytul: nazwa, opis: tytul.trim() ? tresc.trim() : '', priorytet, termin: data ? `${data}${godzina ? `T${godzina}:00` : ''}` : undefined }), ...(data ? { dataElementu: data, trybTerminuElementu: godzina ? 'o_godzinie' as const : 'koniec_dnia' as const, ...(godzina ? { godzinaElementu: godzina } : {}) } : {}) }
        await pobierzRepozytorium('zadania').zapisz(zadanie); id = zadanie.id
      }
      if (typ === 'notatka') { const notatka = { ...utworzMetadane(), tytul: nazwa.slice(0, 70), tresc: tresc.trim(), tagi: [], powiazania: [] } satisfies Notatka; await pobierzRepozytorium('notatki').zapisz(notatka); id = notatka.id }
      if (typ === 'wydarzenie') { if (!data || !godzina) throw new Error('Wydarzenie wymaga daty i godziny.'); const wydarzenie = { ...utworzMetadane(), tytul: nazwa, poczatek: `${data}T${godzina}:00`, koniec: koniecWydarzenia(data, godzina), typ: 'inne', elastycznosc: 'twardy', status: 'zaakceptowany' } satisfies BlokCzasu; await pobierzRepozytorium('blokiCzasu').zapisz(wydarzenie); id = wydarzenie.id }
      if (typ === 'przypomnienie') { if (!data || !godzina) throw new Error('Przypomnienie wymaga daty i godziny.'); const przypomnienie = { ...utworzMetadane(), tytul: nazwa, typ: 'absolutne', czas: `${data}T${godzina}:00`, priorytet, stan: 'nowe', eskalacja: false } satisfies Przypomnienie; await pobierzRepozytorium('przypomnienia').zapisz(przypomnienie); id = przypomnienie.id }
      if (typ === 'wizyta') { const wizyta = { ...utworzMetadane(), nazwa, status: data ? 'umowiona' : 'do_umowienia', data: data || undefined, godzina: godzina || undefined, notatka: '', pytania: [], dokumentyIds: [], checklista: [] } satisfies Wizyta; await pobierzRepozytorium('wizyty').zapisz(wizyta); id = wizyta.id }
      if (typ === 'lek') { const lek = { ...utworzMetadane(), nazwa, dawkaInstrukcja: instrukcja.trim() || 'Uzupełnij instrukcję użytkownika', godziny: godzina ? [godzina] : [], aktywny: true } satisfies Lek; await pobierzRepozytorium('leki').zapisz(lek); id = lek.id }
      if (typ === 'wydatek') { const liczba = Number(kwota.replace(',', '.')); if (!Number.isFinite(liczba) || liczba <= 0) throw new Error('Podaj prawidłową kwotę wydatku.'); const wydatek = { ...utworzMetadane(), opis: nazwa, kwota: liczba, data: data || dzisiajIso(), kategoria: 'Inne' } satisfies Wydatek; await pobierzRepozytorium('wydatki').zapisz(wydatek); id = wydatek.id }
      if (typ === 'samochod') { const pojazd = { ...utworzMetadane(), nazwa, planowanySerwisData: data || undefined, planowanySerwisGodzina: data && godzina ? godzina : undefined, notatka: tresc.trim() || undefined } satisfies Pojazd; await pobierzRepozytorium('pojazdy').zapisz(pojazd); id = pojazd.id }
      await zapiszUstawienia({ szybkieDodawanie: { ...ustawienia.szybkieDodawanie, licznikiUzyc: { ...ustawienia.szybkieDodawanie.licznikiUzyc, [typ]: ustawienia.szybkieDodawanie.licznikiUzyc[typ] + 1 } } })
      await platforma.haptyka.sukces()
      ustawUtworzony({ id, typ, nazwa, termin: etykietaTerminu(data, godzina) })
      ustawBlad('')
    } catch (przyczyna) {
      ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się zapisać elementu.')
    }
  }

  const cofnij = async () => {
    if (!utworzony) return
    await usunUtworzony(utworzony.typ, utworzony.id)
    ustawUtworzony(null)
  }

  if (utworzony) return <Modal tytul="Dodano do Ogarniacza" opis="Element jest zapisany lokalnie i gotowy do synchronizacji." zamknij={zamknij}>
    <Komunikat typ="sukces"><Check aria-hidden="true" /> Utworzono: <strong>{utworzony.nazwa}</strong> · {typy.find((element) => element.typ === utworzony.typ)?.etykieta} · {utworzony.termin}</Komunikat>
    <div className="akcje-formularza"><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => void cofnij()}><Undo2 aria-hidden="true" />Cofnij</button><button type="button" className="przycisk przycisk--glowny" onClick={() => { nawiguj(`${sciezkiTypow[utworzony.typ]}?element=${encodeURIComponent(utworzony.id)}`); zamknij() }}><ArrowRight aria-hidden="true" />Przejdź do elementu</button></div>
  </Modal>

  return <Modal tytul="Dodaj do Ogarniacza" opis="Zapisz sprawę teraz, a szczegóły doprecyzuj tylko wtedy, gdy ich potrzebujesz." zamknij={zamknij} szeroki>
    <form className="formularz" onSubmit={zapisz}>
      {blad && <Komunikat typ="blad">{blad}</Komunikat>}
      <label className="pole pole--pelne"><span>Co chcesz ogarnąć? *</span><input autoFocus value={tresc} onChange={(e) => ustawTresc(e.target.value)} placeholder="np. dentysta jutro 16 albo kupić mleko" /></label>
      {tresc && sugestia && <div className="pole pole--pelne"><span>Propozycja Ogarniacza</span><div><Znacznik wariant="informacja">{typy.find((element) => element.typ === typ)?.etykieta}</Znacznik>{(data || godzina) && <small> · {etykietaTerminu(data, godzina)}</small>}{sugestia.confidence !== 'niska' && <small> · rozpoznano z tekstu</small>}</div></div>}
      <button type="button" className="przycisk przycisk--tekstowy pole--pelne" onClick={() => ustawSzczegoly(!szczegoly)}><SlidersHorizontal aria-hidden="true" />{szczegoly ? 'Ukryj szczegóły' : 'Dodaj szczegóły'}</button>
      {szczegoly && <>
        <div className="wybor-typu pole--pelne">{bezposrednie.map((element) => { const Ikona = element.ikona; return <button type="button" key={element.typ} className={typ === element.typ ? 'wybor-typu__przycisk wybor-typu__przycisk--aktywny' : 'wybor-typu__przycisk'} onClick={() => wybierzTyp(element.typ)}><Ikona aria-hidden="true" />{element.etykieta}</button> })}{pozostale.length > 0 && <button type="button" className="wybor-typu__przycisk" onClick={() => ustawWiecejTypow(!wiecejTypow)}>Więcej</button>}{wiecejTypow && pozostale.map((element) => <button type="button" key={element.typ} className="wybor-typu__przycisk" onClick={() => wybierzTyp(element.typ)}>{element.etykieta}</button>)}</div>
        <label className="pole pole--pelne"><span>Tytuł</span><input value={tytul} onChange={(e) => { ustawTytul(e.target.value); ustawNadpisane((stan) => ({ ...stan, tytul: true })) }} placeholder="Automatycznie z treści" /></label>
        {['zadanie', 'wydarzenie', 'przypomnienie', 'wizyta', 'wydatek', 'samochod'].includes(typ) && <label className="pole"><span>Termin</span><input type="date" required={typ === 'wydarzenie' || typ === 'przypomnienie'} value={data} onChange={(e) => { ustawDate(e.target.value); ustawNadpisane((stan) => ({ ...stan, data: true })) }} /></label>}
        {['zadanie', 'wydarzenie', 'przypomnienie', 'wizyta', 'lek', 'samochod'].includes(typ) && <label className="pole"><span>Godzina</span><input type="time" required={typ === 'wydarzenie' || typ === 'przypomnienie'} value={godzina} onChange={(e) => { ustawGodzine(e.target.value); ustawNadpisane((stan) => ({ ...stan, godzina: true })) }} /></label>}
        {['zadanie', 'przypomnienie'].includes(typ) && <label className="pole"><span>Priorytet</span><select value={priorytet} onChange={(e) => ustawPriorytet(e.target.value as Priorytet)}><option value="niski">Niski</option><option value="normalny">Normalny</option><option value="wysoki">Wysoki</option><option value="krytyczny">Krytyczny</option></select></label>}
        {typ === 'lek' && <label className="pole pole--pelne"><span>Instrukcja</span><input value={instrukcja} onChange={(e) => ustawInstrukcje(e.target.value)} placeholder="np. zgodnie z zaleceniem" /></label>}
        {typ === 'wydatek' && <label className="pole"><span>Kwota *</span><input type="number" min="0.01" step="0.01" value={kwota} onChange={(e) => ustawKwote(e.target.value)} /></label>}
      </>}
      <div className="akcje-formularza pole--pelne"><button type="button" className="przycisk przycisk--drugorzedny" onClick={zamknij}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny">Dodaj</button></div>
    </form>
  </Modal>
}