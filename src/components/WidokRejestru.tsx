import { useState, type FormEvent, type ReactNode } from 'react'
import { Edit3, Plus, Trash2 } from 'lucide-react'
import type { Repozytorium } from '../data/Repozytorium'
import type { EncjaBazowa } from '../domain/typy'
import { Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan } from './Interfejs'

export interface DefinicjaPola {
  klucz: string
  etykieta: string
  typ?: 'text' | 'textarea' | 'date' | 'time' | 'number' | 'email' | 'url' | 'select'
  wymagane?: boolean
  podpowiedz?: string
  min?: number
  krok?: number
  opcje?: { wartosc: string; etykieta: string }[]
}

interface Wlasciwosci<T extends EncjaBazowa> {
  tytul: string
  opis: string
  etykietaDodawania: string
  dane: T[]
  repozytorium: Repozytorium<T>
  pola: DefinicjaPola[]
  zbuduj: (formularz: Record<string, string>, istniejacy?: T) => T
  etykieta: (element: T) => string
  szczegoly: (element: T) => ReactNode
  akcje?: (element: T) => ReactNode
  filtr?: ReactNode
}

function wartoscTekstowa(wartosc: unknown): string {
  if (Array.isArray(wartosc)) return wartosc.join(', ')
  return wartosc === undefined || wartosc === null ? '' : String(wartosc)
}

export function WidokRejestru<T extends EncjaBazowa>(wlasciwosci: Wlasciwosci<T>) {
  const [formularzOtwarty, ustawFormularzOtwarty] = useState(false)
  const [edytowany, ustawEdytowany] = useState<T>()
  const [formularz, ustawFormularz] = useState<Record<string, string>>({})
  const [doUsuniecia, ustawDoUsuniecia] = useState<T>()
  const [blad, ustawBlad] = useState('')

  const otworz = (element?: T) => {
    ustawEdytowany(element)
    ustawFormularz(Object.fromEntries(wlasciwosci.pola.map((pole) => [pole.klucz, wartoscTekstowa(element ? (element as unknown as Record<string, unknown>)[pole.klucz] : '')])))
    ustawBlad('')
    ustawFormularzOtwarty(true)
  }

  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    try {
      const encja = wlasciwosci.zbuduj(formularz, edytowany)
      await wlasciwosci.repozytorium.zapisz(encja)
      ustawFormularzOtwarty(false)
    } catch (przyczyna) {
      ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udalo sie zapisac elementu.')
    }
  }

  return (
    <div className="widok">
      <NaglowekWidoku
        tytul={wlasciwosci.tytul}
        opis={wlasciwosci.opis}
        akcje={<button type="button" className="przycisk przycisk--glowny" onClick={() => otworz()}><Plus aria-hidden="true" />{wlasciwosci.etykietaDodawania}</button>}
      />
      {wlasciwosci.filtr}
      {wlasciwosci.dane.length === 0 ? (
        <PustyStan tytul="Na razie jest tu pusto" opis="Dodaj pierwszy element, aby zacząć korzystać z modułu." akcja={<button type="button" className="przycisk przycisk--glowny" onClick={() => otworz()}>Dodaj</button>} />
      ) : (
        <div className="lista-rekordow">
          {wlasciwosci.dane.map((element) => (
            <article className="rekord" key={element.id} data-element-id={element.id}>
              <div className="rekord__tresc">
                <h3>{wlasciwosci.etykieta(element)}</h3>
                <div className="rekord__szczegoly">{wlasciwosci.szczegoly(element)}</div>
              </div>
              <div className="rekord__akcje">
                {wlasciwosci.akcje?.(element)}
                <button type="button" className="przycisk-ikona" onClick={() => otworz(element)} title="Edytuj"><Edit3 aria-hidden="true" /><span className="sr-only">Edytuj</span></button>
                <button type="button" className="przycisk-ikona przycisk-ikona--niebezpieczny" onClick={() => ustawDoUsuniecia(element)} title="Usuń"><Trash2 aria-hidden="true" /><span className="sr-only">Usuń</span></button>
              </div>
            </article>
          ))}
        </div>
      )}
      {formularzOtwarty && (
        <Modal tytul={edytowany ? 'Edytuj element' : wlasciwosci.etykietaDodawania} zamknij={() => ustawFormularzOtwarty(false)}>
          <form className="formularz" onSubmit={zapisz}>
            {blad && <Komunikat typ="blad">{blad}</Komunikat>}
            {wlasciwosci.pola.map((pole) => (
              <label className={pole.typ === 'textarea' ? 'pole pole--pelne' : 'pole'} key={pole.klucz}>
                <span>{pole.etykieta}{pole.wymagane && ' *'}</span>
                {pole.typ === 'textarea' ? (
                  <textarea required={pole.wymagane} placeholder={pole.podpowiedz} value={formularz[pole.klucz] ?? ''} onChange={(e) => ustawFormularz({ ...formularz, [pole.klucz]: e.target.value })} />
                ) : pole.typ === 'select' ? (
                  <select required={pole.wymagane} value={formularz[pole.klucz] ?? ''} onChange={(e) => ustawFormularz({ ...formularz, [pole.klucz]: e.target.value })}>
                    {!pole.wymagane && <option value="">—</option>}
                    {pole.opcje?.map((opcja) => <option key={opcja.wartosc} value={opcja.wartosc}>{opcja.etykieta}</option>)}
                  </select>
                ) : (
                  <input type={pole.typ ?? 'text'} required={pole.wymagane} placeholder={pole.podpowiedz} min={pole.min} step={pole.krok} value={formularz[pole.klucz] ?? ''} onChange={(e) => ustawFormularz({ ...formularz, [pole.klucz]: e.target.value })} />
                )}
              </label>
            ))}
            <div className="akcje-formularza pole--pelne">
              <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawFormularzOtwarty(false)}>Anuluj</button>
              <button type="submit" className="przycisk przycisk--glowny">Zapisz</button>
            </div>
          </form>
        </Modal>
      )}
      {doUsuniecia && (
        <ModalPotwierdzenia
          tytul="Usunąć element?"
          opis={`Element „${wlasciwosci.etykieta(doUsuniecia)}” zniknie z bieżących danych, ale pozostanie jako znacznik synchronizacyjny w kopii lokalnej.`}
          etykietaAkcji="Usuń"
          niebezpieczne
          anuluj={() => ustawDoUsuniecia(undefined)}
          potwierdz={async () => { await wlasciwosci.repozytorium.usun(doUsuniecia.id); ustawDoUsuniecia(undefined) }}
        />
      )}
    </div>
  )
}
