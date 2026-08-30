import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format } from 'date-fns'
import { AlertCircle, CheckCircle2, LayoutGrid, Plus } from 'lucide-react'
import { Karta, Komunikat, NaglowekWidoku, PustyStan } from '../../components/Interfejs'
import { utworzMetadane, dzisiajIso } from '../../domain/fabryki'
import { poprawnaGodzinaTerminu } from '../../domain/logikaTerminuZadania'
import type { DostawcaElementowPulpitu, ElementOgarniacza, ZakresDat } from '../../domain/elementyOgarniacza'
import type { KonfiguracjaKafelkaPulpitu, ZakresZmianyHarmonogramu } from '../../domain/typy'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { DostawcaLekowPulpitu } from '../../providers/DostawcaLekowPulpitu'
import { DostawcaWizytPulpitu } from '../../providers/DostawcaWizytPulpitu'
import { DostawcaZadanPulpitu } from '../../providers/DostawcaZadanPulpitu'
import { DostawcaFinansowPulpitu } from '../../providers/DostawcaFinansowPulpitu'
import { DostawcaSamochoduPulpitu } from '../../providers/DostawcaSamochoduPulpitu'
import { DostawcaZakupowPulpitu } from '../../providers/DostawcaZakupowPulpitu'
import {
  adresReferencjiZrodla,
  alertyFinansow,
  alertyLekow,
  alertySamochodu,
  alertyWizyt,
  alertyZakupow,
  alertyZadan,
  deduplikujAlerty,
  klasaRozmiaruKafelka,
  ograniczAlerty,
  rangujAlerty,
  rozwiazDaneKafelka,
  rozwiazZakresKafelka,
  sortujKafelki,
} from './logikaKafelkow'
import { FormularzHarmonogramuDnia } from './FormularzHarmonogramuDnia'
import { NawigatorDnia } from './NawigatorDnia'
import { OsCzasu } from './OsCzasu'
import {
  utworzHarmonogramDnia,
  utworzNowaReguleHarmonogramu,
  type EdycjaHarmonogramuDnia,
} from './logikaOsiCzasu'

const dostawcaZadan = new DostawcaZadanPulpitu()
const dostawcaLekow = new DostawcaLekowPulpitu()
const dostawcaWizyt = new DostawcaWizytPulpitu()
const dostawcaFinansow = new DostawcaFinansowPulpitu()
const dostawcaSamochodu = new DostawcaSamochoduPulpitu()
const dostawcaZakupow = new DostawcaZakupowPulpitu()

type StanZrodla = 'gotowy' | 'blad'

interface WynikZrodla {
  stan: StanZrodla
  elementy: ElementOgarniacza[]
}

interface WynikiModulow {
  leki: WynikZrodla
  wizyty: WynikZrodla
  finanse: WynikZrodla
  samochod: WynikZrodla
  zakupy: WynikZrodla
}

async function pobierzBezpiecznie(dostawca: DostawcaElementowPulpitu, zakres: ZakresDat): Promise<WynikZrodla> {
  try {
    return { stan: 'gotowy', elementy: await dostawca.pobierzElementy(zakres) }
  } catch {
    return { stan: 'blad', elementy: [] }
  }
}

function etykietaTerminuBezGodziny(tryb: string | undefined): string {
  if (tryb === 'koniec_dnia') return 'Do końca dnia'
  if (tryb === 'bez_godziny') return 'Bez godziny'
  return 'Wymaga poprawy godziny'
}

function wagaElementuBezGodziny(tryb: string | undefined): number {
  return tryb === 'koniec_dnia' ? 2 : tryb === 'bez_godziny' ? 0 : 1
}

function wagaPriorytetuElementu(priorytet: string | undefined): number {
  return priorytet === 'asap' ? 2 : priorytet === 'pilny' ? 1 : 0
}

function ograniczMinuty(wartosc: number): number {
  return Number.isFinite(wartosc) ? Math.min(180, Math.max(0, Math.round(wartosc))) : 0
}

function etykietaKafelka(kafelek: KonfiguracjaKafelkaPulpitu): string {
  if (kafelek.typ === 'pilne') return 'Pilne / zaległe'
  if (kafelek.typ === 'leki') return 'Leki'
  if (kafelek.typ === 'wizyty') return 'Wizyty'
  if (kafelek.typ === 'finanse') return 'Finanse'
  if (kafelek.typ === 'samochod') return 'Samochód'
  if (kafelek.typ === 'zakupy') return 'Zakupy'
  return kafelek.typ
}

function opisElementuKafelka(element: ElementOgarniacza): string {
  const termin = [element.data, element.godzina].filter(Boolean).join(' ')
  if (element.typ === 'lek') {
    const status = element.dane?.statusDawki === 'zazyte' ? 'zażyta' : element.dane?.statusDawki ?? 'oczekuje'
    return `${termin} · ${status}`
  }
  if (element.typ === 'platnosc') return `${termin} · ${element.dane?.kwota?.toFixed(2) ?? '—'} ${element.dane?.waluta ?? 'PLN'}`
  if (element.typ === 'wydatek' && element.dane?.rodzaj === 'budzet') return element.opis ?? 'Przekroczony budżet'
  if (element.typ === 'samochod') return [termin, element.dane?.pozostaloKm === undefined ? '' : `${element.dane.pozostaloKm} km do wymiany`].filter(Boolean).join(' · ')
  if (element.typ === 'zakupy') return `${element.dane?.kupione ?? 0}/${element.dane?.liczbaPozycji ?? 0} kupionych${termin ? ` · ${termin}` : ''}`
  return termin || 'Bez terminu'
}

function stanKafelka(kafelek: KonfiguracjaKafelkaPulpitu, wyniki: WynikiModulow | undefined) {
  if (!['leki', 'wizyty', 'finanse', 'samochod', 'zakupy'].includes(kafelek.typ)) return 'gotowy' as const
  if (!wyniki) return 'ladowanie' as const
  return wyniki[kafelek.typ as keyof WynikiModulow].stan
}

function ZawartoscKafelka({
  kafelek,
  elementy,
  wynikiModulow,
  dataReferencyjna,
}: {
  kafelek: KonfiguracjaKafelkaPulpitu
  elementy: ElementOgarniacza[]
  wynikiModulow: WynikiModulow | undefined
  dataReferencyjna: Date
}) {
  const stanZrodla = stanKafelka(kafelek, wynikiModulow)
  if (stanZrodla === 'ladowanie') return <p className="tekst-pomocniczy">Ładowanie danych…</p>
  if (stanZrodla === 'blad') return <PustyStan tytul="Nie udało się pobrać danych" opis="Pozostałe moduły Pulpitu działają niezależnie." />
  const dane = rozwiazDaneKafelka(kafelek, elementy, dataReferencyjna)
  if (dane.stan === 'niedostepny') return <PustyStan tytul="Brak danych" opis="Integracja modułu nie jest jeszcze dostępna." />
  if (dane.elementy.length === 0) return <PustyStan tytul="Brak danych" opis="Brak elementów w wybranym zakresie." />
  return <div className="lista-kompaktowa">{dane.elementy.map((element) => <div key={element.id}><div>{element.referencjaZrodla ? <Link to={adresReferencjiZrodla(element.referencjaZrodla)}><strong>{element.tytul}</strong></Link> : <strong>{element.tytul}</strong>}<small>{opisElementuKafelka(element)}</small></div></div>)}</div>
}

export function WidokPulpitu() {
  const [data, ustawDate] = useState(dzisiajIso())
  const [edycjaHarmonogramu, ustawEdycjeHarmonogramu] = useState(false)
  const [komunikat, ustawKomunikat] = useState('')
  const [pokazWiecejAlertow, ustawPokazWiecejAlertow] = useState(false)
  const [filtrKafelkow, ustawFiltrKafelkow] = useState<'wszystkie' | 'zadania' | 'pilne'>('wszystkie')
  const nawiguj = useNavigate()
  const { ustawienia, zapiszUstawienia, otworzSzybkieDodawanie } = useAplikacja()
  const { dane: wyjatki, repozytorium: repozytoriumWyjatkow } = useRepozytorium('wyjatkiGrafiku')
  const dzisiaj = dzisiajIso()
  const zakresModulow = useMemo(() => {
    const dataReferencyjna = new Date(`${dzisiaj}T12:00:00`)
    const konceZakresow = ustawienia.pulpit.kafelki
      .filter((kafelek) => kafelek.widoczny && ['leki', 'wizyty', 'finanse', 'samochod', 'zakupy'].includes(kafelek.typ))
      .map((kafelek) => rozwiazZakresKafelka(kafelek, dataReferencyjna).do)
    if (ustawienia.pulpit.pokazAlerty) konceZakresow.push(format(addDays(dataReferencyjna, 1), 'yyyy-MM-dd'))
    return { od: dzisiaj, do: konceZakresow.sort().at(-1) ?? dzisiaj }
  }, [dzisiaj, ustawienia.pulpit.kafelki, ustawienia.pulpit.pokazAlerty])
  const zadaniaDnia = useLiveQuery(() => dostawcaZadan.pobierzElementy({ od: data, do: data }), [data], [])
  const modulyDnia = useLiveQuery(async () => {
    const [leki, wizyty, finanse, samochod, zakupy] = await Promise.all([
      pobierzBezpiecznie(dostawcaLekow, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaWizyt, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaFinansow, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaSamochodu, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaZakupow, { od: data, do: data }),
    ])
    return { leki, wizyty, finanse, samochod, zakupy }
  }, [data])
  const zadaniaKafelkow = useLiveQuery(() => dostawcaZadan.pobierzElementy({ od: '1900-01-01', do: '9999-12-31' }), [], [])
  const modulyKafelkow = useLiveQuery(async () => {
    const [leki, wizyty, finanse, samochod, zakupy] = await Promise.all([
      pobierzBezpiecznie(dostawcaLekow, zakresModulow),
      pobierzBezpiecznie(dostawcaWizyt, zakresModulow),
      pobierzBezpiecznie(dostawcaFinansow, zakresModulow),
      pobierzBezpiecznie(dostawcaSamochodu, { od: zakresModulow.od, do: format(addDays(new Date(`${zakresModulow.od}T12:00:00`), 3650), 'yyyy-MM-dd') }),
      pobierzBezpiecznie(dostawcaZakupow, zakresModulow),
    ])
    return { leki, wizyty, finanse, samochod, zakupy }
  }, [zakresModulow.od, zakresModulow.do])
  const modulyAlertow = useLiveQuery(async () => {
    const dataReferencyjna = new Date()
    const dzisiajAlertow = format(dataReferencyjna, 'yyyy-MM-dd')
    const jutroAlertow = format(addDays(dataReferencyjna, 1), 'yyyy-MM-dd')
    const zaMiesiac = format(addDays(dataReferencyjna, 30), 'yyyy-MM-dd')
    const [leki, wizyty, finanse, samochod, zakupy] = await Promise.all([
      pobierzBezpiecznie(dostawcaLekow, { od: dzisiajAlertow, do: jutroAlertow }),
      pobierzBezpiecznie(dostawcaWizyt, { od: dzisiajAlertow, do: jutroAlertow }),
      pobierzBezpiecznie(dostawcaFinansow, { od: '1900-01-01', do: zaMiesiac }),
      pobierzBezpiecznie(dostawcaSamochodu, { od: '1900-01-01', do: zaMiesiac }),
      pobierzBezpiecznie(dostawcaZakupow, { od: '1900-01-01', do: jutroAlertow }),
    ])
    return { leki, wizyty, finanse, samochod, zakupy }
  }, [dzisiaj])
  const elementyDnia = [
    ...zadaniaDnia,
    ...(modulyDnia?.leki.elementy ?? []),
    ...(modulyDnia?.wizyty.elementy ?? []),
    ...(modulyDnia?.finanse.elementy.filter((element) => element.typ === 'platnosc') ?? []),
    ...(modulyDnia?.samochod.elementy ?? []),
    ...(modulyDnia?.zakupy.elementy.filter((element) => element.data === data) ?? []),
  ]
  const elementyModulowKafelkow = useMemo(() => [
    ...(modulyKafelkow?.leki.elementy ?? []),
    ...(modulyKafelkow?.wizyty.elementy ?? []),
    ...(modulyKafelkow?.finanse.elementy ?? []),
    ...(modulyKafelkow?.samochod.elementy ?? []),
    ...(modulyKafelkow?.zakupy.elementy ?? []),
  ], [modulyKafelkow])
  const elementyKafelkow = useMemo(() => [...zadaniaKafelkow, ...elementyModulowKafelkow], [elementyModulowKafelkow, zadaniaKafelkow])
  const alerty = useMemo(() => {
    const teraz = new Date()
    return rangujAlerty(deduplikujAlerty([
      ...alertyZadan(zadaniaKafelkow, teraz),
      ...alertyLekow(modulyAlertow?.leki.elementy ?? [], teraz),
      ...alertyWizyt(modulyAlertow?.wizyty.elementy ?? [], teraz),
      ...alertyFinansow(modulyAlertow?.finanse.elementy ?? [], teraz),
      ...alertySamochodu(modulyAlertow?.samochod.elementy ?? [], teraz),
      ...alertyZakupow(modulyAlertow?.zakupy.elementy ?? [], teraz),
    ]))
  }, [modulyAlertow, zadaniaKafelkow])
  const widoczneAlerty = ograniczAlerty(alerty, ustawienia.pulpit.limitAlertow, pokazWiecejAlertow).widoczne
  const kafelki = useMemo(() => sortujKafelki(ustawienia.pulpit.kafelki).filter((kafelek) => filtrKafelkow === 'wszystkie' || kafelek.typ === filtrKafelkow), [ustawienia.pulpit.kafelki, filtrKafelkow])
  const wyjatekDnia = useMemo(() => [...wyjatki].filter((wyjatek) => wyjatek.data === data).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0], [data, wyjatki])
  const harmonogram = useMemo(() => utworzHarmonogramDnia(data, ustawienia.harmonogram, wyjatekDnia), [data, ustawienia.harmonogram, wyjatekDnia])
  const elementyOsi = elementyDnia
    .filter((element) => element.trybTerminu === 'o_godzinie' && poprawnaGodzinaTerminu(element.godzina))
    .filter((element) => element.typ === 'lek' || element.status !== 'wykonany')
    .filter((element) => element.status !== 'anulowany')
    .sort((a, b) => (a.godzina ?? '').localeCompare(b.godzina ?? '') || a.typ.localeCompare(b.typ, 'pl') || a.tytul.localeCompare(b.tytul, 'pl') || a.id.localeCompare(b.id))
  const elementyBezGodziny = elementyDnia
    .filter((element) => element.status !== 'wykonany' && element.status !== 'anulowany' && !elementyOsi.some((elementOsi) => elementOsi.id === element.id))
    .sort((a, b) => wagaElementuBezGodziny(b.trybTerminu) - wagaElementuBezGodziny(a.trybTerminu) || wagaPriorytetuElementu(b.priorytet) - wagaPriorytetuElementu(a.priorytet) || a.tytul.localeCompare(b.tytul, 'pl'))
  const elementyWykonane = elementyDnia.filter((element) => element.status === 'wykonany')

  const zapiszWyjatekDnia = async (edycja: EdycjaHarmonogramuDnia) => {
    await repozytoriumWyjatkow.zapisz({
      ...(wyjatekDnia ?? utworzMetadane()), data, pracuje: edycja.pracuje,
      od: edycja.pracuje ? edycja.odPracy : undefined, do: edycja.pracuje ? edycja.doPracy : undefined,
      dojazdDoPracyMinuty: edycja.pracuje ? ograniczMinuty(edycja.dojazdDoPracyMinuty) : 0,
      powrotZPracyMinuty: edycja.pracuje ? ograniczMinuty(edycja.powrotZPracyMinuty) : 0,
      dostepnoscDojazdu: edycja.dostepnoscDojazdu, opis: edycja.opis?.trim() || undefined,
    })
  }

  const zapiszZmianeHarmonogramu = async (edycja: EdycjaHarmonogramuDnia, zakres: ZakresZmianyHarmonogramu) => {
    if (zakres === 'tylko_ten_dzien') {
      await zapiszWyjatekDnia(edycja)
      ustawKomunikat('Zapisano wyjątek wyłącznie dla wybranego dnia.')
    } else {
      await zapiszUstawienia({ harmonogram: utworzNowaReguleHarmonogramu(ustawienia.harmonogram, data, edycja) })
      if (wyjatekDnia) await repozytoriumWyjatkow.usun(wyjatekDnia.id)
      ustawKomunikat('Zapisano nową domyślną regułę harmonogramu.')
    }
    ustawEdycjeHarmonogramu(false)
  }

  const przelaczDostepnosc = async () => {
    await zapiszWyjatekDnia({
      pracuje: harmonogram.pracuje, odPracy: harmonogram.odPracy, doPracy: harmonogram.doPracy,
      dojazdDoPracyMinuty: harmonogram.dojazdDoPracyMinuty, powrotZPracyMinuty: harmonogram.powrotZPracyMinuty,
      dostepnoscDojazdu: harmonogram.dostepnoscDojazdu === 'pelna' ? 'czesciowa' : 'pelna', opis: wyjatekDnia?.opis,
    })
    ustawKomunikat('Dostępność dojazdów zmieniono tylko dla wybranego dnia.')
  }

  const usunWyjatek = async () => {
    if (!wyjatekDnia) return
    await repozytoriumWyjatkow.usun(wyjatekDnia.id)
    ustawKomunikat('Przywrócono domyślną regułę harmonogramu dla tego dnia.')
  }

  const bladModuluDnia = modulyDnia && Object.values(modulyDnia).some((wynik) => wynik.stan === 'blad')
  const dataReferencyjnaKafelkow = new Date(`${dzisiaj}T12:00:00`)

  return <div className="widok widok-pulpitu">
    <NaglowekWidoku tytul="Pulpit" opis="Najważniejsze informacje teraz i w nadchodzących zakresach. Wybrana data steruje osią czasu, nie całym Pulpitem." akcje={<button type="button" className="przycisk przycisk--glowny" onClick={otworzSzybkieDodawanie}><Plus aria-hidden="true" />Szybko dodaj</button>} />
    <NawigatorDnia data={data} zmienDate={(nowaData) => { ustawDate(nowaData); ustawKomunikat('') }} />
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
    {bladModuluDnia && <Komunikat typ="blad">Nie udało się pobrać części danych modułowych. Pozostałe elementy Pulpitu nadal działają.</Komunikat>}

    {ustawienia.pulpit.pokazAlerty && <Karta klasa="strefa-pulpitu strefa-pulpitu--alerty"><div className="tytul-karty"><AlertCircle aria-hidden="true" /><span>Smart Alerts</span></div><h2>Najważniejsze sygnały</h2>{widoczneAlerty.length === 0 ? <p>Brak alertów wymagających uwagi.</p> : <div className="lista-kompaktowa">{widoczneAlerty.map((alert) => <div key={alert.id}><div><Link to={adresReferencjiZrodla(alert.sourceRef)}><strong>{alert.tytul}</strong></Link><small>{alert.severity === 'critical' ? 'Krytyczne' : alert.severity === 'warning' ? 'Ostrzeżenie' : 'Informacja'} · {alert.opis}</small></div></div>)}</div>}{alerty.length > ustawienia.pulpit.limitAlertow && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawPokazWiecejAlertow((wartosc) => !wartosc)}>{pokazWiecejAlertow ? 'Pokaż mniej' : 'Pokaż więcej'}</button>}</Karta>}
    {ustawienia.pulpit.pokazKafelki && <section><div className="akcje-formularza"><button type="button" className="przycisk przycisk--maly" onClick={() => ustawFiltrKafelkow('wszystkie')}>Wszystkie</button><button type="button" className="przycisk przycisk--maly" onClick={() => ustawFiltrKafelkow('zadania')}>Zadania</button><button type="button" className="przycisk przycisk--maly" onClick={() => ustawFiltrKafelkow('pilne')}>Pilne</button></div><div className="strefy-pulpitu">{kafelki.map((kafelek) => <Karta key={kafelek.id} klasa={`strefa-pulpitu ${klasaRozmiaruKafelka(kafelek.rozmiar)}`}><div className="tytul-karty"><LayoutGrid aria-hidden="true" /><span>{etykietaKafelka(kafelek)}</span></div><ZawartoscKafelka kafelek={kafelek} elementy={elementyKafelkow} wynikiModulow={modulyKafelkow} dataReferencyjna={dataReferencyjnaKafelkow} /></Karta>)}</div></section>}
    {ustawienia.pulpit.pokazOsCzasu && <OsCzasu data={data} harmonogram={harmonogram} zakresSnu={{ od: ustawienia.harmonogram.poczatekSnu, do: ustawienia.harmonogram.koniecSnu, skala: ustawienia.harmonogram.skalaSnuNaOsi }} elementy={elementyOsi} zezwalajNaPelnaDostepnosc={ustawienia.harmonogram.zezwalajNaPelnaDostepnoscDojazdu} edytujHarmonogram={() => ustawEdycjeHarmonogramu(true)} przelaczDostepnosc={przelaczDostepnosc} usunWyjatek={usunWyjatek} otworzElement={(element) => { if (element.referencjaZrodla) nawiguj(adresReferencjiZrodla(element.referencjaZrodla)) }} />}

    <section className="sekcje-elementow-pulpitu">
      <Karta><div className="naglowek-karty"><div><h2>Bez godziny</h2><p>Elementy przypisane do wybranego dnia bez konkretnej godziny.</p></div></div>{elementyBezGodziny.length === 0 ? <PustyStan tytul="Brak elementów bez godziny" opis="Zadania i wizyty bez konkretnej godziny pojawią się tutaj." /> : <div className="lista-kompaktowa">{elementyBezGodziny.map((element) => <div key={element.id}><div><strong>{element.tytul}</strong><small>{etykietaTerminuBezGodziny(element.trybTerminu)}</small></div></div>)}</div>}</Karta>
      {ustawienia.pulpit.pokazWykonane && <Karta><div className="naglowek-karty"><div><h2><CheckCircle2 aria-hidden="true" /> Wykonane</h2><p>Elementy zakończone dla wybranej daty.</p></div></div>{elementyWykonane.length === 0 ? <p className="tekst-pomocniczy">Brak wykonanych elementów.</p> : <div className="lista-kompaktowa">{elementyWykonane.map((element) => <div key={element.id}><div><strong>{element.tytul}</strong><small>{element.godzina ?? 'Bez godziny'}</small></div></div>)}</div>}</Karta>}
    </section>

    {edycjaHarmonogramu && <FormularzHarmonogramuDnia harmonogram={harmonogram} opis={wyjatekDnia?.opis} domyslnyZakres={ustawienia.harmonogram.domyslnyZakresZmiany} zezwalajNaPelnaDostepnosc={ustawienia.harmonogram.zezwalajNaPelnaDostepnoscDojazdu} zamknij={() => ustawEdycjeHarmonogramu(false)} zapisz={zapiszZmianeHarmonogramu} />}
  </div>
}
