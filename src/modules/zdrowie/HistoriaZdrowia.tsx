import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { dzisiajIso, utworzMetadane } from '../../domain/fabryki'
import { KATEGORIE_OSI_ZDROWIA, KATEGORIE_WAZNYCH_INFORMACJI, STATUSY_POTWIERDZENIA, opisChwiliZdrowia, opisDatyZdrowia, type DataZdrowia, type WaznaInformacjaZdrowotna, type ZdarzenieZdrowia, type ZrodloZdrowia } from '../../domain/historiaZdrowia'
import { platforma } from '../../platform/platforma'
import { filtrujOsZdrowia, odczytajZrodloZdrowia, pobierzDaneHistoriiZdrowia, SEKCJE_KARTY_ZDROWOTNEJ, sortujZdarzeniaZdrowia, stanZrodlaZdrowia, usunWaznaInformacje, wygenerujKartePoPodgladzie, wybierzSekcjeKarty, zbudujKarteZdrowotna, zbudujOsZdrowia, zapiszWaznaInformacje, type DaneHistoriiZdrowia, type DostepHistoriiZdrowia, type KartaZdrowotna, type SekcjaKartyZdrowotnej } from '../../services/HistoriaZdrowiaService'
import './historiaZdrowia.css'

function opisBledu(blad: unknown) { return blad instanceof Error && !('issues' in blad) ? blad.message : 'Sprawdź treść, datę lub okres oraz powiązania.' }

function useDaneOsiZdrowia() {
  const { moze } = useAplikacja()
  const dostep = useCallback<DostepHistoriiZdrowia>((tabela, operacja) => {
    if (tabela === 'leki' || tabela === 'dziennikLekow') return moze('leki', operacja)
    if (tabela === 'wynikiBadan') return moze('zdrowie', operacja, 'badania')
    if (tabela === 'wpisyTerapii') return moze('zdrowie', operacja, 'psychoterapia')
    if (tabela === 'wpisySamopoczucia') return moze('zdrowie', operacja, 'samopoczucie')
    if (tabela === 'wazneInformacjeZdrowotne') return moze('zdrowie', operacja, 'wazne_informacje')
    if (tabela === 'recepty' || tabela === 'terapie') return moze('zdrowie', operacja)
    return moze(tabela, operacja)
  }, [moze])
  const dane = useLiveQuery(() => pobierzDaneHistoriiZdrowia(dostep), [dostep])
  const [strefa, ustawStrefe] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [teraz, ustawTeraz] = useState(() => new Date())
  useEffect(() => { const zegar = window.setInterval(() => ustawTeraz(new Date()), 60_000); return () => window.clearInterval(zegar) }, [])
  const os = useMemo(() => dane ? zbudujOsZdrowia(dane, dostep, strefa) : [], [dane, dostep, strefa])
  const karta = useMemo(() => dane ? zbudujKarteZdrowotna(dane, dostep, teraz, strefa) : undefined, [dane, dostep, teraz, strefa])
  return { dane, dostep, os, karta, strefa, ustawStrefe }
}

function PrzelacznikWidokow() {
  return <nav className="akcje-formularza" aria-label="Widoki historii zdrowia"><Link className="przycisk" to="/zdrowie/historia">Osobista oś czasu</Link><Link className="przycisk" to="/zdrowie/wazne-informacje">Ważne informacje</Link></nav>
}

function FormularzWaznejInformacji({ informacja, zdarzenie, dane, dostep, zamknij }: { informacja?: WaznaInformacjaZdrowotna; zdarzenie?: ZdarzenieZdrowia; dane: DaneHistoriiZdrowia; dostep: DostepHistoriiZdrowia; zamknij: () => void }) {
  const [szkic, ustawSzkic] = useState<WaznaInformacjaZdrowotna>(() => informacja ?? {
    ...utworzMetadane(), kategoria: 'inne', tresc: '', data: zdarzenie?.data ?? { dokladnosc: 'nieznana' },
    zrodlo: zdarzenie?.zrodlo, statusPotwierdzenia: 'do_weryfikacji', ukryjTresc: true,
  })
  const [blad, ustawBlad] = useState('')
  const [zapisuje, ustawZapisuje] = useState(false)
  const zmienDate = (wartosc: string, koniec = false) => {
    if (szkic.data.dokladnosc === 'okres') ustawSzkic({ ...szkic, data: { ...szkic.data, [koniec ? 'do' : 'od']: wartosc } })
    else if (szkic.data.dokladnosc === 'nieznana') ustawSzkic({ ...szkic, data: { ...szkic.data, opis: wartosc || undefined } })
    else ustawSzkic({ ...szkic, data: { ...szkic.data, od: wartosc } })
  }
  async function zapisz(zdarzenie: FormEvent) {
    zdarzenie.preventDefault(); ustawZapisuje(true); ustawBlad('')
    try { await zapiszWaznaInformacje(szkic, dostep); zamknij() } catch (blad) { ustawBlad(opisBledu(blad)) } finally { ustawZapisuje(false) }
  }
  return <Modal tytul={informacja ? 'Edytuj ważną informację' : 'Dodaj ważną informację'} zamknij={zamknij}><form className="formularz" onSubmit={zapisz}>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <p className="pole--pelne">Sam wybierasz ważne fakty i status ich potwierdzenia. Obserwacja ani wynik badania nie stają się automatycznie diagnozą.</p>
    <label className="pole pole--pelne"><span>Kategoria</span><select value={szkic.kategoria} onChange={(zdarzenie) => ustawSzkic({ ...szkic, kategoria: zdarzenie.target.value as WaznaInformacjaZdrowotna['kategoria'] })}>{Object.entries(KATEGORIE_WAZNYCH_INFORMACJI).map(([klucz, etykieta]) => <option key={klucz} value={klucz}>{etykieta}</option>)}</select></label>
    <label className="pole pole--pelne"><span>Treść *</span><textarea required maxLength={5000} value={szkic.tresc} onChange={(zdarzenie) => ustawSzkic({ ...szkic, tresc: zdarzenie.target.value })} /></label>
    <label className="pole pole--pelne"><span>Dokładność daty</span><select value={szkic.data.dokladnosc} onChange={(zdarzenie) => {
      const dokladnosc = zdarzenie.target.value as DataZdrowia['dokladnosc']
      ustawSzkic({ ...szkic, data: dokladnosc === 'nieznana' ? { dokladnosc } : dokladnosc === 'okres' ? { dokladnosc, od: '', do: '' } : { dokladnosc, od: '' } })
    }}><option value="dzien">Znany dzień</option><option value="miesiac">Przybliżony miesiąc</option><option value="rok">Przybliżony rok</option><option value="okres">Okres</option><option value="nieznana">Data nieznana</option></select></label>
    <label className="pole"><span>{szkic.data.dokladnosc === 'nieznana' ? 'Opis czasu (opcjonalnie)' : 'Data lub początek okresu *'}</span><input required={szkic.data.dokladnosc !== 'nieznana'} type={szkic.data.dokladnosc === 'miesiac' ? 'month' : ['dzien', 'okres'].includes(szkic.data.dokladnosc) ? 'date' : 'text'} inputMode={szkic.data.dokladnosc === 'rok' ? 'numeric' : undefined} placeholder={szkic.data.dokladnosc === 'rok' ? 'np. 2020' : undefined} value={'od' in szkic.data ? szkic.data.od : szkic.data.opis ?? ''} onChange={(zdarzenie) => zmienDate(zdarzenie.target.value)} /></label>
    {szkic.data.dokladnosc === 'okres' && <label className="pole"><span>Koniec okresu *</span><input required type="date" value={szkic.data.do} onChange={(zdarzenie) => zmienDate(zdarzenie.target.value, true)} /></label>}
    <label className="pole pole--pelne"><span>Status potwierdzenia</span><select value={szkic.statusPotwierdzenia} onChange={(zdarzenie) => ustawSzkic({ ...szkic, statusPotwierdzenia: zdarzenie.target.value as WaznaInformacjaZdrowotna['statusPotwierdzenia'] })}>{Object.entries(STATUSY_POTWIERDZENIA).map(([klucz, etykieta]) => <option key={klucz} value={klucz}>{etykieta}</option>)}</select></label>
    <label className="pole"><span>Ostatni przegląd (opcjonalnie)</span><input type="date" value={szkic.ostatniPrzeglad ?? ''} onChange={(zdarzenie) => ustawSzkic({ ...szkic, ostatniPrzeglad: zdarzenie.target.value || undefined })} /></label>
    <label className="wazne-zdrowie__wybor pole--pelne"><input type="checkbox" checked={szkic.ukryjTresc} onChange={(zdarzenie) => ustawSzkic({ ...szkic, ukryjTresc: zdarzenie.target.checked })} /><span>Ukryj treść do świadomego otwarcia; pomiń ją w eksporcie</span></label>
    {szkic.zrodlo && <p className="pole--pelne">Powiązanie ze źródłem zachowane. {stanZrodlaZdrowia(szkic.zrodlo, dane, dostep) !== 'dostepne' && 'Źródło niedostępne — sprawdź informację.'}<button type="button" className="przycisk" onClick={() => ustawSzkic({ ...szkic, zrodlo: undefined })}>Odłącz źródło</button></p>}
    <details className="pole--pelne"><summary>Okres obowiązywania i ważne kontakty</summary><div className="formularz">
      <label className="pole"><span>Obowiązuje od</span><input type="date" value={szkic.obowiazujeOd ?? ''} onChange={(zdarzenie) => ustawSzkic({ ...szkic, obowiazujeOd: zdarzenie.target.value || undefined })} /></label>
      <label className="pole"><span>Obowiązuje do</span><input type="date" value={szkic.obowiazujeDo ?? ''} onChange={(zdarzenie) => ustawSzkic({ ...szkic, obowiazujeDo: zdarzenie.target.value || undefined })} /></label>
      {dostep('kontakty', 'odczyt') && <fieldset className="pole--pelne"><legend>Kontakty do karty zdrowotnej</legend>{dane.kontakty.map((kontakt) => <label key={kontakt.id} className="wazne-zdrowie__wybor"><input type="checkbox" checked={szkic.kontaktyIds?.includes(kontakt.id) ?? false} onChange={(zdarzenie) => ustawSzkic({ ...szkic, kontaktyIds: zdarzenie.target.checked ? [...(szkic.kontaktyIds ?? []), kontakt.id] : szkic.kontaktyIds?.filter((id) => id !== kontakt.id) })} /><span>{kontakt.nazwa}</span></label>)}</fieldset>}
    </div></details>
    <div className="akcje-formularza"><button className="przycisk przycisk--glowny" disabled={zapisuje}>Zapisz ważną informację</button><button className="przycisk" type="button" onClick={zamknij}>Anuluj</button></div>
  </form></Modal>
}

function SzczegolyZrodla({ zrodlo, dostep, zamknij }: { zrodlo: ZrodloZdrowia; dostep: DostepHistoriiZdrowia; zamknij: () => void }) {
  const [odczyt, ustawOdczyt] = useState<Awaited<ReturnType<typeof odczytajZrodloZdrowia>>>()
  const [blad, ustawBlad] = useState('')
  const [adresPliku, ustawAdresPliku] = useState('')
  useEffect(() => { let aktywny = true; ustawOdczyt(undefined); void odczytajZrodloZdrowia(zrodlo, dostep).then((wynik) => { if (aktywny) ustawOdczyt(wynik) }).catch((blad) => { if (aktywny) ustawBlad(opisBledu(blad)) }); return () => { aktywny = false } }, [zrodlo, dostep])
  useEffect(() => {
    if (odczyt?.stan !== 'dostepne' || !('plik' in odczyt.rekord) || !odczyt.rekord.plik) { ustawAdresPliku(''); return }
    const adres = URL.createObjectURL(odczyt.rekord.plik); ustawAdresPliku(adres); return () => URL.revokeObjectURL(adres)
  }, [odczyt])
  if (!dostep(zrodlo.tabela, 'odczyt')) return <Modal tytul="Źródło niedostępne" zamknij={zamknij}><Komunikat>Brak uprawnienia do źródła.</Komunikat></Modal>
  const wersja = odczyt?.stan === 'dostepne' && zrodlo.szczegolId && 'historiaDawkowania' in odczyt.rekord ? odczyt.rekord.historiaDawkowania?.find((wersja) => wersja.id === zrodlo.szczegolId) : undefined
  const rekord = odczyt?.stan === 'dostepne' ? { ...odczyt.rekord, ...(wersja ? { ...wersja.konfiguracja, notatka: wersja.notatka } : {}) } as unknown as Record<string, unknown> : undefined
  const pola = [['nazwa', 'Nazwa'], ['parametr', 'Parametr'], ['oryginalnyWynik', 'Wynik źródłowy'], ['jednostka', 'Jednostka'], ['zakresReferencyjny', 'Zakres laboratorium'], ['tresc', 'Treść'], ['notatka', 'Notatka'], ['notatkaPrzed', 'Przed wizytą'], ['notatkaPo', 'Po wizycie'], ['obserwacje', 'Obserwacje'], ['zalecenia', 'Zalecenia'], ['dawkaInstrukcja', 'Instrukcja dawkowania']]
  const szczegolySesji = rekord?.psychoterapia as { tematy?: string; wypowiedzi?: string } | undefined
  const szczegolyDziennika = rekord?.szczegoly as Record<string, string> | undefined
  return <Modal tytul="Źródło zdarzenia" zamknij={zamknij}>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {!odczyt ? <p>Wczytywanie źródła…</p> : odczyt.stan !== 'dostepne' ? <Komunikat>Źródło jest usunięte, nie istnieje lub jest niedostępne. Odniesienie pozostało zachowane.</Komunikat> : <>
      {pola.map(([klucz, etykieta]) => typeof rekord?.[klucz] === 'string' && rekord[klucz] && <div key={klucz}><h3>{etykieta}</h3><p className="wazne-zdrowie__tekst">{rekord[klucz] as string}</p></div>)}
      {szczegolySesji?.tematy && <p className="wazne-zdrowie__tekst">{szczegolySesji.tematy}</p>}{szczegolySesji?.wypowiedzi && <p className="wazne-zdrowie__tekst">{szczegolySesji.wypowiedzi}</p>}
      {szczegolyDziennika && Object.entries(szczegolyDziennika).map(([klucz, tresc]) => <p key={klucz} className="wazne-zdrowie__tekst">{tresc}</p>)}
      {zrodlo.szczegolId && 'historiaDawkowania' in odczyt.rekord && <p>Schemat obowiązuje od: {odczyt.rekord.historiaDawkowania?.find((wersja) => wersja.id === zrodlo.szczegolId)?.obowiazujeOd ?? 'Wersja niedostępna'}</p>}
      {adresPliku && <a className="przycisk" href={adresPliku} download={typeof rekord?.nazwaPliku === 'string' ? rekord.nazwaPliku : 'dokument'}>Pobierz źródłowy plik</a>}
    </>}
  </Modal>
}

function GrupyOsi({ zdarzenia, tryb, otworz, wazne }: { zdarzenia: ZdarzenieZdrowia[]; tryb: 'dzien' | 'miesiac' | 'rok'; otworz: (zrodlo: ZrodloZdrowia) => void; wazne?: (zdarzenie: ZdarzenieZdrowia) => void }) {
  const grupy = new Map<string, ZdarzenieZdrowia[]>()
  for (const zdarzenie of zdarzenia) {
    const data = zdarzenie.data
    const klucz = data.dokladnosc === 'nieznana' || data.dokladnosc === 'okres' || data.dokladnosc !== 'dzien' && tryb === 'dzien' || data.dokladnosc === 'rok' && tryb === 'miesiac' ? opisDatyZdrowia(data) : data.od.slice(0, tryb === 'rok' ? 4 : tryb === 'miesiac' ? 7 : 10)
    grupy.set(klucz, [...(grupy.get(klucz) ?? []), zdarzenie])
  }
  return <>{[...grupy].map(([grupa, wydarzenia]) => <section key={grupa}><h2>{grupa}</h2><ol className="os-zdrowia__lista">{wydarzenia.map((zdarzenie) => <li key={zdarzenie.id}>
    <div><Znacznik>{KATEGORIE_OSI_ZDROWIA[zdarzenie.kategoria]}</Znacznik><h3>{zdarzenie.rodzaj}</h3><p className="wazne-zdrowie__tekst">{zdarzenie.opis}</p><p>{opisDatyZdrowia(zdarzenie.data)}{zdarzenie.godzina && ` · ${zdarzenie.godzina}`}{zdarzenie.godzina && !zdarzenie.chwila && ' (godzina lokalna, strefa nieznana)'}</p>
      {zdarzenie.chwila && <small>Chwila źródłowa: {zdarzenie.chwila}</small>}
      {zdarzenie.dostepnosc !== 'dostepne' && <p>Powiązane źródło niedostępne lub ograniczony dostęp — sprawdź informację.</p>}
      <div className="akcje-formularza"><button className="przycisk" onClick={() => otworz(zdarzenie.zrodlo)}>{zdarzenie.prywatneSzczegoly ? 'Świadomie otwórz szczegóły' : 'Otwórz źródło'}</button>{wazne && zdarzenie.zrodlo.tabela !== 'wazneInformacjeZdrowotne' && <button className="przycisk" onClick={() => wazne(zdarzenie)}>Dodaj jako ważne</button>}</div>
    </div>
  </li>)}</ol></section>)}</>
}

export function OsCzasuZdrowia() {
  const { dane, dostep, os, strefa, ustawStrefe } = useDaneOsiZdrowia()
  const [tryb, ustawTryb] = useState<'dzien' | 'miesiac' | 'rok'>('miesiac')
  const [okres, ustawOkres] = useState('')
  const [kategoria, ustawKategorie] = useState('')
  const [rodzaj, ustawRodzaj] = useState('')
  const [szukana, ustawSzukana] = useState('')
  const [zrodlo, ustawZrodlo] = useState<ZrodloZdrowia>()
  const [wazne, ustawWazne] = useState<ZdarzenieZdrowia>()
  const wybrane = filtrujOsZdrowia(os, { okres, kategoria, rodzaj, szukana })
  return <div className="widok os-zdrowia"><NaglowekWidoku tytul="Osobista oś czasu zdrowia" opis="Historia wyliczana z istniejących źródeł. Prywatne treści pojawiają się dopiero po świadomym otwarciu." /><PrzelacznikWidokow />
    <div className="formularz">
      <label className="pole"><span>Widok osi</span><select value={tryb} onChange={(zdarzenie) => { ustawTryb(zdarzenie.target.value as typeof tryb); ustawOkres('') }}><option value="dzien">Dzienny</option><option value="miesiac">Miesięczny</option><option value="rok">Roczny</option></select></label>
      <label className="pole"><span>Wybrany okres (opcjonalnie)</span><input type={tryb === 'dzien' ? 'date' : tryb === 'miesiac' ? 'month' : 'text'} inputMode={tryb === 'rok' ? 'numeric' : undefined} placeholder={tryb === 'rok' ? 'np. 2026' : undefined} value={okres} onChange={(zdarzenie) => ustawOkres(zdarzenie.target.value)} /></label>
      <label className="pole"><span>Kategoria wydarzeń</span><select value={kategoria} onChange={(zdarzenie) => ustawKategorie(zdarzenie.target.value)}><option value="">Wszystkie</option>{Object.entries(KATEGORIE_OSI_ZDROWIA).map(([klucz, etykieta]) => <option key={klucz} value={klucz}>{etykieta}</option>)}</select></label>
      <label className="pole"><span>Rodzaj wydarzenia</span><select value={rodzaj} onChange={(zdarzenie) => ustawRodzaj(zdarzenie.target.value)}><option value="">Wszystkie</option>{[...new Set(os.map((zdarzenie) => zdarzenie.rodzaj))].map((rodzaj) => <option key={rodzaj}>{rodzaj}</option>)}</select></label>
      <label className="pole"><span>Szukaj w krótkich podsumowaniach</span><input type="search" value={szukana} onChange={(zdarzenie) => ustawSzukana(zdarzenie.target.value)} /></label>
      <label className="pole"><span>Strefa prezentacji znanych chwil</span><select value={strefa} onChange={(zdarzenie) => ustawStrefe(zdarzenie.target.value)}>{[...new Set([strefa, Intl.DateTimeFormat().resolvedOptions().timeZone, 'Europe/Warsaw', 'UTC'])].map((strefa) => <option key={strefa}>{strefa}</option>)}</select></label>
    </div>
    <p>Daty bez godziny oraz przybliżone okresy zachowują dokładność źródła. Lokalne godziny bez strefy są uporządkowane osobno od znanych chwil.</p>
    {!dane ? <p>Wczytywanie…</p> : !wybrane.length ? <PustyStan tytul="Brak wydarzeń" opis="Dodaj dane zdrowotne lub zmień filtry. Widoczne są tylko dostępne źródła." /> : <GrupyOsi zdarzenia={wybrane} tryb={tryb} otworz={ustawZrodlo} wazne={dostep('wazneInformacjeZdrowotne', 'edycja') ? ustawWazne : undefined} />}
    {zrodlo && <SzczegolyZrodla zrodlo={zrodlo} dostep={dostep} zamknij={() => ustawZrodlo(undefined)} />}
    {wazne && dane && <FormularzWaznejInformacji zdarzenie={wazne} dane={dane} dostep={dostep} zamknij={() => ustawWazne(undefined)} />}
  </div>
}

function TrescKarty({ karta, otworz }: { karta: KartaZdrowotna; otworz?: (zrodlo: ZrodloZdrowia) => void }) {
  return <div className="wazne-zdrowie__karta"><p>Przygotowano: {opisChwiliZdrowia(karta.przygotowanoAt)}</p>{Object.entries(karta.sekcje).map(([sekcja, pozycje]) => <Karta key={sekcja}><h2>{SEKCJE_KARTY_ZDROWOTNEJ[sekcja as SekcjaKartyZdrowotnej]}</h2>
    {!pozycje.length ? <p>Brak dostępnych informacji w tej sekcji.</p> : pozycje.map((pozycja) => <article key={pozycja.id} className="wazne-zdrowie__pozycja"><p className="wazne-zdrowie__tekst">{pozycja.tresc}</p><p><strong>{pozycja.status}</strong></p><small>{pozycja.aktualnosc}</small>{pozycja.dostepnosc !== 'dostepne' && <p>Źródło niedostępne — zweryfikuj. Informacja pomijana w eksporcie.</p>}{otworz && pozycja.zrodlo && <button className="przycisk" onClick={() => otworz(pozycja.zrodlo!)}>{pozycja.ukryta ? 'Świadomie otwórz treść' : 'Otwórz źródło'}</button>}</article>)}
  </Karta>)}</div>
}

export function WazneInformacjeZdrowotne() {
  const { dane, dostep, os, karta, strefa } = useDaneOsiZdrowia()
  const [tryb, ustawTryb] = useState<'karta' | 'os'>('karta')
  const [formularz, ustawFormularz] = useState<WaznaInformacjaZdrowotna | null>()
  const [zrodlo, ustawZrodlo] = useState<ZrodloZdrowia>()
  const [usunId, ustawUsunId] = useState<string>()
  const [eksport, ustawEksport] = useState(false)
  const [wybrane, ustawWybrane] = useState<SekcjaKartyZdrowotnej[]>(['najwazniejsze', 'reakcje', 'leki', 'wydarzenia', 'hospitalizacje', 'kontakty'])
  const [podglad, ustawPodglad] = useState<KartaZdrowotna>()
  const [druk, ustawDruk] = useState('')
  const ramkaDruku = useRef<HTMLIFrameElement>(null)
  const [blad, ustawBlad] = useState('')
  const [zapisuje, ustawZapisuje] = useState(false)
  const widocznaKarta = karta && dostep('wazneInformacjeZdrowotne', 'odczyt') ? karta : undefined
  const probaEksportu = useRef(0)
  useEffect(() => () => { probaEksportu.current += 1 }, [dostep])
  const zamknijEksport = () => { probaEksportu.current += 1; ustawEksport(false); ustawPodglad(undefined); ustawDruk('') }
  async function wyeksportuj(czyDruk: boolean) {
    const proba = ++probaEksportu.current
    ustawZapisuje(true); ustawBlad('')
    try {
      if (!dostep('wazneInformacjeZdrowotne', 'odczyt')) throw new Error('Brak uprawnienia do karty.')
      const html = await wygenerujKartePoPodgladzie(podglad, wybrane, dostep, strefa)
      if (proba !== probaEksportu.current) return
      if (czyDruk) ustawDruk(html)
      else if (!await platforma.pliki.zapisz(`ogarniacz-karta-zdrowotna-${new Date().toISOString().replace(/[:.]/g, '-')}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }))) throw new Error('Nie udało się zapisać karty.')
    } catch (blad) { ustawBlad(opisBledu(blad)); ustawPodglad(undefined) } finally { ustawZapisuje(false) }
  }
  if (!dostep('wazneInformacjeZdrowotne', 'odczyt')) return <Komunikat>Brak uprawnienia do ważnych informacji zdrowotnych.</Komunikat>
  const informacje = dane?.wazneInformacjeZdrowotne ?? []
  const wazneZdarzenia = sortujZdarzeniaZdrowia(os.filter((zdarzenie) => zdarzenie.zrodlo.tabela === 'wazneInformacjeZdrowotne'))
  return <div className="widok wazne-zdrowie"><NaglowekWidoku tytul="Ważne informacje zdrowotne" opis="Twoje wybrane informacje. Dostępne offline w aplikacji; wymagają sprawdzenia aktualności." /><PrzelacznikWidokow />
    <div className="akcje-formularza"><button className="przycisk" aria-pressed={tryb === 'karta'} onClick={() => ustawTryb('karta')}>Szybki odczyt</button><button className="przycisk" aria-pressed={tryb === 'os'} onClick={() => ustawTryb('os')}>Oś kluczowych wydarzeń</button>{dostep('wazneInformacjeZdrowotne', 'edycja') && <button className="przycisk przycisk--glowny" onClick={() => ustawFormularz(null)}>Dodaj ważną informację</button>}<button className="przycisk" disabled={!widocznaKarta} onClick={() => { ustawEksport(true); ustawBlad('') }}>Przygotuj kartę do eksportu</button></div>
    <p>Karta nie jest gwarantowanym źródłem danych dla ratowników. Nie jest udostępniana na ekranie blokady i korzysta z ochrony dostępu aplikacji.</p>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {!dane ? <p>Wczytywanie…</p> : tryb === 'karta' && widocznaKarta ? <TrescKarty karta={widocznaKarta} otworz={ustawZrodlo} /> : <>
      {!wazneZdarzenia.length && <PustyStan tytul="Brak ważnych wydarzeń" opis="Wybierz ważny fakt z osi czasu lub dodaj własną informację." />}
      <GrupyOsi zdarzenia={wazneZdarzenia} tryb="rok" otworz={ustawZrodlo} />
    </>}
    {dane && <details><summary>Zarządzaj wybranymi informacjami ({informacje.length})</summary>{informacje.map((informacja) => <Karta key={informacja.id}><h3>{KATEGORIE_WAZNYCH_INFORMACJI[informacja.kategoria]}</h3><p>{opisDatyZdrowia(informacja.data)} · {STATUSY_POTWIERDZENIA[informacja.statusPotwierdzenia]}</p>{dostep('wazneInformacjeZdrowotne', 'edycja') && <div className="akcje-formularza"><button className="przycisk" onClick={() => ustawFormularz(informacja)}>Edytuj informację</button><button className="przycisk" onClick={async () => { try { await zapiszWaznaInformacje({ ...informacja, ostatniPrzeglad: dzisiajIso() }, dostep) } catch (blad) { ustawBlad(opisBledu(blad)) } }}>Przejrzano dzisiaj</button><button className="przycisk" onClick={() => ustawUsunId(informacja.id)}>Usuń informację</button></div>}</Karta>)}</details>}
    {formularz !== undefined && dane && dostep('wazneInformacjeZdrowotne', 'edycja') && <FormularzWaznejInformacji informacja={formularz ?? undefined} dane={dane} dostep={dostep} zamknij={() => ustawFormularz(undefined)} />}
    {zrodlo && <SzczegolyZrodla zrodlo={zrodlo} dostep={dostep} zamknij={() => ustawZrodlo(undefined)} />}
    {usunId && <ModalPotwierdzenia tytul="Usuń ważną informację" opis="Informacja zostanie oznaczona jako usunięta. Dane źródłowe pozostaną." niebezpieczne anuluj={() => ustawUsunId(undefined)} potwierdz={async () => { try { await usunWaznaInformacje(usunId, dostep); ustawUsunId(undefined) } catch (blad) { ustawBlad(opisBledu(blad)) } }} />}
    {eksport && widocznaKarta && <Modal tytul="Przygotowanie karty zdrowotnej" zamknij={zamknijEksport} szeroki>
      <p>Wybierz sekcje i sprawdź podgląd. Ukryte treści i informacje z niedostępnym źródłem zostaną pominięte. Eksportowany plik HTML jest jawny; przechowuj go zgodnie z własną decyzją.</p>
      {Object.entries(SEKCJE_KARTY_ZDROWOTNEJ).map(([klucz, etykieta]) => <label key={klucz} className="wazne-zdrowie__wybor"><input type="checkbox" disabled={zapisuje} checked={wybrane.includes(klucz as SekcjaKartyZdrowotnej)} onChange={(zdarzenie) => { ustawWybrane(zdarzenie.target.checked ? [...wybrane, klucz as SekcjaKartyZdrowotnej] : wybrane.filter((sekcja) => sekcja !== klucz)); ustawPodglad(undefined); ustawDruk('') }} /><span>{etykieta}</span></label>)}
      <button className="przycisk" disabled={zapisuje || !wybrane.length} onClick={() => { ustawPodglad(wybierzSekcjeKarty(widocznaKarta, wybrane)); ustawBlad(''); ustawDruk('') }}>Otwórz podgląd eksportu</button>
      {podglad && <section aria-label="Podgląd eksportu"><TrescKarty karta={podglad} /><div className="akcje-formularza"><button className="przycisk przycisk--glowny" disabled={zapisuje} onClick={() => wyeksportuj(false)}>Zapisz kartę HTML</button><button className="przycisk" disabled={zapisuje} onClick={() => wyeksportuj(true)}>Drukuj kartę</button></div></section>}
      {blad && <Komunikat typ="blad">{blad}</Komunikat>}
      {druk && <iframe ref={ramkaDruku} className="wazne-zdrowie__druk" title="Wydruk karty zdrowotnej" srcDoc={druk} onLoad={() => { try { ramkaDruku.current?.contentWindow?.print() } catch { ustawBlad('Drukowanie niedostępne. Zapisz kartę HTML i wydrukuj ją w przeglądarce.') } }} />}
    </Modal>}
  </div>
}
