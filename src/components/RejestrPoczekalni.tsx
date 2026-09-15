import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import type { DefinicjaPolaRejestru, DefinicjaWidokuRejestru, TypPolaRejestru } from '../domain/rejestr'
import type { ElementSkrzynki } from '../domain/typy'
import { useRepozytorium } from '../hooks/useRepozytorium'
import { archiwizujWlasnePoleRejestru, utworzWlasnePoleRejestru, zapiszWidokRejestru, zmienDefinicjeWlasnegoPolaRejestru } from '../services/RejestrService'
import { rejestrResolverowPolSystemowych } from '../services/KontraktPolSystemowychRejestru'
import { POLE_AKCJI_PRZEKSZTALCENIA_POCZEKALNI, przeksztalcPoczekalniePrzezRejestr } from '../services/RejestrPolSystemowychPoczekalni'
import { czyElementInboxDoKlasyfikacji, zapiszDoInbox, type TypKonwersjiInbox } from '../services/PoczekalniaService'
import { EdytorPolaRejestru, skonwertujWartoscPolaWlasnego, wartoscFormularzaPola, type PoleDoEdycjiRejestru } from './EdytorPolaRejestru'
import { Karta, Komunikat, Modal } from './Interfejs'

const ID_REJESTRU = 'poczekalnia'
const typyPol: { wartosc: TypPolaRejestru; etykieta: string }[] = [
  { wartosc: 'tekst', etykieta: 'Tekst' }, { wartosc: 'textarea', etykieta: 'Długi tekst' }, { wartosc: 'liczba', etykieta: 'Liczba' }, { wartosc: 'kwota', etykieta: 'Kwota' }, { wartosc: 'data', etykieta: 'Data' }, { wartosc: 'czas', etykieta: 'Czas' }, { wartosc: 'checkbox', etykieta: 'Checkbox' }, { wartosc: 'select', etykieta: 'Wybór' }, { wartosc: 'multiselect', etykieta: 'Tagi' }, { wartosc: 'url', etykieta: 'URL' },
]

export const POLA_SYSTEMOWE_POCZEKALNI: DefinicjaPolaRejestru[] = [
  { id: 'system:tresc', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'tresc', etykieta: 'Treść', typ: 'textarea' },
  { id: 'system:zrodlo', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'zrodlo', etykieta: 'Źródło', typ: 'select', opcje: [{ wartosc: 'tekst', etykieta: 'Tekst' }, { wartosc: 'glos', etykieta: 'Głos' }] },
  { id: 'system:status', zrodlo: 'systemowe', trybObslugi: 'tylko_odczyt', resolverId: 'resolver:poczekalnia-status', etykieta: 'Status', typ: 'tekst' },
  { id: 'system:przeksztalconoNa', zrodlo: 'systemowe', trybObslugi: 'tylko_odczyt', resolverId: 'resolver:poczekalnia-wynik-przeksztalcenia', etykieta: 'Wynik', typ: 'tekst' },
  POLE_AKCJI_PRZEKSZTALCENIA_POCZEKALNI,
]

function wartoscPola(element: ElementSkrzynki, pole: DefinicjaPolaRejestru): string {
  if (pole.zrodlo === 'systemowe' && pole.trybObslugi === 'tylko_odczyt') {
    const wynik = rejestrResolverowPolSystemowych.odczytaj(pole, { encja: element, daneZrodlowe: {} })
    return wynik.stan === 'gotowe' ? String(wynik.wartosc ?? '—') : wynik.komunikat
  }
  return wartoscFormularzaPola(element, { definicja: pole }) || '—'
}

function domyslnyWidok(pola: DefinicjaPolaRejestru[]): Omit<DefinicjaWidokuRejestru, 'createdAt' | 'updatedAt' | 'usunietoAt'> {
  return { id: 'widok:poczekalnia:domyslny', rejestrId: ID_REJESTRU, nazwa: 'Domyślny', widocznePolaIds: pola.filter((pole) => pole.zrodlo !== 'systemowe' || pole.trybObslugi !== 'akcja_domenowa').map((pole) => pole.id) }
}

export function RejestrPoczekalni() {
  const { dane, repozytorium } = useRepozytorium('skrzynka')
  const { dane: definicje, repozytorium: repoDefinicji } = useRepozytorium('definicjeWlasnychPolRejestru')
  const { dane: widoki, repozytorium: repoWidokow } = useRepozytorium('widokiRejestru')
  const [edytowany, ustawEdytowany] = useState<ElementSkrzynki>()
  const [formularz, ustawFormularz] = useState<Record<string, string>>({})
  const [konfiguracja, ustawKonfiguracja] = useState(false)
  const [nowePole, ustawNowePole] = useState(false)
  const [nazwaPola, ustawNazwePola] = useState('')
  const [typPola, ustawTypPola] = useState<TypPolaRejestru>('tekst')
  const [opcje, ustawOpcje] = useState('')
  const [komunikat, ustawKomunikat] = useState<{ typ: 'sukces' | 'blad'; tresc: string }>()
  const wszystkiePola = useMemo(() => [...POLA_SYSTEMOWE_POCZEKALNI, ...definicje.filter((pole) => pole.rejestrId === ID_REJESTRU && pole.aktywne).map((pole) => ({ id: pole.id, zrodlo: 'wlasne' as const, etykieta: pole.etykieta, typ: pole.typ, opcje: pole.opcje, rolaSemantyczna: pole.rolaSemantyczna }))] as DefinicjaPolaRejestru[], [definicje])
  const widok = widoki.find((element) => element.id === 'widok:poczekalnia:domyslny')
  useEffect(() => { if (!widok) void zapiszWidokRejestru(domyslnyWidok(wszystkiePola), repoWidokow) }, [repoWidokow, wszystkiePola, widok])
  const widoczneIds = widok?.widocznePolaIds ?? domyslnyWidok(wszystkiePola).widocznePolaIds
  const kolumny = widoczneIds.map((id) => wszystkiePola.find((pole) => pole.id === id)).filter((pole): pole is DefinicjaPolaRejestru => Boolean(pole))
  const oczekujace = dane.filter(czyElementInboxDoKlasyfikacji).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const historia = dane.filter((element) => !czyElementInboxDoKlasyfikacji(element)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const elementy = [...oczekujace, ...historia]

  const czyAkcja = (pole: DefinicjaPolaRejestru) => pole.zrodlo === 'systemowe' && pole.trybObslugi === 'akcja_domenowa'
  const otworz = (element: ElementSkrzynki) => {
    ustawEdytowany(element)
    ustawFormularz(Object.fromEntries(wszystkiePola.filter((pole) => !czyAkcja(pole)).map((pole) => [pole.id, wartoscPola(element, pole)])))
  }
  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (!edytowany) return
    const systemowe = Object.fromEntries(wszystkiePola.filter((pole) => pole.zrodlo === 'systemowe' && pole.trybObslugi === 'bezposrednie').map((pole) => [pole.kluczWlasciwosci, formularz[pole.id] ?? '']))
    const polaWlasne = wszystkiePola.filter((pole) => pole.zrodlo === 'wlasne').reduce((wynik, pole) => ({ ...wynik, [pole.id]: skonwertujWartoscPolaWlasnego(pole, formularz[pole.id] ?? '') }), edytowany.polaWlasne ?? {})
    await repozytorium.zapisz({ ...edytowany, ...systemowe, tresc: String(systemowe.tresc).trim(), polaWlasne, updatedAt: new Date().toISOString() } as ElementSkrzynki)
    ustawEdytowany(undefined)
    ustawKomunikat({ typ: 'sukces', tresc: 'Zapisano element Poczekalni.' })
  }
  const przeksztalc = async (element: ElementSkrzynki, typ: TypKonwersjiInbox) => {
    try {
      await przeksztalcPoczekalniePrzezRejestr(element, typ)
      ustawKomunikat({ typ: 'sukces', tresc: 'Przekształcono element. Oryginał pozostał w historii Poczekalni.' })
    } catch { ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się przekształcić elementu. Pozostał w Poczekalni.' }) }
  }
  const akcjePrzeksztalcenia = (element: ElementSkrzynki) => czyElementInboxDoKlasyfikacji(element) && <><button type="button" className="przycisk przycisk--maly" onClick={() => void przeksztalc(element, 'zadanie')}>Zadanie</button><button type="button" className="przycisk przycisk--maly" onClick={() => void przeksztalc(element, 'projekt')}>Projekt</button><select aria-label={`Inny typ dla ${element.tresc}`} value="" onChange={(zdarzenie) => { if (zdarzenie.target.value) void przeksztalc(element, zdarzenie.target.value as TypKonwersjiInbox) }}><option value="">Inny typ…</option><option value="notatka">Notatka</option><option value="przypomnienie">Przypomnienie</option><option value="zakup">Zakup</option><option value="pomysl">Pomysł</option><option value="wizyta">Do umówienia</option><option value="na_pozniej">Na później</option></select></>
  const utworzPole = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (!nazwaPola.trim()) return
    await utworzWlasnePoleRejestru({ rejestrId: ID_REJESTRU, etykieta: nazwaPola.trim(), typ: typPola, opcje: ['select', 'multiselect'].includes(typPola) ? opcje.split('\n').map((wartosc) => wartosc.trim()).filter(Boolean).map((wartosc) => ({ wartosc, etykieta: wartosc })) : undefined } as never, repoDefinicji)
    ustawNowePole(false); ustawNazwePola(''); ustawOpcje('')
  }
  const zapiszWidok = async (ids: DefinicjaWidokuRejestru['widocznePolaIds']) => { await zapiszWidokRejestru({ ...(widok ?? domyslnyWidok(wszystkiePola)), widocznePolaIds: ids }, repoWidokow) }
  const polaEdycji = wszystkiePola.filter((pole) => !czyAkcja(pole)).map((definicja) => ({ definicja })) satisfies PoleDoEdycjiRejestru[]

  return <div className="rejestr-poczekalni"><Karta><div className="rejestr-poczekalni__naglowek"><div><h2>Poczekalnia</h2><p>{oczekujace.length} {oczekujace.length === 1 ? 'sprawa czeka' : 'spraw czeka'} na uporządkowanie.</p></div><div className="akcje-karty"><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawKonfiguracja(true)}><Settings2 aria-hidden="true" />Kolumny</button><button type="button" className="przycisk przycisk--glowny" onClick={() => ustawNowePole(true)}><Plus aria-hidden="true" />Dodaj właściwość</button></div></div><form className="szybki-wpis" onSubmit={async (zdarzenie) => { zdarzenie.preventDefault(); const tresc = new FormData(zdarzenie.currentTarget).get('tresc'); if (typeof tresc !== 'string' || !tresc.trim()) return; await zapiszDoInbox(tresc); zdarzenie.currentTarget.reset(); ustawKomunikat({ typ: 'sukces', tresc: 'Dodano do Poczekalni.' }) }}><input name="tresc" aria-label="Treść do Poczekalni" placeholder="Co chcesz zapamiętać?" /><button className="przycisk przycisk--glowny">Dodaj</button></form></Karta>{komunikat && <Komunikat typ={komunikat.typ}>{komunikat.tresc}</Komunikat>}<Karta klasa="rejestr-poczekalni"><div className="rejestr-poczekalni__tabela"><table><thead><tr>{kolumny.map((pole) => <th key={pole.id}>{pole.etykieta}</th>)}<th aria-label="Akcje" /></tr></thead><tbody>{elementy.map((element) => <tr key={element.id}>{kolumny.map((pole) => <td key={pole.id}>{wartoscPola(element, pole)}</td>)}<td><div className="akcje-karty">{akcjePrzeksztalcenia(element)}<button type="button" className="przycisk-ikona" title="Edytuj element Poczekalni" onClick={() => otworz(element)}><Pencil aria-hidden="true" /></button></div></td></tr>)}</tbody></table></div><div className="rejestr-poczekalni__karty">{elementy.map((element) => <article key={element.id}><strong>{element.tresc}</strong>{kolumny.filter((pole) => pole.id !== 'system:tresc').slice(0, 3).map((pole) => <span key={pole.id}>{pole.etykieta}: {wartoscPola(element, pole)}</span>)}<div className="akcje-karty">{akcjePrzeksztalcenia(element)}<button type="button" className="przycisk przycisk--drugorzedny" onClick={() => otworz(element)}>Edytuj</button></div></article>)}</div></Karta>{edytowany && <Modal tytul="Edytuj element Poczekalni" zamknij={() => ustawEdytowany(undefined)}><form className="formularz" onSubmit={zapisz}>{polaEdycji.map((pole) => <EdytorPolaRejestru key={pole.definicja.id} pole={pole} wartosc={formularz[pole.definicja.id] ?? ''} zmien={(wartosc) => ustawFormularz({ ...formularz, [pole.definicja.id]: wartosc })} />)}<div className="akcje-formularza"><button type="button" className="przycisk" onClick={() => ustawEdytowany(undefined)}>Anuluj</button><button className="przycisk przycisk--glowny">Zapisz</button></div></form></Modal>}{konfiguracja && <Modal tytul="Kolumny Poczekalni" zamknij={() => ustawKonfiguracja(false)}><div className="lista-kompaktowa">{wszystkiePola.filter((pole) => !czyAkcja(pole)).map((pole) => <div key={pole.id}><label><input type="checkbox" checked={widoczneIds.includes(pole.id)} onChange={() => void zapiszWidok(widoczneIds.includes(pole.id) ? widoczneIds.filter((id) => id !== pole.id) : [...widoczneIds, pole.id])} />{pole.etykieta}</label>{pole.zrodlo === 'wlasne' && <div><button type="button" title="Zmień nazwę pola" className="przycisk-ikona" onClick={() => { const etykieta = window.prompt('Nowa nazwa pola', pole.etykieta); if (etykieta) void zmienDefinicjeWlasnegoPolaRejestru(pole.id, { etykieta, opcje: pole.opcje, rolaSemantyczna: pole.rolaSemantyczna } as never, repoDefinicji) }}><Pencil /></button><button type="button" title="Archiwizuj pole" className="przycisk-ikona" onClick={() => void archiwizujWlasnePoleRejestru(pole.id, repoDefinicji)}><Trash2 /></button></div>}</div>)}</div></Modal>}{nowePole && <Modal tytul="Dodaj właściwość" zamknij={() => ustawNowePole(false)}><form className="formularz" onSubmit={utworzPole}><label className="pole"><span>Nazwa</span><input required value={nazwaPola} onChange={(e) => ustawNazwePola(e.target.value)} /></label><label className="pole"><span>Typ</span><select value={typPola} onChange={(e) => ustawTypPola(e.target.value as TypPolaRejestru)}>{typyPol.map((typ) => <option key={typ.wartosc} value={typ.wartosc}>{typ.etykieta}</option>)}</select></label>{['select', 'multiselect'].includes(typPola) && <label className="pole pole--pelne"><span>Opcje, po jednej w wierszu</span><textarea value={opcje} onChange={(e) => ustawOpcje(e.target.value)} /></label>}<div className="akcje-formularza"><button type="submit" className="przycisk przycisk--glowny">Utwórz</button></div></form></Modal>}</div>
}
