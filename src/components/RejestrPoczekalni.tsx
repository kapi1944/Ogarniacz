import { useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DefinicjaPolaRejestru } from '../domain/rejestr'
import type { ElementPoczekalni, NazwaModulu } from '../domain/typy'
import { useRepozytorium } from '../hooks/useRepozytorium'
import { sciezkaDlaCeluNawigacji } from '../platform/trasy'
import { rejestrResolverowPolSystemowych } from '../services/KontraktPolSystemowychRejestru'
import { POLE_AKCJI_PRZEKSZTALCENIA_POCZEKALNI, przeksztalcPoczekalniePrzezRejestr } from '../services/RejestrPolSystemowychPoczekalni'
import { czyElementPoczekalniDoKlasyfikacji, cofnijPrzeksztalceniePoczekalni, zapiszDoPoczekalni, type TypKonwersjiPoczekalni } from '../services/PoczekalniaService'
import { EdytorPolaRejestru, skonwertujWartoscPolaWlasnego, wartoscFormularzaPola, type PoleDoEdycjiRejestru } from './EdytorPolaRejestru'
import { Karta, Komunikat, Modal } from './Interfejs'
import { useWlasciwosciRejestru } from './useWlasciwosciRejestru'

const ID_REJESTRU = 'poczekalnia'
const etykietyWynikow: Record<NazwaModulu, string> = {
  zadania: 'zadanie', projekty: 'projekt', skrzynka: 'wpis Poczekalni', planer: 'element planera', grafik: 'wpis grafiku', nawyki: 'nawyk', leki: 'lek', wizyty: 'wizytę', zdrowie: 'element zdrowia', skierowania: 'skierowanie', przypomnienia: 'przypomnienie', zakupy: 'pozycję zakupów', rachunki: 'rachunek', miasto: 'sprawę na mieście', miejsca: 'miejsce', cele: 'cel', notatki: 'notatkę', pomysly: 'pomysł', na_pozniej: 'element „Na później”', kontakty: 'kontakt', dokumenty: 'dokument', finanse: 'element finansów', samochod: 'element samochodu', terminy: 'termin', echo: 'element Echo', ustawienia: 'ustawienie',
}
export const POLA_SYSTEMOWE_POCZEKALNI: DefinicjaPolaRejestru[] = [
  { id: 'system:tresc', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'tresc', etykieta: 'Treść', typ: 'textarea' },
  { id: 'system:zrodlo', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'zrodlo', etykieta: 'Źródło', typ: 'select', opcje: [{ wartosc: 'tekst', etykieta: 'Tekst' }, { wartosc: 'glos', etykieta: 'Głos' }] },
  { id: 'system:status', zrodlo: 'systemowe', trybObslugi: 'tylko_odczyt', resolverId: 'resolver:poczekalnia-status', etykieta: 'Status', typ: 'tekst' },
  { id: 'system:przeksztalconoNa', zrodlo: 'systemowe', trybObslugi: 'tylko_odczyt', resolverId: 'resolver:poczekalnia-wynik-przeksztalcenia', etykieta: 'Wynik', typ: 'tekst' },
  POLE_AKCJI_PRZEKSZTALCENIA_POCZEKALNI,
]

function wartoscPola(element: ElementPoczekalni, pole: DefinicjaPolaRejestru): string {
  if (pole.zrodlo === 'systemowe' && pole.trybObslugi === 'tylko_odczyt') {
    const wynik = rejestrResolverowPolSystemowych.odczytaj(pole, { encja: element, daneZrodlowe: {} })
    return wynik.stan === 'gotowe' ? String(wynik.wartosc ?? '—') : wynik.komunikat
  }
  return wartoscFormularzaPola(element, { definicja: pole }) || '—'
}

export function RejestrPoczekalni() {
  const { dane, repozytorium } = useRepozytorium('skrzynka')
  const [edytowany, ustawEdytowany] = useState<ElementPoczekalni>()
  const [formularz, ustawFormularz] = useState<Record<string, string>>({})
  const [komunikat, ustawKomunikat] = useState<{ typ: 'sukces' | 'blad'; tresc: string }>()
  const [ostatniePrzeksztalcenie, ustawOstatniePrzeksztalcenie] = useState<{ element: ElementPoczekalni; wynik: { typ: NazwaModulu; id: string } }>()
  const { pola: wszystkiePola, widocznePola: kolumny, sterowanie } = useWlasciwosciRejestru({ rejestrId: ID_REJESTRU, polaSystemowe: POLA_SYSTEMOWE_POCZEKALNI, tytulKonfiguracji: 'Kolumny Poczekalni' })
  const oczekujace = dane.filter(czyElementPoczekalniDoKlasyfikacji).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const historia = dane.filter((element) => !czyElementPoczekalniDoKlasyfikacji(element)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const elementy = [...oczekujace, ...historia]

  const czyAkcja = (pole: DefinicjaPolaRejestru) => pole.zrodlo === 'systemowe' && pole.trybObslugi === 'akcja_domenowa'
  const otworz = (element: ElementPoczekalni) => {
    ustawEdytowany(element)
    ustawFormularz(Object.fromEntries(wszystkiePola.filter((pole) => !czyAkcja(pole)).map((pole) => [pole.id, wartoscPola(element, pole)])))
  }
  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (!edytowany) return
    try {
      const systemowe = Object.fromEntries(wszystkiePola.filter((pole) => pole.zrodlo === 'systemowe' && pole.trybObslugi === 'bezposrednie').map((pole) => [pole.kluczWlasciwosci, formularz[pole.id] ?? '']))
      const polaWlasne = wszystkiePola.filter((pole) => pole.zrodlo === 'wlasne').reduce((wynik, pole) => ({ ...wynik, [pole.id]: skonwertujWartoscPolaWlasnego(pole, formularz[pole.id] ?? '') }), edytowany.polaWlasne ?? {})
      await repozytorium.zapisz({ ...edytowany, ...systemowe, tresc: String(systemowe.tresc).trim(), polaWlasne, updatedAt: new Date().toISOString() } as ElementPoczekalni)
      ustawEdytowany(undefined)
      ustawKomunikat({ typ: 'sukces', tresc: 'Zapisano element Poczekalni.' })
    } catch (blad) { ustawKomunikat({ typ: 'blad', tresc: blad instanceof Error ? blad.message : 'Nie udało się zapisać elementu.' }) }
  }
  const przeksztalc = async (element: ElementPoczekalni, typ: TypKonwersjiPoczekalni) => {
    try {
      const wynik = await przeksztalcPoczekalniePrzezRejestr(element, typ)
      ustawOstatniePrzeksztalcenie({ element, wynik })
      ustawKomunikat(undefined)
    } catch { ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się przekształcić elementu. Pozostał w Poczekalni.' }) }
  }
  const cofnijPrzeksztalcenie = async () => {
    if (!ostatniePrzeksztalcenie) return
    try {
      await cofnijPrzeksztalceniePoczekalni(ostatniePrzeksztalcenie.element, ostatniePrzeksztalcenie.wynik)
      ustawOstatniePrzeksztalcenie(undefined)
      ustawKomunikat({ typ: 'sukces', tresc: 'Wpis znowu czeka w Poczekalni.' })
    } catch { ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się cofnąć przekształcenia.' }) }
  }
  const akcjePrzeksztalcenia = (element: ElementPoczekalni) => czyElementPoczekalniDoKlasyfikacji(element) && <><button type="button" className="przycisk przycisk--maly" onClick={() => void przeksztalc(element, 'zadanie')}>Zadanie</button><button type="button" className="przycisk przycisk--maly" onClick={() => void przeksztalc(element, 'projekt')}>Projekt</button><select aria-label={`Inny typ dla ${element.tresc}`} value="" onChange={(zdarzenie) => { if (zdarzenie.target.value) void przeksztalc(element, zdarzenie.target.value as TypKonwersjiPoczekalni) }}><option value="">Inny typ…</option><option value="notatka">Notatka</option><option value="przypomnienie">Przypomnienie</option><option value="zakup">Zakup</option><option value="pomysl">Pomysł</option><option value="wizyta">Do umówienia</option><option value="na_pozniej">Na później</option></select></>
  const polaEdycji = wszystkiePola.filter((pole) => !czyAkcja(pole)).map((definicja) => ({ definicja })) satisfies PoleDoEdycjiRejestru[]

  const adresWyniku = ostatniePrzeksztalcenie && sciezkaDlaCeluNawigacji({ sourceRef: ostatniePrzeksztalcenie.wynik, route: '/poczekalnia' })

  return <div className="rejestr-poczekalni"><Karta><div className="rejestr-poczekalni__naglowek"><div><h2>Poczekalnia</h2><p>{oczekujace.length} {oczekujace.length === 1 ? 'sprawa czeka' : 'spraw czeka'} na uporządkowanie.</p></div>{sterowanie}</div><form className="szybki-wpis" onSubmit={async (zdarzenie) => {
      zdarzenie.preventDefault()
      const formularz = zdarzenie.currentTarget
      const tresc = new FormData(formularz).get('tresc')
      if (typeof tresc !== 'string' || !tresc.trim()) return
      try {
        await zapiszDoPoczekalni(tresc)
        formularz.reset()
        ustawKomunikat({ typ: 'sukces', tresc: 'Dodano do Poczekalni.' })
      } catch { ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się dodać do Poczekalni. Treść pozostała w formularzu.' }) }
    }}><input name="tresc" aria-label="Treść do Poczekalni" placeholder="Co chcesz zapamiętać?" /><button className="przycisk przycisk--glowny">Dodaj</button></form></Karta>{ostatniePrzeksztalcenie && <Komunikat typ="sukces">Utworzono {etykietyWynikow[ostatniePrzeksztalcenie.wynik.typ]}: {ostatniePrzeksztalcenie.element.tresc}. {adresWyniku && <Link to={adresWyniku}>Otwórz utworzony element</Link>}<button type="button" className="przycisk przycisk--tekstowy" onClick={() => void cofnijPrzeksztalcenie()}>Cofnij</button></Komunikat>}{komunikat && <Komunikat typ={komunikat.typ}>{komunikat.tresc}</Komunikat>}<Karta klasa="rejestr-poczekalni"><div className="rejestr-poczekalni__tabela"><table><thead><tr>{kolumny.map((pole) => <th key={pole.id}>{pole.etykieta}</th>)}<th aria-label="Akcje" /></tr></thead><tbody>{elementy.map((element) => <tr key={element.id}>{kolumny.map((pole) => <td key={pole.id}>{wartoscPola(element, pole)}</td>)}<td><div className="akcje-karty">{akcjePrzeksztalcenia(element)}<button type="button" className="przycisk-ikona" title="Edytuj element Poczekalni" onClick={() => otworz(element)}><Pencil aria-hidden="true" /></button></div></td></tr>)}</tbody></table></div><div className="rejestr-poczekalni__karty">{elementy.map((element) => <article key={element.id}><strong>{element.tresc}</strong>{kolumny.filter((pole) => pole.id !== 'system:tresc').slice(0, 3).map((pole) => <span key={pole.id}>{pole.etykieta}: {wartoscPola(element, pole)}</span>)}<div className="akcje-karty">{akcjePrzeksztalcenia(element)}<button type="button" className="przycisk przycisk--drugorzedny" onClick={() => otworz(element)}>Edytuj</button></div></article>)}</div></Karta>{edytowany && <Modal tytul="Edytuj element Poczekalni" zamknij={() => ustawEdytowany(undefined)}><form className="formularz" onSubmit={zapisz}>{komunikat?.typ === 'blad' && <Komunikat typ="blad">{komunikat.tresc}</Komunikat>}{polaEdycji.map((pole) => <EdytorPolaRejestru key={pole.definicja.id} pole={pole} wartosc={formularz[pole.definicja.id] ?? ''} zmien={(wartosc) => ustawFormularz({ ...formularz, [pole.definicja.id]: wartosc })} />)}<div className="akcje-formularza"><button type="button" className="przycisk" onClick={() => ustawEdytowany(undefined)}>Anuluj</button><button className="przycisk przycisk--glowny">Zapisz</button></div></form></Modal>}</div>
}
