import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format } from 'date-fns'
import { AlertCircle, CalendarDays, Inbox, LayoutGrid, MessageCircle, Plus, Sparkles } from 'lucide-react'
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
import { DostawcaNotatekPulpitu } from '../../providers/DostawcaNotatekPulpitu'
import { DostawcaPoczekalniPulpitu } from '../../providers/DostawcaPoczekalniPulpitu'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import {
  adresReferencjiZrodla,
  alertyFinansow,
  alertyKonfliktowTerminow,
  alertyLekow,
  alertyZdrowia,
  alertySamochodu,
  alertyWizyt,
  alertyZakupow,
  alertyNotatek,
  alertyPoczekalni,
  alertyStarychCelow,
  alertyTerminow,
  alertyWzrostuCenSubskrypcji,
  alertyZadan,
  deduplikujAlerty,
  klasaRozmiaruKafelka,
  ograniczAlerty,
  poziomSmartSygnalu,
  rangujAlerty,
  rozwiazDaneKafelka,
  rozwiazZakresKafelka,
  sortujKafelki,
} from './logikaKafelkow'
import { FormularzHarmonogramuDnia } from './FormularzHarmonogramuDnia'
import { NawigatorDnia } from './NawigatorDnia'
import { OsCzasu } from './OsCzasu'
import { kandydaciSugestiiEchoPulpitu, widoczneSugestieEchoPulpitu } from './SugestieEchoPulpitu'
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
const dostawcaNotatek = new DostawcaNotatekPulpitu()
const dostawcaPoczekalni = new DostawcaPoczekalniPulpitu()

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
  notatki: WynikZrodla
  poczekalnia: WynikZrodla
}

async function pobierzBezpiecznie(dostawca: DostawcaElementowPulpitu, zakres: ZakresDat): Promise<WynikZrodla> {
  try {
    return { stan: 'gotowy', elementy: await dostawca.pobierzElementy(zakres) }
  } catch {
    return { stan: 'blad', elementy: [] }
  }
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
  if (kafelek.typ === 'notatki') return 'Notatki'
  if (kafelek.typ === 'poczekalnia') return 'Inbox'
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
  if (element.typ === 'notatka') return [element.dane?.przypieta ? 'Przypięta' : '', termin].filter(Boolean).join(' · ') || 'Bez terminu'
  if (element.typ === 'poczekalnia') return `Do sklasyfikowania: ${element.dane?.liczbaNieprzetworzonych ?? 0}`
  return termin || 'Bez terminu'
}

function stanKafelka(kafelek: KonfiguracjaKafelkaPulpitu, wyniki: WynikiModulow | undefined) {
  if (!['leki', 'wizyty', 'finanse', 'samochod', 'zakupy', 'notatki', 'poczekalnia'].includes(kafelek.typ)) return 'gotowy' as const
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
  const { ustawienia, zapiszUstawienia, otworzSzybkieDodawanie, otworzSzybkieDodawanieZDanymi } = useAplikacja()
  const { dane: wyjatki, repozytorium: repozytoriumWyjatkow } = useRepozytorium('wyjatkiGrafiku')
  const { dane: cele } = useRepozytorium('cele')
  const { dane: terminyWaznosci } = useRepozytorium('terminyWaznosci')
  const { dane: platnosciStale } = useRepozytorium('platnosciStale')
  const dzisiaj = dzisiajIso()
  const [teraz, ustawTeraz] = useState(() => new Date())
  useEffect(() => {
    const identyfikator = window.setInterval(() => ustawTeraz(new Date()), 60_000)
    return () => window.clearInterval(identyfikator)
  }, [])
  const zakresModulow = useMemo(() => {
    const dataReferencyjna = new Date(`${dzisiaj}T12:00:00`)
    const konceZakresow = ustawienia.pulpit.kafelki
      .filter((kafelek) => kafelek.widoczny && ['leki', 'wizyty', 'finanse', 'samochod', 'zakupy', 'notatki', 'poczekalnia'].includes(kafelek.typ))
      .map((kafelek) => rozwiazZakresKafelka(kafelek, dataReferencyjna).do)
    if (ustawienia.pulpit.pokazAlerty) konceZakresow.push(format(addDays(dataReferencyjna, 1), 'yyyy-MM-dd'))
    return { od: dzisiaj, do: konceZakresow.sort().at(-1) ?? dzisiaj }
  }, [dzisiaj, ustawienia.pulpit.kafelki, ustawienia.pulpit.pokazAlerty])
  const zadaniaDnia = useLiveQuery(() => dostawcaZadan.pobierzElementy({ od: data, do: data }), [data], [])
  const modulyDnia = useLiveQuery(async () => {
    const [leki, wizyty, finanse, samochod, zakupy, notatki, poczekalnia] = await Promise.all([
      pobierzBezpiecznie(dostawcaLekow, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaWizyt, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaFinansow, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaSamochodu, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaZakupow, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaNotatek, { od: data, do: data }),
      pobierzBezpiecznie(dostawcaPoczekalni, { od: data, do: data }),
    ])
    return { leki, wizyty, finanse, samochod, zakupy, notatki, poczekalnia }
  }, [data])
  const zadaniaKafelkow = useLiveQuery(() => dostawcaZadan.pobierzElementy({ od: '1900-01-01', do: '9999-12-31' }), [], [])
  const modulyKafelkow = useLiveQuery(async () => {
    const [leki, wizyty, finanse, samochod, zakupy, notatki, poczekalnia] = await Promise.all([
      pobierzBezpiecznie(dostawcaLekow, zakresModulow),
      pobierzBezpiecznie(dostawcaWizyt, zakresModulow),
      pobierzBezpiecznie(dostawcaFinansow, zakresModulow),
      pobierzBezpiecznie(dostawcaSamochodu, { od: zakresModulow.od, do: format(addDays(new Date(`${zakresModulow.od}T12:00:00`), 3650), 'yyyy-MM-dd') }),
      pobierzBezpiecznie(dostawcaZakupow, zakresModulow),
      pobierzBezpiecznie(dostawcaNotatek, zakresModulow),
      pobierzBezpiecznie(dostawcaPoczekalni, zakresModulow),
    ])
    return { leki, wizyty, finanse, samochod, zakupy, notatki, poczekalnia }
  }, [zakresModulow.od, zakresModulow.do])
  const modulyAlertow = useLiveQuery(async () => {
    const dataReferencyjna = new Date()
    const dzisiajAlertow = format(dataReferencyjna, 'yyyy-MM-dd')
    const jutroAlertow = format(addDays(dataReferencyjna, 1), 'yyyy-MM-dd')
    const zaMiesiac = format(addDays(dataReferencyjna, 30), 'yyyy-MM-dd')
    const [leki, wizyty, finanse, samochod, zakupy, notatki, poczekalnia] = await Promise.all([
      pobierzBezpiecznie(dostawcaLekow, { od: dzisiajAlertow, do: jutroAlertow }),
      pobierzBezpiecznie(dostawcaWizyt, { od: dzisiajAlertow, do: jutroAlertow }),
      pobierzBezpiecznie(dostawcaFinansow, { od: '1900-01-01', do: zaMiesiac }),
      pobierzBezpiecznie(dostawcaSamochodu, { od: '1900-01-01', do: zaMiesiac }),
      pobierzBezpiecznie(dostawcaZakupow, { od: '1900-01-01', do: jutroAlertow }),
      pobierzBezpiecznie(dostawcaNotatek, { od: '1900-01-01', do: '9999-12-31' }),
      pobierzBezpiecznie(dostawcaPoczekalni, { od: dzisiajAlertow, do: dzisiajAlertow }),
    ])
    return { leki, wizyty, finanse, samochod, zakupy, notatki, poczekalnia }
  }, [dzisiaj])
  const zdrowieDoAlertow = useLiveQuery(async () => ({ skierowania: await pobierzRepozytorium('skierowania').lista(), recepty: await pobierzRepozytorium('recepty').lista() }), [], { skierowania: [], recepty: [] })
  const elementyDnia = [
    ...zadaniaDnia,
    ...(modulyDnia?.leki.elementy ?? []),
    ...(modulyDnia?.wizyty.elementy ?? []),
    ...(modulyDnia?.finanse.elementy.filter((element) => element.typ === 'platnosc') ?? []),
    ...(modulyDnia?.samochod.elementy ?? []),
    ...(modulyDnia?.zakupy.elementy.filter((element) => element.data === data) ?? []),
    ...(modulyDnia?.notatki.elementy.filter((element) => element.data === data) ?? []),
  ]
  const elementyModulowKafelkow = useMemo(() => [
    ...(modulyKafelkow?.leki.elementy ?? []),
    ...(modulyKafelkow?.wizyty.elementy ?? []),
    ...(modulyKafelkow?.finanse.elementy ?? []),
    ...(modulyKafelkow?.samochod.elementy ?? []),
    ...(modulyKafelkow?.zakupy.elementy ?? []),
    ...(modulyKafelkow?.notatki.elementy ?? []),
    ...(modulyKafelkow?.poczekalnia.elementy ?? []),
  ], [modulyKafelkow])
  const elementyKafelkow = useMemo(() => [...zadaniaKafelkow, ...elementyModulowKafelkow], [elementyModulowKafelkow, zadaniaKafelkow])
  const alerty = useMemo(() => {
    const teraz = new Date()
    return rangujAlerty(deduplikujAlerty([
      ...alertyZadan(zadaniaKafelkow, teraz),
      ...alertyKonfliktowTerminow(elementyKafelkow),
      ...alertyLekow(modulyAlertow?.leki.elementy ?? [], teraz),
      ...alertyWizyt(modulyAlertow?.wizyty.elementy ?? [], teraz),
      ...alertyZdrowia(zdrowieDoAlertow.skierowania, zdrowieDoAlertow.recepty, teraz),
      ...alertyFinansow(modulyAlertow?.finanse.elementy ?? [], teraz),
      ...alertySamochodu(modulyAlertow?.samochod.elementy ?? [], teraz),
      ...alertyZakupow(modulyAlertow?.zakupy.elementy ?? [], teraz),
      ...alertyNotatek(modulyAlertow?.notatki.elementy ?? [], teraz),
      ...alertyPoczekalni(modulyAlertow?.poczekalnia.elementy ?? [], teraz),
      ...alertyStarychCelow(cele, teraz),
      ...alertyTerminow(terminyWaznosci, teraz),
      ...alertyWzrostuCenSubskrypcji(platnosciStale),
    ]))
  }, [cele, modulyAlertow, platnosciStale, terminyWaznosci, zadaniaKafelkow, zdrowieDoAlertow])
  const widoczneAlerty = ograniczAlerty(alerty, ustawienia.pulpit.limitAlertow, pokazWiecejAlertow).widoczne
  const alertyWCentrum = pokazWiecejAlertow ? widoczneAlerty : widoczneAlerty.slice(0, 2)
  const kafelki = useMemo(() => sortujKafelki(ustawienia.pulpit.kafelki).filter((kafelek) => filtrKafelkow === 'wszystkie' || kafelek.typ === filtrKafelkow), [ustawienia.pulpit.kafelki, filtrKafelkow])
  const wyjatekDnia = useMemo(() => [...wyjatki].filter((wyjatek) => wyjatek.data === data).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0], [data, wyjatki])
  const harmonogram = useMemo(() => utworzHarmonogramDnia(data, ustawienia.harmonogram, wyjatekDnia), [data, ustawienia.harmonogram, wyjatekDnia])
  const elementyOsi = elementyDnia
    .filter((element) => element.trybTerminu === 'o_godzinie' && poprawnaGodzinaTerminu(element.godzina))
    .filter((element) => element.typ === 'lek' || element.status !== 'wykonany')
    .filter((element) => element.status !== 'anulowany')
    .sort((a, b) => (a.godzina ?? '').localeCompare(b.godzina ?? '') || a.typ.localeCompare(b.typ, 'pl') || a.tytul.localeCompare(b.tytul, 'pl') || a.id.localeCompare(b.id))
  const kandydaciSugestiiEcho = useMemo(() => kandydaciSugestiiEchoPulpitu(alerty, elementyDnia, harmonogram, teraz), [alerty, elementyDnia, harmonogram, teraz])
  const sugestieEcho = ustawienia.proaktywnoscEcho && !ustawienia.echoWyciszone
    ? widoczneSugestieEchoPulpitu(kandydaciSugestiiEcho, ustawienia.pulpit.odrzuconeSugestieEcho, 1)
    : []
  const horyzontSiedmiuDni = elementyKafelkow
    .filter((element) => element.status === 'otwarty' && element.data && element.data >= dzisiaj && element.data <= format(addDays(new Date(`${dzisiaj}T12:00:00`), 7), 'yyyy-MM-dd'))
    .sort((a, b) => `${a.data}T${a.godzina ?? '99:99'}`.localeCompare(`${b.data}T${b.godzina ?? '99:99'}`))
    .slice(0, 4)
  const elementyPoczekalni = modulyKafelkow?.poczekalnia.elementy ?? []
  const klasaUwagiKafelka = (kafelek: KonfiguracjaKafelkaPulpitu) => alerty.some((alert) => alert.sourceRef.modul === kafelek.typ || kafelek.typ === 'pilne' && poziomSmartSygnalu(alert) === 'pilne') ? 'strefa-pulpitu--wymaga-uwagi' : ''

  const odrzucSugestieEcho = async (id: string) => {
    const odrzuconeSugestieEcho = [...ustawienia.pulpit.odrzuconeSugestieEcho, id].slice(-30)
    await zapiszUstawienia({ pulpit: { ...ustawienia.pulpit, odrzuconeSugestieEcho } })
  }

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
    <div className="pulpit-sekcja--naglowek"><NaglowekWidoku tytul="Pulpit" opis="Najważniejsze sprawy wymagające Twojej uwagi." akcje={<><Link className="przycisk przycisk--drugorzedny" to="/dzisiaj">Przejdź do Dzisiaj</Link><button type="button" className="przycisk przycisk--glowny" onClick={otworzSzybkieDodawanie}><Plus aria-hidden="true" />Dodaj</button></>} /></div>
    <div className="pulpit-sekcja--nawigator"><NawigatorDnia data={data} zmienDate={(nowaData) => { ustawDate(nowaData); ustawKomunikat('') }} /></div>
    {(komunikat || bladModuluDnia) && <div className="pulpit-sekcja--komunikaty">
      {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
      {bladModuluDnia && <Komunikat typ="blad">Nie udało się pobrać części danych modułowych. Pozostałe elementy Pulpitu nadal działają.</Komunikat>}
    </div>}

    <section className="pulpit-sekcja--uwaga centrum-dowodzenia">
      <Karta klasa="centrum-dowodzenia__glowna centrum-dowodzenia__alerty"><div className="tytul-karty"><AlertCircle aria-hidden="true" /><span>Wymaga uwagi</span></div>{!ustawienia.pulpit.pokazAlerty || alertyWCentrum.length === 0 ? <PustyStan tytul="Nic pilnego" opis="Najważniejsze obszary nie zgłaszają teraz spraw wymagających reakcji." /> : <div className="lista-kompaktowa">{alertyWCentrum.map((alert) => <div key={alert.id}><div><Link to={adresReferencjiZrodla(alert.sourceRef)}><strong>{alert.tytul}</strong></Link><small>{poziomSmartSygnalu(alert) === 'pilne' ? 'Pilne' : poziomSmartSygnalu(alert) === 'wazne' ? 'Ważne' : 'Informacyjne'} · {alert.opis}</small></div></div>)}</div>}{ustawienia.pulpit.pokazAlerty && alerty.length > ustawienia.pulpit.limitAlertow && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawPokazWiecejAlertow((wartosc) => !wartosc)}>{pokazWiecejAlertow ? 'Pokaż mniej' : 'Pokaż wszystkie sygnały'}</button>}</Karta>
      <Karta klasa="centrum-dowodzenia__bok"><div className="tytul-karty"><CalendarDays aria-hidden="true" /><span>Najbliższe terminy</span></div>{horyzontSiedmiuDni.length === 0 ? <p className="tekst-pomocniczy">Brak ważnych terminów w ciągu 7 dni.</p> : <div className="lista-kompaktowa">{horyzontSiedmiuDni.slice(0, 3).map((element) => <div key={element.id}><div>{element.referencjaZrodla ? <Link to={adresReferencjiZrodla(element.referencjaZrodla)}><strong>{element.tytul}</strong></Link> : <strong>{element.tytul}</strong>}<small>{element.data}{element.godzina ? ` · ${element.godzina}` : ''}</small></div></div>)}</div>}</Karta>
      <Karta klasa="centrum-dowodzenia__bok"><div className="tytul-karty"><Inbox aria-hidden="true" /><span>Skrzynka</span></div>{elementyPoczekalni.length === 0 ? <p className="tekst-pomocniczy">Skrzynka i poczekalnia są puste.</p> : <><strong className="pulpit-licznik-uwagi">{elementyPoczekalni.length}</strong><p className="tekst-pomocniczy">{elementyPoczekalni.length === 1 ? 'sprawa czeka na uporządkowanie' : 'spraw czeka na uporządkowanie'}</p><Link className="przycisk przycisk--tekstowy" to="/skrzynka">Otwórz skrzynkę</Link></>}</Karta>
    </section>
    <section className="pulpit-sekcja--szybkie-akcje" aria-label="Szybkie akcje"><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => otworzSzybkieDodawanieZDanymi({ typ: 'zadanie' })}><Plus aria-hidden="true" />Zadanie</button><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => otworzSzybkieDodawanieZDanymi({ typ: 'przypomnienie' })}><Plus aria-hidden="true" />Przypomnienie</button><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => otworzSzybkieDodawanieZDanymi({ typ: 'wydatek' })}><Plus aria-hidden="true" />Wydatek</button><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => otworzSzybkieDodawanieZDanymi({ typ: 'wydarzenie' })}><Plus aria-hidden="true" />Wydarzenie</button></section>
    {ustawienia.pulpit.pokazOsCzasu && <OsCzasu data={data} harmonogram={harmonogram} zakresSnu={{ od: ustawienia.harmonogram.poczatekSnu, do: ustawienia.harmonogram.koniecSnu, skala: ustawienia.harmonogram.skalaSnuNaOsi }} elementy={elementyOsi} zezwalajNaPelnaDostepnosc={ustawienia.harmonogram.zezwalajNaPelnaDostepnoscDojazdu} edytujHarmonogram={() => ustawEdycjeHarmonogramu(true)} przelaczDostepnosc={przelaczDostepnosc} usunWyjatek={usunWyjatek} otworzElement={(element) => { if (element.referencjaZrodla) nawiguj(adresReferencjiZrodla(element.referencjaZrodla)) }} />}
    {ustawienia.pulpit.pokazKafelki && <section className="pulpit-sekcja--kafelki"><div className="akcje-formularza"><button type="button" className="przycisk przycisk--maly" onClick={() => ustawFiltrKafelkow('wszystkie')}>Wszystkie</button><button type="button" className="przycisk przycisk--maly" onClick={() => ustawFiltrKafelkow('zadania')}>Zadania</button><button type="button" className="przycisk przycisk--maly" onClick={() => ustawFiltrKafelkow('pilne')}>Pilne</button></div><div className="strefy-pulpitu">{kafelki.map((kafelek) => <Karta key={kafelek.id} klasa={`strefa-pulpitu strefa-pulpitu--${kafelek.typ} ${klasaRozmiaruKafelka(kafelek.rozmiar)} ${klasaUwagiKafelka(kafelek)}`}><div className="tytul-karty"><LayoutGrid aria-hidden="true" /><span>{etykietaKafelka(kafelek)}</span></div><ZawartoscKafelka kafelek={kafelek} elementy={elementyKafelkow} wynikiModulow={modulyKafelkow} dataReferencyjna={dataReferencyjnaKafelkow} /></Karta>)}</div></section>}
    <section className="pulpit-sekcja--echo"><Karta klasa="karta-echo"><Sparkles aria-hidden="true" /><div><h2>Echo proponuje</h2>{sugestieEcho.length === 0 ? <p>{ustawienia.proaktywnoscEcho && !ustawienia.echoWyciszone ? 'Nie mam teraz krótkiej sugestii wynikającej z Twoich danych.' : 'Proaktywne sugestie Echo są wyłączone.'}</p> : <div className="lista-kompaktowa">{sugestieEcho.map((sugestia) => <div key={sugestia.id}><div><p>{sugestia.tresc}</p></div><button type="button" className="przycisk przycisk--tekstowy" onClick={() => void odrzucSugestieEcho(sugestia.id)}>Ukryj</button></div>)}</div>}</div><Link className="przycisk przycisk--drugorzedny" to="/echo"><MessageCircle aria-hidden="true" />Zapytaj Echo</Link></Karta></section>

    {edycjaHarmonogramu && <FormularzHarmonogramuDnia harmonogram={harmonogram} opis={wyjatekDnia?.opis} domyslnyZakres={ustawienia.harmonogram.domyslnyZakresZmiany} zezwalajNaPelnaDostepnosc={ustawienia.harmonogram.zezwalajNaPelnaDostepnoscDojazdu} zamknij={() => ustawEdycjeHarmonogramu(false)} zapisz={zapiszZmianeHarmonogramu} />}
  </div>
}
