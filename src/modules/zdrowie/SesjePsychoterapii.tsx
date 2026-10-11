import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { Link, useSearchParams } from 'react-router-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan } from '../../components/Interfejs'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { noweId, terazIso, utworzMetadane } from '../../domain/fabryki'
import type { Kontakt, Dokument, Terapia, Wizyta, WpisTerapii, Zadanie } from '../../domain/typy'
import type { WpisSamopoczucia } from '../../domain/samopoczucie'
import { usunSesje, utworzCwiczenie, zapiszSesje, type DostepPsychoterapii } from '../../services/PsychoterapiaService'

interface DaneSesji {
  sesje: WpisTerapii[]; terapie: Terapia[]; wizyty: Wizyta[]; kontakty: Kontakt[]; dokumenty: Dokument[]
  dziennik: WpisSamopoczucia[]; zadania: Zadanie[]
}
const pusteDane: DaneSesji = { sesje: [], terapie: [], wizyty: [], kontakty: [], dokumenty: [], dziennik: [], zadania: [] }
const etykietyStatusu = { otwarte: 'Do wykonania', w_toku: 'W trakcie', wykonane: 'Wykonane' }
function opisBledu(przyczyna: unknown) {
  return przyczyna instanceof Error && !('issues' in przyczyna) ? przyczyna.message : 'Sprawdź uzupełnione pola.'
}
function dataSesji(czas: string) {
  return Number.isFinite(Date.parse(czas)) ? new Date(czas).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : czas
}
function czasFormularza(czas: string) { return Number.isFinite(Date.parse(czas)) ? format(new Date(czas), "yyyy-MM-dd'T'HH:mm") : '' }
function dzienSesji(czas: string) { return Number.isFinite(Date.parse(czas)) ? format(new Date(czas), 'yyyy-MM-dd') : czas.slice(0, 10) }
function nazwaTerapeuty(kontakt?: Kontakt) { return kontakt?.nazwa ?? 'Niedostępny kontakt' }

function WyborZrodel({ tytul, opcje, wybrane, zmien }: { tytul: string; opcje: { id: string; etykieta: string; opis?: string }[]; wybrane: string[]; zmien: (ids: string[]) => void }) {
  const wszystkie = [...opcje, ...wybrane.filter((id) => !opcje.some((opcja) => opcja.id === id)).map((id) => ({ id, etykieta: 'Niedostępne źródło', opis: undefined }))]
  return <fieldset className="psychoterapia-zrodla"><legend>{tytul}</legend>{wszystkie.length === 0 && <p>Brak dostępnych źródeł.</p>}{wszystkie.map((opcja) => <div key={opcja.id}>
    <label><input type="checkbox" checked={wybrane.includes(opcja.id)} onChange={(zdarzenie) => zmien(zdarzenie.target.checked ? [...wybrane, opcja.id] : wybrane.filter((id) => id !== opcja.id))} /> {opcja.etykieta}</label>
    {opcja.opis && <details><summary>Pokaż wybrane źródło</summary><p className="psychoterapia-tekst">{opcja.opis}</p></details>}
  </div>)}</fieldset>
}

function FormularzSesji({ wpis, dane, dostep, przygotowanie, zamknij }: { wpis?: WpisTerapii; dane: DaneSesji; dostep: DostepPsychoterapii; przygotowanie: boolean; zamknij: () => void }) {
  const [szkic, ustawSzkic] = useState<WpisTerapii>(() => wpis ? { ...wpis, psychoterapia: wpis.psychoterapia ?? {} } : { ...utworzMetadane(), terapiaId: '', dataCzas: terazIso(), tresc: '', psychoterapia: {} })
  const [czas, ustawCzas] = useState(() => czasFormularza(szkic.dataCzas))
  const [blad, ustawBlad] = useState('')
  const [zapisuje, ustawZapisuje] = useState(false)
  const zmien = (zmiany: Partial<WpisTerapii>) => ustawSzkic((poprzedni) => ({ ...poprzedni, ...zmiany }))
  const zmienSzczegoly = (zmiany: Partial<NonNullable<WpisTerapii['psychoterapia']>>) => ustawSzkic((poprzedni) => ({ ...poprzedni, psychoterapia: { ...poprzedni.psychoterapia, ...zmiany } }))
  const poleTekstu = (etykieta: string, klucz: 'tresc' | 'tytul' | 'zalecenia' | 'obserwacje' | 'tematNastepnegoSpotkania') => <label className="pole"><span>{etykieta}</span><textarea rows={klucz === 'tytul' ? 1 : 3} value={szkic[klucz] ?? ''} onChange={(zdarzenie) => zmien({ [klucz]: zdarzenie.target.value })} /></label>
  return <form className="formularz psychoterapia-formularz" onSubmit={async (zdarzenie) => {
    zdarzenie.preventDefault(); if (zapisuje) return; ustawZapisuje(true); ustawBlad('')
    try { await zapiszSesje({ ...szkic, dataCzas: !czas || czas === czasFormularza(szkic.dataCzas) ? szkic.dataCzas : new Date(czas).toISOString() }, dostep); zamknij() }
    catch (przyczyna) { ustawBlad(opisBledu(przyczyna)) } finally { ustawZapisuje(false) }
  }}>
    <p>Wystarczy krótka notatka. Pozostałe informacje uzupełniasz, kiedy chcesz.</p>
    {poleTekstu('Krótka notatka', 'tresc')}
    <details><summary>Termin, terapia i terapeuta</summary><div className="formularz">
      <label className="pole"><span>Data i godzina</span><input type="datetime-local" value={czas} onChange={(zdarzenie) => ustawCzas(zdarzenie.target.value)} /></label>
      <label className="pole"><span>Terapia</span><select value={szkic.terapiaId} onChange={(zdarzenie) => zmien({ terapiaId: zdarzenie.target.value })}><option value="">Bez wskazanej terapii</option>{szkic.terapiaId && !dane.terapie.some((terapia) => terapia.id === szkic.terapiaId) && <option value={szkic.terapiaId}>Niedostępna terapia</option>}{dane.terapie.map((terapia) => <option key={terapia.id} value={terapia.id}>{terapia.nazwa}</option>)}</select></label>
      <label className="pole"><span>Terapeuta</span><select value={szkic.psychoterapia?.terapeutaId ?? ''} onChange={(zdarzenie) => zmienSzczegoly({ terapeutaId: zdarzenie.target.value || undefined })}><option value="">Bez wskazanego terapeuty</option>{szkic.psychoterapia?.terapeutaId && !dane.kontakty.some((kontakt) => kontakt.id === szkic.psychoterapia?.terapeutaId) && <option value={szkic.psychoterapia.terapeutaId}>Niedostępny kontakt</option>}{dane.kontakty.map((kontakt) => <option key={kontakt.id} value={kontakt.id}>{nazwaTerapeuty(kontakt)}</option>)}</select></label>
      <label className="pole"><span>Powiązana wizyta</span><select value={szkic.wizytaId ?? ''} onChange={(zdarzenie) => zmien({ wizytaId: zdarzenie.target.value || undefined })}><option value="">Bez zaplanowanej wizyty</option>{szkic.wizytaId && !dane.wizyty.some((wizyta) => wizyta.id === szkic.wizytaId) && <option value={szkic.wizytaId}>Niedostępna wizyta</option>}{dane.wizyty.map((wizyta) => <option key={wizyta.id} value={wizyta.id}>{wizyta.nazwa} · {wizyta.data ?? 'Bez terminu'}</option>)}</select></label>
    </div></details>
    <details><summary>Tematy</summary>{poleTekstu('Temat spotkania', 'tytul')}<label className="pole"><span>Najważniejsze zagadnienia</span><textarea rows={3} value={szkic.psychoterapia?.tematy ?? ''} onChange={(zdarzenie) => zmienSzczegoly({ tematy: zdarzenie.target.value })} /></label></details>
    <details><summary>Ustalenia</summary><p>Twój zapis ustaleń i zaleceń. Nie jest zweryfikowanym zaleceniem medycznym.</p>{poleTekstu('Zapisane ustalenia', 'zalecenia')}<label className="pole"><span>Ważne wypowiedzi</span><textarea rows={3} value={szkic.psychoterapia?.wypowiedzi ?? ''} onChange={(zdarzenie) => zmienSzczegoly({ wypowiedzi: zdarzenie.target.value })} /></label></details>
    <details><summary>Refleksje</summary>{poleTekstu('Własne refleksje', 'obserwacje')}{szkic.samopoczucie !== undefined && <p>Zachowana wcześniejsza ocena samopoczucia: {szkic.samopoczucie}/5</p>}</details>
    <details open={przygotowanie || undefined}><summary>Pytania na następne spotkanie</summary>{poleTekstu('Pytania', 'tematNastepnegoSpotkania')}
      <WyborZrodel tytul="Pytania z wcześniejszych spotkań" opcje={dane.sesje.filter((sesja) => sesja.id !== szkic.id && Boolean(sesja.tematNastepnegoSpotkania) && Date.parse(sesja.dataCzas) < Date.parse(czas || szkic.dataCzas)).map((sesja) => ({ id: sesja.id, etykieta: dataSesji(sesja.dataCzas), opis: sesja.tematNastepnegoSpotkania }))} wybrane={szkic.psychoterapia?.pytaniaSesjiIds ?? []} zmien={(ids) => zmienSzczegoly({ pytaniaSesjiIds: ids })} />
    </details>
    <details open={przygotowanie || undefined}><summary>Do omówienia i wcześniejsze ustalenia</summary>
      {dostep.dziennik() ? <WyborZrodel tytul="Do omówienia na terapii" opcje={dane.dziennik.filter((wpis) => wpis.doOmowienia || szkic.psychoterapia?.wpisySamopoczuciaIds?.includes(wpis.id)).map((wpis) => ({ id: wpis.id, etykieta: dataSesji(wpis.czasObserwacji), opis: [wpis.notatka, wpis.szczegoly?.omowienie].filter(Boolean).join('\n') }))} wybrane={szkic.psychoterapia?.wpisySamopoczuciaIds ?? []} zmien={(ids) => zmienSzczegoly({ wpisySamopoczuciaIds: ids })} /> : <p>Brak uprawnienia do dziennika samopoczucia. Zapisane odniesienia pozostają zachowane.</p>}
      <WyborZrodel tytul="Wcześniejsze ustalenia" opcje={dane.sesje.filter((sesja) => sesja.id !== szkic.id && Boolean(sesja.zalecenia) && Date.parse(sesja.dataCzas) < Date.parse(czas || szkic.dataCzas)).map((sesja) => ({ id: sesja.id, etykieta: `${dataSesji(sesja.dataCzas)} · ${sesja.tytul || 'Sesja'}`, opis: sesja.zalecenia }))} wybrane={szkic.psychoterapia?.ustaleniaSesjiIds ?? []} zmien={(ids) => zmienSzczegoly({ ustaleniaSesjiIds: ids })} />
    </details>
    <details><summary>Dokumenty</summary><WyborZrodel tytul="Powiązane dokumenty" opcje={dane.dokumenty.map((dokument) => ({ id: dokument.id, etykieta: dokument.nazwa }))} wybrane={szkic.psychoterapia?.dokumentyIds ?? []} zmien={(ids) => zmienSzczegoly({ dokumentyIds: ids })} /></details>
    <details open={przygotowanie || undefined}><summary>Ćwiczenia</summary><p>Nowe ćwiczenie utworzysz po zapisaniu sesji, zatwierdzając zwykłe zadanie.</p>{dostep.zadania('odczyt') ? <WyborZrodel tytul="Niewykonane ćwiczenia do omówienia" opcje={dane.zadania.filter((zadanie) => zadanie.sesjaTerapiiId && (zadanie.status !== 'wykonane' || szkic.psychoterapia?.cwiczeniaZadaniaIds?.includes(zadanie.id))).map((zadanie) => ({ id: zadanie.id, etykieta: `${zadanie.tytul} · ${etykietyStatusu[zadanie.status]}${zadanie.termin ? ` · ${zadanie.termin}` : ''}`, opis: zadanie.opis }))} wybrane={szkic.psychoterapia?.cwiczeniaZadaniaIds ?? []} zmien={(ids) => zmienSzczegoly({ cwiczeniaZadaniaIds: ids })} /> : <p>Brak uprawnienia do zadań. Zapisane odniesienia pozostają zachowane.</p>}</details>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <div className="akcje-formularza"><button type="button" className="przycisk" onClick={zamknij}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny" disabled={zapisuje}>{zapisuje ? 'Zapisywanie…' : 'Zapisz sesję'}</button></div>
  </form>
}

function FormularzCwiczenia({ sesja, dostep, zamknij }: { sesja: WpisTerapii; dostep: DostepPsychoterapii; zamknij: () => void }) {
  const [operacjaId] = useState(noweId)
  const [tytul, ustawTytul] = useState('')
  const [opis, ustawOpis] = useState('')
  const [termin, ustawTermin] = useState('')
  const [potwierdzenie, ustawPotwierdzenie] = useState(false)
  const [zapisuje, ustawZapisuje] = useState(false)
  const [blad, ustawBlad] = useState('')
  return <form className="formularz" onSubmit={async (zdarzenie) => { zdarzenie.preventDefault(); if (zapisuje) return; ustawZapisuje(true); try { await utworzCwiczenie(sesja.id, operacjaId, { tytul, opis, termin: termin || undefined }, potwierdzenie, dostep); zamknij() } catch (przyczyna) { ustawBlad(opisBledu(przyczyna)) } finally { ustawZapisuje(false) } }}>
    <label className="pole"><span>Tytuł ćwiczenia</span><input value={tytul} onChange={(zdarzenie) => ustawTytul(zdarzenie.target.value)} /></label>
    <label className="pole"><span>Opis ćwiczenia</span><textarea rows={3} value={opis} onChange={(zdarzenie) => ustawOpis(zdarzenie.target.value)} /></label>
    <label className="pole"><span>Termin (opcjonalnie)</span><input type="date" value={termin} onChange={(zdarzenie) => ustawTermin(zdarzenie.target.value)} /></label>
    <label><input type="checkbox" checked={potwierdzenie} onChange={(zdarzenie) => ustawPotwierdzenie(zdarzenie.target.checked)} /> Zatwierdzam utworzenie zadania powiązanego z sesją</label>
    <p>Ćwiczenie będzie dostępne w Zadaniach z uprawnieniem do psychoterapii. Pozostaje lokalne i nie pojawi się w ogólnych podglądach.</p>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <div className="akcje-formularza"><button type="button" className="przycisk" onClick={zamknij}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny" disabled={zapisuje || !potwierdzenie}>Utwórz ćwiczenie</button></div>
  </form>
}

export function SesjePsychoterapii() {
  const { moze } = useAplikacja()
  const [parametry] = useSearchParams()
  const odczyt = moze('zdrowie', 'odczyt', 'psychoterapia')
  const dziennik = moze('zdrowie', 'odczyt', 'samopoczucie')
  const zadania = moze('zadania', 'odczyt')
  const kontakty = moze('kontakty', 'odczyt')
  const dokumenty = moze('dokumenty', 'odczyt')
  const wizyty = moze('wizyty', 'odczyt')
  const dostep: DostepPsychoterapii = { sesje: (operacja) => moze('zdrowie', operacja, 'psychoterapia'), dziennik: () => moze('zdrowie', 'odczyt', 'samopoczucie'), zadania: (operacja) => moze('zadania', operacja), zrodla: (tabela) => moze(tabela, 'odczyt') }
  const odczytaneDane = useLiveQuery(async (): Promise<DaneSesji> => {
    if (!odczyt) return pusteDane
    const [sesje, terapie, daneWizyt, daneKontaktow, daneDokumentow, daneDziennika, daneZadan] = await Promise.all([
      pobierzRepozytorium('wpisyTerapii', dostep.sesje).lista(), pobierzRepozytorium('terapie').lista(),
      wizyty ? pobierzRepozytorium('wizyty').lista() : [], kontakty ? pobierzRepozytorium('kontakty').lista() : [], dokumenty ? pobierzRepozytorium('dokumenty').lista() : [],
      dziennik ? pobierzRepozytorium('wpisySamopoczucia').lista() : [], zadania ? pobierzRepozytorium('zadania', dostep.sesje).lista() : [],
    ])
    return { sesje, terapie, wizyty: daneWizyt, kontakty: daneKontaktow, dokumenty: daneDokumentow, dziennik: daneDziennika, zadania: daneZadan }
  }, [odczyt, dziennik, zadania, kontakty, dokumenty, wizyty], pusteDane) ?? pusteDane
  const dane = { ...odczytaneDane, dziennik: dziennik ? odczytaneDane.dziennik : [], zadania: zadania ? odczytaneDane.zadania : [], kontakty: kontakty ? odczytaneDane.kontakty : [], dokumenty: dokumenty ? odczytaneDane.dokumenty : [], wizyty: wizyty ? odczytaneDane.wizyty : [] }
  const [formularz, ustawFormularz] = useState<{ wpis?: WpisTerapii; przygotowanie: boolean }>()
  const [otwartaId, ustawOtwartaId] = useState<string | undefined>(() => parametry.get('sesja') ?? undefined)
  const [cwiczenieId, ustawCwiczenieId] = useState<string>()
  const [usunId, ustawUsunId] = useState<string>()
  const [filtrTerapii, ustawFiltrTerapii] = useState('')
  const [od, ustawOd] = useState('')
  const [doDaty, ustawDo] = useState('')
  const [szukana, ustawSzukana] = useState('')
  const [blad, ustawBlad] = useState('')
  if (!odczyt) return <Komunikat typ="blad">Brak uprawnienia do psychoterapii.</Komunikat>
  const otwarta = dane.sesje.find((sesja) => sesja.id === otwartaId)
  const sesjaCwiczenia = dane.sesje.find((sesja) => sesja.id === cwiczenieId)
  const najblizsza = dane.sesje.filter((sesja) => Date.parse(sesja.dataCzas) >= Date.now()).sort((a, b) => Date.parse(a.dataCzas) - Date.parse(b.dataCzas))[0]
  const historia = dane.sesje.filter((sesja) => (!filtrTerapii || sesja.terapiaId === filtrTerapii) && (!od || dzienSesji(sesja.dataCzas) >= od) && (!doDaty || dzienSesji(sesja.dataCzas) <= doDaty) && (!szukana || (sesja.tytul ?? '').toLocaleLowerCase('pl').includes(szukana.toLocaleLowerCase('pl')))).sort((a, b) => Date.parse(b.dataCzas) - Date.parse(a.dataCzas) || a.id.localeCompare(b.id))
  const edycja = dostep.sesje('edycja')
  const przygotuj = () => ustawFormularz({ wpis: najblizsza, przygotowanie: true })
  const nazwaTerapii = (sesja: WpisTerapii) => sesja.terapiaId ? dane.terapie.find((terapia) => terapia.id === sesja.terapiaId)?.nazwa ?? 'Niedostępna terapia' : 'Bez wskazanej terapii'
  return <section className="widok psychoterapia">
    <NaglowekWidoku tytul="Sesje psychoterapii" opis="Przygotowanie, notatki i działania pomiędzy spotkaniami." />
    <div className="akcje-formularza">{edycja && <><button className="przycisk przycisk--glowny" onClick={() => ustawFormularz({ przygotowanie: false })}>Nowa sesja</button><button className="przycisk" onClick={przygotuj}>Przygotuj się</button></>}<a className="przycisk" href="#historia-psychoterapii">Historia</a>{edycja && <button className="przycisk" onClick={przygotuj}>Do omówienia</button>}</div>
    <Karta><p>Sesje zapisane tutaj i ich ćwiczenia pozostają lokalne. Nie trafiają do Echo, synchronizacji, powiadomień ani ogólnych podglądów. Baza i backup nie są szyfrowane. Kopia zapasowa zawiera pełną treść.</p><p>{najblizsza ? `Najbliższa zaplanowana sesja: ${dataSesji(najblizsza.dataCzas)} · ${nazwaTerapii(najblizsza)}` : 'Nie masz zapisanej przyszłej sesji.'}</p></Karta>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <Karta><h2 id="historia-psychoterapii">Historia psychoterapii</h2><div className="formularz">
      <label className="pole"><span>Filtr terapii</span><select value={filtrTerapii} onChange={(zdarzenie) => ustawFiltrTerapii(zdarzenie.target.value)}><option value="">Wszystkie terapie</option>{dane.terapie.map((terapia) => <option key={terapia.id} value={terapia.id}>{terapia.nazwa}</option>)}</select></label>
      <label className="pole"><span>Sesje od</span><input type="date" value={od} onChange={(zdarzenie) => ustawOd(zdarzenie.target.value)} /></label><label className="pole"><span>Sesje do</span><input type="date" value={doDaty} onChange={(zdarzenie) => ustawDo(zdarzenie.target.value)} /></label><label className="pole"><span>Szukaj tematu</span><input value={szukana} onChange={(zdarzenie) => ustawSzukana(zdarzenie.target.value)} /></label>
    </div>{!historia.length && <PustyStan tytul="Brak sesji w wybranym zakresie" opis="Zapisz krótką notatkę lub przygotuj się do spotkania." />}
      {historia.map((sesja) => {
        const cwiczenia = zadania ? dane.zadania.filter((zadanie) => zadanie.sesjaTerapiiId === sesja.id) : []
        return <article className="psychoterapia-sesja" key={sesja.id}><time dateTime={sesja.dataCzas}>{dataSesji(sesja.dataCzas)}</time><h3>{sesja.tytul || 'Sesja bez tematu'}</h3><p>{nazwaTerapii(sesja)}{sesja.psychoterapia?.terapeutaId && ` · ${kontakty ? nazwaTerapeuty(dane.kontakty.find((kontakt) => kontakt.id === sesja.psychoterapia?.terapeutaId)) : 'Kontakt bez uprawnienia do odczytu'}`}</p><p>{sesja.tresc ? 'Zapisana notatka' : 'Bez krótkiej notatki'} · Powiązane zagadnienia: {(sesja.psychoterapia?.wpisySamopoczuciaIds?.length ?? 0) + (sesja.psychoterapia?.ustaleniaSesjiIds?.length ?? 0) + (sesja.psychoterapia?.pytaniaSesjiIds?.length ?? 0)}</p><p>{zadania ? `Ćwiczenia: ${cwiczenia.filter((zadanie) => zadanie.status === 'wykonane').length}/${cwiczenia.length} wykonanych` : 'Ćwiczenia: brak uprawnienia do odczytu'}</p><button className="przycisk" onClick={() => ustawOtwartaId(sesja.id)}>Otwórz sesję</button></article>
      })}
    </Karta>
    {formularz && edycja && <Modal tytul={formularz.przygotowanie ? 'Przygotowanie do terapii' : formularz.wpis ? 'Edytuj sesję' : 'Nowa sesja'} zamknij={() => ustawFormularz(undefined)}><FormularzSesji wpis={formularz.wpis} dane={dane} dostep={dostep} przygotowanie={formularz.przygotowanie} zamknij={() => ustawFormularz(undefined)} /></Modal>}
    {otwarta && <Modal tytul={otwarta.tytul || 'Sesja psychoterapii'} zamknij={() => ustawOtwartaId(undefined)}><p>{dataSesji(otwarta.dataCzas)} · {nazwaTerapii(otwarta)}</p>
      {otwarta.wizytaId && <p>{wizyty && dane.wizyty.some((wizyta) => wizyta.id === otwarta.wizytaId) ? <Link to={`/zdrowie/wizyty?element=${otwarta.wizytaId}`}>Otwórz powiązaną wizytę</Link> : 'Powiązana wizyta jest niedostępna.'}</p>}
      {([['Notatka', otwarta.tresc], ['Tematy', otwarta.psychoterapia?.tematy], ['Ustalenia zapisane przez użytkownika', otwarta.zalecenia], ['Refleksje', otwarta.obserwacje], ['Ważne wypowiedzi', otwarta.psychoterapia?.wypowiedzi], ['Pytania', otwarta.tematNastepnegoSpotkania]] as const).map(([etykieta, tekst]) => tekst && <section key={etykieta}><h3>{etykieta}</h3><p className="psychoterapia-tekst">{tekst}</p></section>)}
      {(otwarta.psychoterapia?.wpisySamopoczuciaIds ?? []).map((id) => { const zrodlo = dziennik ? dane.dziennik.find((wpis) => wpis.id === id) : undefined; return <details key={id}><summary>{dziennik ? zrodlo ? `Dziennik · ${dataSesji(zrodlo.czasObserwacji)}` : 'Niedostępne źródło dziennika' : 'Dziennik: brak uprawnienia do odczytu'}</summary>{zrodlo && <p className="psychoterapia-tekst">{zrodlo.notatka || zrodlo.szczegoly?.omowienie || 'Obserwacja bez notatki'}</p>}</details> })}
      {(otwarta.psychoterapia?.ustaleniaSesjiIds ?? []).map((id) => { const zrodlo = dane.sesje.find((sesja) => sesja.id === id); return <details key={id}><summary>{zrodlo ? `Wcześniejsze ustalenia · ${dataSesji(zrodlo.dataCzas)}` : 'Niedostępne źródło ustaleń'}</summary><p className="psychoterapia-tekst">{zrodlo?.zalecenia}</p>{zrodlo && <button className="przycisk" onClick={() => ustawOtwartaId(id)}>Otwórz wcześniejszą sesję</button>}</details> })}
      {(otwarta.psychoterapia?.pytaniaSesjiIds ?? []).map((id) => { const zrodlo = dane.sesje.find((sesja) => sesja.id === id); return <details key={id}><summary>{zrodlo ? `Wcześniejsze pytania · ${dataSesji(zrodlo.dataCzas)}` : 'Niedostępne źródło pytań'}</summary><p className="psychoterapia-tekst">{zrodlo?.tematNastepnegoSpotkania}</p></details> })}
      {(otwarta.psychoterapia?.cwiczeniaZadaniaIds ?? []).map((id) => { const zrodlo = zadania ? dane.zadania.find((zadanie) => zadanie.id === id) : undefined; return <p key={id}>{zadania ? zrodlo ? `Wybrane ćwiczenie: ${zrodlo.tytul} · ${etykietyStatusu[zrodlo.status]}` : 'Niedostępne źródło ćwiczenia' : 'Ćwiczenie: brak uprawnienia do odczytu'}</p> })}
      {(otwarta.psychoterapia?.dokumentyIds ?? []).map((id) => <p key={id}>{dokumenty && dane.dokumenty.some((dokument) => dokument.id === id) ? <Link to={`/dokumenty?element=${id}`}>{dane.dokumenty.find((dokument) => dokument.id === id)?.nazwa}</Link> : 'Dokument niedostępny lub brak uprawnienia'}</p>)}
      <h3>Ćwiczenia</h3>{zadania ? dane.zadania.filter((zadanie) => zadanie.sesjaTerapiiId === otwarta.id).map((zadanie) => <p key={zadanie.id}><Link to={`/zadania?element=${zadanie.id}`}>{zadanie.tytul}</Link> · {etykietyStatusu[zadanie.status]}{zadanie.termin && ` · ${zadanie.termin}`}</p>) : <p>Brak uprawnienia do zadań.</p>}
      {edycja && <div className="akcje-formularza"><button className="przycisk" onClick={() => { ustawOtwartaId(undefined); ustawFormularz({ wpis: otwarta, przygotowanie: false }) }}>Edytuj sesję</button>{otwarta.psychoterapia && dostep.zadania('edycja') && zadania && <button className="przycisk" onClick={() => { ustawOtwartaId(undefined); ustawCwiczenieId(otwarta.id) }}>Dodaj ćwiczenie</button>}<button className="przycisk" onClick={() => { ustawOtwartaId(undefined); ustawUsunId(otwarta.id) }}>Usuń sesję</button></div>}
    </Modal>}
    {sesjaCwiczenia && edycja && dostep.zadania('edycja') && zadania && <Modal tytul="Nowe ćwiczenie terapeutyczne" zamknij={() => ustawCwiczenieId(undefined)}><FormularzCwiczenia sesja={sesjaCwiczenia} dostep={dostep} zamknij={() => ustawCwiczenieId(undefined)} /></Modal>}
    {usunId && edycja && <ModalPotwierdzenia tytul="Usuń sesję" opis="Sesja zostanie oznaczona jako usunięta. Jej zadania i źródła pozostaną zachowane." niebezpieczne anuluj={() => ustawUsunId(undefined)} potwierdz={async () => { try { await usunSesje(usunId, dostep); ustawUsunId(undefined) } catch (przyczyna) { ustawBlad(opisBledu(przyczyna)) } }} />}
  </section>
}
