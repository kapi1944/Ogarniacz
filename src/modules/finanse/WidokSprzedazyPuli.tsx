import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Karta, Modal, Komunikat } from '../../components/Interfejs'
import { PoleKwoty } from '../../components/PoleKwoty'
import { PoleDaty } from '../../components/PoleDaty'
import { PoleLiczbowe } from '../../components/PoleLiczbowe'
import { dzisiajIso } from '../../domain/fabryki'
import { liczbaDoModelu } from '../../domain/liczby'
import type { WspolnaKasa } from '../../domain/modeleFinansowWspolnych'
import type { SprzedazPuli } from '../../../server/wspolne/modelePulZobowiazan.ts'
import { sumaGroszy } from '../../../server/wspolne/ObliczeniaPul.ts'
import { pobierzSprzedazePuli, pozostalePozycjeSprzedazy, skorygujSprzedazPuli, type DaneKorektySprzedazy } from '../../services/SprzedazPulService'
import { kwotaNaGrosze } from '../../services/ObliczeniaFinansowWspolnych'
import { FormularzSprzedazyPuli } from './FormularzSprzedazyPuli'
import { useZapisRozliczenia, kwotaDoWyswietlenia } from './pomocRozliczen'

type Widok = Awaited<ReturnType<typeof pobierzSprzedazePuli>>
function FormularzKorekty({ pula, sprzedaz, widok, zamknij }: { pula: WspolnaKasa; sprzedaz: SprzedazPuli; widok: Widok; zamknij: () => void }) {
  const [poczatkowe] = useState({ pula, sprzedaz, widok }), [id] = useState(() => crypto.randomUUID())
  const [rodzaj, ustawRodzaj] = useState<DaneKorektySprzedazy['rodzaj']>('zwrot_towaru')
  const [pozycjaId, ustawPozycje] = useState(sprzedaz.pozycje[0].id), [partiaId, ustawPartie] = useState('')
  const [sztuki, ustawSztuki] = useState('1'), [uszkodzone, ustawUszkodzone] = useState('0')
  const [cena, ustawCene] = useState('0'), [gotowka, ustawGotowke] = useState('0'), [powod, ustawPowod] = useState(''), [data, ustawDate] = useState(dzisiajIso)
  const zapis = useZapisRozliczenia(poczatkowe.sprzedaz.rewizja)
  const pozycje = pozostalePozycjeSprzedazy(poczatkowe.sprzedaz)
  const kwota = (grosze: number) => kwotaDoWyswietlenia(grosze, pula.waluta)
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    try {
      const dane: DaneKorektySprzedazy = { rodzaj, pozycjaId, dataOperacji: data, uzasadnienie: powod, partiaDocelowaId: partiaId, liczbaSztuk: rodzaj === 'zwrot_towaru' ? liczbaDoModelu(sztuki) : 0, uszkodzoneSztuki: rodzaj === 'zwrot_towaru' ? liczbaDoModelu(uszkodzone) : 0, zmianaCenyGrosze: ['cena', 'zwrot_towaru'].includes(rodzaj) ? kwotaNaGrosze(cena, pula.waluta) : 0, rozliczonoGrosze: kwotaNaGrosze(gotowka, pula.waluta) }
      void zapis.wykonaj(dane, (polecenie) => skorygujSprzedazPuli(sprzedaz.id, id, dane, polecenie, poczatkowe.pula.rewizja ?? 0, poczatkowe.widok.zakupy.map((zakup) => ({ id: zakup.id, rewizja: zakup.rewizja }))), zamknij)
    } catch (blad) { zapis.ustawBlad((blad as Error).message) }
  }
  return <div className="pule-dialog"><Modal tytul="Korekta sprzedaży" zamknij={() => { if (!zapis.zajety) zamknij() }}><form className="pule-formularz" onSubmit={wyslij}><fieldset disabled={zapis.zajety}>
    <label className="pole"><span>Rodzaj korekty sprzedaży</span><select value={rodzaj} onChange={(zdarzenie) => ustawRodzaj(zdarzenie.target.value as typeof rodzaj)}><option value="zwrot_towaru">Zwrot towaru</option><option value="cena">Korekta ceny</option><option value="pomylka_partii">Błędna partia</option><option value="anulowanie">Anulowanie sprzedaży</option></select></label>
    {rodzaj !== 'anulowanie' && <label className="pole"><span>Pozycja sprzedaży</span><select value={pozycjaId} onChange={(zdarzenie) => ustawPozycje(zdarzenie.target.value)}>{pozycje.map((pozycja, indeks) => <option key={pozycja.id} value={pozycja.id}>Pozycja {indeks + 1} · pozostało {pozycja.pozostaloSztuk} szt. · {kwota(pozycja.pozostalaCenaGrosze)}</option>)}</select></label>}
    {rodzaj === 'pomylka_partii' && <label className="pole"><span>Właściwa partia</span><select required value={partiaId} onChange={(zdarzenie) => ustawPartie(zdarzenie.target.value)}><option value="">Wybierz partię</option>{widok.zakupy.flatMap((zakup) => zakup.partie.map((partia) => <option key={partia.id} value={partia.id}>{partia.nazwaProduktu} · {zakup.dataZakupu} · {partia.id.slice(0, 8)}</option>))}</select></label>}
    {rodzaj === 'zwrot_towaru' && <><PoleLiczbowe etykieta="Zwracane sztuki" wymagane min={1} krok={1} wartosc={sztuki} zmien={ustawSztuki} /><PoleLiczbowe etykieta="W tym uszkodzone" wymagane min={0} krok={1} wartosc={uszkodzone} zmien={ustawUszkodzone} /></>}
    {['cena', 'zwrot_towaru'].includes(rodzaj) && <PoleKwoty etykieta="Zmiana ceny całkowitej (ze znakiem)" wymagane wartosc={cena} zmien={ustawCene} waluta={pula.waluta} />}
    {rodzaj === 'anulowanie' && <p>Anulowanie przyjmuje wszystkie pozostałe sztuki i wycofuje pozostałą cenę: {kwota(-sumaGroszy(pozycje.map((pozycja) => pozycja.pozostalaCenaGrosze)))}. Potwierdź, że towar faktycznie wrócił lub nie został wydany. Uszkodzenia zarejestruj wcześniej jako zwrot.</p>}
    <PoleKwoty etykieta="Faktycznie rozliczona gotówka (dopłata +, zwrot −)" wymagane wartosc={gotowka} zmien={ustawGotowke} waluta={pula.waluta} />
    <p>Zwrot towaru bez zmiany ceny i bez przepływu gotówki: obie kwoty 0. Nierozliczone dopłaty lub zwroty wymagają FZ-6.</p>
    <PoleDaty etykieta="Data korekty sprzedaży" wymagane wartosc={data} zmien={ustawDate} />
    <label className="pole"><span>Uzasadnienie korekty sprzedaży</span><textarea required value={powod} onChange={(zdarzenie) => ustawPowod(zdarzenie.target.value)} /></label>
    <div className="akcje-formularza"><button type="button" className="przycisk" onClick={zamknij}>Anuluj</button><button className="przycisk przycisk--glowny">Zapisz korektę sprzedaży</button></div>
  </fieldset>{zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}</form></Modal></div>
}

export default function WidokSprzedazyPuli({ pula, edycja }: { pula: WspolnaKasa; edycja: boolean }) {
  const [nowa, ustawNowa] = useState(false), [korekta, ustawKorekte] = useState<SprzedazPuli>()
  const dane = useLiveQuery(async () => { try { return { widok: await pobierzSprzedazePuli(pula.id), blad: '' } } catch (blad) { return { widok: undefined, blad: (blad as Error).message } } }, [pula.id])
  if (!dane) return <p role="status">Ładowanie sprzedaży…</p>
  if (!dane.widok) return <Komunikat typ="blad">{dane.blad}</Komunikat>
  const { widok } = dane, kwota = (grosze: number) => kwotaDoWyswietlenia(grosze, pula.waluta)
  return <Karta><h2>Sprzedaż produktów</h2>{widok.ograniczenie && <Komunikat typ="blad">{widok.ograniczenie}</Komunikat>}
    {widok.wynik && <p>Koszt sprzedanych produktów netto: {kwota(sumaGroszy(widok.wynik.zapas.partie.map((partia) => partia.kosztSprzedanychGrosze)))} · Marża sprzedaży: {kwota(widok.wynik.marza.marzaGrosze)}</p>}
    {edycja && !widok.ograniczenie && <button className="przycisk przycisk--glowny" onClick={() => ustawNowa(true)}>Nowa sprzedaż</button>}
    {!widok.sprzedaze.length && <p>Brak sprzedaży.</p>}
    {widok.sprzedaze.map((sprzedaz) => <article className="pule-operacja" key={sprzedaz.id}><h3>Sprzedaż · {sprzedaz.dataSprzedazy}</h3><p>{sprzedaz.opis}</p><p>Cena po korektach: {kwota(sumaGroszy(pozostalePozycjeSprzedazy(sprzedaz).map((pozycja) => pozycja.pozostalaCenaGrosze)))}</p><details><summary>Szczegóły sprzedaży</summary><p>Identyfikator: {sprzedaz.id} · rewizja {sprzedaz.rewizja}</p>{sprzedaz.pozycje.map((pozycja) => <p key={pozycja.id}>{widok.zakupy.find((zakup) => zakup.id === pozycja.zakupId)?.partie.find((partia) => partia.id === pozycja.partiaId)?.nazwaProduktu} · Partia {pozycja.partiaId} · {pozycja.liczbaSztuk} szt. · {kwota(pozycja.cenaCalkowitaGrosze)} · dokładnie {pozycja.cenaJednostkowa.licznikGroszy}/{pozycja.cenaJednostkowa.mianownik} grosza/szt.</p>)}<h4>Historia korekt</h4>{sprzedaz.korekty.map((wpis) => <div key={wpis.id}><p>{wpis.dataOperacji} · {wpis.rodzaj} · {wpis.uzasadnienie}</p>{wpis.pozycje.map((pozycja, indeks) => <p key={indeks}>{pozycja.partiaId} · zmiana {pozycja.zmianaSztuk} szt. · {kwota(pozycja.zmianaCenyGrosze ?? 0)} · uszkodzone {pozycja.sztukiUszkodzone ?? 0}</p>)}</div>)}<h4>Rewizje</h4>{sprzedaz.historiaWersji.map((wersja) => <p key={wersja.rewizja}>{wersja.rewizja} · {wersja.znacznikCzasu}</p>)}</details>{edycja && !widok.ograniczenie && <button className="przycisk" onClick={() => ustawKorekte(sprzedaz)}>Koryguj sprzedaż {sprzedaz.id.slice(0, 8)}</button>}</article>)}
    {nowa && <FormularzSprzedazyPuli pula={pula} widok={widok} zamknij={() => ustawNowa(false)} zapisano={() => ustawNowa(false)} />}
    {korekta && <FormularzKorekty pula={pula} widok={widok} sprzedaz={korekta} zamknij={() => ustawKorekte(undefined)} />}
  </Karta>
}
