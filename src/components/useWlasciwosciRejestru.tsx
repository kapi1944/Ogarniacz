import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import type { DefinicjaPolaRejestru, DefinicjaWidokuRejestru, TypPolaRejestru } from '../domain/rejestr'
import { useRepozytorium } from '../hooks/useRepozytorium'
import { archiwizujWlasnePoleRejestru, utworzWlasnePoleRejestru, zapiszWidokRejestru, zmienDefinicjeWlasnegoPolaRejestru } from '../services/RejestrService'
import { Modal } from './Interfejs'

const TYPY_POL: { wartosc: TypPolaRejestru; etykieta: string }[] = [
  { wartosc: 'tekst', etykieta: 'Tekst' }, { wartosc: 'textarea', etykieta: 'Długi tekst' }, { wartosc: 'liczba', etykieta: 'Liczba' }, { wartosc: 'kwota', etykieta: 'Kwota' }, { wartosc: 'data', etykieta: 'Data' }, { wartosc: 'czas', etykieta: 'Czas' }, { wartosc: 'checkbox', etykieta: 'Checkbox' }, { wartosc: 'select', etykieta: 'Wybór' }, { wartosc: 'multiselect', etykieta: 'Tagi' }, { wartosc: 'url', etykieta: 'URL' },
]

interface OpcjeWlasciwosciRejestru {
  rejestrId: string
  polaSystemowe: DefinicjaPolaRejestru[]
  idWidoku?: string
  tytulKonfiguracji?: string
  aktywny?: boolean
}

function domyslnyWidok(rejestrId: string, id: string, pola: DefinicjaPolaRejestru[]): Omit<DefinicjaWidokuRejestru, 'createdAt' | 'updatedAt' | 'usunietoAt'> {
  return { id, rejestrId, nazwa: 'Domyślny', widocznePolaIds: pola.filter((pole) => pole.zrodlo !== 'systemowe' || pole.trybObslugi !== 'akcja_domenowa').map((pole) => pole.id) }
}

export function useWlasciwosciRejestru({ rejestrId, polaSystemowe, idWidoku = `widok:${rejestrId}:domyslny`, tytulKonfiguracji = 'Kolumny', aktywny = true }: OpcjeWlasciwosciRejestru): { pola: DefinicjaPolaRejestru[]; widocznePola: DefinicjaPolaRejestru[]; sterowanie: ReactNode } {
  const { dane: definicje, repozytorium: repoDefinicji } = useRepozytorium('definicjeWlasnychPolRejestru')
  const { dane: widoki, repozytorium: repoWidokow } = useRepozytorium('widokiRejestru')
  const [konfiguracjaOtwarta, ustawKonfiguracjeOtwarta] = useState(false)
  const [tworzenieOtwarte, ustawTworzenieOtwarte] = useState(false)
  const [etykieta, ustawEtykiete] = useState('')
  const [typ, ustawTyp] = useState<TypPolaRejestru>('tekst')
  const [opcje, ustawOpcje] = useState('')
  const pola = useMemo(() => [...polaSystemowe, ...definicje.filter((pole) => pole.rejestrId === rejestrId && pole.aktywne).map((pole) => ({ id: pole.id, zrodlo: 'wlasne' as const, etykieta: pole.etykieta, typ: pole.typ, opcje: pole.opcje, rolaSemantyczna: pole.rolaSemantyczna }))] as DefinicjaPolaRejestru[], [definicje, polaSystemowe, rejestrId])
  const widok = widoki.find((kandydat) => kandydat.id === idWidoku)
  const widoczneIds = widok?.widocznePolaIds ?? domyslnyWidok(rejestrId, idWidoku, pola).widocznePolaIds
  const widocznePola = widoczneIds.map((id) => pola.find((pole) => pole.id === id)).filter((pole): pole is DefinicjaPolaRejestru => Boolean(pole))

  const zapiszWidok = async (widocznePolaIds: DefinicjaWidokuRejestru['widocznePolaIds']) => {
    await zapiszWidokRejestru({ ...(widok ?? domyslnyWidok(rejestrId, idWidoku, pola)), widocznePolaIds }, repoWidokow)
  }
  const utworzPole = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (!etykieta.trim()) return
    await utworzWlasnePoleRejestru({ rejestrId, etykieta: etykieta.trim(), typ, opcje: ['select', 'multiselect'].includes(typ) ? opcje.split('\n').map((wartosc) => wartosc.trim()).filter(Boolean).map((wartosc) => ({ wartosc, etykieta: wartosc })) : undefined } as never, repoDefinicji)
    ustawTworzenieOtwarte(false)
    ustawEtykiete('')
    ustawOpcje('')
  }
  const czyAkcja = (pole: DefinicjaPolaRejestru) => pole.zrodlo === 'systemowe' && pole.trybObslugi === 'akcja_domenowa'
  const sterowanie = aktywny ? <><div className="akcje-karty"><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawKonfiguracjeOtwarta(true)}><Settings2 aria-hidden="true" />Kolumny</button><button type="button" className="przycisk przycisk--glowny" onClick={() => ustawTworzenieOtwarte(true)}><Plus aria-hidden="true" />Dodaj właściwość</button></div>{konfiguracjaOtwarta && <Modal tytul={tytulKonfiguracji} zamknij={() => ustawKonfiguracjeOtwarta(false)}><div className="lista-kompaktowa">{pola.filter((pole) => !czyAkcja(pole)).map((pole) => <div key={pole.id}><label><input type="checkbox" checked={widoczneIds.includes(pole.id)} onChange={() => void zapiszWidok(widoczneIds.includes(pole.id) ? widoczneIds.filter((id) => id !== pole.id) : [...widoczneIds, pole.id])} />{pole.etykieta}</label>{pole.zrodlo === 'wlasne' && <div><button type="button" title="Zmień nazwę pola" className="przycisk-ikona" onClick={() => { const nowaEtykieta = window.prompt('Nowa nazwa pola', pole.etykieta); if (nowaEtykieta?.trim()) void zmienDefinicjeWlasnegoPolaRejestru(pole.id, { etykieta: nowaEtykieta.trim(), opcje: pole.opcje, rolaSemantyczna: pole.rolaSemantyczna } as never, repoDefinicji) }}><Pencil /></button><button type="button" title="Archiwizuj pole" className="przycisk-ikona" onClick={() => void archiwizujWlasnePoleRejestru(pole.id, repoDefinicji)}><Trash2 /></button></div>}</div>)}</div></Modal>}{tworzenieOtwarte && <Modal tytul="Dodaj właściwość" zamknij={() => ustawTworzenieOtwarte(false)}><form className="formularz" onSubmit={utworzPole}><label className="pole"><span>Nazwa</span><input required value={etykieta} onChange={(zdarzenie) => ustawEtykiete(zdarzenie.target.value)} /></label><label className="pole"><span>Typ</span><select value={typ} onChange={(zdarzenie) => ustawTyp(zdarzenie.target.value as TypPolaRejestru)}>{TYPY_POL.map((opcja) => <option key={opcja.wartosc} value={opcja.wartosc}>{opcja.etykieta}</option>)}</select></label>{['select', 'multiselect'].includes(typ) && <label className="pole pole--pelne"><span>Opcje, po jednej w wierszu</span><textarea value={opcje} onChange={(zdarzenie) => ustawOpcje(zdarzenie.target.value)} /></label>}<div className="akcje-formularza"><button type="submit" className="przycisk przycisk--glowny">Utwórz</button></div></form></Modal>}</> : null
  return { pola, widocznePola, sterowanie }
}
