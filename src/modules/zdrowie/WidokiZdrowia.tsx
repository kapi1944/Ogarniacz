import { EdytorPolaRejestru, normalizujStarePolaRejestru, type DefinicjaPola } from '../../components/EdytorPolaRejestru'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BellPlus, CalendarClock, ClipboardList, Edit3, FileText, History, Pill, Plus, ScanLine, ShieldAlert, Stethoscope, Trash2 } from 'lucide-react'
import { WidokRejestru } from '../../components/WidokRejestru'
import { Karta, Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import type { Repozytorium } from '../../data/Repozytorium'
import { dzisiajIso, noweId, terazIso, utworzMetadane } from '../../domain/fabryki'
import type { DawkaLeku, JednostkaLeku, Lek, PozycjaRecepty, PostacLeku, Przypomnienie, Recepta, Skierowanie, Terapia, UstawieniaHarmonogramu, Wizyta } from '../../domain/typy'
import { usePodswietlenie } from '../../hooks/usePodswietlenie'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { dawkiLeku, dawkiZaplanowaneNaDzien, generujDawkiDnia, proponujGodzinyDawek, przewidywanaDataWyczerpania, stanApteczki, zapiszLekZDodanymZapasem, zapiszStatusDawkiZApteczka } from '../../services/LekiService'
import { ocrLekow } from '../../services/LekiOcrService'
import type { WynikOcrLeku } from '../../services/LekiOcrParser'
import { zapiszPowiazanePrzypomnienie } from '../../services/PrzypomnieniaService'
import { utworzZadanie } from '../../services/ZadaniaService'
import { useAplikacja } from '../../app/KontekstAplikacji'

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

interface SzkicLeku {
  nazwa: string
  postac: PostacLeku
  jednostka: JednostkaLeku
  moc: string
  dodawanyZapas: string
  dataOtwarcia: string
  dataOd: string
  dataDo: string
  trybHarmonogramu: 'codziennie' | 'wybrane_dni' | 'co_x_dni'
  dniTygodnia: string
  coIleDni: string
  dodatkoweInstrukcje: string
  aktywny: boolean
  trybDawkowania: 'konkretne_godziny' | 'razy_dziennie' | 'co_x_godzin'
  liczbaDawekDziennie: string
  oknoAktywnosciOd: string
  oknoAktywnosciDo: string
  interwalGodzin: string
  pierwszaGodzina: string
  dawki: DawkaLeku[]
}

const postacieLekow: { wartosc: PostacLeku; etykieta: string; domyslnaJednostka: JednostkaLeku }[] = [
  ['tabletka', 'Tabletka', 'szt.'], ['tabletka_powlekana', 'Tabletka powlekana', 'szt.'], ['kapsulka', 'Kapsułka', 'szt.'], ['syrop', 'Syrop', 'ml'], ['zawiesina', 'Zawiesina', 'ml'], ['krople', 'Krople', 'kropla'], ['aerozol', 'Aerozol', 'rozpylenie'], ['inhalacja', 'Inhalacja', 'dawka'], ['saszetka', 'Saszetka', 'szt.'], ['proszek', 'Proszek', 'g'], ['roztwor', 'Roztwór', 'ml'], ['masc', 'Maść', 'g'], ['krem', 'Krem', 'g'], ['zel', 'Żel', 'g'], ['czopek', 'Czopek', 'szt.'], ['plaster', 'Plaster', 'szt.'], ['ampulka', 'Ampułka', 'szt.'], ['fiolka', 'Fiolka', 'szt.'], ['inna', 'Inna', 'szt.'],
].map(([wartosc, etykieta, domyslnaJednostka]) => ({ wartosc: wartosc as PostacLeku, etykieta, domyslnaJednostka: domyslnaJednostka as JednostkaLeku }))
const jednostkiLekow: { wartosc: JednostkaLeku; etykieta: string }[] = [['szt.', 'szt.'], ['ml', 'ml'], ['mg', 'mg'], ['g', 'g'], ['kropla', 'kropla'], ['rozpylenie', 'rozpylenie'], ['dawka', 'dawka'], ['inna', 'inna']].map(([wartosc, etykieta]) => ({ wartosc: wartosc as JednostkaLeku, etykieta }))

function jednostkaLeku(lek: Lek): string | undefined { return lek.jednostka ?? lek.jednostkaLubPostac }

function nowaDawka(godzina = '08:00'): DawkaLeku {
  return { id: noweId(), godzina, ilosc: 1, instrukcja: '' }
}

function utworzSzkicLeku(lek: Lek | undefined, harmonogram: UstawieniaHarmonogramu): SzkicLeku {
  const dawki = lek ? dawkiLeku(lek).map((dawka) => ({ ...dawka })) : [nowaDawka()]
  return {
    nazwa: lek?.nazwa ?? '',
    postac: lek?.postac ?? 'inna',
    jednostka: lek?.jednostka ?? 'szt.',
    moc: lek?.moc ?? '',
    dodawanyZapas: '',
    dataOtwarcia: lek?.dataOtwarcia ?? '',
    dataOd: lek?.dataOd ?? '',
    dataDo: lek?.dataDo ?? '',
    trybHarmonogramu: lek?.coIleDni ? 'co_x_dni' : lek?.dniTygodnia?.length ? 'wybrane_dni' : 'codziennie',
    dniTygodnia: lek?.dniTygodnia?.join(', ') ?? '',
    coIleDni: lek?.coIleDni ? String(lek.coIleDni) : '',
    dodatkoweInstrukcje: lek?.dodatkoweInstrukcje ?? '',
    aktywny: lek?.aktywny ?? true,
    trybDawkowania: lek?.trybDawkowania ?? 'konkretne_godziny',
    liczbaDawekDziennie: lek?.liczbaDawekDziennie ? String(lek.liczbaDawekDziennie) : String(dawki.length),
    oknoAktywnosciOd: lek?.oknoAktywnosciOd ?? harmonogram.koniecSnu,
    oknoAktywnosciDo: lek?.oknoAktywnosciDo ?? harmonogram.poczatekSnu,
    interwalGodzin: lek?.interwalGodzin ? String(lek.interwalGodzin) : '8',
    pierwszaGodzina: lek?.pierwszaGodzina ?? dawki[0]?.godzina ?? '08:00',
    dawki,
  }
}

function zapisanyLek(szkic: SzkicLeku, istniejacy?: Lek): Lek {
  const dawkiDoSprawdzenia = szkic.trybDawkowania === 'co_x_godzin' ? szkic.dawki.slice(0, 1) : szkic.dawki
  if (dawkiDoSprawdzenia.some((dawka) => typeof dawka.ilosc !== 'number' || !Number.isFinite(dawka.ilosc) || dawka.ilosc <= 0)) throw new Error('Uzupełnij dodatnią ilość każdej dawki.')
  const dawki = dawkiDoSprawdzenia
    .filter((dawka) => /^\d{2}:\d{2}$/.test(dawka.godzina))
    .sort((a, b) => a.godzina.localeCompare(b.godzina))
  if (!szkic.nazwa.trim()) throw new Error('Podaj nazwę leku.')
  if (szkic.trybDawkowania !== 'co_x_godzin' && dawki.length === 0) throw new Error('Dodaj co najmniej jedną dawkę.')
  if (szkic.trybDawkowania === 'co_x_godzin' && (!Number(szkic.interwalGodzin) || !/^\d{2}:\d{2}$/.test(szkic.pierwszaGodzina) || dawki.length === 0)) throw new Error('Podaj interwał, godzinę pierwszej dawki i jej ilość.')
  const dawkaGlowna = dawki[0] ?? nowaDawka(szkic.pierwszaGodzina)
  const dawkiDoZapisu = szkic.trybDawkowania === 'co_x_godzin' ? [{ ...dawkaGlowna, godzina: szkic.pierwszaGodzina }] : dawki
  return {
    ...(istniejacy ?? utworzMetadane()),
    nazwa: szkic.nazwa.trim(),
    dawkaInstrukcja: dawkiDoZapisu[0]?.instrukcja?.trim() || istniejacy?.dawkaInstrukcja || 'Instrukcja wpisana przez użytkownika',
    godziny: dawkiDoZapisu.map((dawka) => dawka.godzina),
    dawki: dawkiDoZapisu,
    trybDawkowania: szkic.trybDawkowania,
    liczbaDawekDziennie: szkic.trybDawkowania === 'razy_dziennie' ? Math.max(1, Number(szkic.liczbaDawekDziennie)) : undefined,
    oknoAktywnosciOd: szkic.trybDawkowania === 'razy_dziennie' ? szkic.oknoAktywnosciOd : undefined,
    oknoAktywnosciDo: szkic.trybDawkowania === 'razy_dziennie' ? szkic.oknoAktywnosciDo : undefined,
    interwalGodzin: szkic.trybDawkowania === 'co_x_godzin' ? Math.max(1, Number(szkic.interwalGodzin)) : undefined,
    pierwszaGodzina: szkic.trybDawkowania === 'co_x_godzin' ? szkic.pierwszaGodzina : undefined,
    postac: szkic.postac,
    jednostka: szkic.jednostka,
    moc: szkic.moc.trim() || undefined,
    jednostkaLubPostac: szkic.jednostka,
    dniTygodnia: szkic.trybHarmonogramu === 'wybrane_dni' ? szkic.dniTygodnia.split(',').map(Number).filter((dzien) => Number.isInteger(dzien) && dzien >= 0 && dzien <= 6) : undefined,
    coIleDni: szkic.trybHarmonogramu === 'co_x_dni' ? Math.max(1, Number(szkic.coIleDni)) : undefined,
    dataOd: szkic.dataOd || (szkic.trybDawkowania === 'co_x_godzin' ? dzisiajIso() : undefined),
    dataDo: szkic.dataDo || undefined,
    zapasJednostek: istniejacy?.zapasJednostek,
    zuzycieNaDawke: dawkiDoZapisu[0]?.ilosc,
    dataOtwarcia: szkic.dataOtwarcia || undefined,
    dodatkoweInstrukcje: szkic.dodatkoweInstrukcje.trim() || undefined,
    aktywny: szkic.aktywny,
    updatedAt: terazIso(),
  }
}

function FormularzDawkowania({ szkic, ustawSzkic }: { szkic: SzkicLeku; ustawSzkic: (szkic: SzkicLeku) => void }) {
  const aktualizujDawke = (id: string, zmiany: Partial<DawkaLeku>) => ustawSzkic({ ...szkic, dawki: szkic.dawki.map((dawka) => dawka.id === id ? { ...dawka, ...zmiany } : dawka) })
  const dawkaInterwalowa = szkic.dawki[0] ?? nowaDawka(szkic.pierwszaGodzina)
  const pokazListe = szkic.trybDawkowania !== 'co_x_godzin'
  const wynikInterwalu = Number(szkic.interwalGodzin) > 0 && /^\d{2}:\d{2}$/.test(szkic.pierwszaGodzina)
    ? Array.from({ length: Math.ceil(24 / Number(szkic.interwalGodzin)) }, (_, indeks) => {
      const [godziny, minuty] = szkic.pierwszaGodzina.split(':').map(Number)
      const razem = godziny * 60 + minuty + indeks * Number(szkic.interwalGodzin) * 60
      return `${String(Math.floor((razem % 1440) / 60)).padStart(2, '0')}:${String(razem % 60).padStart(2, '0')}`
    })
    : []
  return <fieldset className="pole--pelne"><legend>Dawkowanie</legend>
    <label className="pole"><span>Tryb</span><select value={szkic.trybDawkowania} onChange={(e) => ustawSzkic({ ...szkic, trybDawkowania: e.target.value as SzkicLeku['trybDawkowania'] })}><option value="konkretne_godziny">Konkretne godziny</option><option value="razy_dziennie">X razy dziennie</option><option value="co_x_godzin">Co X godzin</option></select></label>
    {szkic.trybDawkowania === 'razy_dziennie' && <div className="formularz"><label className="pole"><span>Liczba dawek dziennie</span><input type="number" min="1" value={szkic.liczbaDawekDziennie} onChange={(e) => ustawSzkic({ ...szkic, liczbaDawekDziennie: e.target.value })} /></label><label className="pole"><span>Aktywność od</span><input type="time" value={szkic.oknoAktywnosciOd} onChange={(e) => ustawSzkic({ ...szkic, oknoAktywnosciOd: e.target.value })} /></label><label className="pole"><span>do</span><input type="time" value={szkic.oknoAktywnosciDo} onChange={(e) => ustawSzkic({ ...szkic, oknoAktywnosciDo: e.target.value })} /></label><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => { const godziny = proponujGodzinyDawek(Number(szkic.liczbaDawekDziennie), szkic.oknoAktywnosciOd, szkic.oknoAktywnosciDo); ustawSzkic({ ...szkic, dawki: godziny.map((godzina, indeks) => ({ id: szkic.dawki[indeks]?.id ?? noweId(), godzina, ilosc: szkic.dawki[indeks]?.ilosc ?? 1, instrukcja: szkic.dawki[indeks]?.instrukcja ?? '' })) }) }}>Wygeneruj propozycję godzin</button><p className="tekst-pomocniczy">To tylko edytowalna pomoc w rozłożeniu godzin, nie zalecenie medyczne.</p></div>}
    {szkic.trybDawkowania === 'co_x_godzin' && <div className="formularz"><label className="pole"><span>Co ile godzin</span><input type="number" min="1" value={szkic.interwalGodzin} onChange={(e) => ustawSzkic({ ...szkic, interwalGodzin: e.target.value })} /></label><label className="pole"><span>Pierwsza dawka</span><input type="time" value={szkic.pierwszaGodzina} onChange={(e) => ustawSzkic({ ...szkic, pierwszaGodzina: e.target.value, dawki: [{ ...dawkaInterwalowa, godzina: e.target.value }] })} /></label><label className="pole"><span>Ilość / zużycie</span><input type="number" min="0.01" step="0.01" value={dawkaInterwalowa.ilosc ?? ''} onChange={(e) => ustawSzkic({ ...szkic, dawki: [{ ...dawkaInterwalowa, ilosc: e.target.value ? Number(e.target.value) : undefined }] })} /></label><label className="pole pole--pelne"><span>Instrukcja dawki (opcjonalna)</span><input value={dawkaInterwalowa.instrukcja ?? ''} onChange={(e) => ustawSzkic({ ...szkic, dawki: [{ ...dawkaInterwalowa, instrukcja: e.target.value }] })} /></label><p className="tekst-pomocniczy">Wynik w pierwszych 24 godzinach: {wynikInterwalu.join(', ') || 'uzupełnij interwał'}. Kolejne wystąpienia są liczone według interwału, także w nocy, jeśli z niego wynikają.</p></div>}
    {pokazListe && <div className="lista-dawek">{szkic.dawki.map((dawka) => <div key={dawka.id}><input aria-label="Godzina dawki" type="time" value={dawka.godzina} onChange={(e) => aktualizujDawke(dawka.id, { godzina: e.target.value })} /><input aria-label="Ilość dawki" type="number" min="0.01" step="0.01" value={dawka.ilosc ?? ''} onChange={(e) => aktualizujDawke(dawka.id, { ilosc: e.target.value ? Number(e.target.value) : undefined })} /><input aria-label="Instrukcja dawki" placeholder="Instrukcja (opcjonalna)" value={dawka.instrukcja ?? ''} onChange={(e) => aktualizujDawke(dawka.id, { instrukcja: e.target.value })} /><button type="button" className="przycisk-ikona przycisk-ikona--niebezpieczny" title="Usuń dawkę" onClick={() => ustawSzkic({ ...szkic, dawki: szkic.dawki.filter((element) => element.id !== dawka.id) })}><Trash2 aria-hidden="true" /></button></div>)}</div>}
    {pokazListe && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawSzkic({ ...szkic, dawki: [...szkic.dawki, nowaDawka()] })}><Plus aria-hidden="true" />Dodaj dawkę</button>}
  </fieldset>
}

function PodgladOcrLeku({ wynik, ustawWynik, zatwierdz, anuluj }: { wynik: WynikOcrLeku; ustawWynik: (wynik: WynikOcrLeku) => void; zatwierdz: () => void; anuluj: () => void }) {
  const pewnosc = (pewne: boolean) => pewne ? 'rozpoznano pewnie' : 'wymaga sprawdzenia'
  return <Modal tytul="Podgląd skanu opakowania" zamknij={anuluj}><div className="formularz">
    <p className="tekst-pomocniczy">Sprawdź i popraw dane przed uzupełnieniem formularza. Moc preparatu nie zmienia dawkowania.</p>
    <label className="pole"><span>Nazwa — {pewnosc(wynik.nazwa.pewne)}</span><input value={wynik.nazwa.wartosc ?? ''} onChange={(e) => ustawWynik({ ...wynik, nazwa: { wartosc: e.target.value || undefined, pewne: false } })} /></label>
    <label className="pole"><span>Moc — {pewnosc(wynik.moc.pewne)}</span><input value={wynik.moc.wartosc ?? ''} onChange={(e) => ustawWynik({ ...wynik, moc: { wartosc: e.target.value || undefined, pewne: false } })} /></label>
    <label className="pole"><span>Postać — {pewnosc(wynik.postac.pewne)}</span><select value={wynik.postac.wartosc ?? 'inna'} onChange={(e) => ustawWynik({ ...wynik, postac: { wartosc: e.target.value as PostacLeku, pewne: false } })}>{postacieLekow.map((postac) => <option key={postac.wartosc} value={postac.wartosc}>{postac.etykieta}</option>)}</select></label>
    <label className="pole"><span>Liczba jednostek w opakowaniu — {pewnosc(wynik.opakowanie.pewne)}</span><input type="number" min="0" step="0.01" value={wynik.opakowanie.wartosc?.ilosc ?? ''} onChange={(e) => { const ilosc = Number(e.target.value); ustawWynik({ ...wynik, opakowanie: { wartosc: Number.isFinite(ilosc) && ilosc > 0 ? { ilosc, jednostka: wynik.opakowanie.wartosc?.jednostka ?? 'szt.' } : undefined, pewne: false } }) }} /></label>
    <label className="pole"><span>Jednostka opakowania</span><select value={wynik.opakowanie.wartosc?.jednostka ?? 'szt.'} onChange={(e) => ustawWynik({ ...wynik, opakowanie: { wartosc: { ilosc: wynik.opakowanie.wartosc?.ilosc ?? 0, jednostka: e.target.value as JednostkaLeku }, pewne: false } })}>{jednostkiLekow.map((jednostka) => <option key={jednostka.wartosc} value={jednostka.wartosc}>{jednostka.etykieta}</option>)}</select></label>
    <details className="pole--pelne"><summary>Rozpoznany tekst</summary><pre>{wynik.surowyTekst || 'Brak tekstu rozpoznanego przez OCR.'}</pre></details>
    <div className="akcje-formularza pole--pelne"><button type="button" className="przycisk przycisk--drugorzedny" onClick={anuluj}>Anuluj</button><button type="button" className="przycisk przycisk--glowny" onClick={zatwierdz}>Uzupełnij formularz</button></div>
  </div></Modal>
}

function RejestrLekow({ leki, repozytorium, wybranyElementId, harmonogram }: { leki: Lek[]; repozytorium: Repozytorium<Lek>; wybranyElementId?: string; harmonogram: UstawieniaHarmonogramu }) {
  const [edytowany, ustawEdytowany] = useState<Lek>()
  const [szkic, ustawSzkic] = useState(() => utworzSzkicLeku(undefined, harmonogram))
  const [otwarty, ustawOtwarty] = useState(false)
  const [blad, ustawBlad] = useState('')
  const [wynikOcr, ustawWynikOcr] = useState<WynikOcrLeku>()
  const [skanowanie, ustawSkanowanie] = useState(false)
  const [doUsuniecia, ustawDoUsuniecia] = useState<Lek>()
  const otworz = (lek?: Lek) => { ustawEdytowany(lek); ustawSzkic(utworzSzkicLeku(lek, harmonogram)); ustawBlad(''); ustawOtwarty(true) }
  const skanujOpakowanie = async () => {
    try {
      ustawSkanowanie(true)
      ustawWynikOcr(await ocrLekow.zeskanujOpakowanie())
    } catch (przyczyna) {
      ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się zeskanować opakowania.')
    } finally {
      ustawSkanowanie(false)
    }
  }
  const zatwierdzSkan = () => {
    if (!wynikOcr) return
    const postac = wynikOcr.postac.wartosc
    const jednostka = wynikOcr.opakowanie.wartosc?.jednostka ?? (postac ? postacieLekow.find((element) => element.wartosc === postac)?.domyslnaJednostka : undefined) ?? szkic.jednostka
    ustawSzkic({ ...szkic, nazwa: wynikOcr.nazwa.wartosc ?? szkic.nazwa, moc: wynikOcr.moc.wartosc ?? szkic.moc, postac: postac ?? szkic.postac, jednostka, dodawanyZapas: wynikOcr.opakowanie.wartosc ? String(wynikOcr.opakowanie.wartosc.ilosc) : szkic.dodawanyZapas })
    ustawWynikOcr(undefined)
  }
  useEffect(() => { const lek = leki.find((element) => element.id === wybranyElementId); if (lek && !otwarty) otworz(lek) }, [wybranyElementId, leki, otwarty])
  const data = dzisiajIso()
  const poleLeku = (klucz: Exclude<keyof SzkicLeku, 'dawki'>, etykieta: string, opcje: Omit<DefinicjaPola, 'klucz' | 'etykieta'> = {}) => {
    const [pole] = normalizujStarePolaRejestru([{ klucz, etykieta, ...opcje }])
    return <EdytorPolaRejestru pole={pole} wartosc={String(szkic[klucz])} zmien={(wartosc) => ustawSzkic({ ...szkic, [klucz]: klucz === 'aktywny' ? wartosc === 'true' : wartosc })} />
  }

  return <section className="widok"><NaglowekWidoku tytul="Harmonogramy leków" opis="Jeden lek może zawierać wiele dawek. Dezaktywacja zachowuje historię." akcje={<button type="button" className="przycisk przycisk--glowny" onClick={() => otworz()}><Plus aria-hidden="true" />Dodaj lek</button>} />
    {leki.length === 0 ? <PustyStan tytul="Brak leków" opis="Dodaj lek i jego dawkowanie." akcja={<button type="button" className="przycisk przycisk--glowny" onClick={() => otworz()}>Dodaj lek</button>} /> : <div className="lista-rekordow">{leki.map((lek) => <article className="rekord" key={lek.id} data-element-id={lek.id}><div className="rekord__tresc"><h3>{lek.nazwa}</h3><div className="rekord__szczegoly"><Znacznik wariant={lek.aktywny ? 'sukces' : 'neutralny'}>{lek.aktywny ? 'aktywny' : 'nieaktywny'}</Znacznik>{lek.moc && <span>{lek.moc}</span>}<span>{lek.postac ?? lek.jednostkaLubPostac ?? 'postać nieuzupełniona'}</span><span>{dawkiZaplanowaneNaDzien(lek, data).map((dawka) => `${dawka.godzina} — ${dawka.ilosc ?? 'uzupełnij ilość'}${dawka.ilosc !== undefined && jednostkaLeku(lek) ? ` ${jednostkaLeku(lek)}` : ''}`).join(', ') || 'brak dawek'}</span>{stanApteczki(lek) !== undefined && <span>Apteczka: {stanApteczki(lek)} {jednostkaLeku(lek)}; przewidywane wyczerpanie: {przewidywanaDataWyczerpania(lek, data) ?? 'uzupełnij zużycie'}</span>}{lek.dodatkoweInstrukcje && <p>{lek.dodatkoweInstrukcje}</p>}</div></div><div className="rekord__akcje"><button type="button" className="przycisk-ikona" title="Edytuj" onClick={() => otworz(lek)}><Edit3 aria-hidden="true" /></button><button type="button" className="przycisk-ikona przycisk-ikona--niebezpieczny" title="Usuń" onClick={() => ustawDoUsuniecia(lek)}><Trash2 aria-hidden="true" /></button></div></article>)}</div>}
    {otwarty && <Modal tytul={edytowany ? 'Edytuj lek' : 'Dodaj lek'} zamknij={() => ustawOtwarty(false)}><form className="formularz" onSubmit={async (e) => { e.preventDefault(); try { await zapiszLekZDodanymZapasem(zapisanyLek(szkic, edytowany), szkic.dodawanyZapas === '' ? undefined : Number(szkic.dodawanyZapas)); ustawOtwarty(false) } catch (przyczyna) { ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się zapisać leku.') } }}>
      {blad && <Komunikat typ="blad">{blad}</Komunikat>}{ocrLekow.czyDostepny() && <button type="button" className="przycisk przycisk--drugorzedny" disabled={skanowanie} onClick={() => void skanujOpakowanie()}><ScanLine aria-hidden="true" />{skanowanie ? 'Skanowanie…' : 'Skanuj opakowanie'}</button>}<fieldset className="pole--pelne"><legend>Dane leku</legend>{poleLeku('nazwa', 'Nazwa', { wymagane: true })}<label className="pole"><span>Postać leku</span><select value={szkic.postac} onChange={(e) => { const postac = e.target.value as PostacLeku; ustawSzkic({ ...szkic, postac, jednostka: postacieLekow.find((element) => element.wartosc === postac)?.domyslnaJednostka ?? szkic.jednostka }) }}>{postacieLekow.map((postac) => <option key={postac.wartosc} value={postac.wartosc}>{postac.etykieta}</option>)}</select></label><label className="pole"><span>Jednostka dawkowania / zapasu</span><select value={szkic.jednostka} onChange={(e) => ustawSzkic({ ...szkic, jednostka: e.target.value as JednostkaLeku })}>{jednostkiLekow.map((jednostka) => <option key={jednostka.wartosc} value={jednostka.wartosc}>{jednostka.etykieta}</option>)}</select></label>{poleLeku('moc', 'Moc (opcjonalnie)', { podpowiedz: 'np. 500 mg' })}<fieldset className="pole--pelne"><legend>Apteczka / zapas</legend>{edytowany && stanApteczki(edytowany) !== undefined && <p className="tekst-pomocniczy">Aktualny stan: {stanApteczki(edytowany)} {jednostkaLeku(edytowany)}</p>}<label className="pole"><span>{edytowany ? 'Dodaj zapas' : 'Zapas początkowy'}</span><input type="number" min="0" step="0.01" value={szkic.dodawanyZapas} onChange={(e) => ustawSzkic({ ...szkic, dodawanyZapas: e.target.value })} /></label>{poleLeku('dataOtwarcia', 'Data otwarcia', { typ: 'date' })}</fieldset>{poleLeku('dataOd', 'Okres od', { typ: 'date' })}{poleLeku('dataDo', 'do', { typ: 'date' })}<label className="pole"><span>Harmonogram dni</span><select value={szkic.trybHarmonogramu} onChange={(e) => ustawSzkic({ ...szkic, trybHarmonogramu: e.target.value as SzkicLeku['trybHarmonogramu'] })}><option value="codziennie">Codziennie</option><option value="wybrane_dni">Wybrane dni</option><option value="co_x_dni">Co X dni</option></select></label>{szkic.trybHarmonogramu === 'wybrane_dni' && poleLeku('dniTygodnia', 'Dni tygodnia (0–6)', { podpowiedz: 'np. 1, 3, 5' })}{szkic.trybHarmonogramu === 'co_x_dni' && poleLeku('coIleDni', 'Co ile dni', { typ: 'number', min: 1 })}{poleLeku('dodatkoweInstrukcje', 'Dodatkowe instrukcje', { typ: 'textarea' })}<label className="pole"><span>Stan</span><select value={String(szkic.aktywny)} onChange={(e) => ustawSzkic({ ...szkic, aktywny: e.target.value === 'true' })}><option value="true">Aktywny</option><option value="false">Nieaktywny</option></select></label></fieldset><FormularzDawkowania szkic={szkic} ustawSzkic={ustawSzkic} /><div className="akcje-formularza pole--pelne"><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawOtwarty(false)}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny">Zapisz</button></div></form></Modal>}
    {wynikOcr && <PodgladOcrLeku wynik={wynikOcr} ustawWynik={ustawWynikOcr} zatwierdz={zatwierdzSkan} anuluj={() => ustawWynikOcr(undefined)} />}
    {doUsuniecia && <ModalPotwierdzenia tytul="Usunąć lek?" opis={`Lek „${doUsuniecia.nazwa}” zniknie z bieżących danych, a historia pozostanie lokalnie zachowana.`} etykietaAkcji="Usuń" niebezpieczne anuluj={() => ustawDoUsuniecia(undefined)} potwierdz={async () => { await repozytorium.usun(doUsuniecia.id); ustawDoUsuniecia(undefined) }} />}
  </section>
}

export function WidokLekow() {
  const [parametryAdresu] = useSearchParams()
  const { ustawienia } = useAplikacja()
  const { dane: leki, repozytorium } = useRepozytorium('leki')
  const { dane: wpisy } = useRepozytorium('dziennikLekow')
  const [historia, ustawHistorie] = useState(false)
  const data = dzisiajIso()
  const dawki = generujDawkiDnia(leki, wpisy, data)

  return <div className="widok">
    <NaglowekWidoku tytul="Leki" opis="Harmonogram i historia świadomych reakcji na dawki wpisane przez użytkownika." akcje={<button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawHistorie(!historia)}><History aria-hidden="true" />{historia ? 'Ukryj historię' : 'Historia'}</button>} />
    <Karta klasa="karta-bezpieczenstwa"><ShieldAlert aria-hidden="true" /><div><strong>Ogarniacz nie udziela porad medycznych.</strong><p>Nie dobiera leków ani dawek i nie zmienia zaleceń. Przechowuje wyłącznie informacje wpisane przez użytkownika.</p></div></Karta>
    <Karta>
      <h2>Dzisiejsze dawki</h2>
      {dawki.length === 0 ? <PustyStan tytul="Brak aktywnych dawek" opis="Dodaj lek i co najmniej jedną dawkę." /> : <div className="lista-dawek lista-dawek--duza">{dawki.map((dawka) => <div key={dawka.idWystapienia}><time>{dawka.planowanaGodzina}</time><div><strong>{dawka.lek.nazwa}</strong><small>{dawka.dawka.instrukcja || (dawka.dawka.ilosc !== undefined ? `${dawka.dawka.ilosc}${jednostkaLeku(dawka.lek) ? ` ${jednostkaLeku(dawka.lek)}` : ''}` : 'Uzupełnij ilość dawki')}</small></div><select aria-label={`Status ${dawka.lek.nazwa} ${dawka.planowanaGodzina}`} value={dawka.status} onChange={async (e) => { try { await zapiszStatusDawkiZApteczka(dawka, e.target.value as typeof dawka.status) } catch (przyczyna) { window.alert(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się zapisać statusu dawki.') } }}><option value="oczekuje">Oczekuje</option><option value="zazyte">Zażyte</option><option value="odroczone">Odroczone</option><option value="pominiete">Pominięte</option></select></div>)}</div>}
    </Karta>
    {historia && <Karta><h2>Historia reakcji</h2>{wpisy.length === 0 ? <p className="tekst-pomocniczy">Brak zapisanych reakcji.</p> : <div className="tabela-przewijana"><table><thead><tr><th>Data</th><th>Godzina</th><th>Lek</th><th>Status</th><th>Reakcja</th></tr></thead><tbody>{[...wpisy].sort((a, b) => b.data.localeCompare(a.data)).map((wpis) => <tr key={wpis.id}><td>{wpis.data}</td><td>{wpis.planowanaGodzina}</td><td>{leki.find((lek) => lek.id === wpis.lekId)?.nazwa ?? 'Usunięty lek'}</td><td><Znacznik wariant={wpis.status === 'zazyte' ? 'sukces' : wpis.status === 'pominiete' ? 'blad' : 'ostrzezenie'}>{wpis.status}</Znacznik></td><td>{wpis.reakcjaAt ? new Date(wpis.reakcjaAt).toLocaleString('pl-PL') : '—'}</td></tr>)}</tbody></table></div>}</Karta>}
    <RejestrLekow leki={leki} repozytorium={repozytorium} wybranyElementId={parametryAdresu.get('element') ?? undefined} harmonogram={ustawienia.harmonogram} />
  </div>
}

export function WidokWizyt() {
  const [parametryAdresu] = useSearchParams()
  const { dane: wizyty, repozytorium } = useRepozytorium('wizyty')
  const { dane: kontakty } = useRepozytorium('kontakty')
  const { dane: dokumenty } = useRepozytorium('dokumenty')
  const { dane: skierowania } = useRepozytorium('skierowania')
  const { dane: notatki } = useRepozytorium('notatki')
  const { repozytorium: repoZadan } = useRepozytorium('zadania')
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
        { klucz: 'skierowanieId', etykieta: 'Skierowanie', typ: 'select', opcje: skierowania.map((x) => ({ wartosc: x.id, etykieta: x.nazwa })) },
        { klucz: 'dokumentyNazwy', etykieta: 'Dokumenty', podpowiedz: dokumenty.map((x) => x.nazwa).join(', ') || 'brak dokumentów' },
        { klucz: 'notatkaPrzed', etykieta: 'Notatki przed wizytą', typ: 'textarea' },
        { klucz: 'notatkaPo', etykieta: 'Notatka po wizycie', typ: 'textarea' },
        { klucz: 'pytania', etykieta: 'Pytania', podpowiedz: 'oddzielone przecinkami' },
        { klucz: 'checklista', etykieta: 'Rzeczy do zabrania', podpowiedz: 'oddzielone przecinkami' },
      ]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), status: (formularz.status || 'do_umowienia') as Wizyta['status'], terminGraniczny: formularz.terminGraniczny || undefined, data: formularz.data || undefined, godzina: formularz.godzina || undefined, miejsce: formularz.miejsce || undefined, lekarzPlacowka: formularz.lekarzPlacowka || undefined, kontaktId: formularz.kontaktId || undefined, skierowanieId: formularz.skierowanieId || undefined, notatka: formularz.notatkaPrzed ?? '', notatkaPrzed: formularz.notatkaPrzed || undefined, notatkaPo: formularz.notatkaPo || undefined, pytania: formularz.pytania.split(',').map((x) => x.trim()).filter(Boolean), checklista: formularz.checklista.split(',').map((x) => x.trim()).filter(Boolean), dokumentyIds: formularz.dokumentyNazwy.split(',').map((n) => dokumenty.find((d) => d.nazwa.toLocaleLowerCase('pl') === n.trim().toLocaleLowerCase('pl'))?.id).filter((id): id is string => Boolean(id)), updatedAt: terazIso() })}
      uzupelnijFormularz={(wizyta) => ({ dokumentyNazwy: wizyta.dokumentyIds.map((id) => dokumenty.find((x) => x.id === id)?.nazwa).filter(Boolean).join(', '), notatkaPrzed: wizyta.notatkaPrzed ?? wizyta.notatka, notatkaPo: wizyta.notatkaPo ?? '' })}
      etykieta={(wizyta) => wizyta.nazwa}
      wybranyElementId={parametryAdresu.get('element') ?? undefined}
      szczegoly={(wizyta) => <><Znacznik wariant={wizyta.status === 'odbyta' ? 'sukces' : wizyta.status === 'do_umowienia' ? 'ostrzezenie' : 'informacja'}>{wizyta.status.replaceAll('_', ' ')}</Znacznik>{wizyta.data && <span>{wizyta.data} {wizyta.godzina}</span>}{wizyta.terminGraniczny && <span>Umów do: {wizyta.terminGraniczny}</span>}{wizyta.miejsce && <span>{wizyta.miejsce}</span>}{wizyta.kontaktId && <span>Lekarz/kontakt: {kontakty.find((x) => x.id === wizyta.kontaktId)?.nazwa}</span>}{wizyta.skierowanieId && <span>Skierowanie: {skierowania.find((x) => x.id === wizyta.skierowanieId)?.nazwa}</span>}{wizyta.dokumentyIds.length > 0 && <span>Dokumenty: {wizyta.dokumentyIds.map((id) => dokumenty.find((x) => x.id === id)?.nazwa).filter(Boolean).join(', ')}</span>}{wizyta.pytania.length > 0 && <span>Pytania: {wizyta.pytania.join(', ')}</span>}{wizyta.checklista.length > 0 && <span>Przygotowanie: {wizyta.checklista.join(', ')}</span>}{wizyta.notatkaPrzed && <p>Przed wizytą: {wizyta.notatkaPrzed}</p>}{wizyta.notatkaPo && <p>Po wizycie: {wizyta.notatkaPo}</p>}<span>Powiązane notatki: {notatki.filter((x) => x.powiazania.some((p) => p.typ === 'wizyty' && p.id === wizyta.id)).map((x) => x.tytul).join(', ') || 'brak'}</span></>}
      akcje={(wizyta) => <><button type="button" className="przycisk-ikona" title="Dodaj przypomnienie dzień wcześniej" onClick={() => dodajPrzypomnienie(wizyta)}><BellPlus aria-hidden="true" /></button>{wizyta.status === 'odbyta' && <button type="button" className="przycisk przycisk--maly" onClick={() => repoZadan.zapisz(utworzZadanie({ tytul: `Follow-up po wizycie: ${wizyta.nazwa}`, opis: wizyta.notatkaPo ?? '', priorytet: 'normalny' }))}>Utwórz follow-up</button>}</>}
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
