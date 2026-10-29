import { useState, type FormEvent } from 'react'
import { Modal, Komunikat } from '../../components/Interfejs'
import { PoleDaty } from '../../components/PoleDaty'
import { PoleKwoty } from '../../components/PoleKwoty'
import { dzisiajIso } from '../../domain/fabryki'
import type { Rozliczenie } from '../../domain/modeleFinansowWspolnych'
import { kwotaNaGrosze } from '../../services/ObliczeniaFinansowWspolnych'
import { limitZwrotu, zarejestrujZwrot, type pobierzBilansRozliczenia } from '../../services/RozliczeniaService'
import { WyborWaluty } from './FormularzeRozliczen'
import { kwotaDoWyswietlenia, nazwaOsoby, useZapisRozliczenia } from './pomocRozliczen'

export function FormularzZwrotu({ rozliczenie, bilans, zamknij }: { rozliczenie: Rozliczenie; bilans: Awaited<ReturnType<typeof pobierzBilansRozliczenia>>; zamknij: () => void }) {
  const [id] = useState(() => crypto.randomUUID())
  const [od, ustawOd] = useState('')
  const [doOsoby, ustawDo] = useState('')
  const [kwota, ustawKwote] = useState('')
  const [data, ustawDate] = useState(dzisiajIso())
  const [opis, ustawOpis] = useState('')
  const [potwierdzenie, ustawPotwierdzenie] = useState(false)
  const zapis = useZapisRozliczenia()
  const limit = limitZwrotu(bilans, od, doOsoby)
  let nadplata = false
  try { nadplata = Boolean(od && doOsoby && kwotaNaGrosze(kwota, rozliczenie.waluta) > limit) } catch { /* Szkic kwoty nie powoduje zapisu. */ }
  const zmienKwote = (tekst: string) => { ustawKwote(tekst); ustawPotwierdzenie(false) }
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    try {
      if (od === doOsoby) throw new Error('Wybierz dwie różne osoby.')
      if (nadplata && !potwierdzenie) throw new Error('Potwierdź rzeczywistą nadpłatę.')
      const dane = { rozliczenieId: rozliczenie.id, odUczestnikaId: od, doUczestnikaId: doOsoby, kwotaGrosze: kwotaNaGrosze(kwota, rozliczenie.waluta), waluta: rozliczenie.waluta, dataOperacji: data, opis: opis.trim() }
      void zapis.wykonaj(dane, (polecenie) => zarejestrujZwrot(id, dane, polecenie, potwierdzenie), zamknij)
    } catch (blad) { zapis.ustawBlad((blad as Error).message) }
  }
  return <Modal tytul="Zarejestruj zwrot" zamknij={zamknij}><form className="rozliczenia-formularz" onSubmit={wyslij}>
    <p>Zapisz wyłącznie wykonany przelew lub zwrot gotówki. Propozycja przelewu nie jest spłatą.</p>
    <fieldset disabled={zapis.zajety}>
      <label className="pole"><span>Kto oddaje</span><select required value={od} onChange={(zdarzenie) => { ustawOd(zdarzenie.target.value); ustawPotwierdzenie(false) }}><option value="">Wybierz osobę</option>{rozliczenie.uczestnicy.map((osoba) => <option value={osoba.id} key={osoba.id}>{nazwaOsoby(rozliczenie, osoba.id)}{osoba.nieaktywny && ' · nieaktywna'}</option>)}</select></label>
      <label className="pole"><span>Komu oddaje</span><select required value={doOsoby} onChange={(zdarzenie) => { ustawDo(zdarzenie.target.value); ustawPotwierdzenie(false) }}><option value="">Wybierz osobę</option>{rozliczenie.uczestnicy.filter((osoba) => osoba.id !== od).map((osoba) => <option value={osoba.id} key={osoba.id}>{nazwaOsoby(rozliczenie, osoba.id)}{osoba.nieaktywny && ' · nieaktywna'}</option>)}</select></label>
      <PoleKwoty etykieta="Kwota zwrotu" wartosc={kwota} zmien={zmienKwote} wymagane min="0.01" waluta={rozliczenie.waluta} />
      <WyborWaluty wartosc={rozliczenie.waluta} zmien={() => {}} zablokowany />
      <PoleDaty etykieta="Data zwrotu" wartosc={data} zmien={ustawDate} wymagane />
      <label className="pole"><span>Opis zwrotu</span><textarea value={opis} onChange={(zdarzenie) => ustawOpis(zdarzenie.target.value)} /></label>
      {od && doOsoby && <p>Bieżąca kwota do rozliczenia w tym kierunku: {kwotaDoWyswietlenia(limit, rozliczenie.waluta)}.</p>}
      {nadplata && <><Komunikat>Kwota przekracza bieżącą należność lub jest zwrotem w przeciwnym kierunku. Bilans może wskazać przeciwną należność.</Komunikat><label className="rozliczenia-wybor"><input type="checkbox" required checked={potwierdzenie} onChange={(zdarzenie) => ustawPotwierdzenie(zdarzenie.target.checked)} />Potwierdzam rzeczywisty zwrot mimo nadpłaty</label></>}
    </fieldset>
    {zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}
    <div className="akcje-formularza"><button className="przycisk" type="button" onClick={zamknij}>Anuluj</button><button className="przycisk przycisk--glowny" disabled={zapis.zajety}>Zapisz wykonany zwrot</button></div>
  </form></Modal>
}
