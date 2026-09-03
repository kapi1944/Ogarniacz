import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BellPlus, CalendarClock, ClipboardList, FileText, History, Pill, ShieldAlert, Stethoscope } from 'lucide-react'
import { WidokRejestru } from '../../components/WidokRejestru'
import { Karta, Komunikat, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { dzisiajIso, noweId, terazIso, utworzMetadane } from '../../domain/fabryki'
import type { Lek, PozycjaRecepty, Przypomnienie, Recepta, Skierowanie, Terapia, Wizyta } from '../../domain/typy'
import { usePodswietlenie } from '../../hooks/usePodswietlenie'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { generujDawkiDnia, zapiszStatusDawki } from '../../services/LekiService'
import { zapiszPowiazanePrzypomnienie } from '../../services/PrzypomnieniaService'

const formatowanieDaty = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' })

function opisTerminu(data?: string, godzina?: string) {
  return data ? `${formatowanieDaty.format(new Date(`${data}T12:00:00`))}${godzina ? `, ${godzina}` : ''}` : 'Bez ustalonego terminu'
}

function terminWkrotce(termin?: string) {
  if (!termin) return false
  const dzisiaj = new Date(`${dzisiajIso()}T00:00:00`)
  const granica = new Date(dzisiaj)
  granica.setDate(granica.getDate() + 14)
  const data = new Date(`${termin}T00:00:00`)
  return data >= dzisiaj && data <= granica
}

export function WidokZdrowia() {
  const { dane: leki } = useRepozytorium('leki')
  const { dane: wpisy } = useRepozytorium('dziennikLekow')
  const { dane: wizyty } = useRepozytorium('wizyty')
  const { dane: skierowania } = useRepozytorium('skierowania')
  const { dane: recepty } = useRepozytorium('recepty')
  const { dane: terapie } = useRepozytorium('terapie')
  const dzisiaj = dzisiajIso()
  const najblizszaWizyta = [...wizyty]
    .filter((wizyta) => wizyta.status === 'umowiona' && wizyta.data && wizyta.data >= dzisiaj)
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))[0]
  const najblizszaDawka = generujDawkiDnia(leki, wpisy, dzisiaj)
    .filter((dawka) => dawka.status === 'oczekuje')
    .sort((a, b) => a.planowanaGodzina.localeCompare(b.planowanaGodzina))[0]
  const wymagajaceDzialania = skierowania.filter((skierowanie) => ['nowe', 'do_umowienia'].includes(skierowanie.status))
  const receptaDoRealizacji = recepty.find((recepta) => ['do_realizacji', 'czesciowo_zrealizowana'].includes(recepta.status))
  const aktywnaTerapia = terapie.find((terapia) => terapia.status === 'aktywna')

  const kafelki = [
    { adres: '/zdrowie/leki', tytul: 'Leki', opis: leki.length ? `${leki.filter((lek) => lek.aktywny).length} aktywnych harmonogramów` : 'Dodaj harmonogram leków', ikona: Pill },
    { adres: '/zdrowie/wizyty', tytul: 'Wizyty', opis: najblizszaWizyta ? opisTerminu(najblizszaWizyta.data, najblizszaWizyta.godzina) : 'Brak umówionych wizyt', ikona: CalendarClock },
    { adres: '/zdrowie/dziennik-terapii', tytul: 'Dziennik terapii', opis: aktywnaTerapia ? aktywnaTerapia.nazwa : 'Dodaj terapię', ikona: ClipboardList },
    { adres: '/zdrowie/skierowania', tytul: 'Skierowania', opis: wymagajaceDzialania.length ? `${wymagajaceDzialania.length} wymagają działania` : 'Zarządzaj skierowaniami', ikona: Stethoscope },
    { adres: '/zdrowie/recepty', tytul: 'Recepty', opis: receptaDoRealizacji ? 'Wymaga realizacji' : 'Zarządzaj receptami', ikona: FileText },
    { adres: '/zdrowie/historia', tytul: 'Historia zdrowia', opis: 'Chronologia zdarzeń zdrowotnych', ikona: History },
  ]

  return <div className="widok">
    <NaglowekWidoku tytul="Zdrowie" opis="Najważniejsze informacje i organizacja spraw zdrowotnych." />
    <Karta><h2>Najbliższe / wymagające uwagi</h2><div className="lista-kompaktowa">
      {najblizszaWizyta && <div><div><Link to={`/zdrowie/wizyty?element=${najblizszaWizyta.id}`}><strong>Najbliższa wizyta: {najblizszaWizyta.nazwa}</strong></Link><small>{opisTerminu(najblizszaWizyta.data, najblizszaWizyta.godzina)}</small></div></div>}
      {najblizszaDawka && <div><div><Link to={`/zdrowie/leki?element=${najblizszaDawka.lek.id}`}><strong>Najbliższa dawka: {najblizszaDawka.lek.nazwa}</strong></Link><small>Dzisiaj o {najblizszaDawka.planowanaGodzina}</small></div></div>}
      {wymagajaceDzialania.map((skierowanie) => <div key={skierowanie.id}><div><Link to={`/zdrowie/skierowania?element=${skierowanie.id}`}><strong>Skierowanie do działania: {skierowanie.nazwa}</strong></Link><small>{skierowanie.terminWaznosci ? `Ważne do ${skierowanie.terminWaznosci}` : 'Bez podanego terminu ważności'}</small></div></div>)}
      {receptaDoRealizacji && <div><div><Link to={`/zdrowie/recepty?element=${receptaDoRealizacji.id}`}><strong>Recepta do realizacji</strong></Link><small>{receptaDoRealizacji.pozycje.length} pozycji</small></div></div>}
      {aktywnaTerapia && <div><div><Link to={`/zdrowie/dziennik-terapii?element=${aktywnaTerapia.id}`}><strong>Aktywna terapia: {aktywnaTerapia.nazwa}</strong></Link></div></div>}
      {!najblizszaWizyta && !najblizszaDawka && wymagajaceDzialania.length === 0 && !receptaDoRealizacji && !aktywnaTerapia && <p className="tekst-pomocniczy">Brak spraw wymagających uwagi.</p>}
    </div></Karta>
    <section className="strefy-pulpitu">{kafelki.map((kafelek) => { const Ikona = kafelek.ikona; return <Karta key={kafelek.adres} klasa="strefa-pulpitu"><div className="tytul-karty"><Ikona aria-hidden="true" /><span>{kafelek.tytul}</span></div><p>{kafelek.opis}</p><Link className="przycisk przycisk--drugorzedny" to={kafelek.adres}>Otwórz</Link></Karta> })}</section>
  </div>
}

function pozycjeZFormularza(wartosc: string, istniejace: PozycjaRecepty[] = []) {
  return wartosc.split('\n').map((wiersz) => wiersz.split('|').map((fragment) => fragment.trim())).filter(([nazwa]) => nazwa).map(([nazwaLeku, ilosc, iloscZrealizowana, dawkowanie, odplatnosc, lekId], indeks) => ({
    id: istniejace[indeks]?.id ?? noweId(), nazwaLeku, ilosc: Math.max(1, Number(ilosc) || 1), iloscZrealizowana: Math.max(0, Number(iloscZrealizowana) || 0), dawkowanie: dawkowanie || undefined, odplatnosc: odplatnosc || undefined, lekId: lekId || undefined,
  }))
}

function statusRecepty(pozycje: PozycjaRecepty[], status: Recepta['status']): Recepta['status'] {
  if (['wygasla', 'anulowana'].includes(status)) return status
  if (pozycje.length > 0 && pozycje.every((pozycja) => pozycja.iloscZrealizowana >= pozycja.ilosc)) return 'zrealizowana'
  if (pozycje.some((pozycja) => pozycja.iloscZrealizowana > 0)) return 'czesciowo_zrealizowana'
  return 'do_realizacji'
}

export function WidokRecept() {
  const [parametryAdresu] = useSearchParams()
  const { dane: recepty, repozytorium } = useRepozytorium('recepty')
  const { dane: leki, repozytorium: repozytoriumLekow } = useRepozytorium('leki')
  const { dane: wizyty } = useRepozytorium('wizyty')
  return <WidokRejestru
    tytul="Recepty" opis="Rejestr recept i realizacji ich pozycji." etykietaDodawania="Dodaj receptę" dane={recepty} repozytorium={repozytorium}
    pola={[
      { klucz: 'dataWystawienia', etykieta: 'Data wystawienia', typ: 'date', wymagane: true, domyslnaWartosc: dzisiajIso() },
      { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, domyslnaWartosc: 'do_realizacji', opcje: [{ wartosc: 'do_realizacji', etykieta: 'Do realizacji' }, { wartosc: 'czesciowo_zrealizowana', etykieta: 'Częściowo zrealizowana' }, { wartosc: 'zrealizowana', etykieta: 'Zrealizowana' }, { wartosc: 'wygasla', etykieta: 'Wygasła' }, { wartosc: 'anulowana', etykieta: 'Anulowana' }] },
      { klucz: 'kod', etykieta: 'Kod recepty' }, { klucz: 'wystawca', etykieta: 'Lekarz / wystawca' }, { klucz: 'terminRealizacji', etykieta: 'Termin realizacji', typ: 'date' },
      { klucz: 'wizytaId', etykieta: 'Powiązana wizyta', typ: 'select', opcje: wizyty.map((wizyta) => ({ wartosc: wizyta.id, etykieta: wizyta.nazwa })) },
      { klucz: 'pozycjeTekst', etykieta: 'Pozycje recepty', typ: 'textarea', wymagane: true, podpowiedz: 'jedna pozycja w wierszu: nazwa | ilość | zrealizowano | dawkowanie | odpłatność | id leku' },
      { klucz: 'notatka', etykieta: 'Notatka', typ: 'textarea' },
    ]}
    uzupelnijFormularz={(recepta) => ({ pozycjeTekst: recepta.pozycje.map((pozycja) => [pozycja.nazwaLeku, pozycja.ilosc, pozycja.iloscZrealizowana, pozycja.dawkowanie ?? '', pozycja.odplatnosc ?? '', pozycja.lekId ?? ''].join(' | ')).join('\n') })}
    zbuduj={(formularz, istniejaca) => { const pozycje = pozycjeZFormularza(formularz.pozycjeTekst, istniejaca?.pozycje); const status = statusRecepty(pozycje, (formularz.status || 'do_realizacji') as Recepta['status']); return { ...(istniejaca ?? utworzMetadane()), dataWystawienia: formularz.dataWystawienia, status, kod: formularz.kod || undefined, wystawca: formularz.wystawca || undefined, terminRealizacji: formularz.terminRealizacji || undefined, wizytaId: formularz.wizytaId || undefined, pozycje, notatka: formularz.notatka || undefined, updatedAt: terazIso() } }}
    etykieta={(recepta) => recepta.kod ? `Recepta ${recepta.kod}` : `Recepta z ${recepta.dataWystawienia}`}
    wybranyElementId={parametryAdresu.get('element') ?? undefined}
    szczegoly={(recepta) => <><Znacznik wariant={recepta.status === 'zrealizowana' ? 'sukces' : recepta.status === 'do_realizacji' ? 'ostrzezenie' : 'informacja'}>{recepta.status.replaceAll('_', ' ')}</Znacznik><span>{recepta.pozycje.length} pozycji</span>{recepta.terminRealizacji && <span>Realizacja do: {recepta.terminRealizacji}</span>}<div>{recepta.pozycje.map((pozycja) => <p key={pozycja.id}>{pozycja.nazwaLeku}: {pozycja.iloscZrealizowana}/{pozycja.ilosc}{pozycja.lekId ? ' · powiązano z lekiem' : ''}</p>)}</div></>}
    akcje={(recepta) => <>{recepta.pozycje.filter((pozycja) => !pozycja.lekId).map((pozycja) => <button key={pozycja.id} type="button" className="przycisk-ikona" title={`Dodaj lub powiąż ${pozycja.nazwaLeku} z moimi lekami`} onClick={async () => { const lek = leki.find((istniejacy) => istniejacy.nazwa.toLocaleLowerCase('pl') === pozycja.nazwaLeku.toLocaleLowerCase('pl')) ?? { ...utworzMetadane(), nazwa: pozycja.nazwaLeku, dawkaInstrukcja: pozycja.dawkowanie ?? 'Uzupełnij instrukcję', godziny: [], aktywny: false }; await repozytoriumLekow.zapisz(lek); await repozytorium.zapisz({ ...recepta, pozycje: recepta.pozycje.map((element) => element.id === pozycja.id ? { ...element, lekId: lek.id } : element) }) }}><Pill aria-hidden="true" /></button>)}</>}
  />
}

export function WidokDziennikaTerapii() {
  const [parametryAdresu] = useSearchParams()
  const { dane: terapie, repozytorium: repozytoriumTerapii } = useRepozytorium('terapie')
  const { dane: wpisy, repozytorium: repozytoriumWpisow } = useRepozytorium('wpisyTerapii')
  const { dane: wizyty } = useRepozytorium('wizyty')
  return <div className="widok"><WidokRejestru tytul="Dziennik terapii" opis="Terapie i krótkie wpisy prowadzone przez użytkownika." etykietaDodawania="Dodaj terapię" dane={terapie} repozytorium={repozytoriumTerapii}
    pola={[{ klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true }, { klucz: 'rodzaj', etykieta: 'Rodzaj', typ: 'select', opcje: [{ wartosc: 'psychoterapia', etykieta: 'Psychoterapia' }, { wartosc: 'rehabilitacja', etykieta: 'Rehabilitacja' }, { wartosc: 'leczenie', etykieta: 'Leczenie' }, { wartosc: 'inne', etykieta: 'Inne' }] }, { klucz: 'dataRozpoczecia', etykieta: 'Data rozpoczęcia', typ: 'date' }, { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, domyslnaWartosc: 'aktywna', opcje: [{ wartosc: 'aktywna', etykieta: 'Aktywna' }, { wartosc: 'wstrzymana', etykieta: 'Wstrzymana' }, { wartosc: 'zakonczona', etykieta: 'Zakończona' }] }, { klucz: 'notatka', etykieta: 'Opis / notatka', typ: 'textarea' }]}
    zbuduj={(formularz, istniejaca) => ({ ...(istniejaca ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), rodzaj: formularz.rodzaj as Terapia['rodzaj'] || undefined, dataRozpoczecia: formularz.dataRozpoczecia || undefined, status: (formularz.status || 'aktywna') as Terapia['status'], notatka: formularz.notatka || undefined, updatedAt: terazIso() })} etykieta={(terapia) => terapia.nazwa} wybranyElementId={parametryAdresu.get('element') ?? undefined} szczegoly={(terapia) => <><Znacznik wariant={terapia.status === 'aktywna' ? 'sukces' : 'neutralny'}>{terapia.status}</Znacznik>{terapia.notatka && <p>{terapia.notatka}</p>}</>} />
    <WidokRejestru tytul="Wpisy terapii" opis="Najważniejsza jest treść wpisu; pozostałe pola są opcjonalne." etykietaDodawania="Dodaj wpis" dane={wpisy} repozytorium={repozytoriumWpisow}
      pola={[{ klucz: 'terapiaId', etykieta: 'Terapia', typ: 'select', wymagane: true, opcje: terapie.map((terapia) => ({ wartosc: terapia.id, etykieta: terapia.nazwa })) }, { klucz: 'dataCzas', etykieta: 'Data i czas', typ: 'text', wymagane: true, domyslnaWartosc: terazIso().slice(0, 16) }, { klucz: 'tytul', etykieta: 'Tytuł' }, { klucz: 'tresc', etykieta: 'Treść', typ: 'textarea', wymagane: true }, { klucz: 'samopoczucie', etykieta: 'Samopoczucie (1–5)', typ: 'number', min: 1 }, { klucz: 'obserwacje', etykieta: 'Obserwacje', typ: 'textarea' }, { klucz: 'zalecenia', etykieta: 'Zadania / zalecenia', typ: 'textarea' }, { klucz: 'tematNastepnegoSpotkania', etykieta: 'Temat na kolejne spotkanie', typ: 'textarea' }, { klucz: 'wizytaId', etykieta: 'Powiązana wizyta', typ: 'select', opcje: wizyty.map((wizyta) => ({ wartosc: wizyta.id, etykieta: wizyta.nazwa })) }]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), terapiaId: formularz.terapiaId, dataCzas: formularz.dataCzas, tytul: formularz.tytul || undefined, tresc: formularz.tresc.trim(), samopoczucie: formularz.samopoczucie ? Math.min(5, Math.max(1, Number(formularz.samopoczucie))) : undefined, obserwacje: formularz.obserwacje || undefined, zalecenia: formularz.zalecenia || undefined, tematNastepnegoSpotkania: formularz.tematNastepnegoSpotkania || undefined, wizytaId: formularz.wizytaId || undefined, updatedAt: terazIso() })} etykieta={(wpis) => wpis.tytul || terapie.find((terapia) => terapia.id === wpis.terapiaId)?.nazwa || 'Wpis terapii'} szczegoly={(wpis) => <><span>{wpis.dataCzas}</span><p>{wpis.tresc}</p>{wpis.samopoczucie && <span>Samopoczucie: {wpis.samopoczucie}/5</span>}</>} />
  </div>
}

export function WidokLekow() {
  const [parametryAdresu] = useSearchParams()
  const { dane: leki, repozytorium } = useRepozytorium('leki')
  const { dane: wpisy, repozytorium: repoWpisow } = useRepozytorium('dziennikLekow')
  const [historia, ustawHistorie] = useState(false)
  const data = dzisiajIso()
  const dawki = generujDawkiDnia(leki, wpisy, data)

  return <div className="widok">
    <NaglowekWidoku tytul="Leki" opis="Harmonogram i historia świadomych reakcji na dawki wpisane przez użytkownika." akcje={<button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawHistorie(!historia)}><History aria-hidden="true" />{historia ? 'Ukryj historię' : 'Historia'}</button>} />
    <Karta klasa="karta-bezpieczenstwa"><ShieldAlert aria-hidden="true" /><div><strong>Ogarniacz nie udziela porad medycznych.</strong><p>Nie dobiera leków ani dawek i nie zmienia zaleceń. Przechowuje wyłącznie informacje wpisane przez użytkownika.</p></div></Karta>
    <Karta>
      <h2>Dzisiejsze dawki</h2>
      {dawki.length === 0 ? <PustyStan tytul="Brak aktywnych dawek" opis="Dodaj lek i co najmniej jedną godzinę." /> : <div className="lista-dawek lista-dawek--duza">{dawki.map((dawka) => <div key={dawka.idWystapienia}><time>{dawka.planowanaGodzina}</time><div><strong>{dawka.lek.nazwa}</strong><small>{dawka.lek.dawkaInstrukcja}</small></div><select aria-label={`Status ${dawka.lek.nazwa} ${dawka.planowanaGodzina}`} value={dawka.status} onChange={(e) => repoWpisow.zapisz(zapiszStatusDawki(dawka, e.target.value as typeof dawka.status))}><option value="oczekuje">Oczekuje</option><option value="zazyte">Zażyte</option><option value="odroczone">Odroczone</option><option value="pominiete">Pominięte</option></select></div>)}</div>}
    </Karta>
    {historia && <Karta><h2>Historia reakcji</h2>{wpisy.length === 0 ? <p className="tekst-pomocniczy">Brak zapisanych reakcji.</p> : <div className="tabela-przewijana"><table><thead><tr><th>Data</th><th>Godzina</th><th>Lek</th><th>Status</th><th>Reakcja</th></tr></thead><tbody>{[...wpisy].sort((a, b) => b.data.localeCompare(a.data)).map((wpis) => <tr key={wpis.id}><td>{wpis.data}</td><td>{wpis.planowanaGodzina}</td><td>{leki.find((lek) => lek.id === wpis.lekId)?.nazwa ?? 'Usunięty lek'}</td><td><Znacznik wariant={wpis.status === 'zazyte' ? 'sukces' : wpis.status === 'pominiete' ? 'blad' : 'ostrzezenie'}>{wpis.status}</Znacznik></td><td>{wpis.reakcjaAt ? new Date(wpis.reakcjaAt).toLocaleString('pl-PL') : '—'}</td></tr>)}</tbody></table></div>}</Karta>}
    <WidokRejestru
      tytul="Harmonogramy leków"
      opis="Każdy lek może mieć kilka godzin dziennie. Dezaktywacja zachowuje historię."
      etykietaDodawania="Dodaj lek"
      dane={leki}
      repozytorium={repozytorium}
      pola={[
        { klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true },
        { klucz: 'dawkaInstrukcja', etykieta: 'Dawka / instrukcja użytkownika', wymagane: true },
        { klucz: 'godziny', etykieta: 'Godziny', wymagane: true, podpowiedz: 'np. 08:00, 14:00, 21:00' },
        { klucz: 'dodatkoweInstrukcje', etykieta: 'Dodatkowe instrukcje', typ: 'textarea' },
        { klucz: 'aktywny', etykieta: 'Stan', typ: 'select', wymagane: true, opcje: [{ wartosc: 'true', etykieta: 'Aktywny' }, { wartosc: 'false', etykieta: 'Nieaktywny' }] },
      ]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), dawkaInstrukcja: formularz.dawkaInstrukcja.trim(), godziny: formularz.godziny.split(',').map((x) => x.trim()).filter((x) => /^\d{2}:\d{2}$/.test(x)).sort(), dodatkoweInstrukcje: formularz.dodatkoweInstrukcje || undefined, aktywny: formularz.aktywny !== 'false', updatedAt: terazIso() } as Lek)}
      etykieta={(lek) => lek.nazwa}
      wybranyElementId={parametryAdresu.get('element') ?? undefined}
      szczegoly={(lek) => <><Znacznik wariant={lek.aktywny ? 'sukces' : 'neutralny'}>{lek.aktywny ? 'aktywny' : 'nieaktywny'}</Znacznik><span>{lek.dawkaInstrukcja}</span><span>Godziny: {lek.godziny.join(', ') || 'brak — uzupełnij'}</span>{lek.dodatkoweInstrukcje && <p>{lek.dodatkoweInstrukcje}</p>}</>}
    />
  </div>
}

export function WidokWizyt() {
  const [parametryAdresu] = useSearchParams()
  const { dane: wizyty, repozytorium } = useRepozytorium('wizyty')
  const { dane: kontakty } = useRepozytorium('kontakty')
  const { dane: przypomnienia, repozytorium: repoPrzypomnien } = useRepozytorium('przypomnienia')
  const [komunikat, ustawKomunikat] = useState('')
  usePodswietlenie(wizyty.length)

  const dodajPrzypomnienie = async (wizyta: Wizyta) => {
    const dataCzas = wizyta.data ? `${wizyta.data}T${wizyta.godzina ?? '09:00'}:00` : wizyta.terminGraniczny ? `${wizyta.terminGraniczny}T09:00:00` : undefined
    if (!dataCzas) return ustawKomunikat('Najpierw podaj datę wizyty albo termin graniczny.')
    const przypomnienie: Przypomnienie = { ...utworzMetadane(), tytul: `Wizyta: ${wizyta.nazwa}`, zrodlo: { typ: 'wizyty', id: wizyta.id }, typ: 'wzgledne', czas: dataCzas, przesuniecieMin: 1440, priorytet: 'wysoki', stan: 'nowe', eskalacja: true }
    await repoPrzypomnien.zapisz(zapiszPowiazanePrzypomnienie(przypomnienia, przypomnienie))
    ustawKomunikat('Zapisano przypomnienie na dzień przed wizytą.')
  }

  return <div className="widok">
    {komunikat && <Komunikat typ={komunikat.startsWith('Najpierw') ? 'blad' : 'sukces'}>{komunikat}</Komunikat>}
    <WidokRejestru
      tytul="Wizyty i zdrowie"
      opis="Sprawy do umówienia oraz umówione wizyty z kontaktem, pytaniami i checklistą."
      etykietaDodawania="Dodaj wizytę / sprawę"
      dane={wizyty}
      repozytorium={repozytorium}
      pola={[
        { klucz: 'nazwa', etykieta: 'Nazwa / typ wizyty', wymagane: true },
        { klucz: 'status', etykieta: 'Stan', typ: 'select', wymagane: true, opcje: [{ wartosc: 'do_umowienia', etykieta: 'Do umówienia' }, { wartosc: 'umowiona', etykieta: 'Umówiona' }, { wartosc: 'odbyta', etykieta: 'Odbyta' }, { wartosc: 'anulowana', etykieta: 'Anulowana' }] },
        { klucz: 'terminGraniczny', etykieta: 'Termin graniczny', typ: 'date' },
        { klucz: 'data', etykieta: 'Data wizyty', typ: 'date' },
        { klucz: 'godzina', etykieta: 'Godzina', typ: 'time' },
        { klucz: 'miejsce', etykieta: 'Miejsce' },
        { klucz: 'lekarzPlacowka', etykieta: 'Lekarz / placówka' },
        { klucz: 'kontaktId', etykieta: 'Kontakt', typ: 'select', opcje: kontakty.map((kontakt) => ({ wartosc: kontakt.id, etykieta: kontakt.nazwa })) },
        { klucz: 'notatka', etykieta: 'Notatka', typ: 'textarea' },
        { klucz: 'pytania', etykieta: 'Pytania', podpowiedz: 'oddzielone przecinkami' },
        { klucz: 'checklista', etykieta: 'Rzeczy do zabrania', podpowiedz: 'oddzielone przecinkami' },
      ]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), status: (formularz.status || 'do_umowienia') as Wizyta['status'], terminGraniczny: formularz.terminGraniczny || undefined, data: formularz.data || undefined, godzina: formularz.godzina || undefined, miejsce: formularz.miejsce || undefined, lekarzPlacowka: formularz.lekarzPlacowka || undefined, kontaktId: formularz.kontaktId || undefined, notatka: formularz.notatka ?? '', pytania: formularz.pytania.split(',').map((x) => x.trim()).filter(Boolean), checklista: formularz.checklista.split(',').map((x) => x.trim()).filter(Boolean), dokumentyIds: istniejacy?.dokumentyIds ?? [], updatedAt: terazIso() })}
      etykieta={(wizyta) => wizyta.nazwa}
      wybranyElementId={parametryAdresu.get('element') ?? undefined}
      szczegoly={(wizyta) => <><Znacznik wariant={wizyta.status === 'odbyta' ? 'sukces' : wizyta.status === 'do_umowienia' ? 'ostrzezenie' : 'informacja'}>{wizyta.status.replaceAll('_', ' ')}</Znacznik>{wizyta.data && <span>{wizyta.data} {wizyta.godzina}</span>}{wizyta.terminGraniczny && <span>Umów do: {wizyta.terminGraniczny}</span>}{wizyta.miejsce && <span>{wizyta.miejsce}</span>}{wizyta.pytania.length > 0 && <span>Pytania: {wizyta.pytania.join(', ')}</span>}{wizyta.checklista.length > 0 && <span>Zabrać: {wizyta.checklista.join(', ')}</span>}{wizyta.notatka && <p>{wizyta.notatka}</p>}</>}
      akcje={(wizyta) => <button type="button" className="przycisk-ikona" title="Dodaj przypomnienie dzień wcześniej" onClick={() => dodajPrzypomnienie(wizyta)}><BellPlus aria-hidden="true" /></button>}
    />
  </div>
}

export function WidokSkierowan() {
  const [parametryAdresu] = useSearchParams()
  const { dane: skierowania, repozytorium } = useRepozytorium('skierowania')
  const { dane: wizyty } = useRepozytorium('wizyty')

  return <WidokRejestru
    tytul="Skierowania"
    opis="Informacje organizacyjne o skierowaniach; Ogarniacz nie interpretuje ich medycznie."
    etykietaDodawania="Dodaj skierowanie"
    dane={[...skierowania].sort((a, b) => {
      const waga = (skierowanie: Skierowanie) => skierowanie.status === 'do_umowienia' ? 0 : skierowanie.status === 'umowiono' ? 1 : 2
      return waga(a) - waga(b) || (a.terminWaznosci ?? '9999-12-31').localeCompare(b.terminWaznosci ?? '9999-12-31')
    })}
    repozytorium={repozytorium}
    pola={[
      { klucz: 'nazwa', etykieta: 'Rodzaj / nazwa', wymagane: true },
      { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, domyslnaWartosc: 'nowe', opcje: [{ wartosc: 'nowe', etykieta: 'Nowe' }, { wartosc: 'do_umowienia', etykieta: 'Do umówienia' }, { wartosc: 'umowiono', etykieta: 'Umówiono' }, { wartosc: 'zrealizowano', etykieta: 'Zrealizowano' }, { wartosc: 'anulowano', etykieta: 'Anulowano' }, { wartosc: 'wygaslo', etykieta: 'Wygasło' }] },
      { klucz: 'dataWystawienia', etykieta: 'Data wystawienia', typ: 'date', wymagane: true, domyslnaWartosc: dzisiajIso() },
      { klucz: 'typCelu', etykieta: 'Typ celu', typ: 'select', wymagane: true, domyslnaWartosc: 'specjalista', opcje: [{ wartosc: 'specjalista', etykieta: 'Specjalista' }, { wartosc: 'badanie', etykieta: 'Badanie' }, { wartosc: 'zabieg', etykieta: 'Zabieg' }, { wartosc: 'rehabilitacja', etykieta: 'Rehabilitacja' }, { wartosc: 'inne', etykieta: 'Inne' }] },
      { klucz: 'cel', etykieta: 'Cel / opis', typ: 'textarea', wymagane: true },
      { klucz: 'wystawca', etykieta: 'Wystawca / lekarz' },
      { klucz: 'kod', etykieta: 'Kod lub numer skierowania' },
      { klucz: 'terminWaznosci', etykieta: 'Termin ważności', typ: 'date' },
      { klucz: 'placowka', etykieta: 'Placówka' },
      { klucz: 'wizytaId', etykieta: 'Powiązana wizyta', typ: 'select', opcje: wizyty.map((wizyta) => ({ wartosc: wizyta.id, etykieta: wizyta.nazwa })) },
      { klucz: 'notatka', etykieta: 'Notatka', typ: 'textarea' },
    ]}
    zbuduj={(formularzz, istniejace) => ({
      ...(istniejace ?? utworzMetadane()), nazwa: formularzz.nazwa.trim(), status: (formularzz.status || 'nowe') as Skierowanie['status'], dataWystawienia: formularzz.dataWystawienia, typCelu: formularzz.typCelu as Skierowanie['typCelu'], cel: formularzz.cel.trim(), wystawca: formularzz.wystawca || undefined, kod: formularzz.kod || undefined, terminWaznosci: formularzz.terminWaznosci || undefined, placowka: formularzz.placowka || undefined, wizytaId: formularzz.wizytaId || undefined, notatka: formularzz.notatka || undefined, updatedAt: terazIso(),
    })}
    etykieta={(skierowanie) => skierowanie.nazwa}
    wybranyElementId={parametryAdresu.get('element') ?? undefined}
    szczegoly={(skierowanie) => <><Znacznik wariant={skierowanie.status === 'do_umowienia' || terminWkrotce(skierowanie.terminWaznosci) ? 'ostrzezenie' : skierowanie.status === 'umowiono' ? 'informacja' : skierowanie.status === 'zrealizowano' ? 'sukces' : 'neutralny'}>{skierowanie.status.replaceAll('_', ' ')}</Znacznik><span>{skierowanie.typCelu}: {skierowanie.cel}</span>{skierowanie.terminWaznosci && <span>{terminWkrotce(skierowanie.terminWaznosci) ? 'Ważne wkrótce: ' : 'Ważne do: '}{skierowanie.terminWaznosci}</span>}{skierowanie.wizytaId && <Link to={`/zdrowie/wizyty?element=${skierowanie.wizytaId}`}>Otwórz powiązaną wizytę</Link>}{skierowanie.notatka && <p>{skierowanie.notatka}</p>}</>}
  />
}

export function WidokHistoriiZdrowia() {
  const { dane: wizyty } = useRepozytorium('wizyty')
  const { dane: skierowania } = useRepozytorium('skierowania')
  const { dane: recepty } = useRepozytorium('recepty')
  const { dane: terapie } = useRepozytorium('terapie')
  const { dane: wpisy } = useRepozytorium('wpisyTerapii')
  const zdarzenia = [
    ...wizyty.filter((wizyta) => wizyta.data).map((wizyta) => ({ data: wizyta.data!, typ: 'Wizyta', tytul: wizyta.nazwa, opis: wizyta.status.replaceAll('_', ' '), adres: `/zdrowie/wizyty?element=${wizyta.id}` })),
    ...skierowania.map((skierowanie) => ({ data: skierowanie.dataWystawienia, typ: 'Skierowanie', tytul: skierowanie.nazwa, opis: skierowanie.status.replaceAll('_', ' '), adres: `/zdrowie/skierowania?element=${skierowanie.id}` })),
    ...recepty.map((recepta) => ({ data: recepta.dataWystawienia, typ: 'Recepta', tytul: recepta.kod ? `Recepta ${recepta.kod}` : 'Recepta', opis: recepta.status.replaceAll('_', ' '), adres: `/zdrowie/recepty?element=${recepta.id}` })),
    ...terapie.filter((terapia) => terapia.dataRozpoczecia).map((terapia) => ({ data: terapia.dataRozpoczecia!, typ: 'Terapia', tytul: terapia.nazwa, opis: terapia.status.replaceAll('_', ' '), adres: `/zdrowie/dziennik-terapii?element=${terapia.id}` })),
    ...wpisy.map((wpis) => ({ data: wpis.dataCzas.slice(0, 10), typ: 'Wpis terapii', tytul: wpis.tytul || 'Wpis terapii', opis: wpis.tresc, adres: '/zdrowie/dziennik-terapii' })),
  ].sort((a, b) => b.data.localeCompare(a.data))
  return <div className="widok"><NaglowekWidoku tytul="Historia zdrowia" opis="Chronologiczny widok zdarzeń z istniejących danych." />{zdarzenia.length === 0 ? <PustyStan tytul="Brak zdarzeń zdrowotnych" opis="Dodaj wizytę, skierowanie, receptę lub terapię." /> : <div className="lista-rekordow">{zdarzenia.map((zdarzenie, indeks) => <article className="rekord" key={`${zdarzenie.typ}-${indeks}`}><div className="rekord__tresc"><h3><Link to={zdarzenie.adres}>{zdarzenie.tytul}</Link></h3><div className="rekord__szczegoly"><Znacznik wariant="informacja">{zdarzenie.typ}</Znacznik><span>{zdarzenie.data}</span><span>{zdarzenie.opis}</span></div></div></article>)}</div>}</div>
}
