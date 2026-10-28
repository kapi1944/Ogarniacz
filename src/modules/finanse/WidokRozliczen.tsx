import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat, Modal, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import type { Rozliczenie, WydatekGrupowy } from '../../domain/modeleFinansowWspolnych'
import { czyDostepFinansowWspolnych } from '../../services/UprawnieniaService'
import { listaRozliczen, pobierzWidokRozliczenia, dodajUczestnika, edytujNazweUczestnika, wylaczUczestnika } from '../../services/RozliczeniaService'
import { FormularzRozliczenia, FormularzWydatkuGrupowego } from './FormularzeRozliczen'
import { dataDoWyswietlenia, kwotaDoWyswietlenia, metodyPodzialu, nazwaOsoby, useZapisRozliczenia } from './pomocRozliczen'
import { useObslugaWstecz } from '../../platform/obslugaWstecz'
import './rozliczenia.css'

export default function WidokRozliczen() {
  const { gotowyDostep } = useAplikacja()
  const { rozliczenieId } = useParams()
  if (!gotowyDostep) return <p role="status">Ładowanie dostępu…</p>
  if (!czyDostepFinansowWspolnych('odczyt')) return <Komunikat typ="blad">Wspólne rozliczenia są dostępne tylko dla właściciela.</Komunikat>
  return rozliczenieId ? <SzczegolyRozliczenia key={rozliczenieId} id={rozliczenieId} /> : <ListaRozliczen />
}

function ListaRozliczen() {
  const [formularz, ustawFormularz] = useState(false)
  const nawiguj = useNavigate()
  useObslugaWstecz(true, () => nawiguj('/finanse'), 20)
  const wynik = useLiveQuery(async () => {
    try { return { dane: await listaRozliczen(), blad: '' } } catch (blad) { return { dane: [], blad: (blad as Error).message } }
  }, [])
  return <div className="widok rozliczenia">
    <Link to="/finanse">← Finanse</Link>
    <NaglowekWidoku tytul="Wspólne rozliczenia" opis="Wydatki grupowe bez kont uczestników. Dostępne również offline." akcje={<button type="button" className="przycisk przycisk--glowny" onClick={() => ustawFormularz(true)}>Nowe rozliczenie</button>} />
    {!wynik ? <p role="status">Ładowanie rozliczeń…</p> : wynik.blad ? <Komunikat typ="blad">{wynik.blad}</Komunikat> : <>
      {!wynik.dane.filter((grupa) => !grupa.usunietoAt).length && <PustyStan tytul="Jeszcze bez rozliczeń" opis="Utwórz np. Wyjście z Julką, Wspólne zakupy lub Wyjazd wakacyjny." />}
      <div className="rozliczenia-lista">{wynik.dane.filter((grupa) => !grupa.usunietoAt).map((grupa) => <Karta key={grupa.id}>
        <h2><Link to={`/finanse/rozliczenia/${encodeURIComponent(grupa.id)}`}>{grupa.nazwa}</Link></h2>
        <p>{grupa.opis}</p><p>{grupa.uczestnicy.length} osób · {grupa.waluta} · od {dataDoWyswietlenia(grupa.dataRozpoczecia)}</p>
        <Znacznik>{grupa.zarchiwizowanoAt ? 'Zarchiwizowane' : grupa.etap === 'oczekuje' ? 'Oczekuje na rozliczenie' : 'Aktywne'}</Znacznik>
      </Karta>)}</div>
    </>}
    {formularz && <FormularzRozliczenia zamknij={() => ustawFormularz(false)} zapisano={(id) => nawiguj(`/finanse/rozliczenia/${id}`)} />}
  </div>
}

function FormularzUczestnika({ rozliczenie, uczestnikId, zamknij }: { rozliczenie: Rozliczenie; uczestnikId?: string; zamknij: () => void }) {
  const [id] = useState(() => uczestnikId ?? crypto.randomUUID())
  const [nazwa, ustawNazwe] = useState(rozliczenie.uczestnicy.find((osoba) => osoba.id === id)?.nazwa ?? '')
  const zapis = useZapisRozliczenia(rozliczenie.rewizja ?? 0)
  return <Modal tytul={uczestnikId ? 'Zmień nazwę osoby' : 'Dodaj uczestnika'} zamknij={zamknij}><form className="rozliczenia-formularz" onSubmit={(zdarzenie) => {
    zdarzenie.preventDefault()
    void zapis.wykonaj({ nazwa: nazwa.trim() }, (polecenie) => uczestnikId ? edytujNazweUczestnika(rozliczenie.id, id, nazwa.trim(), polecenie) : dodajUczestnika(rozliczenie.id, { id, nazwa: nazwa.trim() }, polecenie), zamknij)
  }}><label className="pole"><span>Nazwa osoby</span><input required value={nazwa} onChange={(zdarzenie) => ustawNazwe(zdarzenie.target.value)} /></label><p>Osoby o tej samej nazwie rozróżnia stały numer w tym rozliczeniu. Dodanie osoby nie zmienia wcześniejszych kosztów.</p>
    {zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}<div className="akcje-formularza"><button className="przycisk" type="button" onClick={zamknij}>Anuluj</button><button className="przycisk przycisk--glowny" disabled={zapis.zajety}>Zapisz osobę</button></div></form></Modal>
}

export function HistoriaRozliczenia({ rekord, waluta }: { rekord: { historiaWersji?: Rozliczenie['historiaWersji'] }; waluta: string }) {
  const etykiety = { utworzenie: 'Utworzenie', aktualizacja: 'Zmiana', usuniecie: 'Usunięcie', przywrocenie: 'Przywrócenie', rozstrzygniecie: 'Rozstrzygnięcie konfliktu' }
  const opisStanu = (stan: Record<string, unknown>) => [
    stan.nazwa, stan.opis, typeof stan.kwotaGrosze === 'number' ? kwotaDoWyswietlenia(stan.kwotaGrosze, waluta) : '',
    typeof stan.dataOperacji === 'string' ? dataDoWyswietlenia(stan.dataOperacji) : '',
    Array.isArray(stan.uczestnicy) ? stan.uczestnicy.map((osoba) => `${osoba.nazwa}${osoba.nieaktywny ? ' (nieaktywna)' : ''}`).join(', ') : '',
  ].filter(Boolean).join(' · ')
  return <details><summary>Historia zmian ({rekord.historiaWersji?.length ?? 0})</summary><ol className="rozliczenia-historia">{rekord.historiaWersji?.map((wersja) => <li key={wersja.rewizja}><strong>{etykiety[wersja.operacja]} · wersja {wersja.rewizja}</strong><p>{new Date(wersja.znacznikCzasu).toLocaleString('pl-PL')}</p>{wersja.przed && <p>Przed: {opisStanu(wersja.przed)}</p>}<p>Po: {opisStanu(wersja.po)}</p></li>)}</ol></details>
}

function SzczegolyRozliczenia({ id }: { id: string }) {
  const nawiguj = useNavigate()
  useObslugaWstecz(true, () => nawiguj('/finanse/rozliczenia'), 20)
  const [formularz, ustawFormularz] = useState<'osoba' | 'wydatek'>()
  const [osobaId, ustawOsobe] = useState<string>()
  const [edytowanyWydatek, ustawWydatek] = useState<WydatekGrupowy>()
  const zapis = useZapisRozliczenia()
  const wynik = useLiveQuery(async () => {
    try { return { dane: await pobierzWidokRozliczenia(id), blad: '' } } catch (blad) { return { dane: undefined, blad: (blad as Error).message } }
  }, [id])
  if (!wynik) return <p role="status">Ładowanie rozliczenia…</p>
  if (!wynik.dane) return <div className="widok"><Link to="/finanse/rozliczenia">← Wspólne rozliczenia</Link><Komunikat typ="blad">{wynik.blad}</Komunikat></div>
  const { rozliczenie, wydatki, bilans, ograniczenie } = wynik.dane
  const edycja = !rozliczenie.zarchiwizowanoAt && czyDostepFinansowWspolnych('edycja')
  const zamknij = () => { ustawFormularz(undefined); ustawOsobe(undefined); ustawWydatek(undefined) }
  return <div className="widok rozliczenia">
    <Link to="/finanse/rozliczenia">← Wspólne rozliczenia</Link>
    <NaglowekWidoku tytul={rozliczenie.nazwa} opis={rozliczenie.opis} akcje={edycja && <button className="przycisk przycisk--glowny" type="button" onClick={() => ustawFormularz('wydatek')}>Dodaj wydatek</button>} />
    <p>Od {dataDoWyswietlenia(rozliczenie.dataRozpoczecia)} · {rozliczenie.waluta} · {rozliczenie.uczestnicy.length} uczestników · Domyślnie: {metodyPodzialu[rozliczenie.domyslnyPodzial]}</p>
    {ograniczenie && <Komunikat typ="blad">Bilans jest niedostępny: {ograniczenie}</Komunikat>}
    {bilans && <>
      <Karta><h2>Suma wydatków</h2><strong className="rozliczenia-suma">{kwotaDoWyswietlenia(bilans.sumaWydatkowGrosze, rozliczenie.waluta)}</strong><p>Wspólne koszty nie zwiększają osobistych wydatków ani budżetów.</p></Karta>
      <section><h2>Bilans osób</h2><div className="rozliczenia-lista">{bilans.bilanse.map((osoba) => <Karta key={osoba.uczestnikId}><h3>{nazwaOsoby(rozliczenie, osoba.uczestnikId)}</h3><dl className="rozliczenia-bilans"><dt>Wyłożono</dt><dd>{kwotaDoWyswietlenia(osoba.wylozoneGrosze, rozliczenie.waluta)}</dd><dt>Przypisany koszt</dt><dd>{kwotaDoWyswietlenia(osoba.kosztGrosze, rozliczenie.waluta)}</dd><dt>Bilans</dt><dd>{kwotaDoWyswietlenia(osoba.bilansGrosze, rozliczenie.waluta)}</dd></dl><Znacznik wariant={osoba.doOddaniaGrosze ? 'ostrzezenie' : 'sukces'}>{osoba.doOddaniaGrosze ? `Do oddania: ${kwotaDoWyswietlenia(osoba.doOddaniaGrosze, rozliczenie.waluta)}` : osoba.doOtrzymaniaGrosze ? `Do otrzymania: ${kwotaDoWyswietlenia(osoba.doOtrzymaniaGrosze, rozliczenie.waluta)}` : 'Bilans zerowy'}</Znacznik></Karta>)}</div></section>
      <Karta><h2>Propozycje przelewów</h2><p>To sugestie rozliczenia. Nie potwierdzają rzeczywistego zwrotu pieniędzy.</p>{bilans.propozycjePrzelewow.length ? <ul>{bilans.propozycjePrzelewow.map((przelew) => <li key={`${przelew.odUczestnikaId}-${przelew.doUczestnikaId}`}><strong>{nazwaOsoby(rozliczenie, przelew.odUczestnikaId)} → {nazwaOsoby(rozliczenie, przelew.doUczestnikaId)}: {kwotaDoWyswietlenia(przelew.kwotaGrosze, rozliczenie.waluta)}</strong></li>)}</ul> : <p>Brak propozycji przelewów.</p>}</Karta>
    </>}
    <Karta><h2>Uczestnicy</h2><div className="rozliczenia-osoby">{rozliczenie.uczestnicy.map((osoba) => <div className="rozliczenia-osoba" key={osoba.id}><strong>{nazwaOsoby(rozliczenie, osoba.id)}{osoba.nieaktywny && ' · Nieaktywna'}</strong>{edycja && <div className="akcje-formularza"><button className="przycisk" onClick={() => { ustawOsobe(osoba.id); ustawFormularz('osoba') }}>Zmień nazwę: {nazwaOsoby(rozliczenie, osoba.id)}</button>{!osoba.nieaktywny && <button className="przycisk" disabled={zapis.zajety} onClick={() => void zapis.wykonaj({ id: osoba.id, rewizja: rozliczenie.rewizja }, (polecenie) => wylaczUczestnika(id, osoba.id, { ...polecenie, oczekiwanaRewizja: rozliczenie.rewizja ?? 0 }), () => {})}>Oznacz jako nieaktywną: {nazwaOsoby(rozliczenie, osoba.id)}</button>}</div>}</div>)}</div>{edycja && <button className="przycisk" onClick={() => ustawFormularz('osoba')}>Dodaj uczestnika</button>}</Karta>
    <Karta><h2>Wspólne wydatki</h2>{!wydatki.length && <p>Brak wydatków. Dodaj pierwszy wspólny zakup.</p>}{wydatki.map((wydatek) => <article key={wydatek.id} className="rozliczenia-osoba"><h3>{wydatek.nazwa}{wydatek.usunietoAt && ' · Usunięty'}</h3><p>{dataDoWyswietlenia(wydatek.dataOperacji)} · {kwotaDoWyswietlenia(wydatek.kwotaGrosze, wydatek.waluta)} · {metodyPodzialu[wydatek.metodaPodzialu]}</p><p>{wydatek.opis}</p><p>Finansowanie: {wydatek.finansujacy.map((pozycja) => `${nazwaOsoby(rozliczenie, pozycja.uczestnikId)}: ${kwotaDoWyswietlenia(pozycja.kwotaGrosze, wydatek.waluta)}`).join(' · ')}</p><p>Koszty: {wydatek.podzialKosztu.map((pozycja) => `${nazwaOsoby(rozliczenie, pozycja.uczestnikId)}: ${kwotaDoWyswietlenia(pozycja.kwotaGrosze, wydatek.waluta)}`).join(' · ')}</p>{edycja && !wydatek.usunietoAt && <button className="przycisk" onClick={() => { ustawWydatek(wydatek); ustawFormularz('wydatek') }}>Edytuj wydatek: {wydatek.nazwa}</button>}<HistoriaRozliczenia rekord={wydatek} waluta={wydatek.waluta} /></article>)}</Karta>
    <Karta><h2>Historia rozliczenia</h2><HistoriaRozliczenia rekord={rozliczenie} waluta={rozliczenie.waluta} /></Karta>
    {zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}
    {formularz === 'osoba' && <FormularzUczestnika rozliczenie={rozliczenie} uczestnikId={osobaId} zamknij={zamknij} />}
    {formularz === 'wydatek' && <FormularzWydatkuGrupowego rozliczenie={rozliczenie} wydatek={edytowanyWydatek} zamknij={zamknij} zapisano={zamknij} />}
  </div>
}
