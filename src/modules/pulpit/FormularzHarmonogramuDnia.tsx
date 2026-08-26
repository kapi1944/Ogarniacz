import { useState, type FormEvent } from 'react'
import { Komunikat, Modal } from '../../components/Interfejs'
import type { ZakresZmianyHarmonogramu } from '../../domain/typy'
import type { EdycjaHarmonogramuDnia, HarmonogramDnia } from './logikaOsiCzasu'

export function FormularzHarmonogramuDnia({
  harmonogram,
  opis,
  domyslnyZakres,
  zezwalajNaPelnaDostepnosc,
  zamknij,
  zapisz,
}: {
  harmonogram: HarmonogramDnia
  opis?: string
  domyslnyZakres: ZakresZmianyHarmonogramu
  zezwalajNaPelnaDostepnosc: boolean
  zamknij: () => void
  zapisz: (edycja: EdycjaHarmonogramuDnia, zakres: ZakresZmianyHarmonogramu) => Promise<void>
}) {
  const [edycja, ustawEdycje] = useState<EdycjaHarmonogramuDnia>({
    pracuje: harmonogram.pracuje,
    odPracy: harmonogram.odPracy,
    doPracy: harmonogram.doPracy,
    dojazdDoPracyMinuty: harmonogram.dojazdDoPracyMinuty,
    powrotZPracyMinuty: harmonogram.powrotZPracyMinuty,
    dostepnoscDojazdu: harmonogram.dostepnoscDojazdu,
    opis,
  })
  const [zakres, ustawZakres] = useState<ZakresZmianyHarmonogramu>(domyslnyZakres)
  const [blad, ustawBlad] = useState('')

  const wyslij = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (edycja.pracuje && (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(edycja.odPracy) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(edycja.doPracy) || edycja.doPracy <= edycja.odPracy)) {
      ustawBlad('Godzina zakończenia pracy musi być późniejsza niż rozpoczęcia.')
      return
    }
    await zapisz(edycja, zakres)
  }

  return (
    <Modal tytul="Zmień harmonogram dnia" opis="Wybierz, czy zmiana dotyczy tylko tej daty, czy ma stać się nową regułą." zamknij={zamknij}>
      <form className="formularz" onSubmit={wyslij}>
        {blad && <div className="pole--pelne"><Komunikat typ="blad">{blad}</Komunikat></div>}
        <label className="pole pole--pelne pole-checkbox">
          <input type="checkbox" checked={edycja.pracuje} onChange={(zdarzenie) => ustawEdycje({ ...edycja, pracuje: zdarzenie.target.checked })} />
          <span>W tym dniu pracuję</span>
        </label>
        {edycja.pracuje && <>
          <label className="pole"><span>Praca od</span><input type="time" value={edycja.odPracy} onChange={(zdarzenie) => ustawEdycje({ ...edycja, odPracy: zdarzenie.target.value })} /></label>
          <label className="pole"><span>Praca do</span><input type="time" value={edycja.doPracy} onChange={(zdarzenie) => ustawEdycje({ ...edycja, doPracy: zdarzenie.target.value })} /></label>
          <label className="pole"><span>Dojazd do pracy</span><input type="number" min="0" max="180" value={edycja.dojazdDoPracyMinuty} onChange={(zdarzenie) => ustawEdycje({ ...edycja, dojazdDoPracyMinuty: Number(zdarzenie.target.value) })} /><small>0 minut oznacza brak dojazdu.</small></label>
          <label className="pole"><span>Powrót</span><input type="number" min="0" max="180" value={edycja.powrotZPracyMinuty} onChange={(zdarzenie) => ustawEdycje({ ...edycja, powrotZPracyMinuty: Number(zdarzenie.target.value) })} /></label>
          <label className="pole pole--pelne"><span>Dostępność podczas dojazdów</span><select value={edycja.dostepnoscDojazdu} disabled={!zezwalajNaPelnaDostepnosc} onChange={(zdarzenie) => ustawEdycje({ ...edycja, dostepnoscDojazdu: zdarzenie.target.value as EdycjaHarmonogramuDnia['dostepnoscDojazdu'] })}><option value="czesciowa">Częściowa — bez zwykłych zadań ekranowych</option><option value="pelna">Pełna</option></select></label>
        </>}
        <label className="pole pole--pelne"><span>Opis wyjątku</span><input value={edycja.opis ?? ''} onChange={(zdarzenie) => ustawEdycje({ ...edycja, opis: zdarzenie.target.value || undefined })} placeholder="np. wcześniejsze wyjście, dzień wolny" /></label>
        <label className="pole pole--pelne"><span>Zakres zmiany</span><select value={zakres} onChange={(zdarzenie) => ustawZakres(zdarzenie.target.value as ZakresZmianyHarmonogramu)}><option value="tylko_ten_dzien">Tylko ten dzień — zapisz wyjątek daty</option><option value="nowa_regula">Zapisz jako nową regułę harmonogramu</option></select></label>
        <div className="akcje-formularza pole--pelne">
          <button type="button" className="przycisk przycisk--drugorzedny" onClick={zamknij}>Anuluj</button>
          <button type="submit" className="przycisk przycisk--glowny">Zapisz zmianę</button>
        </div>
      </form>
    </Modal>
  )
}
