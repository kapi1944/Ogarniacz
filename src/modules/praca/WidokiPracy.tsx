import { useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Check, CornerDownRight, RotateCcw, Share2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { WidokRejestru, type DefinicjaPola } from '../../components/WidokRejestru'
import { Karta, Komunikat, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { dzisiajIso, terazIso, utworzMetadane } from '../../domain/fabryki'
import { normalizujTerminZadania, odczytajTerminZadania } from '../../domain/logikaTerminuZadania'
import type { ElementSkrzynki, ListaZakupow, NaPozniej, NazwaModulu, Notatka, PozycjaZakupow, Pomysl, Projekt, Wizyta, Zadanie } from '../../domain/typy'
import { usePodswietlenie } from '../../hooks/usePodswietlenie'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { czyZadanieZalegle, odroczZadanie, przywrocZadanie, ukonczZadanie, utworzZadanie } from '../../services/ZadaniaService'
import { platforma } from '../../platform/platforma'

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
  const [filtr, ustawFiltr] = useState<'otwarte' | 'dzisiaj' | 'zalegle' | 'nadchodzace' | 'wykonane' | 'wszystkie'>('otwarte')
  const [sortowanie, ustawSortowanie] = useState<'termin' | 'priorytet' | 'aktualizacja'>('termin')
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
      if (sortowanie === 'priorytet') return waga[b.priorytet] - waga[a.priorytet]
      if (sortowanie === 'aktualizacja') return b.updatedAt.localeCompare(a.updatedAt)
      return (a.termin ?? '9999').localeCompare(b.termin ?? '9999')
    })

  const pola: DefinicjaPola[] = [
    { klucz: 'tytul', etykieta: 'Tytuł', wymagane: true },
    { klucz: 'opis', etykieta: 'Opis', typ: 'textarea' },
    { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, opcje: [
      { wartosc: 'otwarte', etykieta: 'Otwarte' }, { wartosc: 'w_toku', etykieta: 'W toku' }, { wartosc: 'wykonane', etykieta: 'Wykonane' },
    ] },
    { klucz: 'priorytet', etykieta: 'Priorytet', typ: 'select', wymagane: true, opcje: opcjePriorytetu },
    { klucz: 'termin', etykieta: 'Termin', typ: 'date' },
    { klucz: 'trybTerminuElementu', etykieta: 'Tryb terminu', typ: 'select', wymagane: true, domyslnaWartosc: 'bez_godziny', opcje: [
      { wartosc: 'o_godzinie', etykieta: 'O konkretnej godzinie' },
      { wartosc: 'koniec_dnia', etykieta: 'Do końca dnia' },
      { wartosc: 'bez_godziny', etykieta: 'Bez godziny' },
    ] },
    { klucz: 'godzinaElementu', etykieta: 'Godzina', typ: 'time', widoczne: (formularz) => formularz.trybTerminuElementu === 'o_godzinie' },
    { klucz: 'dataStartu', etykieta: 'Najwcześniej od', typ: 'date' },
    { klucz: 'szacowanyCzasMin', etykieta: 'Szacowany czas (min)', typ: 'number', min: 1 },
    { klucz: 'projektId', etykieta: 'Projekt', typ: 'select', opcje: projekty.map((projekt) => ({ wartosc: projekt.id, etykieta: projekt.nazwa })) },
    { klucz: 'kontekst', etykieta: 'Kontekst / miejsce', podpowiedz: 'np. apteka, telefon, komputer' },
    { klucz: 'tagi', etykieta: 'Tagi', podpowiedz: 'oddzielone przecinkami' },
    { klucz: 'powtarzanieTyp', etykieta: 'Powtarzanie', typ: 'select', opcje: [
      { wartosc: 'brak', etykieta: 'Brak' }, { wartosc: 'codziennie', etykieta: 'Codziennie' }, { wartosc: 'co_x_dni', etykieta: 'Co X dni' }, { wartosc: 'tygodniowo', etykieta: 'Tygodniowo' }, { wartosc: 'miesiecznie', etykieta: 'Miesięcznie' }, { wartosc: 'rocznie', etykieta: 'Rocznie' },
    ] },
    { klucz: 'powtarzanieCoIle', etykieta: 'Powtarzaj co', typ: 'number', min: 1 },
  ]

  return <WidokRejestru
    tytul="Zadania"
    opis="Jednorazowe i cykliczne działania, terminy, priorytety oraz konteksty. Estymacja czasu jest opcjonalna."
    etykietaDodawania="Nowe zadanie"
    dane={widoczne}
    repozytorium={repozytorium}
    wybranyElementId={parametryAdresu.get('element') ?? undefined}
    pola={pola}
    filtr={<div className="pasek-filtrow">
      <div className="segmenty">{(['otwarte', 'dzisiaj', 'zalegle', 'nadchodzace', 'wykonane', 'wszystkie'] as const).map((wartosc) => <button type="button" className={filtr === wartosc ? 'aktywny' : ''} onClick={() => ustawFiltr(wartosc)} key={wartosc}>{wartosc === 'wszystkie' ? 'Wszystkie' : wartosc[0].toUpperCase() + wartosc.slice(1)}</button>)}</div>
      <label className="pole-inline"><span>Sortuj</span><select value={sortowanie} onChange={(e) => ustawSortowanie(e.target.value as typeof sortowanie)}><option value="termin">Termin</option><option value="priorytet">Priorytet</option><option value="aktualizacja">Ostatnia zmiana</option></select></label>
    </div>}
    zbuduj={(formularz, istniejace) => {
      const baza = istniejace ?? utworzZadanie({ tytul: formularz.tytul, opis: formularz.opis, priorytet: formularz.priorytet as Zadanie['priorytet'], termin: formularz.termin || undefined })
      const {
        deadlineMode: _deadlineMode,
        time: _time,
        godzinaElementu: _godzinaElementu,
        ...kanonicznaBaza
      } = baza as Zadanie & { deadlineMode?: unknown; time?: unknown }
      const termin = normalizujTerminZadania(formularz.trybTerminuElementu, formularz.godzinaElementu)
      return {
        ...kanonicznaBaza,
        tytul: formularz.tytul.trim(),
        opis: formularz.opis ?? '',
        status: (formularz.status || 'otwarte') as Zadanie['status'],
        priorytet: (formularz.priorytet || 'normalny') as Zadanie['priorytet'],
        termin: formularz.termin || undefined,
        trybTerminuElementu: termin.tryb,
        ...(termin.godzina ? { godzinaElementu: termin.godzina } : {}),
        dataStartu: formularz.dataStartu || undefined,
        szacowanyCzasMin: formularz.szacowanyCzasMin ? Number(formularz.szacowanyCzasMin) : undefined,
        projektId: formularz.projektId || undefined,
        kontekst: formularz.kontekst || undefined,
        tagi: (formularz.tagi ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        powtarzanie: formularz.powtarzanieTyp && formularz.powtarzanieTyp !== 'brak' ? { typ: formularz.powtarzanieTyp as NonNullable<Zadanie['powtarzanie']>['typ'], coIle: Number(formularz.powtarzanieCoIle) || 1, dataStartu: formularz.termin || dzisiaj } : undefined,
        updatedAt: terazIso(),
      }
    }}
    uzupelnijFormularz={(zadanie) => {
      const termin = odczytajTerminZadania(zadanie as unknown as Record<string, unknown>)
      return {
        termin: termin.data ?? '',
        trybTerminuElementu: termin.tryb,
        godzinaElementu: termin.godzina ?? '',
      }
    }}
    etykieta={(zadanie) => zadanie.tytul}
    szczegoly={(zadanie) => <>
      <Znacznik wariant={zadanie.status === 'wykonane' ? 'sukces' : czyZadanieZalegle(zadanie) ? 'blad' : 'neutralny'}>{zadanie.status === 'w_toku' ? 'w toku' : zadanie.status}</Znacznik>
      <Znacznik wariant={zadanie.priorytet === 'krytyczny' ? 'blad' : zadanie.priorytet === 'wysoki' ? 'ostrzezenie' : 'neutralny'}>priorytet: {zadanie.priorytet}</Znacznik>
      {zadanie.termin && <span>Termin: {zadanie.termin}</span>}
      {zadanie.szacowanyCzasMin && <span>{zadanie.szacowanyCzasMin} min</span>}
      {zadanie.projektId && <span>Projekt: {projekty.find((projekt) => projekt.id === zadanie.projektId)?.nazwa ?? 'nieznany'}</span>}
      {zadanie.kontekst && <span>Kontekst: {zadanie.kontekst}</span>}
      {zadanie.opis && <p>{zadanie.opis}</p>}
    </>}
    akcje={(zadanie) => <>
      {zadanie.status === 'wykonane' ? <button type="button" className="przycisk-ikona" title="Przywróć" onClick={() => repozytorium.zapisz(przywrocZadanie(zadanie))}><RotateCcw aria-hidden="true" /></button> : <button type="button" className="przycisk-ikona przycisk-ikona--sukces" title="Oznacz jako wykonane" onClick={async () => { const wynik = ukonczZadanie(zadanie); await repozytorium.zapisz(wynik.wykonane); if (wynik.nastepne) await repozytorium.zapisz(wynik.nastepne); await platforma.haptyka.sukces() }}><Check aria-hidden="true" /></button>}
      {zadanie.status !== 'wykonane' && <button type="button" className="przycisk-ikona" title="Odrocz o dzień" onClick={() => repozytorium.zapisz(odroczZadanie(zadanie, format(addDays(parseISO(zadanie.termin ?? dzisiaj), 1), 'yyyy-MM-dd')))}><CornerDownRight aria-hidden="true" /></button>}
      {platforma.udostepnianie.dostepne() && <button type="button" className="przycisk-ikona" title="Udostępnij zadanie" onClick={() => platforma.udostepnianie.udostepnij({ tytul: zadanie.tytul, tekst: [zadanie.opis, zadanie.termin ? `Termin: ${zadanie.termin}` : ''].filter(Boolean).join('\n') })}><Share2 aria-hidden="true" /></button>}
    </>}
  />
}

export function WidokProjektow() {
  const { dane: projekty, repozytorium } = useRepozytorium('projekty')
  const { dane: zadania } = useRepozytorium('zadania')
  usePodswietlenie(projekty.length)
  return <WidokRejestru
    tytul="Projekty"
    opis="Większe przedsięwzięcia z celem, następnym działaniem, blokadami i postępem wynikającym z zadań."
    etykietaDodawania="Nowy projekt"
    dane={projekty}
    repozytorium={repozytorium}
    pola={[
      { klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true },
      { klucz: 'opis', etykieta: 'Cel / opis', typ: 'textarea' },
      { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, opcje: [{ wartosc: 'aktywne', etykieta: 'Aktywny' }, { wartosc: 'wstrzymane', etykieta: 'Wstrzymany' }, { wartosc: 'zakonczone', etykieta: 'Zakończony' }] },
      { klucz: 'nastepneDzialanie', etykieta: 'Następne działanie' },
      { klucz: 'blokady', etykieta: 'Blokady', typ: 'textarea' },
      { klucz: 'dataStartu', etykieta: 'Start', typ: 'date' },
      { klucz: 'termin', etykieta: 'Termin', typ: 'date' },
    ]}
    zbuduj={(formularz, istniejacy) => ({
      ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), opis: formularz.opis ?? '', status: (formularz.status || 'aktywne') as Projekt['status'], nastepneDzialanie: formularz.nastepneDzialanie || undefined, blokady: formularz.blokady ?? '', dataStartu: formularz.dataStartu || undefined, termin: formularz.termin || undefined, updatedAt: terazIso(),
    })}
    etykieta={(projekt) => projekt.nazwa}
    szczegoly={(projekt) => {
      const powiazane = zadania.filter((zadanie) => zadanie.projektId === projekt.id)
      const wykonane = powiazane.filter((zadanie) => zadanie.status === 'wykonane').length
      const procent = powiazane.length ? Math.round((wykonane / powiazane.length) * 100) : 0
      return <><Znacznik wariant={projekt.status === 'zakonczone' ? 'sukces' : 'neutralny'}>{projekt.status}</Znacznik><span>Postęp: {wykonane}/{powiazane.length} ({procent}%)</span>{projekt.nastepneDzialanie && <span>Następne: {projekt.nastepneDzialanie}</span>}{projekt.blokady && <span className="tekst-bledu">Blokuje: {projekt.blokady}</span>}{projekt.opis && <p>{projekt.opis}</p>}</>
    }}
  />
}

type TypKonwersji = 'zadanie' | 'notatka' | 'pomysl' | 'zakup' | 'na_pozniej' | 'wizyta'

export function WidokSkrzynki() {
  const { dane, repozytorium } = useRepozytorium('skrzynka')
  const [typyKonwersji, ustawTypyKonwersji] = useState<Record<string, TypKonwersji>>({})
  const [komunikat, ustawKomunikat] = useState('')
  usePodswietlenie(dane.length)

  const przetworz = async (element: ElementSkrzynki) => {
    const typ = typyKonwersji[element.id] ?? 'zadanie'
    let celId = ''
    if (typ === 'zadanie') { const cel = utworzZadanie({ tytul: element.tresc, opis: '', priorytet: 'normalny' }); await (await import('../../data/Repozytorium')).pobierzRepozytorium('zadania').zapisz(cel); celId = cel.id }
    if (typ === 'notatka') { const cel: Notatka = { ...utworzMetadane(), tytul: element.tresc.slice(0, 70), tresc: element.tresc, tagi: [], powiazania: [] }; await (await import('../../data/Repozytorium')).pobierzRepozytorium('notatki').zapisz(cel); celId = cel.id }
    if (typ === 'pomysl') { const cel: Pomysl = { ...utworzMetadane(), tytul: element.tresc, opis: '', status: 'nowy' }; await (await import('../../data/Repozytorium')).pobierzRepozytorium('pomysly').zapisz(cel); celId = cel.id }
    if (typ === 'na_pozniej') { const cel: NaPozniej = { ...utworzMetadane(), tytul: element.tresc, typ: 'sprawdzic', status: 'oczekuje' }; await (await import('../../data/Repozytorium')).pobierzRepozytorium('naPozniej').zapisz(cel); celId = cel.id }
    if (typ === 'wizyta') { const cel: Wizyta = { ...utworzMetadane(), nazwa: element.tresc, status: 'do_umowienia', notatka: '', pytania: [], dokumentyIds: [], checklista: [] }; await (await import('../../data/Repozytorium')).pobierzRepozytorium('wizyty').zapisz(cel); celId = cel.id }
    if (typ === 'zakup') {
      const { pobierzRepozytorium } = await import('../../data/Repozytorium')
      const repoList = pobierzRepozytorium('listyZakupow')
      let lista = (await repoList.lista()).find((x) => x.aktywna)
      if (!lista) { lista = { ...utworzMetadane(), nazwa: 'Szybka lista', aktywna: true } satisfies ListaZakupow; await repoList.zapisz(lista) }
      const cel: PozycjaZakupow = { ...utworzMetadane(), listaId: lista.id, nazwa: element.tresc, ilosc: '1', kupione: false }
      await pobierzRepozytorium('pozycjeZakupow').zapisz(cel); celId = cel.id
    }
    const modulDocelowy: Record<TypKonwersji, NazwaModulu> = { zadanie: 'zadania', notatka: 'notatki', pomysl: 'pomysly', zakup: 'zakupy', na_pozniej: 'na_pozniej', wizyta: 'wizyty' }
    await repozytorium.zapisz({ ...element, status: 'przetworzone', sugerowanyTyp: modulDocelowy[typ], przeksztalconoNa: { typ: modulDocelowy[typ], id: celId }, updatedAt: terazIso() })
    ustawKomunikat('Element został przetworzony i zachowany w skrzynce jako historia.')
  }

  return <div className="widok">
    <NaglowekWidoku tytul="Skrzynka" opis="Zapisz wszystko od razu. Klasyfikacja może poczekać." />
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
    <Karta>
      <form className="szybki-wpis" onSubmit={async (e) => { e.preventDefault(); const pole = e.currentTarget.elements.namedItem('tresc') as HTMLInputElement; if (!pole.value.trim()) return; await repozytorium.zapisz({ ...utworzMetadane(), tresc: pole.value.trim(), zrodlo: 'tekst', status: 'nowe' }); pole.value = '' }}>
        <input name="tresc" aria-label="Treść do skrzynki" placeholder="Co chcesz zapamiętać?" />
        <button className="przycisk przycisk--glowny" type="submit">Zapisz do skrzynki</button>
      </form>
    </Karta>
    {dane.length === 0 ? <PustyStan tytul="Skrzynka jest pusta" opis="To dobrze — nic nie czeka na uporządkowanie." /> : <div className="lista-rekordow">{dane.map((element) => <article className="rekord" data-element-id={element.id} key={element.id}>
      <div className="rekord__tresc"><h3>{element.tresc}</h3><div className="rekord__szczegoly"><Znacznik wariant={element.status === 'przetworzone' ? 'sukces' : 'ostrzezenie'}>{element.status}</Znacznik><span>{new Date(element.createdAt).toLocaleString('pl-PL')}</span>{element.sugerowanyTyp && <span>Sugerowany typ: {element.sugerowanyTyp}</span>}</div></div>
      <div className="rekord__akcje">
        {element.status === 'nowe' && <><select aria-label="Typ konwersji" value={typyKonwersji[element.id] ?? 'zadanie'} onChange={(e) => ustawTypyKonwersji({ ...typyKonwersji, [element.id]: e.target.value as TypKonwersji })}><option value="zadanie">Zadanie</option><option value="notatka">Notatka</option><option value="pomysl">Pomysł</option><option value="zakup">Zakup</option><option value="wizyta">Do umówienia</option><option value="na_pozniej">Na później</option></select><button type="button" className="przycisk przycisk--maly" onClick={() => przetworz(element)}>Przetwórz</button></>}
        <button type="button" className="przycisk przycisk--tekstowy" onClick={() => repozytorium.usun(element.id)}>Usuń</button>
      </div>
    </article>)}</div>}
  </div>
}

// OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V3: Zadanie obsługuje tryb terminu i godzinę deadline.
