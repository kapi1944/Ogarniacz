import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { SzybkieDodawanie } from '../../app/SzybkieDodawanie'
import { Komunikat } from '../../components/Interfejs'
import type { ElementOgarniacza } from '../../domain/elementyOgarniacza'
import { adresReferencjiZrodla } from './logikaKafelkow'
import { usePlanDniaPulpitu } from './usePlanDniaPulpitu'
import { OsCzasu } from './OsCzasu'
import { FormularzHarmonogramuDnia } from './FormularzHarmonogramuDnia'

export function PlanWybranegoDnia({ data, zamknij }: { data: string; zamknij: (poZamknieciu?: () => void) => void }) {
  const { ustawienia, moze } = useAplikacja()
  const nawiguj = useNavigate()
  const [dodawanie, ustawDodawanie] = useState(false)
  const plan = usePlanDniaPulpitu(data)
  const otworzElement = (element: ElementOgarniacza) => {
    if (element.referencjaZrodla) {
      const adres = adresReferencjiZrodla(element.referencjaZrodla)
      zamknij(() => nawiguj(adres))
    }
  }
  return <>
    {plan.komunikat && <Komunikat typ="sukces">{plan.komunikat}</Komunikat>}
    {plan.daneDnia?.blad && <Komunikat typ="blad">Nie udało się pobrać części danych dnia.</Komunikat>}
    {!plan.daneDnia && <p role="status">Ładowanie planu dnia…</p>}
    <OsCzasu data={data} harmonogram={plan.harmonogram}
      zakresSnu={{ od: ustawienia.harmonogram.poczatekSnu, do: ustawienia.harmonogram.koniecSnu, skala: ustawienia.harmonogram.skalaSnuNaOsi }}
      elementy={plan.elementyOsi} zezwalajNaPelnaDostepnosc={ustawienia.harmonogram.zezwalajNaPelnaDostepnoscDojazdu}
      edytujHarmonogram={() => plan.ustawEdycjeHarmonogramu(true)} przelaczDostepnosc={plan.przelaczDostepnosc} usunWyjatek={plan.usunWyjatek} otworzElement={otworzElement} />
    <div className="naglowek-karty"><h3>Elementy dnia</h3><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawDodawanie(true)}><Plus aria-hidden="true" />Dodaj</button></div>
    {plan.daneDnia && plan.elementyDnia.length === 0 && <p className="tekst-pomocniczy">Brak elementów zaplanowanych na ten dzień.</p>}
    <div className="lista-kompaktowa">{plan.elementyDnia.map((element) => <div key={element.id}>
      <div>{element.referencjaZrodla ? <button type="button" className="przycisk przycisk--tekstowy" onClick={() => otworzElement(element)}>{element.tytul}</button> : <strong>{element.tytul}</strong>}
        <small>{element.godzina ?? (element.trybTerminu === 'koniec_dnia' ? 'Do końca dnia' : 'Bez godziny')} · {element.status ?? 'zaplanowany'}</small>
        {element.opis && <small>{element.opis}</small>}
      </div>
    </div>)}</div>
    {plan.edycjaHarmonogramu && <FormularzHarmonogramuDnia harmonogram={plan.harmonogram} opis={plan.wyjatekDnia?.opis} domyslnyZakres={ustawienia.harmonogram.domyslnyZakresZmiany} zezwalajNaPelnaDostepnosc={ustawienia.harmonogram.zezwalajNaPelnaDostepnoscDojazdu} zamknij={() => plan.ustawEdycjeHarmonogramu(false)} zapisz={plan.zapiszZmianeHarmonogramu} />}
    {dodawanie && <SzybkieDodawanie moze={moze} danePoczatkowe={{ typ: 'zadanie', data }} zamknij={() => ustawDodawanie(false)} />}
  </>
}
