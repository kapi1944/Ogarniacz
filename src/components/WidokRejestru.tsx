import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Edit3, Plus, Trash2 } from 'lucide-react'
import type { Repozytorium } from '../data/Repozytorium'
import type { DefinicjaPolaRejestru } from '../domain/rejestr'
import type { EncjaBazowa } from '../domain/typy'
import { EdytorPolaRejestru, normalizujPolaRejestru, normalizujStarePolaRejestru, skonwertujWartoscPolaWlasnego, wartoscFormularzaPola, type DefinicjaPola, type PoleDoEdycjiRejestru } from './EdytorPolaRejestru'
import { Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan } from './Interfejs'
import { useWlasciwosciRejestru } from './useWlasciwosciRejestru'

export type { DefinicjaPola } from './EdytorPolaRejestru'

interface Wlasciwosci<T extends EncjaBazowa> {
  tytul: string
  opis: string
  etykietaDodawania: string
  dane: T[]
  repozytorium: Repozytorium<T>
  pola: DefinicjaPola[]
  polaRejestru?: DefinicjaPolaRejestru[]
  konfiguracjaWlasciwosci?: { rejestrId: string; polaSystemowe: DefinicjaPolaRejestru[]; tytulKonfiguracji?: string }
  zbuduj: (formularz: Record<string, string>, istniejacy?: T) => T
  etykieta: (element: T) => string
  szczegoly: (element: T) => ReactNode
  akcje?: (element: T) => ReactNode
  filtr?: ReactNode
  uzupelnijFormularz?: (element: T) => Record<string, string>
  wybranyElementId?: string
  poZapisie?: (element: T, poprzedni?: T) => Promise<void>
  pustyStan?: { tytul: string; opis: string }
}

export function WidokRejestru<T extends EncjaBazowa>(wlasciwosci: Wlasciwosci<T>) {
  const [formularzOtwarty, ustawFormularzOtwarty] = useState(false)
  const [edytowany, ustawEdytowany] = useState<T>()
  const [formularz, ustawFormularz] = useState<Record<string, string>>({})
  const [doUsuniecia, ustawDoUsuniecia] = useState<T>()
  const [blad, ustawBlad] = useState('')
  const ostatnioOtwartyElement = useRef<string | undefined>(undefined)
  const konfiguracjaWlasciwosci = useWlasciwosciRejestru({ rejestrId: wlasciwosci.konfiguracjaWlasciwosci?.rejestrId ?? 'nieaktywny', polaSystemowe: wlasciwosci.konfiguracjaWlasciwosci?.polaSystemowe ?? [], tytulKonfiguracji: wlasciwosci.konfiguracjaWlasciwosci?.tytulKonfiguracji, aktywny: Boolean(wlasciwosci.konfiguracjaWlasciwosci) })
  const zewnetrznePola = normalizujPolaRejestru(wlasciwosci.konfiguracjaWlasciwosci ? konfiguracjaWlasciwosci.pola : wlasciwosci.polaRejestru ?? [])
  const zewnetrzneIdPola = new Set(zewnetrznePola.map((pole) => pole.definicja.id))
  const polaDoEdycji: PoleDoEdycjiRejestru[] = [
    ...normalizujStarePolaRejestru(wlasciwosci.pola).filter((pole) => !zewnetrzneIdPola.has(pole.definicja.id)),
    ...zewnetrznePola,
  ]

  const otworz = useCallback((element?: T) => {
    ustawEdytowany(element)
    const wartosciPoczatkowe = Object.fromEntries(polaDoEdycji.map((pole) => [pole.definicja.id, wartoscFormularzaPola(element, pole)]))
    const uzupelnienia = element ? wlasciwosci.uzupelnijFormularz?.(element) : undefined
    const formularzZUzupelnieniem = Object.fromEntries(polaDoEdycji.map((pole) => {
      const kluczUzupelnienia = pole.definicja.zrodlo === 'systemowe' && pole.definicja.trybObslugi === 'bezposrednie'
        ? pole.definicja.kluczWlasciwosci
        : pole.definicja.id
      return [pole.definicja.id, uzupelnienia?.[kluczUzupelnienia ?? pole.definicja.id] ?? wartosciPoczatkowe[pole.definicja.id]]
    }))
    ustawFormularz(formularzZUzupelnieniem)
    ustawBlad('')
    ustawFormularzOtwarty(true)
  }, [polaDoEdycji, wlasciwosci])

  useEffect(() => {
    const wybranyElementId = wlasciwosci.wybranyElementId
    if (!wybranyElementId || ostatnioOtwartyElement.current === wybranyElementId) return
    const element = wlasciwosci.dane.find((pozycja) => pozycja.id === wybranyElementId)
    if (!element) return
    ostatnioOtwartyElement.current = wybranyElementId
    otworz(element)
  }, [otworz, wlasciwosci.dane, wlasciwosci.wybranyElementId])

  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    try {
      const formularzSystemowy = polaDoEdycji.reduce<Record<string, string>>((wynik, pole) => {
        if (pole.definicja.zrodlo === 'systemowe' && pole.definicja.trybObslugi === 'bezposrednie') {
          wynik[pole.definicja.kluczWlasciwosci] = formularz[pole.definicja.id] ?? ''
        }
        return wynik
      }, {})
      const zbudowanaEncja = wlasciwosci.zbuduj(formularzSystemowy, edytowany)
      const polaWlasne = polaDoEdycji
        .filter((pole) => pole.definicja.zrodlo === 'wlasne')
        .reduce((wynik, pole) => ({ ...wynik, [pole.definicja.id]: skonwertujWartoscPolaWlasnego(pole.definicja, formularz[pole.definicja.id] ?? '') }), zbudowanaEncja.polaWlasne ?? {})
      const encja = { ...zbudowanaEncja, ...(polaDoEdycji.some((pole) => pole.definicja.zrodlo === 'wlasne') ? { polaWlasne } : {}) }
      await wlasciwosci.repozytorium.zapisz(encja)
      await wlasciwosci.poZapisie?.(encja, edytowany)
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
        akcje={<>{konfiguracjaWlasciwosci.sterowanie}<button type="button" className="przycisk przycisk--glowny" onClick={() => otworz()}><Plus aria-hidden="true" />{wlasciwosci.etykietaDodawania}</button></>}
      />
      {wlasciwosci.filtr}
      {wlasciwosci.dane.length === 0 ? (
        <PustyStan tytul={wlasciwosci.pustyStan?.tytul ?? 'Na razie jest tu pusto'} opis={wlasciwosci.pustyStan?.opis ?? `Wybierz „${wlasciwosci.etykietaDodawania}”, aby zacząć korzystać z tej części.`} akcja={<button type="button" className="przycisk przycisk--glowny" onClick={() => otworz()}>{wlasciwosci.etykietaDodawania}</button>} />
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
            {polaDoEdycji.filter((pole) => pole.widoczne?.(formularz) ?? true).map((pole) => (
              <EdytorPolaRejestru key={pole.definicja.id} pole={pole} wartosc={formularz[pole.definicja.id] ?? ''} zmien={(wartosc) => ustawFormularz({ ...formularz, [pole.definicja.id]: wartosc })} />
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
