import { useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Check, CornerDownRight, RotateCcw, Share2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { WidokRejestru, type DefinicjaPola } from '../../components/WidokRejestru'
import { Karta, Komunikat, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { dzisiajIso, terazIso, utworzMetadane } from '../../domain/fabryki'
import { normalizujTerminZadania, odczytajTerminZadania } from '../../domain/logikaTerminuZadania'
import type { ElementSkrzynki, ListaZakupow, NaPozniej, NazwaModulu, Notatka, PozycjaZakupow, Pomysl, Projekt, Wizyta, Zadanie } from '../../domain/typy'
import { usePodswietlenie } from '../../hooks/usePodswietlenie'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { czyZadanieZalegle, odroczZadanie, przywrocZadanie, ukonczZadanie, utworzZadanie } from '../../services/ZadaniaService'
import { platforma } from '../../platform/platforma'
import { zaproponujPodzialPoczekalni } from '../../services/PoczekalniaService'

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
    { klucz: 'faktycznyCzasMin', etykieta: 'Faktyczny czas (min)', typ: 'number', min: 0 },
    { klucz: 'projektId', etykieta: 'Projekt', typ: 'select', opcje: projekty.map((projekt) => ({ wartosc: projekt.id, etykieta: projekt.nazwa })) },
    { klucz: 'kontekst', etykieta: 'Kontekst / miejsce', podpowiedz: 'np. apteka, telefon, komputer' },
    { klucz: 'miejsceId', etykieta: 'Zapisane miejsce', typ: 'select', opcje: miejsca.map((miejsce) => ({ wartosc: miejsce.id, etykieta: `${miejsce.nazwa} — ${miejsce.adres}` })) },
    { klucz: 'tagi', etykieta: 'Tagi', podpowiedz: 'oddzielone przecinkami' },
    { klucz: 'podzadaniaTekst', etykieta: 'Podzadania', typ: 'textarea', podpowiedz: 'jedno podzadanie w wierszu' },
    { klucz: 'blokujaceIds', etykieta: 'Blokowane przez zadania', typ: 'multiselect', opcje: zadania.map((zadanie) => ({ wartosc: zadanie.id, etykieta: zadanie.tytul })) },
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
      <label className="pole-inline"><span>Widok</span><select value={widok} onChange={(e) => ustawWidok(e.target.value as typeof widok)}><option value="lista">Zwykła lista</option><option value="projekt">Według projektu</option><option value="termin">Według terminu</option></select></label>
      <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => { ustawTrybMasowy(!trybMasowy); ustawZaznaczone(new Set()) }}>{trybMasowy ? 'Zakończ zaznaczanie' : 'Zaznacz wiele'}</button>
      {trybMasowy && zaznaczone.size > 0 && <div className="akcje-karty"><strong>{zaznaczone.size} zazn.</strong><button type="button" className="przycisk przycisk--maly" onClick={() => void Promise.all(zadania.filter((x) => zaznaczone.has(x.id)).map(async (x) => repozytorium.zapisz(ukonczZadanie(x).wykonane)))}>Wykonaj</button><button type="button" className="przycisk przycisk--maly" onClick={() => { const data = window.prompt('Nowy termin (RRRR-MM-DD)'); if (data) void Promise.all(zadania.filter((x) => zaznaczone.has(x.id)).map((x) => repozytorium.zapisz({ ...x, termin: data, updatedAt: terazIso() }))) }}>Przełóż</button><button type="button" className="przycisk przycisk--maly" onClick={() => { const priorytet = window.prompt('Priorytet: niski, normalny, wysoki, krytyczny'); if (['niski', 'normalny', 'wysoki', 'krytyczny'].includes(priorytet ?? '')) void Promise.all(zadania.filter((x) => zaznaczone.has(x.id)).map((x) => repozytorium.zapisz({ ...x, priorytet: priorytet as Zadanie['priorytet'], updatedAt: terazIso() }))) }}>Priorytet</button><select aria-label="Przypisz zaznaczone do projektu" defaultValue="" onChange={(e) => { const projektId = e.target.value || undefined; void Promise.all(zadania.filter((x) => zaznaczone.has(x.id)).map((x) => repozytorium.zapisz({ ...x, projektId, updatedAt: terazIso() }))) }}><option value="">Projekt…</option>{projekty.map((x) => <option key={x.id} value={x.id}>{x.nazwa}</option>)}</select></div>}
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
        faktycznyCzasMin: formularz.faktycznyCzasMin ? Number(formularz.faktycznyCzasMin) : undefined,
        projektId: formularz.projektId || undefined,
        kontekst: formularz.kontekst || undefined,
        miejsceId: formularz.miejsceId || undefined,
        tagi: (formularz.tagi ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        podzadania: formularz.podzadaniaTekst.split('\n').map((tytul) => tytul.trim()).filter(Boolean).map((tytul) => baza.podzadania.find((x) => x.tytul === tytul) ?? { id: crypto.randomUUID(), tytul, wykonane: false }),
        blokowanePrzezIds: formularz.blokujaceIds.split(',').filter((id) => id && id !== baza.id && zadania.some((x) => x.id === id)),
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
        podzadaniaTekst: zadanie.podzadania.map((x) => x.tytul).join('\n'),
        blokujaceIds: (zadanie.blokowanePrzezIds ?? []).join(','),
      }
    }}
    etykieta={(zadanie) => zadanie.tytul}
    szczegoly={(zadanie) => <>
      <Znacznik wariant={zadanie.status === 'wykonane' ? 'sukces' : czyZadanieZalegle(zadanie) ? 'blad' : 'neutralny'}>{zadanie.status === 'w_toku' ? 'w toku' : zadanie.status}</Znacznik>
      <Znacznik wariant={zadanie.priorytet === 'krytyczny' ? 'blad' : zadanie.priorytet === 'wysoki' ? 'ostrzezenie' : 'neutralny'}>priorytet: {zadanie.priorytet}</Znacznik>
      {zadanie.termin && <span>Termin: {zadanie.termin}</span>}
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
      {zadanie.status === 'wykonane' ? <button type="button" className="przycisk-ikona" title="Przywróć" onClick={() => repozytorium.zapisz(przywrocZadanie(zadanie))}><RotateCcw aria-hidden="true" /></button> : <button type="button" className="przycisk-ikona przycisk-ikona--sukces" title="Oznacz jako wykonane" onClick={async () => { const wynik = ukonczZadanie(zadanie); await repozytorium.zapisz(wynik.wykonane); if (wynik.nastepne) await repozytorium.zapisz(wynik.nastepne); await platforma.haptyka.sukces() }}><Check aria-hidden="true" /></button>}
      {zadanie.status !== 'wykonane' && <button type="button" className="przycisk-ikona" title="Odrocz o dzień" onClick={() => repozytorium.zapisz(odroczZadanie(zadanie, format(addDays(parseISO(zadanie.termin ?? dzisiaj), 1), 'yyyy-MM-dd')))}><CornerDownRight aria-hidden="true" /></button>}
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
      ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), opis: formularz.opis ?? '', status: (formularz.status || 'aktywne') as Projekt['status'], nastepneDzialanie: formularz.nastepneDzialanie || undefined, blokady: formularz.blokady ?? '', dataStartu: formularz.dataStartu || undefined, termin: formularz.termin || undefined, celId: formularz.celId || undefined, kamienieMilowe: formularz.kamienieTekst.split('\n').map((wiersz) => wiersz.trim()).filter(Boolean).map((wiersz) => { const [nazwa, termin] = wiersz.split('|').map((x) => x.trim()); return istniejacy?.kamienieMilowe?.find((x) => x.nazwa === nazwa) ?? { id: crypto.randomUUID(), nazwa, wykonany: false, termin: termin || undefined } }), updatedAt: terazIso(),
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
      return <><Znacznik wariant={stan === 'zakończony' ? 'sukces' : ['blokada', 'po terminie'].includes(stan) ? 'blad' : stan === 'stoi' ? 'ostrzezenie' : 'neutralny'}>{stan}</Znacznik><span>Postęp: {wykonane + wykonaneKamienie}/{liczbaElementow} ({procent}%)</span>{projekt.termin && <span>Termin: {projekt.termin}</span>}{projekt.celId && <span>Cel: {cele.find((x) => x.id === projekt.celId)?.nazwa ?? 'nieznany'}</span>}{projekt.nastepneDzialanie && <span>Następne: {projekt.nastepneDzialanie}</span>}{projekt.blokady && <span className="tekst-bledu">Blokady: {projekt.blokady}</span>}{projekt.opis && <p>{projekt.opis}</p>}<strong>Zadania projektu</strong>{powiazane.slice(0, 8).map((x) => <Link key={x.id} to={`/zadania?element=${x.id}`}>{x.tytul}{x.termin && x.termin < dzisiaj && x.status !== 'wykonane' ? ' (zaległe)' : ''}</Link>)}<strong>Kamienie milowe</strong>{kamienie.map((x) => <div key={x.id}><button type="button" className="przycisk-check" onClick={() => repozytorium.zapisz({ ...projekt, kamienieMilowe: kamienie.map((k) => k.id === x.id ? { ...k, wykonany: !k.wykonany } : k), updatedAt: terazIso() })}>{x.wykonany ? '✓' : '○'}</button><span>{x.nazwa}{x.termin ? ` · ${x.termin}` : ''}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => repozytorium.zapisz({ ...projekt, kamienieMilowe: kamienie.filter((k) => k.id !== x.id), updatedAt: terazIso() })}>Usuń</button></div>)}<span>Notatki: {powiazaneNotatki.map((x) => x.tytul).join(', ') || 'brak'} · Dokumenty: {powiazaneDokumenty.map((x) => x.nazwa).join(', ') || 'brak'} · Kontakty: {powiazaneKontakty.map((x) => x.nazwa).join(', ') || 'brak'}</span>{aktywnosc.length > 0 && <span>Ostatnia aktywność: {aktywnosc.map((x) => `${x.nazwa} (${x.data.slice(0, 10)})`).join(' · ')}</span>}</>
    }}
  />
}

type TypKonwersji = 'zadanie' | 'notatka' | 'pomysl' | 'zakup' | 'na_pozniej' | 'wizyta'

export function WidokSkrzynki() {
  const { dane, repozytorium } = useRepozytorium('skrzynka')
  const [typyKonwersji, ustawTypyKonwersji] = useState<Record<string, TypKonwersji>>({})
  const [podgladPodzialu, ustawPodgladPodzialu] = useState<string>()
  const [komunikat, ustawKomunikat] = useState('')
  usePodswietlenie(dane.length)

  const przetworz = async (element: ElementSkrzynki, typWymuszony?: TypKonwersji) => {
    const typ = typWymuszony ?? typyKonwersji[element.id] ?? 'zadanie'
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
    if (!typWymuszony) await repozytorium.zapisz({ ...element, status: 'przetworzone', sugerowanyTyp: modulDocelowy[typ], przeksztalconoNa: { typ: modulDocelowy[typ], id: celId }, updatedAt: terazIso() })
    ustawKomunikat('Element został przetworzony i zachowany w skrzynce jako historia.')
  }

  const przetworzPodzial = async (element: ElementSkrzynki) => {
    const propozycje = zaproponujPodzialPoczekalni(element.tresc)
    for (const propozycja of propozycje) {
      const typ = propozycja.typ === 'zakupy' ? 'zakup' : propozycja.typ === 'wizyty' ? 'wizyta' : propozycja.typ === 'na_pozniej' ? 'na_pozniej' : propozycja.typ === 'pomysly' ? 'pomysl' : 'zadanie'
      await przetworz({ ...element, id: `${element.id}:${propozycja.tresc}`, tresc: propozycja.tresc }, typ)
    }
    await repozytorium.zapisz({ ...element, status: 'przetworzone', updatedAt: terazIso() })
    ustawKomunikat(`Podzielono wpis na ${propozycje.length} elementy. Oryginał pozostał w historii.`)
  }

  return <div className="widok">
    <NaglowekWidoku tytul="Poczekalnia" opis="Zapisz wszystko od razu. Klasyfikacja może poczekać." />
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
    <Karta>
      <form className="szybki-wpis" onSubmit={async (e) => { e.preventDefault(); const pole = e.currentTarget.elements.namedItem('tresc') as HTMLInputElement; if (!pole.value.trim()) return; await repozytorium.zapisz({ ...utworzMetadane(), tresc: pole.value.trim(), zrodlo: 'tekst', status: 'nowe' }); pole.value = '' }}>
        <input name="tresc" aria-label="Treść do skrzynki" placeholder="Co chcesz zapamiętać?" />
        <button className="przycisk przycisk--glowny" type="submit">Zapisz do skrzynki</button>
      </form>
    </Karta>
    {dane.length === 0 ? <PustyStan tytul="Poczekalnia jest pusta" opis="To dobrze — nic nie czeka na uporządkowanie." /> : <div className="lista-rekordow">{dane.map((element) => <article className="rekord" data-element-id={element.id} key={element.id}>
      <div className="rekord__tresc"><h3>{element.tresc}</h3><div className="rekord__szczegoly"><Znacznik wariant={element.status === 'przetworzone' ? 'sukces' : 'ostrzezenie'}>{element.status}</Znacznik><span>{new Date(element.createdAt).toLocaleString('pl-PL')}</span>{element.sugerowanyTyp && <span>Sugerowany typ: {element.sugerowanyTyp}</span>}</div></div>
      <div className="rekord__akcje">
        {element.status === 'nowe' && <><select aria-label="Typ konwersji" value={typyKonwersji[element.id] ?? 'zadanie'} onChange={(e) => ustawTypyKonwersji({ ...typyKonwersji, [element.id]: e.target.value as TypKonwersji })}><option value="zadanie">Zadanie</option><option value="notatka">Notatka</option><option value="pomysl">Pomysł</option><option value="zakup">Zakup</option><option value="wizyta">Do umówienia</option><option value="na_pozniej">Na później</option></select><button type="button" className="przycisk przycisk--maly" onClick={() => przetworz(element)}>Przetwórz</button>{zaproponujPodzialPoczekalni(element.tresc).length > 1 && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawPodgladPodzialu(element.id)}>Podgląd podziału</button>}</>}
        <button type="button" className="przycisk przycisk--tekstowy" onClick={() => repozytorium.usun(element.id)}>Usuń</button>
      </div>
      {podgladPodzialu === element.id && <div className="rekord__szczegoly"><span>{zaproponujPodzialPoczekalni(element.tresc).map((propozycja) => `${propozycja.typ}: ${propozycja.tresc}`).join(' · ')}</span><button type="button" className="przycisk przycisk--maly" onClick={() => { void przetworzPodzial(element); ustawPodgladPodzialu(undefined) }}>Przetwórz propozycje</button><button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawPodgladPodzialu(undefined)}>Anuluj</button></div>}
    </article>)}</div>}
  </div>
}

// OGARNIACZ_TASK_DEADLINE_TIME_2026_08_27_V3: Zadanie obsługuje tryb terminu i godzinę deadline.
