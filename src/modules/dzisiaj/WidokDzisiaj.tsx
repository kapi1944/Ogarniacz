import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format } from 'date-fns'
import { CalendarDays, Check, ChevronRight, Clock3, MessageCircle, Plus, Undo2 } from 'lucide-react'
import { Karta, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { dzisiajIso } from '../../domain/fabryki'
import { poprawnaGodzinaTerminu } from '../../domain/logikaTerminuZadania'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { DostawcaFinansowPulpitu } from '../../providers/DostawcaFinansowPulpitu'
import { DostawcaLekowPulpitu } from '../../providers/DostawcaLekowPulpitu'
import { DostawcaNotatekPulpitu } from '../../providers/DostawcaNotatekPulpitu'
import { DostawcaSamochoduPulpitu } from '../../providers/DostawcaSamochoduPulpitu'
import { DostawcaWizytPulpitu } from '../../providers/DostawcaWizytPulpitu'
import { DostawcaZadanPulpitu } from '../../providers/DostawcaZadanPulpitu'
import { DostawcaZakupowPulpitu } from '../../providers/DostawcaZakupowPulpitu'
import { repozytoriumElementowZadan } from '../../data/RepozytoriumElementowZadan'
import { adresReferencjiZrodla } from '../pulpit/logikaKafelkow'
import { utworzHarmonogramDnia } from '../pulpit/logikaOsiCzasu'
import { sortujElementyDzisiaj, wybierzElementTeraz } from '../pulpit/logikaDniaPulpitu'

const dostawcaZadan = new DostawcaZadanPulpitu()
const dostawcaLekow = new DostawcaLekowPulpitu()
const dostawcaWizyt = new DostawcaWizytPulpitu()
const dostawcaFinansow = new DostawcaFinansowPulpitu()
const dostawcaSamochodu = new DostawcaSamochoduPulpitu()
const dostawcaZakupow = new DostawcaZakupowPulpitu()
const dostawcaNotatek = new DostawcaNotatekPulpitu()

function etykietaTypu(element: ElementOgarniacza): string {
  const etykiety = { zadanie: 'Zadanie', lek: 'Lek', wizyta: 'Wizyta', platnosc: 'Płatność', samochod: 'Samochód', zakupy: 'Zakupy', notatka: 'Notatka', wydarzenie: 'Wydarzenie' }
  return etykiety[element.typ as keyof typeof etykiety] ?? 'Element dnia'
}

function stanCzasu(element: ElementOgarniacza, teraz: Date): 'przeszly' | 'teraz' | 'najblizszy' | 'pozniej' {
  if (!element.godzina) return 'pozniej'
  const [godzina, minuta] = element.godzina.split(':').map(Number)
  const minutyElementu = godzina * 60 + minuta
  const minutyTeraz = teraz.getHours() * 60 + teraz.getMinutes()
  if (element.czasTrwaniaMinuty && minutyElementu <= minutyTeraz && minutyTeraz < minutyElementu + element.czasTrwaniaMinuty) return 'teraz'
  return minutyElementu < minutyTeraz ? 'przeszly' : 'pozniej'
}

export function WidokPulpitu() {
  const data = dzisiajIso()
  const [teraz, ustawTeraz] = useState(() => new Date())
  const { moze, otworzSzybkieDodawanie, ustawienia } = useAplikacja()
  const { dane: wyjatki } = useRepozytorium('wyjatkiGrafiku')

  useEffect(() => {
    const identyfikator = window.setInterval(() => ustawTeraz(new Date()), 60_000)
    return () => window.clearInterval(identyfikator)
  }, [])

  const wyjatekDnia = useMemo(() => [...wyjatki].filter((wyjatek) => wyjatek.data === data).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0], [data, wyjatki])
  const harmonogram = useMemo(() => utworzHarmonogramDnia(data, ustawienia.harmonogram, wyjatekDnia), [data, ustawienia.harmonogram, wyjatekDnia])
  const elementyDnia = useLiveQuery(async () => {
    const zakres = { od: data, do: data }
    const [zadania, leki, wizyty, finanse, samochod, zakupy, notatki] = await Promise.all([
      dostawcaZadan.pobierzElementy(zakres), dostawcaLekow.pobierzElementy(zakres), dostawcaWizyt.pobierzElementy(zakres),
      dostawcaFinansow.pobierzElementy(zakres), dostawcaSamochodu.pobierzElementy(zakres), dostawcaZakupow.pobierzElementy(zakres), dostawcaNotatek.pobierzElementy(zakres),
    ])
    return [...zadania, ...leki, ...wizyty, ...finanse.filter((element) => element.typ === 'platnosc'), ...samochod, ...zakupy, ...notatki]
  }, [data], [])
  const wszystkieZadania = useLiveQuery(() => dostawcaZadan.pobierzElementy({ od: '1900-01-01', do: '9999-12-31' }), [], [])

  const zaplanowane = useMemo(() => elementyDnia
    .filter((element) => element.trybTerminu === 'o_godzinie' && poprawnaGodzinaTerminu(element.godzina))
    .filter((element) => element.typ === 'lek' || (element.status !== 'wykonany' && element.status !== 'anulowany'))
    .sort((a, b) => (a.godzina ?? '').localeCompare(b.godzina ?? '') || a.tytul.localeCompare(b.tytul, 'pl')), [elementyDnia])
  const bezGodziny = useMemo(() => sortujElementyDzisiaj(elementyDnia, data).filter((element) => !element.godzina), [data, elementyDnia])
  const elementTeraz = useMemo(() => wybierzElementTeraz(elementyDnia, data, teraz), [data, elementyDnia, teraz])
  const zalegle = useMemo(() => wszystkieZadania
    .filter((element) => element.status === 'otwarty' && Boolean(element.data && element.data < data))
    .sort((a, b) => (b.priorytet === 'asap' ? 2 : b.priorytet === 'pilny' ? 1 : 0) - (a.priorytet === 'asap' ? 2 : a.priorytet === 'pilny' ? 1 : 0) || (a.data ?? '').localeCompare(b.data ?? ''))
    .slice(0, 3), [data, wszystkieZadania])
  const maElementy = zaplanowane.length > 0 || bezGodziny.length > 0
  const najblizszyId = elementTeraz?.stan === 'najblizszy' ? elementTeraz.element.id : undefined
  const charakterDnia = harmonogram.pracuje ? `Praca ${harmonogram.odPracy}–${harmonogram.doPracy}` : 'Dzień bez pracy'

  const wykonaj = async (element: ElementOgarniacza) => {
    if (element.typ !== 'zadanie') return
    await repozytoriumElementowZadan.aktualizuj(element.id, { status: 'wykonany' })
  }
  const przeloz = async (element: ElementOgarniacza) => {
    if (element.typ !== 'zadanie') return
    await repozytoriumElementowZadan.aktualizuj(element.id, { data: format(addDays(new Date(`${data}T12:00:00`), 1), 'yyyy-MM-dd'), trybTerminu: 'koniec_dnia', godzina: undefined })
  }

  return <div className="widok widok-dzisiaj">
    <NaglowekWidoku tytul="Dzisiaj" opis="Plan dnia krok po kroku." akcje={<button type="button" className="przycisk przycisk--glowny" onClick={otworzSzybkieDodawanie}><Plus aria-hidden="true" />Dodaj</button>} />

    <section className="plan-dnia__wprowadzenie">
      <div><span className="plan-dnia__etykieta"><CalendarDays aria-hidden="true" />{new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(teraz)}</span><strong>{charakterDnia}{harmonogram.jestWyjatkiem ? ' · wyjątek grafiku' : ''}</strong></div>
      <div className="plan-dnia__najblizszy"><small>{elementTeraz?.stan === 'trwa' ? 'Teraz' : 'Najbliższy krok'}</small><strong>{elementTeraz ? `${elementTeraz.element.godzina ? `${elementTeraz.element.godzina} · ` : ''}${elementTeraz.element.tytul}` : 'Dzień jest spokojny'}</strong></div>
      {zalegle[0] && <Link className="plan-dnia__zalegle" to={adresReferencjiZrodla(zalegle[0].referencjaZrodla!)}><small>Najważniejsze zaległe</small><strong>{zalegle[0].tytul}</strong><ChevronRight aria-hidden="true" /></Link>}
    </section>

    <section className="plan-dnia__agenda" aria-labelledby="agenda-dnia">
      <div className="naglowek-karty"><div><h2 id="agenda-dnia"><Clock3 aria-hidden="true" /> Plan dnia</h2><p>Godziny prowadzą przez dzień, a harmonogram pozostaje w tle.</p></div></div>
      <div className="plan-dnia__harmonogram" aria-label="Kontekst harmonogramu">{harmonogram.przedzialy.length === 0 ? <span>Wolny rytm dnia · sen {ustawienia.harmonogram.poczatekSnu}–{ustawienia.harmonogram.koniecSnu}</span> : harmonogram.przedzialy.map((przedzial) => <span key={przedzial.id}>{przedzial.etykieta} {przedzial.od}–{przedzial.do}</span>)}</div>
      {zaplanowane.length === 0 ? <PustyStan tytul="Brak elementów z godziną" opis="Zostaw przestrzeń w planie albo dodaj pierwszy konkretny krok." /> : <div className="plan-dnia__os">{zaplanowane.map((element) => {
        const stan = element.id === najblizszyId ? 'najblizszy' : stanCzasu(element, teraz)
        return <div className={`plan-dnia__element plan-dnia__element--${stan}`} key={element.id}><time>{element.godzina}</time><span className="plan-dnia__punkt" /><div><div className="plan-dnia__tytul">{element.referencjaZrodla ? <Link to={adresReferencjiZrodla(element.referencjaZrodla)}><strong>{element.tytul}</strong></Link> : <strong>{element.tytul}</strong>}{stan === 'teraz' && <Znacznik wariant="sukces">teraz</Znacznik>}{stan === 'najblizszy' && <Znacznik wariant="informacja">najbliższe</Znacznik>}</div><small>{etykietaTypu(element)}{element.czasTrwaniaMinuty ? ` · ${element.czasTrwaniaMinuty} min` : ''}</small>{element.typ === 'zadanie' && <div className="plan-dnia__akcje"><button type="button" className="przycisk przycisk--maly" disabled={!moze('zadania', 'edycja')} onClick={() => void wykonaj(element)}><Check aria-hidden="true" />Wykonaj</button><Link className="przycisk przycisk--tekstowy" to={adresReferencjiZrodla(element.referencjaZrodla!)}>Otwórz</Link></div>}</div></div>
      })}</div>}
    </section>

    <section className="plan-dnia__sekcja"><Karta><div className="naglowek-karty"><div><h2>Do zrobienia dzisiaj</h2><p>Elementy bez konkretnej godziny.</p></div></div>{bezGodziny.length === 0 ? <p className="tekst-pomocniczy">Nie masz dziś spraw bez godziny.</p> : <div className="lista-kompaktowa">{bezGodziny.map((element) => <div key={element.id}>{element.typ === 'zadanie' && <button type="button" className="przycisk-check" disabled={!moze('zadania', 'edycja')} onClick={() => void wykonaj(element)} title={`Wykonaj ${element.tytul}`}><Check aria-hidden="true" /></button>}<div>{element.referencjaZrodla ? <Link to={adresReferencjiZrodla(element.referencjaZrodla)}><strong>{element.tytul}</strong></Link> : <strong>{element.tytul}</strong>}<small>{etykietaTypu(element)}</small></div></div>)}</div>}</Karta></section>

    {zalegle.length > 0 && <section className="plan-dnia__sekcja"><Karta klasa="plan-dnia__decyzje"><div className="naglowek-karty"><div><h2>Zaległe wymagające decyzji</h2><p>Pokazujemy tylko najważniejsze trzy.</p></div><Link to="/zadania">Wszystkie</Link></div><div className="lista-kompaktowa">{zalegle.map((element) => <div key={element.id}><div><strong>{element.tytul}</strong><small>Zaległe od {element.data}</small></div><div className="plan-dnia__akcje"><button type="button" className="przycisk przycisk--maly" disabled={!moze('zadania', 'edycja')} onClick={() => void wykonaj(element)}><Check aria-hidden="true" />Wykonaj</button><button type="button" className="przycisk przycisk--tekstowy" disabled={!moze('zadania', 'edycja')} onClick={() => void przeloz(element)}><Undo2 aria-hidden="true" />Przełóż</button><Link className="przycisk przycisk--tekstowy" to={adresReferencjiZrodla(element.referencjaZrodla!)}>Otwórz</Link></div></div>)}</div></Karta></section>}

    {!maElementy && <Karta klasa="plan-dnia__pusty"><PustyStan tytul="Dzień ma jeszcze dużo przestrzeni" opis="Dodaj jedną rzecz, od której chcesz zacząć, albo poproś Echo o pomoc w ułożeniu dnia." akcja={<div className="plan-dnia__akcje"><button type="button" className="przycisk przycisk--glowny" onClick={otworzSzybkieDodawanie}><Plus aria-hidden="true" />Dodaj coś</button>{moze('echo') && <Link className="przycisk przycisk--drugorzedny" to="/echo"><MessageCircle aria-hidden="true" />Porozmawiaj z Echo</Link>}</div>} /></Karta>}
  </div>
}
