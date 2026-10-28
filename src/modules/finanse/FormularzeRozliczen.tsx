import { useState, type FormEvent } from 'react'
import { useZapisRozliczenia, metodyPodzialu, nazwaOsoby, kwotaDoWyswietlenia } from './pomocRozliczen'
import { Modal, Komunikat } from '../../components/Interfejs'
import { PoleKwoty } from '../../components/PoleKwoty'
import { PoleDaty } from '../../components/PoleDaty'
import { dzisiajIso } from '../../domain/fabryki'
import { WALUTY } from '../../domain/kwoty'
import type { Rozliczenie, WydatekGrupowy } from '../../domain/modeleFinansowWspolnych'
import { groszeNaKwote, kwotaNaGrosze, obliczWydatekWspolny } from '../../services/ObliczeniaFinansowWspolnych'
import { utworzRozliczenie, dodajWydatekGrupowy, edytujWydatekGrupowy, type DaneWydatkuGrupowego } from '../../services/RozliczeniaService'


export function WyborWaluty({ wartosc, zmien, zablokowany = false }: { wartosc: string; zmien: (waluta: string) => void; zablokowany?: boolean }) {
  return <label className="pole"><span>Waluta</span><select value={wartosc} disabled={zablokowany} onChange={(zdarzenie) => zmien(zdarzenie.target.value)}>{WALUTY.map(({ kod, nazwa }) => <option key={kod} value={kod}>{kod} — {nazwa}</option>)}</select></label>
}

export function FormularzRozliczenia({ zamknij, zapisano }: { zamknij: () => void; zapisano: (id: string) => void }) {
  const [id] = useState(() => crypto.randomUUID())
  const [nazwa, ustawNazwe] = useState('')
  const [opis, ustawOpis] = useState('')
  const [waluta, ustawWalute] = useState('PLN')
  const [data, ustawDate] = useState(dzisiajIso())
  const [metoda, ustawMetode] = useState<Rozliczenie['domyslnyPodzial']>('po_rowno')
  const [osoby, ustawOsoby] = useState(() => [{ id: crypto.randomUUID(), nazwa: '' }, { id: crypto.randomUUID(), nazwa: '' }])
  const zapis = useZapisRozliczenia()
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    if (!nazwa.trim()) { zapis.ustawBlad('Wpisz nazwę rozliczenia.'); return }
    const dane = { nazwa: nazwa.trim(), opis: opis.trim(), waluta, dataRozpoczecia: data, domyslnyPodzial: metoda, etap: 'aktywne' as const, uczestnicy: osoby.map((osoba) => ({ ...osoba, nazwa: osoba.nazwa.trim() })) }
    void zapis.wykonaj(dane, (polecenie) => utworzRozliczenie(id, dane, polecenie), () => zapisano(id))
  }
  return <Modal tytul="Nowe rozliczenie" zamknij={zamknij}><form className="rozliczenia-formularz" onSubmit={wyslij}>
    <fieldset disabled={zapis.zajety}>
      <label className="pole"><span>Nazwa rozliczenia</span><input required value={nazwa} onChange={(zdarzenie) => ustawNazwe(zdarzenie.target.value)} placeholder="Np. Weekend w górach" /></label>
      <label className="pole"><span>Opis</span><textarea value={opis} onChange={(zdarzenie) => ustawOpis(zdarzenie.target.value)} /></label>
      <WyborWaluty wartosc={waluta} zmien={ustawWalute} />
      <PoleDaty etykieta="Data rozpoczęcia" wymagane wartosc={data} zmien={ustawDate} />
      <label className="pole"><span>Domyślny sposób podziału</span><select value={metoda} onChange={(zdarzenie) => ustawMetode(zdarzenie.target.value as typeof metoda)}>{Object.entries(metodyPodzialu).map(([wartosc, tekst]) => <option key={wartosc} value={wartosc}>{tekst}</option>)}</select></label>
      <h3>Uczestnicy bez konta</h3>
      {osoby.map((osoba, indeks) => <label className="pole" key={osoba.id}><span>Osoba {indeks + 1}</span><input required value={osoba.nazwa} onChange={(zdarzenie) => ustawOsoby(osoby.map((pozycja) => pozycja.id === osoba.id ? { ...pozycja, nazwa: zdarzenie.target.value } : pozycja))} /></label>)}
      <button className="przycisk" type="button" onClick={() => ustawOsoby([...osoby, { id: crypto.randomUUID(), nazwa: '' }])}>Dodaj kolejną osobę</button>
    </fieldset>
    {zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}
    <div className="akcje-formularza"><button className="przycisk" type="button" onClick={zamknij}>Anuluj</button><button className="przycisk przycisk--glowny" disabled={zapis.zajety}>Utwórz rozliczenie</button></div>
  </form></Modal>
}

export function FormularzWydatkuGrupowego({ rozliczenie, wydatek, zamknij, zapisano }: { rozliczenie: Rozliczenie; wydatek?: WydatekGrupowy; zamknij: () => void; zapisano: () => void }) {
  const [id] = useState(() => wydatek?.id ?? crypto.randomUUID())
  const [nazwa, ustawNazwe] = useState(wydatek?.nazwa ?? '')
  const [opis, ustawOpis] = useState(wydatek?.opis ?? '')
  const [data, ustawDate] = useState(wydatek?.dataOperacji ?? dzisiajIso())
  const [kwota, ustawKwote] = useState(wydatek ? groszeNaKwote(wydatek.kwotaGrosze, rozliczenie.waluta) : '')
  const [metoda, ustawMetode] = useState(wydatek?.metodaPodzialu ?? rozliczenie.domyslnyPodzial)
  const [finansowanie, ustawFinansowanie] = useState<Record<string, string>>(() => Object.fromEntries(wydatek?.finansujacy.map((pozycja) => [pozycja.uczestnikId, groszeNaKwote(pozycja.kwotaGrosze, rozliczenie.waluta)]) ?? []))
  const [wybrani, ustawWybranych] = useState(() => wydatek?.podzialKosztu.map(({ uczestnikId }) => uczestnikId) ?? rozliczenie.uczestnicy.filter((osoba) => !osoba.nieaktywny).map(({ id }) => id))
  const [parametry, ustawParametry] = useState<Record<string, string>>(() => {
    const podzial = wydatek?.parametryPodzialu
    if (!podzial || podzial.metoda === 'po_rowno') return {}
    return Object.fromEntries(podzial.pozycje.map((pozycja) => [pozycja.uczestnikId, 'kwotaGrosze' in pozycja ? groszeNaKwote(pozycja.kwotaGrosze, rozliczenie.waluta) : 'procentSetne' in pozycja ? groszeNaKwote(pozycja.procentSetne) : String(pozycja.udzialy)]))
  })
  const zapis = useZapisRozliczenia(wydatek?.rewizja ?? 0)
  const poprzednieOsoby = new Set([...(wydatek?.finansujacy ?? []), ...(wydatek?.podzialKosztu ?? [])].map(({ uczestnikId }) => uczestnikId))
  const osoby = rozliczenie.uczestnicy.filter((osoba) => !osoba.nieaktywny || poprzednieOsoby.has(osoba.id))
  function przygotuj(): DaneWydatkuGrupowego {
    if (!nazwa.trim()) throw new Error('Wpisz nazwę wydatku.')
    const pozycje = wybrani.map((uczestnikId) => ({ uczestnikId, tekst: parametry[uczestnikId] ?? '' }))
    const parametryPodzialu = metoda === 'po_rowno' ? { metoda, uczestnicyIds: wybrani }
      : metoda === 'kwotowo' ? { metoda, pozycje: pozycje.map(({ uczestnikId, tekst }) => ({ uczestnikId, kwotaGrosze: kwotaNaGrosze(tekst, rozliczenie.waluta) })) }
      : metoda === 'procentowo' ? { metoda, pozycje: pozycje.map(({ uczestnikId, tekst }) => ({ uczestnikId, procentSetne: kwotaNaGrosze(tekst) })) }
      : { metoda, pozycje: pozycje.map(({ uczestnikId, tekst }) => { if (!/^\d+$/.test(tekst)) throw new Error('Udziały muszą być nieujemnymi liczbami całkowitymi.'); return { uczestnikId, udzialy: Number(tekst) } }) }
    return { rozliczenieId: rozliczenie.id, nazwa: nazwa.trim(), opis: opis.trim(), waluta: rozliczenie.waluta, dataOperacji: data, kwotaGrosze: kwotaNaGrosze(kwota, rozliczenie.waluta), finansujacy: Object.entries(finansowanie).filter(([, tekst]) => tekst !== '').map(([uczestnikId, tekst]) => ({ uczestnikId, kwotaGrosze: kwotaNaGrosze(tekst, rozliczenie.waluta) })).filter(({ kwotaGrosze }) => kwotaGrosze !== 0), parametryPodzialu }
  }
  let podglad = ''
  try {
    const dane = przygotuj()
    const wynik = obliczWydatekWspolny(rozliczenie.uczestnicy.map(({ id }) => id), { ...dane, id, podzial: dane.parametryPodzialu })
    podglad = wynik.podzialKosztu.map((pozycja) => `${nazwaOsoby(rozliczenie, pozycja.uczestnikId)}: ${kwotaDoWyswietlenia(pozycja.kwotaGrosze, rozliczenie.waluta)}`).join(' · ')
  } catch { /* Niepełny szkic nie jest zapisywany. */ }
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    try {
      const dane = przygotuj()
      void zapis.wykonaj(dane, (polecenie) => (wydatek ? edytujWydatekGrupowy : dodajWydatekGrupowy)(id, dane, polecenie), zapisano)
    } catch (blad) { zapis.ustawBlad((blad as Error).message) }
  }
  return <Modal tytul={wydatek ? 'Edytuj wspólny wydatek' : 'Dodaj wspólny wydatek'} zamknij={zamknij}><form className="rozliczenia-formularz" onSubmit={wyslij}>
    <fieldset disabled={zapis.zajety}>
      <label className="pole"><span>Nazwa wydatku</span><input required value={nazwa} onChange={(zdarzenie) => ustawNazwe(zdarzenie.target.value)} /></label>
      <PoleDaty etykieta="Data wydatku" wymagane wartosc={data} zmien={ustawDate} />
      <PoleKwoty etykieta="Kwota wydatku" wymagane min="0.01" wartosc={kwota} zmien={ustawKwote} waluta={rozliczenie.waluta} />
      <WyborWaluty wartosc={rozliczenie.waluta} zmien={() => {}} zablokowany />
      <p>Wszystkie pozycje mają walutę rozliczenia. Bez przeliczania kursów.</p>
      <label className="pole"><span>Opis wydatku</span><textarea value={opis} onChange={(zdarzenie) => ustawOpis(zdarzenie.target.value)} /></label>
      <h3>Kto wyłożył pieniądze?</h3><p>Wpisz faktyczne kwoty. Pozostaw puste pole u pozostałych osób.</p>
      {osoby.map((osoba) => <PoleKwoty key={osoba.id} etykieta={`Finansowanie: ${nazwaOsoby(rozliczenie, osoba.id)}`} wartosc={finansowanie[osoba.id] ?? ''} zmien={(tekst) => ustawFinansowanie({ ...finansowanie, [osoba.id]: tekst })} waluta={rozliczenie.waluta} min="0" />)}
      <label className="pole"><span>Sposób podziału</span><select value={metoda} onChange={(zdarzenie) => { ustawMetode(zdarzenie.target.value as typeof metoda); ustawParametry({}) }}>{Object.entries(metodyPodzialu).map(([wartosc, tekst]) => <option value={wartosc} key={wartosc}>{tekst}</option>)}</select></label>
      <h3>Kto uczestniczy w koszcie?</h3><p>Odznacz osobę, aby wykluczyć ją z tego kosztu.</p>
      {osoby.map((osoba) => <div key={osoba.id} className="rozliczenia-osoba">
        <label className="rozliczenia-wybor"><input type="checkbox" checked={wybrani.includes(osoba.id)} onChange={(zdarzenie) => ustawWybranych(zdarzenie.target.checked ? [...wybrani, osoba.id] : wybrani.filter((id) => id !== osoba.id))} />{nazwaOsoby(rozliczenie, osoba.id)}{osoba.nieaktywny && ' · nieaktywna'}</label>
        {wybrani.includes(osoba.id) && metoda !== 'po_rowno' && (metoda === 'kwotowo'
          ? <PoleKwoty etykieta={`Koszt: ${nazwaOsoby(rozliczenie, osoba.id)}`} wymagane min="0" waluta={rozliczenie.waluta} wartosc={parametry[osoba.id] ?? ''} zmien={(tekst) => ustawParametry({ ...parametry, [osoba.id]: tekst })} />
          : <label className="pole"><span>{metoda === 'procentowo' ? 'Procent' : 'Udziały'}: {nazwaOsoby(rozliczenie, osoba.id)}</span><input required inputMode={metoda === 'procentowo' ? 'decimal' : 'numeric'} value={parametry[osoba.id] ?? ''} onChange={(zdarzenie) => ustawParametry({ ...parametry, [osoba.id]: zdarzenie.target.value })} /></label>)}
      </div>)}
      {podglad && <Komunikat>Podgląd kosztów: {podglad}</Komunikat>}
    </fieldset>
    {zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}
    <div className="akcje-formularza"><button type="button" className="przycisk" onClick={zamknij}>Anuluj</button><button className="przycisk przycisk--glowny" disabled={zapis.zajety}>Zapisz wydatek</button></div>
  </form></Modal>
}
