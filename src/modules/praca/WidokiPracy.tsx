import { useState } from 'react'
import { Check, RotateCcw, Share2, Undo2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { WidokRejestru } from '../../components/WidokRejestru'
import { RejestrPoczekalni } from '../../components/RejestrPoczekalni'
import { Komunikat, Znacznik } from '../../components/Interfejs'
import { noweId, dzisiajIso, terazIso, utworzMetadane } from '../../domain/fabryki'
import { odczytajTerminZadania } from '../../domain/logikaTerminuZadania'
import type { Projekt, Zadanie } from '../../domain/typy'
import { usePodswietlenie } from '../../hooks/usePodswietlenie'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { czyZadanieZalegle, przypiszZadanieDoProjektu, przywrocZadanie, ukonczZadanie, utworzZadanie, zmienPriorytetZadania, zmienTerminZadania } from '../../services/ZadaniaService'
import { platforma } from '../../platform/platforma'
import '../../services/RejestrPolSystemowychZadan'

const opcjePriorytetu = [
  { wartosc: 'niski', etykieta: 'Niski' },
  { wartosc: 'normalny', etykieta: 'Normalny' },
  { wartosc: 'wysoki', etykieta: 'Wysoki' },
  { wartosc: 'krytyczny', etykieta: 'Krytyczny' },
]

export function WidokZadan() {
  const [parametryAdresu] = useSearchParams()
  const { dane: zadania, repozytorium } = useRepozytorium('zadania')
  const { dane: projekty } = useRepozytorium('projekty')
  const { dane: miejsca } = useRepozytorium('miejsca')
  const [filtr, ustawFiltr] = useState<'otwarte' | 'dzisiaj' | 'zalegle' | 'nadchodzace' | 'wykonane' | 'wszystkie'>('otwarte')
  const [sortowanie, ustawSortowanie] = useState<'termin' | 'priorytet' | 'aktualizacja'>('termin')
  const [widok, ustawWidok] = useState<'lista' | 'projekt' | 'termin'>('lista')
  const [trybMasowy, ustawTrybMasowy] = useState(false)
  const [zaznaczone, ustawZaznaczone] = useState<Set<string>>(new Set())
  const [komunikat, ustawKomunikat] = useState<{ typ: 'sukces' | 'blad'; tresc: string }>()
  const [ostatniaZmiana, ustawOstatniaZmiane] = useState<{ poprzednie: Zadanie[]; utworzoneIds: string[] }>()
  usePodswietlenie(zadania.length)
  const dzisiaj = dzisiajIso()
  const waga = { niski: 0, normalny: 1, wysoki: 2, krytyczny: 3 }
  const widoczne = zadania
    .filter((zadanie) => {
      if (filtr === 'otwarte') return zadanie.status !== 'wykonane'
      if (filtr === 'dzisiaj') return zadanie.status !== 'wykonane' && zadanie.termin === dzisiaj
      if (filtr === 'zalegle') return czyZadanieZalegle(zadanie, dzisiaj)
      if (filtr === 'nadchodzace') return zadanie.status !== 'wykonane' && Boolean(zadanie.termin && zadanie.termin > dzisiaj)
      if (filtr === 'wykonane') return zadanie.status === 'wykonane'
      return true
    })
    .sort((a, b) => {
      if (widok === 'projekt') return (projekty.find((x) => x.id === a.projektId)?.nazwa ?? 'Bez projektu').localeCompare(projekty.find((x) => x.id === b.projektId)?.nazwa ?? 'Bez projektu') || (a.termin ?? '9999').localeCompare(b.termin ?? '9999')
      if (widok === 'termin') return (a.termin?.slice(0, 7) ?? 'Bez terminu').localeCompare(b.termin?.slice(0, 7) ?? 'Bez terminu') || (a.termin ?? '9999').localeCompare(b.termin ?? '9999')
      if (sortowanie === 'priorytet') return waga[b.priorytet] - waga[a.priorytet]
      if (sortowanie === 'aktualizacja') return b.updatedAt.localeCompare(a.updatedAt)
      return (a.termin ?? '9999').localeCompare(b.termin ?? '9999')
    })

  const polaRejestru: import('../../domain/rejestr').DefinicjaPolaRejestru[] = [
    { id: 'system:tytul', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'tytul', etykieta: 'Tytuł', typ: 'tekst' },
    { id: 'system:opis', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'opis', etykieta: 'Opis', typ: 'textarea' },
    { id: 'system:kontekst', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'kontekst', etykieta: 'Kontekst / miejsce', typ: 'tekst' },
    { id: 'system:tagi', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'tagi', etykieta: 'Tagi', typ: 'tekst' },
    { id: 'system:dataStartu', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'dataStartu', etykieta: 'Najwcześniej od', typ: 'data' },
    { id: 'system:szacowanyCzasMin', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'szacowanyCzasMin', etykieta: 'Szacowany czas (min)', typ: 'liczba' },
    { id: 'system:faktycznyCzasMin', zrodlo: 'systemowe', trybObslugi: 'bezposrednie', kluczWlasciwosci: 'faktycznyCzasMin', etykieta: 'Faktyczny czas (min)', typ: 'liczba' },
    { id: 'system:status', zrodlo: 'systemowe', trybObslugi: 'tylko_odczyt', resolverId: 'resolver:zadania-status', etykieta: 'Status', typ: 'tekst' },
    { id: 'system:priorytet', zrodlo: 'systemowe', trybObslugi: 'tylko_odczyt', resolverId: 'resolver:zadania-priorytet', etykieta: 'Priorytet', typ: 'tekst' },
    { id: 'system:termin', zrodlo: 'systemowe', trybObslugi: 'tylko_odczyt', resolverId: 'resolver:zadania-termin', etykieta: 'Termin', typ: 'data' },
  ]


  const zapiszSzybkaZmiane = async (poprzednie: Zadanie, zmienione: Zadanie, tresc: string, utworzoneId?: string) => {
    try {
      await repozytorium.zapisz(zmienione)
      ustawOstatniaZmiane({ poprzednie: [poprzednie], utworzoneIds: utworzoneId ? [utworzoneId] : [] })
      ustawKomunikat({ typ: 'sukces', tresc })
    } catch {
      ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się zapisać zmiany zadania.' })
    }
  }

  const zakonczZadanie = async (zadanie: Zadanie) => {
    try {
      const wynik = ukonczZadanie(zadanie)
      await repozytorium.zapisz(wynik.wykonane)
      if (wynik.nastepne) await repozytorium.zapisz(wynik.nastepne)
      ustawOstatniaZmiane({ poprzednie: [zadanie], utworzoneIds: wynik.nastepne ? [wynik.nastepne.id] : [] })
      ustawKomunikat({ typ: 'sukces', tresc: `Oznaczono „${zadanie.tytul}” jako wykonane.${wynik.nastepne ? ' Utworzono kolejne wystąpienie.' : ''}` })
      void platforma.haptyka.sukces().catch(() => undefined)
    } catch {
      ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się oznaczyć zadania jako wykonanego.' })
    }
  }

  const zakonczZaznaczone = async () => {
    const wybrane = zadania.filter((zadanie) => zaznaczone.has(zadanie.id))
    try {
      const wyniki = wybrane.map(ukonczZadanie)
      await Promise.all(wyniki.flatMap((wynik) => [repozytorium.zapisz(wynik.wykonane), ...(wynik.nastepne ? [repozytorium.zapisz(wynik.nastepne)] : [])]))
      ustawOstatniaZmiane({ poprzednie: wybrane, utworzoneIds: wyniki.flatMap((wynik) => wynik.nastepne ? [wynik.nastepne.id] : []) })
      ustawZaznaczone(new Set())
      ustawKomunikat({ typ: 'sukces', tresc: `Oznaczono jako wykonane: ${wybrane.length}. Elementy przeniesiono do filtra „Wykonane”.` })
    } catch {
      ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się wykonać wszystkich zaznaczonych zadań.' })
    }
  }

  const zmienZaznaczone = async (zmien: (zadanie: Zadanie) => Zadanie, tresc: string) => {
    const wybrane = zadania.filter((zadanie) => zaznaczone.has(zadanie.id))
    try {
      await Promise.all(wybrane.map((zadanie) => repozytorium.zapisz(zmien(zadanie))))
      ustawOstatniaZmiane({ poprzednie: wybrane, utworzoneIds: [] })
      ustawZaznaczone(new Set())
      ustawKomunikat({ typ: 'sukces', tresc })
    } catch {
      ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się zmienić wszystkich zaznaczonych zadań.' })
    }
  }

  const cofnijZmiane = async () => {
    if (!ostatniaZmiana) return
    try {
      await Promise.all(ostatniaZmiana.poprzednie.map((zadanie) => repozytorium.zapisz(zadanie)))
      await Promise.all(ostatniaZmiana.utworzoneIds.map((id) => repozytorium.usun(id)))
      ustawOstatniaZmiane(undefined)
      ustawKomunikat({ typ: 'sukces', tresc: 'Cofnięto ostatnią zmianę zadania.' })
    } catch {
      ustawKomunikat({ typ: 'blad', tresc: 'Nie udało się cofnąć ostatniej zmiany.' })
    }
  }

  const pustyStan = filtr === 'zalegle'
    ? { tytul: 'Brak zaległych zadań', opis: 'Nic nie czeka po terminie. Możesz wrócić do zadań otwartych.' }
    : filtr === 'dzisiaj' ? { tytul: 'Brak zadań na dziś', opis: 'Dzisiejsza lista jest wolna. Dodaj zadanie tylko wtedy, gdy naprawdę ma być wykonane dziś.' }
      : filtr === 'wykonane' ? { tytul: 'Brak wykonanych zadań', opis: 'Ukończone zadania pojawią się tutaj.' }
        : filtr === 'nadchodzace' ? { tytul: 'Brak nadchodzących terminów', opis: 'Nie ma otwartych zadań z późniejszym terminem.' }
          : { tytul: 'Lista zadań jest pusta', opis: 'Dodaj pierwsze konkretne działanie albo przekształć wpis z poczekalni.' }

  return <WidokRejestru
    tytul="Zadania"
    opis="Jednorazowe i cykliczne działania, terminy, priorytety oraz konteksty. Estymacja czasu jest opcjonalna."
    etykietaDodawania="Nowe zadanie"
    dane={widoczne}
    repozytorium={repozytorium}
    pustyStan={pustyStan}
    wybranyElementId={parametryAdresu.get('element') ?? undefined}
    pola={[]}
    polaRejestru={polaRejestru}
    konfiguracjaWlasciwosci={{ rejestrId: 'zadania', polaSystemowe: polaRejestru, tytulKonfiguracji: 'Kolumny Zadań' }}
    filtr={<>{komunikat && <Komunikat typ={komunikat.typ}>{komunikat.tresc}{ostatniaZmiana && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => void cofnijZmiane()}><Undo2 aria-hidden="true" />Cofnij</button>}</Komunikat>}<div className="pasek-filtrow">
      <div className="segmenty">{(['otwarte', 'dzisiaj', 'zalegle', 'nadchodzace', 'wykonane', 'wszystkie'] as const).map((wartosc) => <button type="button" className={filtr === wartosc ? 'aktywny' : ''} onClick={() => ustawFiltr(wartosc)} key={wartosc}>{wartosc === 'wszystkie' ? 'Wszystkie' : wartosc[0].toUpperCase() + wartosc.slice(1)}</button>)}</div>
      <label className="pole-inline"><span>Sortuj</span><select value={sortowanie} onChange={(e) => ustawSortowanie(e.target.value as typeof sortowanie)}><option value="termin">Termin</option><option value="priorytet">Priorytet</option><option value="aktualizacja">Ostatnia zmiana</option></select></label>
      <label className="pole-inline"><span>Widok</span><select value={widok} onChange={(e) => ustawWidok(e.target.value as typeof widok)}><option value="lista">Zwykła lista</option><option value="projekt">Według projektu</option><option value="termin">Według terminu</option></select></label>
      <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => { ustawTrybMasowy(!trybMasowy); ustawZaznaczone(new Set()) }}>{trybMasowy ? 'Zakończ zaznaczanie' : 'Zaznacz wiele'}</button>
      {trybMasowy && zaznaczone.size > 0 && <div className="akcje-karty"><strong>{zaznaczone.size} zazn.</strong><button type="button" className="przycisk przycisk--maly" onClick={() => void zakonczZaznaczone()}>Wykonaj</button><button type="button" className="przycisk przycisk--maly" onClick={() => { const data = window.prompt('Nowy termin (RRRR-MM-DD)'); if (data) void zmienZaznaczone((zadanie) => zmienTerminZadania(zadanie, data), `Zmieniono termin ${zaznaczone.size} zadań.`) }}>Przełóż</button><button type="button" className="przycisk przycisk--maly" onClick={() => { const priorytet = window.prompt('Priorytet: niski, normalny, wysoki, krytyczny'); if (['niski', 'normalny', 'wysoki', 'krytyczny'].includes(priorytet ?? '')) void zmienZaznaczone((zadanie) => zmienPriorytetZadania(zadanie, priorytet as Zadanie['priorytet']), `Zmieniono priorytet ${zaznaczone.size} zadań.`) }}>Priorytet</button><select aria-label="Przypisz zaznaczone do projektu" defaultValue="" onChange={(e) => { const projektId = e.target.value || undefined; void zmienZaznaczone((zadanie) => przypiszZadanieDoProjektu(zadanie, projektId), `Zmieniono projekt ${zaznaczone.size} zadań.`) }}><option value="">Projekt…</option>{projekty.map((x) => <option key={x.id} value={x.id}>{x.nazwa}</option>)}</select></div>}
    </div></>}
    zbuduj={(formularz, istniejace) => {
      const baza = istniejace ?? utworzZadanie({ tytul: formularz.tytul, opis: formularz.opis, priorytet: 'normalny' })
      const {
        deadlineMode: _deadlineMode,
        time: _time,
        godzinaElementu: _godzinaElementu,
        ...kanonicznaBaza
      } = baza as Zadanie & { deadlineMode?: unknown; time?: unknown }
      return {
        ...kanonicznaBaza,
        tytul: formularz.tytul.trim(),
        opis: formularz.opis ?? '',
        dataStartu: formularz.dataStartu || undefined,
        szacowanyCzasMin: formularz.szacowanyCzasMin ? Number(formularz.szacowanyCzasMin) : undefined,
        faktycznyCzasMin: formularz.faktycznyCzasMin ? Number(formularz.faktycznyCzasMin) : undefined,
        kontekst: formularz.kontekst || undefined,
        tagi: (formularz.tagi ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        updatedAt: terazIso(),
      }
    }}
    uzupelnijFormularz={(zadanie) => {
      const termin = odczytajTerminZadania(zadanie as unknown as Record<string, unknown>)
      return {
        termin: termin.data ?? '',
        trybTerminuElementu: termin.tryb,
        godzinaElementu: termin.godzina ?? '',
        podzadaniaTekst: zadanie.podzadania.map((x) => x.tytul).join('\n'),
        blokujaceIds: (zadanie.blokowanePrzezIds ?? []).join(','),
      }
    }}
    etykieta={(zadanie) => zadanie.tytul}
    szczegoly={(zadanie) => <>
      <Znacznik wariant={zadanie.status === 'wykonane' ? 'sukces' : czyZadanieZalegle(zadanie) ? 'blad' : 'neutralny'}>{czyZadanieZalegle(zadanie) ? 'zaległe' : zadanie.status === 'w_toku' ? 'w toku' : zadanie.status}</Znacznik>
      <Znacznik wariant={zadanie.priorytet === 'krytyczny' ? 'blad' : zadanie.priorytet === 'wysoki' ? 'ostrzezenie' : 'neutralny'}>priorytet: {zadanie.priorytet}</Znacznik>
      {zadanie.termin && <span className={czyZadanieZalegle(zadanie) ? 'tekst-bledu' : undefined}>{czyZadanieZalegle(zadanie) ? 'Termin minął' : 'Termin'}: {zadanie.termin}</span>}
      {(zadanie.szacowanyCzasMin || zadanie.faktycznyCzasMin !== undefined) && <span>Szacowano: {zadanie.szacowanyCzasMin ?? '—'} min · faktycznie: {zadanie.faktycznyCzasMin ?? '—'} min</span>}
      {zadanie.projektId && <span>Projekt: {projekty.find((projekt) => projekt.id === zadanie.projektId)?.nazwa ?? 'nieznany'}</span>}
      {widok === 'projekt' && <Znacznik>{projekty.find((x) => x.id === zadanie.projektId)?.nazwa ?? 'Bez projektu'}</Znacznik>}
      {widok === 'termin' && <Znacznik>{zadanie.termin?.slice(0, 7) ?? 'Bez terminu'}</Znacznik>}
      {(zadanie.blokowanePrzezIds ?? []).length > 0 && <span className="tekst-bledu">Blokowane przez: {(zadanie.blokowanePrzezIds ?? []).map((id) => <Link key={id} to={`/zadania?element=${id}`}>{zadania.find((x) => x.id === id)?.tytul ?? 'usunięte zadanie'} </Link>)}</span>}
      {zadania.some((x) => x.blokowanePrzezIds?.includes(zadanie.id)) && <span>Blokuje: {zadania.filter((x) => x.blokowanePrzezIds?.includes(zadanie.id)).map((x) => <Link key={x.id} to={`/zadania?element=${x.id}`}>{x.tytul} </Link>)}</span>}
      {zadanie.podzadania.length > 0 && <div><strong>Podzadania: {zadanie.podzadania.filter((x) => x.wykonane).length}/{zadanie.podzadania.length}</strong>{zadanie.podzadania.map((podzadanie) => <div key={podzadanie.id}><button type="button" className="przycisk-check" onClick={() => repozytorium.zapisz({ ...zadanie, podzadania: zadanie.podzadania.map((x) => x.id === podzadanie.id ? { ...x, wykonane: !x.wykonane } : x), updatedAt: terazIso() })}>{podzadanie.wykonane ? '✓' : '○'}</button><span>{podzadanie.tytul}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => repozytorium.zapisz({ ...zadanie, podzadania: zadanie.podzadania.filter((x) => x.id !== podzadanie.id), updatedAt: terazIso() })}>Usuń</button></div>)}</div>}
      {zadanie.kontekst && <span>Kontekst: {zadanie.kontekst}</span>}
      {zadanie.miejsceId && <span>Miejsce: {miejsca.find((x) => x.id === zadanie.miejsceId)?.nazwa ?? 'nieznane'}</span>}
      {zadanie.opis && <p>{zadanie.opis}</p>}
    </>}
    akcje={(zadanie) => <>
      {trybMasowy && <label><input type="checkbox" checked={zaznaczone.has(zadanie.id)} onChange={() => ustawZaznaczone((obecne) => { const nowe = new Set(obecne); if (nowe.has(zadanie.id)) nowe.delete(zadanie.id); else nowe.add(zadanie.id); return nowe })} /><span className="sr-only">Zaznacz {zadanie.tytul}</span></label>}
      {zadanie.status === 'wykonane' ? <button type="button" className="przycisk-ikona" title="Przywróć" onClick={() => void zapiszSzybkaZmiane(zadanie, przywrocZadanie(zadanie), `Przywrócono „${zadanie.tytul}”.`)}><RotateCcw aria-hidden="true" /></button> : <button type="button" className="przycisk-ikona przycisk-ikona--sukces" title="Oznacz jako wykonane" onClick={() => void zakonczZadanie(zadanie)}><Check aria-hidden="true" /></button>}
      {zadanie.status !== 'wykonane' && <div className="akcje-karty"><label className="pole-inline"><span className="sr-only">Priorytet zadania {zadanie.tytul}</span><select aria-label={`Priorytet zadania ${zadanie.tytul}`} value={zadanie.priorytet} onChange={(e) => void zapiszSzybkaZmiane(zadanie, zmienPriorytetZadania(zadanie, e.target.value as Zadanie['priorytet']), `Zmieniono priorytet „${zadanie.tytul}”.`)}>{opcjePriorytetu.map((opcja) => <option key={opcja.wartosc} value={opcja.wartosc}>{opcja.etykieta}</option>)}</select></label><label className="pole-inline"><span className="sr-only">Termin zadania {zadanie.tytul}</span><input aria-label={`Termin zadania ${zadanie.tytul}`} type="date" value={zadanie.termin?.slice(0, 10) ?? ''} onChange={(e) => void zapiszSzybkaZmiane(zadanie, zmienTerminZadania(zadanie, e.target.value || undefined), e.target.value ? `Zmieniono termin „${zadanie.tytul}” na ${e.target.value}.` : `Usunięto termin „${zadanie.tytul}”.`)} /></label><label className="pole-inline"><span className="sr-only">Projekt zadania {zadanie.tytul}</span><select aria-label={`Projekt zadania ${zadanie.tytul}`} value={zadanie.projektId ?? ''} onChange={(e) => { const projektId = e.target.value || undefined; const nazwa = projekty.find((projekt) => projekt.id === projektId)?.nazwa; void zapiszSzybkaZmiane(zadanie, przypiszZadanieDoProjektu(zadanie, projektId), nazwa ? `Przypisano „${zadanie.tytul}” do projektu „${nazwa}”.` : `Usunięto przypisanie „${zadanie.tytul}” do projektu.`) }}><option value="">Bez projektu</option>{projekty.map((projekt) => <option key={projekt.id} value={projekt.id}>{projekt.nazwa}</option>)}</select></label></div>}
      {platforma.udostepnianie.dostepne() && <button type="button" className="przycisk-ikona" title="Udostępnij zadanie" onClick={() => platforma.udostepnianie.udostepnij({ tytul: zadanie.tytul, tekst: [zadanie.opis, zadanie.termin ? `Termin: ${zadanie.termin}` : ''].filter(Boolean).join('\n') })}><Share2 aria-hidden="true" /></button>}
    </>}
  />
}

export function WidokProjektow() {
  const { dane: projekty, repozytorium } = useRepozytorium('projekty')
  const { dane: zadania } = useRepozytorium('zadania')
  const { dane: notatki } = useRepozytorium('notatki')
  const { dane: dokumenty } = useRepozytorium('dokumenty')
  const { dane: kontakty } = useRepozytorium('kontakty')
  const { dane: cele } = useRepozytorium('cele')
  usePodswietlenie(projekty.length)
  return <WidokRejestru
    tytul="Projekty"
    opis="Większe przedsięwzięcia z celem, następnym działaniem, blokadami i postępem wynikającym z zadań."
    etykietaDodawania="Nowy projekt"
    dane={projekty}
    repozytorium={repozytorium}
    pustyStan={{ tytul: 'Brak projektów', opis: 'Projekt ma sens dopiero wtedy, gdy jedna sprawa wymaga kilku kolejnych działań.' }}
    pola={[
      { klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true },
      { klucz: 'opis', etykieta: 'Cel / opis', typ: 'textarea' },
      { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, opcje: [{ wartosc: 'aktywne', etykieta: 'Aktywny' }, { wartosc: 'wstrzymane', etykieta: 'Wstrzymany' }, { wartosc: 'zakonczone', etykieta: 'Zakończony' }] },
      { klucz: 'nastepneDzialanie', etykieta: 'Następne działanie' },
      { klucz: 'blokady', etykieta: 'Blokady', typ: 'textarea' },
      { klucz: 'dataStartu', etykieta: 'Start', typ: 'date' },
      { klucz: 'termin', etykieta: 'Termin', typ: 'date' },
      { klucz: 'celId', etykieta: 'Cel nadrzędny', typ: 'select', opcje: cele.map((cel) => ({ wartosc: cel.id, etykieta: cel.nazwa })) },
      { klucz: 'kamienieTekst', etykieta: 'Kamienie milowe', typ: 'textarea', podpowiedz: 'Nazwa | RRRR-MM-DD, jeden w wierszu' },
    ]}
    zbuduj={(formularz, istniejacy) => ({
      ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), opis: formularz.opis ?? '', status: (formularz.status || 'aktywne') as Projekt['status'], nastepneDzialanie: formularz.nastepneDzialanie || undefined, blokady: formularz.blokady ?? '', dataStartu: formularz.dataStartu || undefined, termin: formularz.termin || undefined, celId: formularz.celId || undefined, kamienieMilowe: formularz.kamienieTekst.split('\n').map((wiersz) => wiersz.trim()).filter(Boolean).map((wiersz) => { const [nazwa, termin] = wiersz.split('|').map((x) => x.trim()); return istniejacy?.kamienieMilowe?.find((x) => x.nazwa === nazwa) ?? { id: noweId(), nazwa, wykonany: false, termin: termin || undefined } }), updatedAt: terazIso(),
    })}
    uzupelnijFormularz={(projekt) => ({ kamienieTekst: (projekt.kamienieMilowe ?? []).map((x) => `${x.nazwa}${x.termin ? ` | ${x.termin}` : ''}`).join('\n') })}
    etykieta={(projekt) => projekt.nazwa}
    szczegoly={(projekt) => {
      const powiazane = zadania.filter((zadanie) => zadanie.projektId === projekt.id)
      const wykonane = powiazane.filter((zadanie) => zadanie.status === 'wykonane').length
      const kamienie = projekt.kamienieMilowe ?? []
      const wykonaneKamienie = kamienie.filter((x) => x.wykonany).length
      const liczbaElementow = powiazane.length + kamienie.length
      const procent = liczbaElementow ? Math.round(((wykonane + wykonaneKamienie) / liczbaElementow) * 100) : 0
      const dzisiaj = dzisiajIso()
      const otwarte = powiazane.filter((x) => x.status !== 'wykonane')
      const stan = projekt.status === 'zakonczone' ? 'zakończony' : projekt.termin && projekt.termin < dzisiaj ? 'po terminie' : projekt.blokady.trim() || (otwarte.length > 0 && otwarte.every((x) => (x.blokowanePrzezIds ?? []).some((id) => zadania.find((y) => y.id === id)?.status !== 'wykonane'))) ? 'blokada' : !projekt.nastepneDzialanie && Date.now() - new Date(projekt.updatedAt).getTime() > 14 * 86400000 ? 'stoi' : 'działa'
      const powiazaneNotatki = notatki.filter((x) => x.powiazania.some((p) => p.typ === 'projekty' && p.id === projekt.id))
      const powiazaneDokumenty = dokumenty.filter((x) => x.powiazania.some((p) => p.typ === 'projekty' && p.id === projekt.id))
      const powiazaneKontakty = kontakty.filter((kontakt) => notatki.some((x) => x.powiazania.some((p) => p.typ === 'projekty' && p.id === projekt.id) && x.powiazania.some((p) => p.typ === 'kontakty' && p.id === kontakt.id)))
      const aktywnosc = [...powiazane.map((x) => ({ nazwa: `Zadanie: ${x.tytul}`, data: x.updatedAt })), ...powiazaneNotatki.map((x) => ({ nazwa: `Notatka: ${x.tytul}`, data: x.updatedAt })), ...kamienie.map((x) => ({ nazwa: `Kamień: ${x.nazwa}`, data: x.termin ?? projekt.updatedAt }))].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5)
      return <><Znacznik wariant={stan === 'zakończony' ? 'sukces' : ['blokada', 'po terminie'].includes(stan) ? 'blad' : stan === 'stoi' ? 'ostrzezenie' : 'neutralny'}>{stan}</Znacznik><span className="komunikat komunikat--informacja"><strong>Następne działanie: </strong>{projekt.nastepneDzialanie ?? 'Nie ustalono — uzupełnij je w edycji projektu.'}</span><span>Postęp: {wykonane + wykonaneKamienie}/{liczbaElementow} ({procent}%)</span>{projekt.termin && <span>Termin: {projekt.termin}</span>}{projekt.celId && <span>Cel: {cele.find((x) => x.id === projekt.celId)?.nazwa ?? 'nieznany'}</span>}{projekt.blokady && <span className="tekst-bledu">Blokady: {projekt.blokady}</span>}{projekt.opis && <p>{projekt.opis}</p>}<strong>Zadania projektu</strong>{powiazane.length === 0 ? <span>Brak zadań w tym projekcie.</span> : powiazane.slice(0, 8).map((x) => <Link className={x.termin && x.termin < dzisiaj && x.status !== 'wykonane' ? 'tekst-bledu' : undefined} key={x.id} to={`/zadania?element=${x.id}`}>{x.tytul}{x.termin && x.termin < dzisiaj && x.status !== 'wykonane' ? ` · zaległe od ${x.termin}` : ''}</Link>)}<strong>Kamienie milowe</strong>{kamienie.length === 0 ? <span>Brak kamieni milowych.</span> : kamienie.map((x) => <div key={x.id}><button type="button" className="przycisk-check" onClick={() => repozytorium.zapisz({ ...projekt, kamienieMilowe: kamienie.map((k) => k.id === x.id ? { ...k, wykonany: !k.wykonany } : k), updatedAt: terazIso() })}>{x.wykonany ? '✓' : '○'}</button><span>{x.nazwa}{x.termin ? ` · ${x.termin}` : ''}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => repozytorium.zapisz({ ...projekt, kamienieMilowe: kamienie.filter((k) => k.id !== x.id), updatedAt: terazIso() })}>Usuń</button></div>)}<span>Notatki: {powiazaneNotatki.map((x) => x.tytul).join(', ') || 'brak'} · Dokumenty: {powiazaneDokumenty.map((x) => x.nazwa).join(', ') || 'brak'} · Kontakty: {powiazaneKontakty.map((x) => x.nazwa).join(', ') || 'brak'}</span>{aktywnosc.length > 0 && <span>Ostatnia aktywność: {aktywnosc.map((x) => `${x.nazwa} (${x.data.slice(0, 10)})`).join(' · ')}</span>}</>
    }}
  />
}

export function WidokPoczekalni() {
  return <RejestrPoczekalni />
}

// OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V3: Zadanie obsługuje tryb terminu i godzinę deadline.
