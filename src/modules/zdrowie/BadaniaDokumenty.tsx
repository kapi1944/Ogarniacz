import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan } from '../../components/Interfejs'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { dzisiajIso, noweId, utworzMetadane } from '../../domain/fabryki'
import { KATEGORIE_MEDYCZNE, type WynikBadania } from '../../domain/badania'
import type { Dokument, MapaTabel } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { dokumentyWizyty, usunWynikBadania, uzgodnijRelacjeDokumentow, zapiszDokumentMedyczny, zapiszWynikBadania, type DostepBadan, type DostepZrodel } from '../../services/BadaniaService'
import { WidokSkierowan } from './WidokiZdrowia'

const TABELE_ZRODEL = ['dokumenty', 'wizyty', 'skierowania', 'terapie', 'recepty', 'kontakty', 'miejsca'] as const
type DaneZrodel = { [K in typeof TABELE_ZRODEL[number]]: MapaTabel[K][] }

function komunikatBledu(blad: unknown): string {
  return blad instanceof Error && !('issues' in blad) ? blad.message : 'Sprawdź wymagane pola, daty i oryginalny zapis wyniku.'
}

function Wybor({ etykieta, wartosc, zmien, opcje, wymagane = false }: { etykieta: string; wartosc?: string; zmien: (wartosc: string) => void; opcje: { id: string; nazwa: string }[]; wymagane?: boolean }) {
  return <label className="pole pole--pelne"><span>{etykieta}</span><select required={wymagane} value={wartosc ?? ''} onChange={(zdarzenie) => zmien(zdarzenie.target.value)}>
    <option value="">{wymagane ? 'Wybierz' : 'Brak'}</option>
    {wartosc && !opcje.some((opcja) => opcja.id === wartosc) && <option value={wartosc}>Źródło niedostępne — zachowaj powiązanie</option>}
    {opcje.map((opcja) => <option key={opcja.id} value={opcja.id}>{opcja.nazwa}</option>)}
  </select></label>
}

function nazwyDokumentow(dokumenty: Dokument[]) {
  return dokumenty.map((dokument, indeks) => ({ id: dokument.id, nazwa: `${dokument.nazwa} · ${dokument.nazwaPliku ?? dokument.medyczne?.dataDokumentu ?? dokument.createdAt.slice(0, 10)} · pozycja ${indeks + 1}` }))
}

function FormularzWyniku({ wynik, wyniki, dane, dostep, zrodla, zamknij }: { wynik?: WynikBadania; wyniki: WynikBadania[]; dane: DaneZrodel; dostep: DostepBadan; zrodla: DostepZrodel; zamknij: () => void }) {
  const [szkic, ustawSzkic] = useState<WynikBadania>(() => wynik ?? { ...utworzMetadane(), parametr: '', dataPobrania: dzisiajIso(), oryginalnyWynik: '', kwalifikator: 'tekst', dokumentId: '' })
  const [blad, ustawBlad] = useState('')
  const [zapisuje, ustawZapisuje] = useState(false)
  const grupy = [...new Map(wyniki.filter((element) => element.grupaId).map((element) => [element.grupaId!, element])).values()]
  const zmien = (pole: keyof WynikBadania, wartosc: string) => ustawSzkic({ ...szkic, [pole]: wartosc || undefined })
  async function zapisz(zdarzenie: FormEvent) {
    zdarzenie.preventDefault(); ustawZapisuje(true); ustawBlad('')
    try { await zapiszWynikBadania({ ...szkic, grupaId: szkic.grupaId ?? (szkic.nazwaGrupy?.trim() ? noweId() : undefined) }, dostep, zrodla); zamknij() } catch (blad) { ustawBlad(komunikatBledu(blad)) } finally { ustawZapisuje(false) }
  }
  return <Modal tytul={wynik ? 'Edytuj wynik' : 'Dodaj wynik'} zamknij={zamknij}><form className="formularz" onSubmit={zapisz}>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <label className="pole pole--pelne"><span>Parametr *</span><input required value={szkic.parametr} onChange={(zdarzenie) => zmien('parametr', zdarzenie.target.value)} /></label>
    <label className="pole"><span>Data pobrania *</span><input required type="date" value={szkic.dataPobrania} onChange={(zdarzenie) => zmien('dataPobrania', zdarzenie.target.value)} /></label>
    <label className="pole pole--pelne"><span>Oryginalny zapis wyniku *</span><input required value={szkic.oryginalnyWynik} placeholder="np. 5,2; < 5; ujemny" onChange={(zdarzenie) => zmien('oryginalnyWynik', zdarzenie.target.value)} /></label>
    <Wybor etykieta="Dokument źródłowy *" wymagane wartosc={szkic.dokumentId} opcje={nazwyDokumentow(dane.dokumenty)} zmien={(wartosc) => zmien('dokumentId', wartosc)} />
    <Wybor etykieta="Grupa badania" wartosc={szkic.grupaId} opcje={grupy.map((grupa) => ({ id: grupa.grupaId!, nazwa: `${grupa.nazwaGrupy} · ${grupa.dataPobrania}` }))} zmien={(id) => {
      const grupa = grupy.find((element) => element.grupaId === id)
      ustawSzkic({ ...szkic, grupaId: id || undefined, nazwaGrupy: grupa?.nazwaGrupy, ...(grupa ? { dokumentId: grupa.dokumentId, dataPobrania: grupa.dataPobrania } : {}) })
    }} />
    {!szkic.grupaId && <label className="pole pole--pelne"><span>Nowa grupa (opcjonalnie)</span><input value={szkic.nazwaGrupy ?? ''} onChange={(zdarzenie) => zmien('nazwaGrupy', zdarzenie.target.value)} /></label>}
    {szkic.grupaId && <p className="pole--pelne">Grupa: {szkic.nazwaGrupy}. Wspólna data i dokument źródłowy.</p>}
    <details className="pole--pelne"><summary>Szczegóły wyniku</summary><div className="formularz">
      <label className="pole"><span>Jednostka</span><input value={szkic.jednostka ?? ''} onChange={(zdarzenie) => zmien('jednostka', zdarzenie.target.value)} /></label>
      <label className="pole"><span>Data otrzymania</span><input type="date" value={szkic.dataOtrzymania ?? ''} onChange={(zdarzenie) => zmien('dataOtrzymania', zdarzenie.target.value)} /></label>
      <label className="pole pole--pelne"><span>Zakres referencyjny laboratorium</span><input value={szkic.zakresReferencyjny ?? ''} onChange={(zdarzenie) => zmien('zakresReferencyjny', zdarzenie.target.value)} /></label>
      <label className="pole pole--pelne"><span>Metoda badania</span><input value={szkic.metoda ?? ''} onChange={(zdarzenie) => zmien('metoda', zdarzenie.target.value)} /></label>
      <Wybor etykieta="Powiązana wizyta" wartosc={szkic.wizytaId} opcje={dane.wizyty} zmien={(wartosc) => zmien('wizytaId', wartosc)} />
      <label className="pole pole--pelne"><span>Notatka</span><textarea value={szkic.notatka ?? ''} onChange={(zdarzenie) => zmien('notatka', zdarzenie.target.value)} /></label>
    </div></details>
    <p className="pole--pelne">Zapis lokalny. Zakres pochodzi z laboratorium; wynik nie stanowi diagnozy.</p>
    <div className="akcje-formularza"><button className="przycisk przycisk--glowny" disabled={zapisuje}>Zapisz wynik</button><button type="button" className="przycisk" onClick={zamknij}>Anuluj</button></div>
  </form></Modal>
}

function FormularzDokumentu({ dokument, dane, dostep, zamknij }: { dokument?: Dokument; dane: DaneZrodel; dostep: DostepZrodel; zamknij: () => void }) {
  const [szkic, ustawSzkic] = useState<Dokument>(() => dokument ? { ...dokument, medyczne: dokument.medyczne ?? { kategoria: 'inne' } } : { ...utworzMetadane(), nazwa: '', powiazania: [], medyczne: { kategoria: 'wynik' } })
  const [wizytaId, ustawWizyte] = useState('')
  const [blad, ustawBlad] = useState('')
  const [zapisuje, ustawZapisuje] = useState(false)
  const metadane = szkic.medyczne!
  const zmien = (pole: keyof NonNullable<Dokument['medyczne']>, wartosc: string) => ustawSzkic({ ...szkic, medyczne: { ...metadane, [pole]: wartosc || undefined } })
  async function zapisz(zdarzenie: FormEvent) {
    zdarzenie.preventDefault(); ustawZapisuje(true); ustawBlad('')
    try { await zapiszDokumentMedyczny({ ...szkic, nazwa: szkic.nazwa.trim(), powiazania: [...szkic.powiazania, ...(wizytaId ? [{ typ: 'wizyty' as const, id: wizytaId }] : [])] }, dostep); zamknij() }
    catch (blad) { ustawBlad(komunikatBledu(blad)) } finally { ustawZapisuje(false) }
  }
  return <Modal tytul={dokument ? 'Dokument medyczny — metadane i powiązania' : 'Dodaj dokument medyczny'} zamknij={zamknij}><form className="formularz" onSubmit={zapisz}>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <label className="pole pole--pelne"><span>Nazwa *</span><input required value={szkic.nazwa} onChange={(zdarzenie) => ustawSzkic({ ...szkic, nazwa: zdarzenie.target.value })} /></label>
    <label className="pole pole--pelne"><span>Kategoria</span><select value={metadane.kategoria} onChange={(zdarzenie) => zmien('kategoria', zdarzenie.target.value)}>{Object.entries(KATEGORIE_MEDYCZNE).map(([klucz, nazwa]) => <option key={klucz} value={klucz}>{nazwa}</option>)}</select></label>
    <label className="pole"><span>Data dokumentu</span><input type="date" value={metadane.dataDokumentu ?? ''} onChange={(zdarzenie) => zmien('dataDokumentu', zdarzenie.target.value)} /></label>
    <label className="pole"><span>Data otrzymania</span><input type="date" value={metadane.dataOtrzymania ?? ''} onChange={(zdarzenie) => zmien('dataOtrzymania', zdarzenie.target.value)} /></label>
    {!dokument && <label className="pole pole--pelne"><span>Plik (opcjonalnie)</span><input type="file" onChange={(zdarzenie) => {
      const plik = zdarzenie.target.files?.[0]
      if (plik) ustawSzkic({ ...szkic, plik, nazwaPliku: plik.name, mimeType: plik.type, rozmiar: plik.size })
    }} /></label>}
    <label className="pole pole--pelne"><span>Placówka</span><input value={metadane.placowka ?? ''} onChange={(zdarzenie) => zmien('placowka', zdarzenie.target.value)} /></label>
    <label className="pole pole--pelne"><span>Lekarz lub specjalista</span><input value={metadane.specjalista ?? ''} onChange={(zdarzenie) => zmien('specjalista', zdarzenie.target.value)} /></label>
    <details className="pole--pelne"><summary>Opis, tagi i powiązania</summary><div className="formularz">
      <label className="pole pole--pelne"><span>Opis</span><textarea value={metadane.opis ?? ''} onChange={(zdarzenie) => zmien('opis', zdarzenie.target.value)} /></label>
      <label className="pole pole--pelne"><span>Tagi (oddzielone przecinkami)</span><input value={metadane.tagi?.join(',') ?? ''} onChange={(zdarzenie) => ustawSzkic({ ...szkic, medyczne: { ...metadane, tagi: zdarzenie.target.value.split(',') } })} /></label>
      {dostep('wizyty', 'edycja') && <Wybor etykieta="Dodaj powiązanie z wizytą" wartosc={wizytaId} opcje={dane.wizyty} zmien={ustawWizyte} />}
      <Wybor etykieta="Skierowanie" wartosc={metadane.skierowanieId} opcje={dane.skierowania} zmien={(wartosc) => zmien('skierowanieId', wartosc)} />
      <Wybor etykieta="Terapia" wartosc={metadane.terapiaId} opcje={dane.terapie} zmien={(wartosc) => zmien('terapiaId', wartosc)} />
      <Wybor etykieta="Recepta" wartosc={metadane.receptaId} opcje={dane.recepty.map((element) => ({ id: element.id, nazwa: `Recepta z ${element.dataWystawienia}` }))} zmien={(wartosc) => zmien('receptaId', wartosc)} />
      <Wybor etykieta="Kontakt" wartosc={metadane.kontaktId} opcje={dane.kontakty} zmien={(wartosc) => zmien('kontaktId', wartosc)} />
      <Wybor etykieta="Miejsce" wartosc={metadane.miejsceId} opcje={dane.miejsca} zmien={(wartosc) => zmien('miejsceId', wartosc)} />
    </div></details>
    <div className="akcje-formularza"><button disabled={zapisuje} className="przycisk przycisk--glowny">Zapisz dokument</button><button type="button" className="przycisk" onClick={zamknij}>Anuluj</button></div>
  </form></Modal>
}

function PodgladDokumentu({ dokument, zamknij }: { dokument: Dokument; zamknij: () => void }) {
  const [adres, ustawAdres] = useState('')
  useEffect(() => {
    if (!dokument.plik) return
    const adres = URL.createObjectURL(dokument.plik); ustawAdres(adres)
    return () => URL.revokeObjectURL(adres)
  }, [dokument.plik])
  const typ = dokument.plik?.type ?? dokument.mimeType
  return <Modal tytul={dokument.nazwa} zamknij={zamknij} szeroki>
    {adres && typ?.startsWith('image/') ? <img src={adres} alt={dokument.nazwa} style={{ maxWidth: '100%' }} /> : adres && typ === 'application/pdf' ? <object data={adres} type="application/pdf" style={{ width: '100%', height: '60vh' }}><p>Podgląd PDF niedostępny. Pobierz dokument.</p></object> : <p>Brak podglądu tego formatu.</p>}
    {adres && <a className="przycisk" href={adres} download={dokument.nazwaPliku ?? dokument.nazwa}>Pobierz dokument</a>}
  </Modal>
}

export default function BadaniaDokumenty() {
  const { moze } = useAplikacja()
  const dostep = useCallback<DostepBadan>((operacja) => moze('zdrowie', operacja, 'badania'), [moze])
  const zrodla = useCallback<DostepZrodel>((tabela, operacja) => moze(tabela === 'terapie' || tabela === 'recepty' ? 'zdrowie' : tabela, operacja), [moze])
  const { dane: wyniki } = useRepozytorium('wynikiBadan', dostep)
  const dane = useLiveQuery(async () => Object.fromEntries(await Promise.all(TABELE_ZRODEL.map(async (tabela) => [tabela, zrodla(tabela, 'odczyt') ? await pobierzRepozytorium(tabela).lista() : []]))) as DaneZrodel, [zrodla])
  const [zakladka, ustawZakladke] = useState('badania')
  const [filtr, ustawFiltr] = useState('')
  const [kategoria, ustawKategorie] = useState('')
  const [wynik, ustawWynik] = useState<WynikBadania | null>()
  const [dokument, ustawDokument] = useState<Dokument | null>()
  const [podglad, ustawPodglad] = useState<Dokument>()
  const [usuwany, ustawUsuwany] = useState<WynikBadania>()
  const [blad, ustawBlad] = useState('')
  if (!dane) return <p>Wczytywanie…</p>
  const widoczne = wyniki.filter((element) => element.parametr.toLocaleLowerCase('pl').includes(filtr.toLocaleLowerCase('pl'))).sort((a, b) => b.dataPobrania.localeCompare(a.dataPobrania) || b.createdAt.localeCompare(a.createdAt))
  const daty = [...new Set(widoczne.map((element) => element.dataPobrania))]
  const dokumentyMedyczne = dane.dokumenty.filter((element) => element.medyczne || element.powiazania.some((relacja) => relacja.typ === 'wizyty' || relacja.typ === 'skierowania') || dane.wizyty.some((wizyta) => wizyta.dokumentyIds.includes(element.id)) || wyniki.some((wynik) => wynik.dokumentId === element.id))
  return <div className="widok"><NaglowekWidoku tytul="Badania i dokumenty" opis="Wyniki, dokumentacja medyczna i skierowania." />
    <nav className="akcje-formularza" aria-label="Badania i dokumenty">{[['badania', 'Badania'], ['dokumenty', 'Dokumenty'], ['skierowania', 'Skierowania']].map(([klucz, nazwa]) => <button key={klucz} className="przycisk" aria-pressed={zakladka === klucz} onClick={() => ustawZakladke(klucz)}>{nazwa}</button>)}</nav>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {zakladka === 'badania' && (dostep('odczyt') ? <>
      <p>Wyniki są lokalne i nie trafiają do synchronizacji ani ogólnej pamięci Echo.</p>
      {dostep('edycja') && <button className="przycisk przycisk--glowny" onClick={() => ustawWynik(null)}>Dodaj wynik</button>}
      <label className="pole"><span>Filtruj parametry</span><input type="search" value={filtr} onChange={(zdarzenie) => ustawFiltr(zdarzenie.target.value)} /></label>
      {!widoczne.length && <PustyStan tytul="Brak wyników" opis="Dodaj wynik ręcznie lub zmień filtr." />}
      {daty.map((data) => <section key={data}><h2>{data}</h2>{[...new Set(widoczne.filter((element) => element.dataPobrania === data).map((element) => element.grupaId ?? ''))].map((grupaId) => <div key={grupaId}>
        {grupaId && <h3>{widoczne.find((element) => element.grupaId === grupaId)?.nazwaGrupy}</h3>}
        {widoczne.filter((element) => element.dataPobrania === data && (element.grupaId ?? '') === grupaId).map((element) => {
          const zrodlo = dane.dokumenty.find((dokument) => dokument.id === element.dokumentId)
          return <Karta key={element.id}><h3>{element.parametr}</h3><p><strong>{element.oryginalnyWynik}</strong> {element.jednostka ?? 'Jednostka niepodana'}</p>
            <details><summary>Szczegóły</summary><p>Zakres laboratorium: {element.zakresReferencyjny ?? 'Niepodany'}</p><p>Metoda: {element.metoda ?? 'Niepodana'}</p>{element.dataOtrzymania && <p>Otrzymano: {element.dataOtrzymania}</p>}{element.notatka && <p>{element.notatka}</p>}{element.wizytaId && <p>{dane.wizyty.find((wizyta) => wizyta.id === element.wizytaId)?.nazwa ?? 'Wizyta niedostępna lub brak uprawnienia'}</p>}</details>
            {zrodlo ? <button className="przycisk" onClick={() => ustawPodglad(zrodlo)}>Dokument: {zrodlo.nazwa}</button> : <p>Dokument źródłowy niedostępny lub brak uprawnienia. Powiązanie zachowane.</p>}
            {dostep('edycja') && <div className="akcje-karty"><button className="przycisk" onClick={() => ustawWynik(element)}>Edytuj wynik</button><button className="przycisk" onClick={() => ustawUsuwany(element)}>Usuń wynik</button></div>}
          </Karta>
        })}</div>)}</section>)}
    </> : <Komunikat>Brak uprawnienia do badań.</Komunikat>)}
    {zakladka === 'dokumenty' && (zrodla('dokumenty', 'odczyt') ? <>
      <p>Dokumenty korzystają z dotychczasowej polityki synchronizacji. Lokalność wyników nie zmienia polityki dokumentu źródłowego.</p>
      {zrodla('dokumenty', 'edycja') && <button className="przycisk przycisk--glowny" onClick={() => ustawDokument(null)}>Dodaj dokument medyczny</button>}
      <Wybor etykieta="Kategoria dokumentów" wartosc={kategoria} opcje={Object.entries(KATEGORIE_MEDYCZNE).map(([id, nazwa]) => ({ id, nazwa }))} zmien={ustawKategorie} />
      {zrodla('dokumenty', 'edycja') && <details><summary>Dodaj metadane do istniejącego dokumentu</summary><Wybor etykieta="Istniejący dokument" opcje={nazwyDokumentow(dane.dokumenty)} zmien={(id) => { if (id) ustawDokument(dane.dokumenty.find((element) => element.id === id)) }} /></details>}
      {zrodla('dokumenty', 'edycja') && zrodla('wizyty', 'edycja') && zrodla('wizyty', 'odczyt') && <button className="przycisk" onClick={async () => { try { await uzgodnijRelacjeDokumentow(zrodla) } catch (blad) { ustawBlad(komunikatBledu(blad)) } }}>Uzgodnij starsze powiązania</button>}
      {dokumentyMedyczne.filter((element) => !kategoria || element.medyczne?.kategoria === kategoria).map((element) => <Karta key={element.id}><h3>{element.nazwa}</h3><p>{element.medyczne ? KATEGORIE_MEDYCZNE[element.medyczne.kategoria] : 'Dokument powiązany ze zdrowiem'} · {element.medyczne?.dataDokumentu ?? 'Data niepodana'}</p><p>{element.medyczne?.placowka}</p>
        {dane.wizyty.filter((wizyta) => dokumentyWizyty(wizyta, dane.dokumenty).includes(element.id)).map((wizyta) => <p key={wizyta.id}><Link to={`/zdrowie/wizyty?element=${wizyta.id}`}>{wizyta.nazwa}</Link></p>)}
        <details><summary>Metadane dokumentu</summary><p>{element.medyczne?.specjalista}</p><p>{element.medyczne?.opis}</p><p>{element.medyczne?.tagi?.join(', ')}</p><p>Otrzymano: {element.medyczne?.dataOtrzymania ?? 'Data niepodana'}</p></details>
        <div className="akcje-karty"><button className="przycisk" onClick={() => ustawPodglad(element)}>Podgląd dokumentu</button>{zrodla('dokumenty', 'edycja') && <button className="przycisk" onClick={() => ustawDokument(element)}>Metadane i powiązania</button>}</div>
      </Karta>)}
    </> : <Komunikat>Brak uprawnienia do dokumentów.</Komunikat>)}
    {zakladka === 'skierowania' && (moze('skierowania', 'odczyt') ? <WidokSkierowan /> : <Komunikat>Brak uprawnienia do skierowań.</Komunikat>)}
    {wynik !== undefined && dostep('edycja') && <FormularzWyniku wynik={wynik ?? undefined} wyniki={wyniki} dane={dane} dostep={dostep} zrodla={zrodla} zamknij={() => ustawWynik(undefined)} />}
    {dokument !== undefined && zrodla('dokumenty', 'edycja') && <FormularzDokumentu dokument={dokument ?? undefined} dane={dane} dostep={zrodla} zamknij={() => ustawDokument(undefined)} />}
    {podglad && zrodla('dokumenty', 'odczyt') && <PodgladDokumentu dokument={podglad} zamknij={() => ustawPodglad(undefined)} />}
    {usuwany && <ModalPotwierdzenia tytul="Usuń wynik" opis="Wynik zostanie oznaczony jako usunięty. Dokument źródłowy pozostanie." niebezpieczne anuluj={() => ustawUsuwany(undefined)} potwierdz={async () => { try { await usunWynikBadania(usuwany.id, dostep); ustawUsuwany(undefined) } catch (blad) { ustawBlad(komunikatBledu(blad)) } }} />}
  </div>
}
