import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { CalendarDays, Check, ChevronRight, Clock3, MessageCircle, Plus, Undo2 } from 'lucide-react'
import { Karta, Komunikat, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { SkupienieDnia, type ZrodloSkupieniaDnia } from '../../components/kalendarz/SkupienieDnia'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { dzisiajIso } from '../../domain/fabryki'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import { repozytoriumElementowZadan } from '../../data/RepozytoriumElementowZadan'
import { adresReferencjiZrodla } from '../pulpit/logikaKafelkow'
import { useDaneDni } from '../pulpit/useDaneDni'
import { PlanWybranegoDnia } from '../pulpit/PlanWybranegoDnia'
import { HoryzontTygodniowy } from './HoryzontTygodniowy'
import { zakresHoryzontu } from './logikaHoryzontu'
import { czyElementOtwarty, etykietaStatusuElementu, stanCzasuElementu, wybierzElementTeraz } from '../pulpit/logikaDniaPulpitu'
import { useSzybkieDzialaniaDnia } from './useSzybkieDzialaniaDnia'

function etykietaTypu(element: ElementOgarniacza): string {
  const etykiety = { zadanie: 'Zadanie', lek: 'Lek', wizyta: 'Wizyta', platnosc: 'Płatność', samochod: 'Samochód', zakupy: 'Zakupy', notatka: 'Notatka', wydarzenie: 'Wydarzenie', planer: 'Blok planera' }
  return etykiety[element.typ as keyof typeof etykiety] ?? 'Element dnia'
}

export function WidokDzisiaj() {
  const [teraz, ustawTeraz] = useState(() => new Date())
  const data = dzisiajIso(teraz)
  const [wybranyDzien, ustawWybranyDzien] = useState<{ data: string; zrodlo: ZrodloSkupieniaDnia }>()
  const { moze, otworzSzybkieDodawanie, ustawienia } = useAplikacja()
  const dzialania = useSzybkieDzialaniaDnia(() => moze('zadania', 'edycja'))

  useEffect(() => {
    const odswiez = () => ustawTeraz(new Date())
    const identyfikator = window.setInterval(odswiez, 60_000)
    window.addEventListener('focus', odswiez)
    document.addEventListener('visibilitychange', odswiez)
    return () => {
      window.clearInterval(identyfikator)
      window.removeEventListener('focus', odswiez)
      document.removeEventListener('visibilitychange', odswiez)
    }
  }, [])

  const zakres = useMemo(() => zakresHoryzontu(data), [data])
  const dane = useDaneDni(zakres)
  const daneDnia = dane.dni.find((dzien) => dzien.data === data)!
  const { harmonogram, elementy: elementyDnia, doZrobieniaBezGodziny: bezGodziny } = daneDnia
  const zaleglosci = useLiveQuery(async () => {
    try { return { ...await repozytoriumElementowZadan.zalegle(data), blad: false } }
    catch { return { elementy: [], liczba: 0, blad: true } }
  }, [data])
  const zalegle = zaleglosci?.elementy ?? []
  const zaplanowane = daneDnia.elementyZGodzina.filter(czyElementOtwarty)
  const zakonczone = elementyDnia.filter((element) => !czyElementOtwarty(element))
  const elementTeraz = wybierzElementTeraz(elementyDnia, data, teraz)
  const nastepnyElement = wybierzElementTeraz(elementyDnia.filter((element) => element.id !== elementTeraz?.element.id), data, teraz)
  const minione = zaplanowane.filter((element) => stanCzasuElementu(element, data, teraz) === 'przeszly')
  const liczbaZaleglych = (zaleglosci?.liczba ?? 0) + minione.filter((element) => element.typ === 'zadanie').length
  const charakterDnia = harmonogram.pracuje ? `Praca ${harmonogram.odPracy}–${harmonogram.doPracy}` : 'Dzień wolny od pracy'
  const najblizszy = elementTeraz?.stan === 'najblizszy' ? elementTeraz.element : undefined
  const doTerminu = najblizszy?.godzina ? Number(najblizszy.godzina.slice(0, 2)) * 60 + Number(najblizszy.godzina.slice(3)) - teraz.getHours() * 60 - teraz.getMinutes() : undefined
  const rytmDnia = liczbaZaleglych > 0 ? `Zaległe zadania: ${liczbaZaleglych}. Wybierz, co wykonać lub przełożyć.`
    : minione.length > 0 ? 'Minęły zaplanowane godziny części spraw. Plan dnia wymaga przejrzenia.'
      : doTerminu !== undefined ? (doTerminu > 0 ? `Najbliższy termin za ${doTerminu} min.` : 'Najbliższy termin jest teraz.')
        : elementyDnia.length > 0 && daneDnia.liczbaWykonanych === elementyDnia.length ? 'Wszystkie zaplanowane działania zostały wykonane.'
          : elementyDnia.length > 0 && daneDnia.liczbaOtwartych === 0 ? 'Nie masz już otwartych spraw na dziś. Sprawdź podsumowanie zakończonych i pominiętych.'
          : 'Wybierz najważniejszy krok. Pozostaw też przestrzeń na odpoczynek.'

  const akcje = (element: ElementOgarniacza) => element.typ === 'zadanie' && czyElementOtwarty(element) && <div className="plan-dnia__akcje">
    <button type="button" className="przycisk przycisk--maly" aria-label={`Wykonaj: ${element.tytul}`} aria-busy={dzialania.zapisywane.has(element.id)} disabled={!moze('zadania', 'edycja') || dzialania.zapisywane.has(element.id)} onClick={() => void dzialania.zmien(element, 'wykonaj')}><Check aria-hidden="true" />{dzialania.zapisywane.has(element.id) ? 'Zapisywanie…' : 'Wykonaj'}</button>
    <button type="button" className="przycisk przycisk--tekstowy" aria-label={`Przełóż na jutro: ${element.tytul}`} disabled={!moze('zadania', 'edycja') || dzialania.zapisywane.has(element.id)} onClick={() => void dzialania.zmien(element, 'przeloz')}><Undo2 aria-hidden="true" />Na jutro</button>
  </div>
  const tytul = (element: ElementOgarniacza) => <div className="plan-dnia__tytul">{element.referencjaZrodla ? <Link to={adresReferencjiZrodla(element.referencjaZrodla, element.data)}><strong>{element.tytul}</strong></Link> : <strong>{element.tytul}</strong>}{element.priorytet && element.priorytet !== 'normalny' && <Znacznik wariant="ostrzezenie">{element.priorytet === 'asap' ? 'Najpilniejsze' : 'Pilne'}</Znacznik>}</div>
  const otworzDzien = (wybranaData: string, element: HTMLButtonElement) => ustawWybranyDzien({ data: wybranaData, zrodlo: { element, prostokat: element.getBoundingClientRect() } })

  return <div className="widok widok-dzisiaj">
    <NaglowekWidoku tytul="Dzisiaj" opis="Plan dnia krok po kroku." akcje={<><Link className="przycisk przycisk--drugorzedny" to={`/planer?data=${data}&od=${format(teraz, 'HH:mm')}`}>Przeplanuj resztę dnia</Link>{moze('echo') && <Link className="przycisk przycisk--drugorzedny" to="/echo"><MessageCircle aria-hidden="true" />Zapytaj Echo</Link>}<button type="button" className="przycisk przycisk--glowny" onClick={otworzSzybkieDodawanie}><Plus aria-hidden="true" />Dodaj</button></>} />
    {dzialania.komunikat && <Komunikat typ={dzialania.komunikat.typ}>{dzialania.komunikat.tresc}{dzialania.ostatniaZmiana && <button type="button" className="przycisk przycisk--tekstowy" disabled={!moze('zadania', 'edycja') || dzialania.zapisywane.has(dzialania.ostatniaZmiana.po.id)} onClick={() => void dzialania.cofnij()}><Undo2 aria-hidden="true" />Cofnij</button>}</Komunikat>}
    {dane.ladowanie && <p role="status">Ładowanie planu dnia…</p>}
    {(dane.blad || zaleglosci?.blad) && <Komunikat typ="blad">Nie udało się pobrać części danych. Plan i liczba zaległości mogą być niepełne.</Komunikat>}

    <section className="plan-dnia__wprowadzenie" aria-label="Najważniejsze teraz" aria-busy={dane.ladowanie}>
      <div className="plan-dnia__najblizszy"><small>{elementTeraz?.stan === 'trwa' ? 'Teraz' : 'Najbliższy krok'}</small><strong>{dane.ladowanie ? 'Pobieranie bieżących spraw…' : elementTeraz ? `${elementTeraz.element.godzina ? `${elementTeraz.element.godzina} · ` : ''}${elementTeraz.element.tytul}` : minione.length ? 'Sprawdź minione terminy' : 'Dzień jest spokojny'}</strong>{elementTeraz && <>{elementTeraz.element.referencjaZrodla && <Link to={adresReferencjiZrodla(elementTeraz.element.referencjaZrodla, elementTeraz.element.data)}>Otwórz szczegóły</Link>}{akcje(elementTeraz.element)}</>}{elementTeraz?.stan === 'trwa' && <small>Następnie: {nastepnyElement ? `${nastepnyElement.element.godzina ? `${nastepnyElement.element.godzina} · ` : ''}${nastepnyElement.element.tytul}` : 'brak kolejnych spraw'}</small>}</div>
      <div><time className="plan-dnia__zegar" dateTime={format(teraz, "yyyy-MM-dd'T'HH:mm")}>{format(teraz, 'HH:mm')}</time><span className="plan-dnia__etykieta"><CalendarDays aria-hidden="true" />{format(teraz, 'EEEE, d MMMM', { locale: pl })}</span><strong>{charakterDnia}{harmonogram.jestWyjatkiem ? ' · wyjątek grafiku' : ''}</strong>{!dane.ladowanie && <p className="tekst-pomocniczy">{rytmDnia}</p>}</div>
      {zalegle[0] && <Link className="plan-dnia__zalegle" to={adresReferencjiZrodla(zalegle[0].referencjaZrodla!)}><small>Najważniejsze zaległe</small><strong>{zalegle[0].tytul}</strong><ChevronRight aria-hidden="true" /></Link>}
    </section>

    <div className="plan-dnia__kolumny">
      <section className="plan-dnia__agenda" aria-labelledby="agenda-dnia">
        <div className="naglowek-karty"><div><h2 id="agenda-dnia"><Clock3 aria-hidden="true" /> Plan dnia</h2><p>Godziny, bieżące działania i minione terminy.</p></div><Znacznik>{daneDnia.liczbaOtwartych} do zrobienia</Znacznik></div>
        <div className="plan-dnia__harmonogram" aria-label="Kontekst harmonogramu"><span>Sen {ustawienia.harmonogram.poczatekSnu}–{ustawienia.harmonogram.koniecSnu}</span>{harmonogram.przedzialy.map((przedzial) => <span key={przedzial.id}>{przedzial.etykieta} {przedzial.od}–{przedzial.do}</span>)}</div>
        {!dane.ladowanie && (zaplanowane.length === 0 ? <p className="tekst-pomocniczy">Brak otwartych spraw z godziną.</p> : <div className="plan-dnia__os">{zaplanowane.map((element) => {
          const stan = element.id === najblizszy?.id ? 'najblizszy' : stanCzasuElementu(element, data, teraz)
          return <div className={`plan-dnia__element plan-dnia__element--${stan}`} key={element.id}><time>{element.godzina}</time><span className="plan-dnia__punkt" /><div>{tytul(element)}<small>{etykietaTypu(element)}{element.czasTrwaniaMinuty ? ` · ${element.czasTrwaniaMinuty} min` : ''}</small><div><Znacznik wariant={stan === 'przeszly' ? 'ostrzezenie' : stan === 'teraz' ? 'sukces' : 'neutralny'}>{stan === 'teraz' ? 'Teraz' : stan === 'najblizszy' ? 'Najbliższe' : stan === 'przeszly' ? (element.typ === 'zadanie' ? 'Zaległe' : 'Minął planowany czas') : 'Zaplanowano'}</Znacznik></div>{akcje(element)}</div></div>
        })}</div>)}
        {zakonczone.length > 0 && <details className="plan-dnia__zakonczone"><summary>Zakończone i pominięte ({zakonczone.length})</summary><div className="lista-kompaktowa">{zakonczone.map((element) => <div key={element.id}><div>{tytul(element)}<small>{element.godzina ? `${element.godzina} · ` : ''}{etykietaStatusuElementu(element)}</small></div></div>)}</div></details>}
      </section>

      <div className="plan-dnia__uzupelnienie">
        <Karta><div className="naglowek-karty"><div><h2>Do zrobienia dzisiaj</h2><p>Sprawy bez konkretnej godziny.</p></div></div>{bezGodziny.length === 0 ? <p className="tekst-pomocniczy">Nie masz dziś spraw bez godziny.</p> : <div className="lista-kompaktowa">{bezGodziny.map((element) => <div key={element.id}><div>{tytul(element)}<small>{etykietaTypu(element)}{element.trybTerminu === 'koniec_dnia' ? ' · Do końca dnia' : ' · Bez godziny'}</small>{akcje(element)}</div></div>)}</div>}</Karta>
        {zalegle.length > 0 && <Karta klasa="plan-dnia__decyzje"><div className="naglowek-karty"><div><h2>Zaległe wymagające decyzji</h2><p>Najważniejsze trzy z wcześniejszych dni.</p></div><Link className="przycisk przycisk--tekstowy" to="/zadania">Wszystkie</Link></div><div className="lista-kompaktowa">{zalegle.map((element) => <div key={element.id}><div>{tytul(element)}<small>Zaległe od {element.data}</small>{akcje(element)}</div></div>)}</div></Karta>}
      </div>
    </div>

    {!dane.ladowanie && !dane.blad && elementyDnia.length === 0 && <Karta klasa="plan-dnia__pusty"><PustyStan tytul="Dzień ma jeszcze dużo przestrzeni" opis="Dodaj jedną rzecz, od której chcesz zacząć, albo poproś Echo o pomoc w ułożeniu dnia." akcja={<div className="plan-dnia__akcje"><button type="button" className="przycisk przycisk--glowny" onClick={otworzSzybkieDodawanie}><Plus aria-hidden="true" />Dodaj coś</button>{moze('echo') && <Link className="przycisk przycisk--drugorzedny" to="/echo"><MessageCircle aria-hidden="true" />Porozmawiaj z Echo</Link>}</div>} /></Karta>}

    <HoryzontTygodniowy dzisiaj={data} dni={dane.dni} ladowanie={dane.ladowanie} blad={dane.blad} otworz={otworzDzien} />
    {wybranyDzien && <SkupienieDnia tytul={format(parseISO(wybranyDzien.data), 'EEEE, d MMMM yyyy', { locale: pl })} zrodlo={wybranyDzien.zrodlo} zamknieto={() => ustawWybranyDzien(undefined)}>{(zamknij) => <PlanWybranegoDnia data={wybranyDzien.data} zamknij={zamknij} />}</SkupienieDnia>}
  </div>
}
