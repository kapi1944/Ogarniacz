import { useState, type FormEvent } from 'react'
import { Modal, Komunikat } from '../../components/Interfejs'
import { PoleKwoty } from '../../components/PoleKwoty'
import { PoleDaty } from '../../components/PoleDaty'
import { dzisiajIso } from '../../domain/fabryki'
import type { WspolnaKasa, OperacjaKasy } from '../../domain/modeleFinansowWspolnych'
import { sumaGroszy } from '../../../server/wspolne/ObliczeniaPul.ts'
import { groszeNaKwote, kwotaNaGrosze } from '../../services/ObliczeniaFinansowWspolnych'
import { utworzPuleFinansowa, edytujPuleFinansowa, zapiszOperacjePuli } from '../../services/WspolneKasyService'
import { WyborWaluty } from './FormularzeRozliczen'
import { useZapisRozliczenia, kwotaDoWyswietlenia } from './pomocRozliczen'

export function FormularzPuli({ pula, walutaZablokowana = false, zamknij, zapisano }: { pula?: WspolnaKasa; walutaZablokowana?: boolean; zamknij: () => void; zapisano: (id: string) => void }) {
  const [poczatkowa] = useState(pula)
  const [id] = useState(() => pula?.id ?? crypto.randomUUID())
  const [nazwa, ustawNazwe] = useState(pula?.nazwa ?? '')
  const [opis, ustawOpis] = useState(pula?.opis ?? '')
  const [waluta, ustawWalute] = useState(pula?.waluta ?? 'PLN')
  const [cel, ustawCel] = useState(pula?.pula?.celGrosze ? groszeNaKwote(pula.pula.celGrosze, pula.waluta) : '')
  const zapis = useZapisRozliczenia(poczatkowa?.rewizja ?? 0)
  const zamknijBezZapisu = () => { if (!zapis.zajety) zamknij() }
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    try {
      if (!nazwa.trim()) throw new Error('Wpisz nazwę Puli.')
      const dane = { nazwa: nazwa.trim(), opis: opis.trim(), waluta, ...(cel ? { celGrosze: kwotaNaGrosze(cel, waluta) } : {}) }
      void zapis.wykonaj(dane, (polecenie) => (poczatkowa ? edytujPuleFinansowa : utworzPuleFinansowa)(id, dane, polecenie), () => zapisano(id))
    } catch (blad) { zapis.ustawBlad((blad as Error).message) }
  }
  return <div className="pule-dialog"><Modal tytul={poczatkowa ? 'Edytuj Pulę' : 'Nowa Pula'} zamknij={zamknijBezZapisu}><form className="pule-formularz" onSubmit={wyslij}>
    <fieldset disabled={zapis.zajety}>
      <label className="pole"><span>Nazwa Puli</span><input required autoFocus value={nazwa} onChange={(zdarzenie) => ustawNazwe(zdarzenie.target.value)} /></label>
      <label className="pole"><span>Opis</span><textarea value={opis} onChange={(zdarzenie) => ustawOpis(zdarzenie.target.value)} /></label>
      <p>Rodzaj: finansowa. Uczestnicy nie są wymagani.</p>
      <WyborWaluty wartosc={waluta} zmien={ustawWalute} zablokowany={walutaZablokowana} />
      {walutaZablokowana && <p>Waluta jest zablokowana po pierwszej operacji, również usuniętej.</p>}
      <PoleKwoty etykieta="Cel finansowy (opcjonalny)" wartosc={cel} zmien={ustawCel} waluta={waluta} min="0.01" />
      {!poczatkowa && <p>Saldo początkowe: 0. Wcześniej zgromadzone środki dodaj jako osobną wpłatę.</p>}
      <div className="akcje-formularza"><button className="przycisk" type="button" onClick={zamknijBezZapisu}>Anuluj</button><button className="przycisk przycisk--glowny" type="submit">{zapis.zajety ? 'Zapisywanie…' : 'Zapisz Pulę'}</button></div>
    </fieldset>
    {zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}
  </form></Modal></div>
}

export function FormularzOperacjiPuli({ pula, typ, operacja, saldoGrosze, zamknij, zapisano }: { pula: WspolnaKasa; typ: 'wplyw' | 'wydatek'; operacja?: OperacjaKasy; saldoGrosze: number; zamknij: () => void; zapisano: () => void }) {
  const [poczatkowa] = useState({ pula, operacja, saldoGrosze })
  const [id] = useState(() => operacja?.id ?? crypto.randomUUID())
  const [kwota, ustawKwote] = useState(operacja ? groszeNaKwote(operacja.kwotaGrosze, pula.waluta) : '')
  const [data, ustawDate] = useState(operacja?.dataOperacji ?? dzisiajIso())
  const [opis, ustawOpis] = useState(operacja?.opis ?? '')
  const [zrodlo, ustawZrodlo] = useState(operacja?.zrodlo ?? '')
  const [kategoria, ustawKategorie] = useState(operacja?.kategoria ?? '')
  const zapis = useZapisRozliczenia(poczatkowa.operacja?.rewizja ?? 0)
  const zamknijBezZapisu = () => { if (!zapis.zajety) zamknij() }
  let przewidywane: number | undefined
  try { if (kwota) przewidywane = sumaGroszy([poczatkowa.saldoGrosze, (poczatkowa.operacja?.kwotaGrosze ?? 0) * (typ === 'wydatek' ? 1 : -1), kwotaNaGrosze(kwota, pula.waluta) * (typ === 'wydatek' ? -1 : 1)]) } catch { /* Niepełną kwotę waliduje PoleKwoty. */ }
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    try {
      const dane = { typ, kwotaGrosze: kwotaNaGrosze(kwota, pula.waluta), dataOperacji: data, opis: opis.trim(), zrodlo: zrodlo.trim(), kategoria: kategoria.trim() }
      if (typ === 'wydatek' && !dane.opis) throw new Error('Wpisz nazwę lub opis wydatku.')
      void zapis.wykonaj(dane, (polecenie) => zapiszOperacjePuli(pula.id, id, dane, poczatkowa.operacja ? 'aktualizacja' : 'utworzenie', polecenie, poczatkowa.pula.rewizja ?? 0), zapisano)
    } catch (blad) { zapis.ustawBlad((blad as Error).message) }
  }
  return <div className="pule-dialog"><Modal tytul={operacja ? 'Popraw operację' : typ === 'wplyw' ? 'Zarejestruj wpłatę' : 'Zarejestruj wydatek'} zamknij={zamknijBezZapisu}><form className="pule-formularz" onSubmit={wyslij}>
    <fieldset disabled={zapis.zajety}>
      <PoleKwoty etykieta="Kwota" wymagane min="0.01" wartosc={kwota} zmien={ustawKwote} waluta={pula.waluta} />
      <PoleDaty etykieta="Data operacji" wymagane wartosc={data} zmien={ustawDate} />
      <label className="pole"><span>{typ === 'wydatek' ? 'Nazwa lub opis wydatku' : 'Opis wpłaty'}</span><textarea required={typ === 'wydatek'} value={opis} onChange={(zdarzenie) => ustawOpis(zdarzenie.target.value)} /></label>
      {typ === 'wplyw' ? <label className="pole"><span>Źródło środków (opcjonalne)</span><input value={zrodlo} onChange={(zdarzenie) => ustawZrodlo(zdarzenie.target.value)} /></label> : <label className="pole"><span>Kategoria (opcjonalna)</span><input value={kategoria} onChange={(zdarzenie) => ustawKategorie(zdarzenie.target.value)} /></label>}
      {przewidywane !== undefined && <p className={przewidywane < 0 ? 'tekst-bledu' : ''}>Przewidywane saldo: <strong>{kwotaDoWyswietlenia(przewidywane, pula.waluta)}</strong></p>}
      {przewidywane !== undefined && przewidywane < 0 && <Komunikat>Uwaga: ta operacja pozostawi ujemne saldo Puli. Możesz ją zapisać; sprawdź kwotę przed zatwierdzeniem.</Komunikat>}
      <div className="akcje-formularza"><button className="przycisk" type="button" onClick={zamknijBezZapisu}>Anuluj</button><button className="przycisk przycisk--glowny" type="submit">{zapis.zajety ? 'Zapisywanie…' : 'Zapisz operację'}</button></div>
    </fieldset>
    {zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}
  </form></Modal></div>
}
