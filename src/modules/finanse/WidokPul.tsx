import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat, ModalPotwierdzenia, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import type { WspolnaKasa, OperacjaKasy } from '../../domain/modeleFinansowWspolnych'
import { czyDostepFinansowWspolnych } from '../../services/UprawnieniaService'
import { listaPodsumowanPul, pobierzWidokPuli, zmienArchiwizacjePuli, zapiszOperacjePuli } from '../../services/WspolneKasyService'
import type { PolecenieZapisuFinansowego } from '../../services/ZapisFinansowWspolnych'
import { useObslugaWstecz } from '../../platform/obslugaWstecz'
import { FormularzPuli, FormularzOperacjiPuli } from './FormularzePul'
import WidokZakupowPuli from './WidokZakupowPuli'
import { dataDoWyswietlenia, kwotaDoWyswietlenia, useZapisRozliczenia } from './pomocRozliczen'
import './pule.css'

type WidokPuli = Awaited<ReturnType<typeof pobierzWidokPuli>>

export default function WidokPul() {
  const { gotowyDostep } = useAplikacja()
  const { pulaId } = useParams()
  if (!gotowyDostep) return <p role="status">Ładowanie dostępu…</p>
  if (!czyDostepFinansowWspolnych('odczyt')) return <Komunikat typ="blad">Brak dostępu. Pule są dostępne wyłącznie dla właściciela aktywnego profilu lub w trybie lokalnym bez konta.</Komunikat>
  return pulaId ? <SzczegolyPuli key={pulaId} id={pulaId} /> : <ListaPul />
}

function InformacjaLokalna() {
  const [online, ustawOnline] = useState(navigator.onLine)
  useEffect(() => {
    const odswiez = () => ustawOnline(navigator.onLine)
    window.addEventListener('online', odswiez); window.addEventListener('offline', odswiez)
    return () => { window.removeEventListener('online', odswiez); window.removeEventListener('offline', odswiez) }
  }, [])
  return <Komunikat>{!online && <strong>Brak połączenia — pracujesz offline. </strong>}Pule są przechowywane lokalnie na tym urządzeniu. Synchronizacja Pul będzie dostępna w późniejszym etapie; obecny serwer nie obsługuje jeszcze ich przesyłania. Dane pozostają w lokalnej kolejce. Wykonuj <Link to="/ustawienia">backup w Ustawieniach</Link>.</Komunikat>
}

function PodsumowaniePuli({ widok }: { widok: WidokPuli }) {
  const { pula, podsumowanie, ograniczenie, ostatniaOperacja } = widok
  return <>
    <p><Znacznik>{pula.status === 'aktywna' ? 'Aktywna' : 'Archiwalna'}</Znacznik> · {pula.pula?.rodzaj === 'zakupowa' ? 'Zakupowa' : 'Finansowa'} · {pula.waluta}</p>
    {ograniczenie ? <Komunikat typ="blad">Niekompletne dane — saldo i postęp niedostępne: {ograniczenie}</Komunikat> : podsumowanie && <>
      <dl className="pule-podsumowanie"><dt>Aktualne saldo</dt><dd className={podsumowanie.saldoGrosze < 0 ? 'tekst-bledu' : ''}>{kwotaDoWyswietlenia(podsumowanie.saldoGrosze, pula.waluta)}</dd><dt>Zebrano — wpłaty</dt><dd>{kwotaDoWyswietlenia(podsumowanie.wplatyGrosze, pula.waluta)}</dd><dt>Wydatki</dt><dd>{kwotaDoWyswietlenia(podsumowanie.wydatkiGrosze, pula.waluta)}</dd></dl>
      {pula.pula?.celGrosze && <div className="pule-cel"><p>Cel: {kwotaDoWyswietlenia(pula.pula.celGrosze, pula.waluta)}</p><label>Postęp zbiórki: {podsumowanie.postep}%<progress max={100} value={Math.min(100, podsumowanie.postep ?? 0)} /></label></div>}
    </>}
    {!pula.pula?.celGrosze && <p>Bez celu finansowego</p>}
    <p>Ostatnia operacja: {ostatniaOperacja ? dataDoWyswietlenia(ostatniaOperacja) : 'brak operacji'}</p>
  </>
}

function ListaPul() {
  const [formularz, ustawFormularz] = useState(false)
  const [filtr, ustawFiltr] = useState('aktywne')
  const [szukaj, ustawSzukaj] = useState('')
  const [proba, ustawProbe] = useState(0)
  const nawiguj = useNavigate()
  useObslugaWstecz(true, () => nawiguj('/finanse'), 20)
  const wynik = useLiveQuery(async () => {
    try { return { dane: await listaPodsumowanPul(), blad: '' } } catch (blad) { return { dane: undefined, blad: (blad as Error).message } }
  }, [proba])
  const widoczne = wynik?.dane?.filter(({ pula }) => pula.nazwa.toLocaleLowerCase('pl').includes(szukaj.trim().toLocaleLowerCase('pl')) && (filtr === 'wszystkie' || pula.status === (filtr === 'aktywne' ? 'aktywna' : 'zarchiwizowana')))
  const nowa = <button className="przycisk przycisk--glowny" onClick={() => ustawFormularz(true)}>Nowa Pula</button>
  return <div className="widok pule">
    <Link to="/finanse">← Finanse</Link>
    <NaglowekWidoku tytul="Pule" opis="Wpłaty i wydatki na Twój cel, bez obowiązkowych uczestników." akcje={nowa} />
    <InformacjaLokalna />
    {!wynik ? <p role="status">Ładowanie Pul…</p> : wynik.blad ? <><Komunikat typ="blad">Błąd odczytu: {wynik.blad}</Komunikat><button className="przycisk" onClick={() => ustawProbe(proba + 1)}>Ponów odczyt</button></> : <>
      <div className="pule-filtry"><label className="pole"><span>Szukaj Puli po nazwie</span><input type="search" value={szukaj} onChange={(zdarzenie) => ustawSzukaj(zdarzenie.target.value)} /></label><label className="pole"><span>Pokaż Pule</span><select value={filtr} onChange={(zdarzenie) => ustawFiltr(zdarzenie.target.value)}><option value="aktywne">Aktywne</option><option value="archiwalne">Archiwalne</option><option value="wszystkie">Wszystkie</option></select></label></div>
      {!wynik.dane?.length ? <PustyStan tytul="Jeszcze bez Pul" opis="Utwórz pierwszą Pulę i zarejestruj wpłatę na swój cel." akcja={<button className="przycisk" onClick={() => ustawFormularz(true)}>Utwórz pierwszą Pulę</button>} /> : !widoczne?.length ? <PustyStan tytul="Brak pasujących Pul" opis="Zmień wyszukiwaną nazwę lub filtr archiwum." /> : <div className="pule-lista">{widoczne.map((widok) => <Karta key={widok.pula.id}><h2><Link to={`/finanse/pule/${widok.pula.id}`}>{widok.pula.nazwa}</Link></h2>{widok.pula.opis && <p>{widok.pula.opis}</p>}<PodsumowaniePuli widok={widok} /></Karta>)}</div>}
    </>}
    {formularz && <FormularzPuli zamknij={() => ustawFormularz(false)} zapisano={(id) => nawiguj(`/finanse/pule/${id}`, { state: { zapisano: true } })} />}
  </div>
}

function HistoriaPuli({ rekord }: { rekord: WspolnaKasa | OperacjaKasy }) {
  const etykiety = { utworzenie: 'Utworzenie', aktualizacja: 'Zmiana', usuniecie: 'Usunięcie', przywrocenie: 'Przywrócenie', rozstrzygniecie: 'Rozstrzygnięcie konfliktu' }
  const opis = (stan: Record<string, unknown>) => [stan.nazwa, stan.opis, typeof stan.kwotaGrosze === 'number' ? kwotaDoWyswietlenia(stan.kwotaGrosze, String(stan.waluta)) : '', stan.dataOperacji, stan.zrodlo, stan.kategoria, stan.status, stan.pula && typeof stan.pula === 'object' && 'celGrosze' in stan.pula ? `Cel: ${kwotaDoWyswietlenia(Number(stan.pula.celGrosze), String(stan.waluta))}` : '', stan.usunietoAt ? 'Usunięta' : ''].filter(Boolean).join(' · ')
  return <details><summary>Historia zmian ({rekord.historiaWersji?.length ?? 0})</summary><ol>{rekord.historiaWersji?.map((wersja) => <li key={wersja.rewizja}><strong>{etykiety[wersja.operacja]} · rewizja {wersja.rewizja}</strong><p>{new Date(wersja.znacznikCzasu).toLocaleString('pl-PL')}</p>{wersja.przed && <p>Przed: {opis(wersja.przed)}</p>}<p>Po: {opis(wersja.po)}</p></li>)}</ol></details>
}

function SzczegolyPuli({ id }: { id: string }) {
  const polozenie = useLocation()
  const nawiguj = useNavigate()
  useObslugaWstecz(true, () => nawiguj('/finanse/pule'), 20)
  const [formularz, ustawFormularz] = useState<'pula' | 'wplyw' | 'wydatek'>()
  const [operacja, ustawOperacje] = useState<OperacjaKasy>()
  const [komunikat, ustawKomunikat] = useState(polozenie.state?.zapisano ? 'Pula została utworzona lokalnie.' : '')
  const [proba, ustawProbe] = useState(0)
  const [potwierdzenie, ustawPotwierdzenie] = useState<{ klucz: string; tytul: string; opis: string; wykonaj: (polecenie: PolecenieZapisuFinansowego) => Promise<void> }>()
  const zapis = useZapisRozliczenia()
  const wynik = useLiveQuery(async () => {
    try { return { dane: await pobierzWidokPuli(id), blad: '' } } catch (blad) { return { dane: undefined, blad: (blad as Error).message } }
  }, [id, proba])
  if (!wynik) return <p role="status">Ładowanie Puli…</p>
  if (!wynik.dane) return <div className="widok pule"><Link to="/finanse/pule">← Pule</Link><Komunikat typ="blad">{wynik.blad}</Komunikat><button className="przycisk" onClick={() => ustawProbe(proba + 1)}>Ponów odczyt</button></div>
  const widok = wynik.dane, { pula, operacje, podsumowanie } = widok
  const edycja = pula.status === 'aktywna' && !widok.ograniczenie && czyDostepFinansowWspolnych('edycja')
  const zamknij = () => { ustawFormularz(undefined); ustawOperacje(undefined) }
  const zapisano = () => { zamknij(); ustawKomunikat('Zapisano lokalnie. Saldo, historia i postęp zostały odświeżone.') }
  return <div className="widok pule">
    <Link to="/finanse/pule">← Pule</Link>
    <NaglowekWidoku tytul={pula.nazwa} opis={pula.opis} />
    <InformacjaLokalna />
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
    <Karta><h2>Przegląd Puli</h2><PodsumowaniePuli widok={widok} /></Karta>
    {pula.status === 'zarchiwizowana' && <Komunikat>Pula jest w archiwum. Dane, historia i saldo są zachowane. Przywróć Pulę przed kolejnymi operacjami.</Komunikat>}
    <div className="akcje-formularza">
      {edycja && <><button className="przycisk przycisk--glowny" onClick={() => ustawFormularz('wplyw')}>Zarejestruj wpłatę</button><button className="przycisk" onClick={() => ustawFormularz('wydatek')}>Zarejestruj wydatek</button><button className="przycisk" onClick={() => ustawFormularz('pula')}>Edytuj Pulę</button></>}
      {!widok.ograniczenie && czyDostepFinansowWspolnych('edycja') && <button className="przycisk" onClick={() => ustawPotwierdzenie({ klucz: id, tytul: pula.status === 'aktywna' ? 'Archiwizuj Pulę' : 'Przywróć Pulę', opis: 'Wszystkie operacje, historia i saldo pozostaną zachowane. Archiwum blokuje edycję i nowe operacje.', wykonaj: (polecenie) => zmienArchiwizacjePuli(id, pula.status === 'aktywna', { ...polecenie, oczekiwanaRewizja: pula.rewizja ?? 0 }) })}>{pula.status === 'aktywna' ? 'Archiwizuj Pulę' : 'Przywróć Pulę'}</button>}
    </div>
    {pula.pula?.rodzaj === 'zakupowa' && <WidokZakupowPuli pula={pula} edycja={edycja} />}
    <Karta><h2>Historia operacji</h2>{!operacje.length && <p>Brak operacji. Zarejestruj pierwszą wpłatę.</p>}{operacje.map((wpis) => <article key={wpis.id} className="pule-operacja">
      <h3>{wpis.typ === 'wplyw' ? 'Wpłata — wpływ' : wpis.typ === 'wydatek' ? 'Wydatek — wypływ' : 'Korekta'}{wpis.usunietoAt && ' · Usunięta'}</h3>
      <p><strong>{wpis.typ === 'wydatek' ? '−' : '+'}{kwotaDoWyswietlenia(wpis.kwotaGrosze, wpis.waluta)}</strong> · {dataDoWyswietlenia(wpis.dataOperacji)}</p><p>{wpis.opis}</p>{wpis.kategoria && <p>Kategoria: {wpis.kategoria}</p>}{wpis.zrodlo && <p>Źródło: {wpis.zrodlo}</p>}
      <details><summary>Szczegóły operacji</summary><p>Identyfikator: {wpis.id}</p><p>Rewizja: {wpis.rewizja}</p><p>Zapisano: {new Date(wpis.createdAt).toLocaleString('pl-PL')}</p></details>
      {edycja && wpis.powiazaniePuli && ['wplata', 'koszt'].includes(wpis.powiazaniePuli.rodzaj) && !wpis.powiazaniePuli.zakupId && <div className="akcje-formularza">{!wpis.usunietoAt && wpis.typ !== 'korekta' && <button className="przycisk" onClick={() => { ustawOperacje(wpis); ustawFormularz(wpis.typ as 'wplyw' | 'wydatek') }}>Popraw operację: {wpis.opis || dataDoWyswietlenia(wpis.dataOperacji)}</button>}<button className="przycisk" onClick={() => ustawPotwierdzenie({ klucz: wpis.id, tytul: wpis.usunietoAt ? 'Przywróć operację' : 'Usuń błędną operację', opis: 'Saldo i postęp zostaną przeliczone z operacji. Historia zmian pozostanie zachowana.', wykonaj: (polecenie) => zapiszOperacjePuli(id, wpis.id, undefined, wpis.usunietoAt ? 'przywrocenie' : 'usuniecie', { ...polecenie, oczekiwanaRewizja: wpis.rewizja ?? 0 }, pula.rewizja ?? 0) })}>{wpis.usunietoAt ? 'Przywróć operację' : 'Usuń błędną operację'}</button></div>}
      <HistoriaPuli rekord={wpis} />
    </article>)}</Karta>
    <Karta><h2>Historia Puli</h2><HistoriaPuli rekord={pula} /></Karta>
    {formularz === 'pula' && <FormularzPuli pula={pula} walutaZablokowana={widok.maFakty} zamknij={zamknij} zapisano={zapisano} />}
    {(formularz === 'wplyw' || formularz === 'wydatek') && podsumowanie && <FormularzOperacjiPuli pula={pula} typ={formularz} operacja={operacja} saldoGrosze={podsumowanie.saldoGrosze} zamknij={zamknij} zapisano={zapisano} />}
    {potwierdzenie && <div className="pule-dialog"><ModalPotwierdzenia tytul={potwierdzenie.tytul} opis={[potwierdzenie.opis, zapis.blad].filter(Boolean).join(' ')} anuluj={() => { if (!zapis.zajety) ustawPotwierdzenie(undefined) }} potwierdz={() => zapis.wykonaj({ klucz: potwierdzenie.klucz, tytul: potwierdzenie.tytul }, potwierdzenie.wykonaj, () => { ustawPotwierdzenie(undefined); ustawKomunikat('Zmiana została zapisana lokalnie.') })} /></div>}
  </div>
}
