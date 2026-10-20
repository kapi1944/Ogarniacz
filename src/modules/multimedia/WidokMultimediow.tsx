import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, Download, ExternalLink, FileImage, FileQuestion, RefreshCw } from 'lucide-react'
import { Komunikat, Modal, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { platforma } from '../../platform/platforma'
import {
  adresKatalogu, adresMaterialu, etykietyStatusow, filtrujMaterialy, odczytajZapamietanyKatalog,
  pobierzKatalog, pobierzOryginal, type MaterialMultimedialny,
} from './bibliotekaMultimediow'
import './multimedia.css'

function rozmiarPliku(bajty: number) {
  return `${(bajty / 1024 / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} MiB`
}

function ObrazMaterialu({ material, miniatura = false }: { material: MaterialMultimedialny; miniatura?: boolean }) {
  const [zaladuj, ustawZaladuj] = useState(!miniatura || Boolean(material.sciezkaMiniatury))
  const [blad, ustawBlad] = useState(false)
  const moznaPodejrzec = Boolean(material.sciezkaPodgladu) || ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/jpeg', 'image/webp', 'image/gif'].includes(material.mime)
  const sciezka = miniatura && material.sciezkaMiniatury || material.sciezkaPodgladu || material.sciezka
  return <div className={`multimedia__obraz ${miniatura ? 'multimedia__obraz--miniatura' : ''}`}>
    {!moznaPodejrzec ? <span className="multimedia__zastepnik"><FileQuestion aria-hidden="true" />Brak podglądu tego formatu</span>
      : blad ? <div className="multimedia__zastepnik"><FileImage aria-hidden="true" /><span>Nie udało się wczytać obrazu.</span><button type="button" className="przycisk" onClick={() => ustawBlad(false)}>Ponów podgląd</button></div>
        : zaladuj ? <img src={adresMaterialu(sciezka, 'raw', material.sha256)} alt={miniatura ? '' : material.nazwa} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => ustawBlad(true)} />
          : <button type="button" className="multimedia__zaladuj" onClick={() => ustawZaladuj(true)} aria-label={`Wczytaj miniaturę: ${material.nazwa}`}><FileImage aria-hidden="true" /><span>Wczytaj miniaturę</span><small>{rozmiarPliku(material.rozmiarBajtow)}</small></button>}
  </div>
}

function PodgladMaterialu({ material, zamknij, children }: { material: MaterialMultimedialny; zamknij: () => void; children: ReactNode }) {
  const obszar = useRef<HTMLDivElement>(null)
  const aktualneZamkniecie = useRef(zamknij)
  aktualneZamkniecie.current = zamknij
  useEffect(() => {
    const poprzednieSkupienie = document.activeElement as HTMLElement | null
    const okno = obszar.current
    const elementy = () => Array.from(okno?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, summary') ?? [])
    elementy()[0]?.focus()
    const ograniczSkupienie = (zdarzenie: KeyboardEvent) => {
      if (zdarzenie.key === 'Escape') { zdarzenie.preventDefault(); zdarzenie.stopPropagation(); aktualneZamkniecie.current(); return }
      if (zdarzenie.key !== 'Tab') return
      const lista = elementy()
      const pierwszy = lista[0]
      const ostatni = lista.at(-1)
      if (zdarzenie.shiftKey && document.activeElement === pierwszy) { zdarzenie.preventDefault(); ostatni?.focus() }
      else if (!zdarzenie.shiftKey && document.activeElement === ostatni) { zdarzenie.preventDefault(); pierwszy?.focus() }
    }
    okno?.addEventListener('keydown', ograniczSkupienie)
    return () => { okno?.removeEventListener('keydown', ograniczSkupienie); poprzednieSkupienie?.focus() }
  }, [])
  return <div ref={obszar}><Modal szeroki tytul={material.nazwa} zamknij={zamknij}>
    <ObrazMaterialu material={material} />
    {material.sciezkaPodgladu && <p>Podgląd przedstawia powiązany PNG. Pobierany jest oryginalny plik ICO.</p>}
    <p>{material.opis}</p><p><strong>Przeznaczenie:</strong> {material.przeznaczenie}</p>
    {material.wymagaKlasyfikacji && <p>Materiał wymaga klasyfikacji przez opiekuna projektu.</p>}
    <p><strong>Wykorzystanie:</strong> {material.wykorzystanie.length ? material.wykorzystanie.join('; ') : 'Brak potwierdzonego użycia w aplikacji.'}</p>
    {material.walidacja.uwagi.map((uwaga) => <p className="multimedia__ostrzezenie" key={uwaga}>{uwaga}</p>)}
    <div className="multimedia__techniczne"><h3>Informacje techniczne</h3><dl>
      <dt>Plik</dt><dd>{material.sciezka.split('/').at(-1)}</dd>
      <dt>Kategoria / status</dt><dd>{material.kategoria} / {etykietyStatusow[material.status]}</dd>
      <dt>Typ MIME</dt><dd>{material.mime}</dd>
      <dt>Rozmiar</dt><dd>{rozmiarPliku(material.rozmiarBajtow)} ({material.rozmiarBajtow.toLocaleString('pl-PL')} bajtów)</dd>
      <dt>Rozdzielczość</dt><dd>{material.rozdzielczosc ? `${material.rozdzielczosc.szerokosc} × ${material.rozdzielczosc.wysokosc} px` : 'Nie dotyczy'}</dd>
      <dt>SHA-256</dt><dd><code>{material.sha256}</code></dd>
      <dt>Ścieżka źródła</dt><dd>{material.sciezka}</dd>
    </dl></div>
    {children}
  </Modal></div>
}

export function WidokMultimediow() {
  const [wpis, ustawWpis] = useState(odczytajZapamietanyKatalog)
  const [zPamieci, ustawZPamieci] = useState(Boolean(wpis))
  const [ladowanie, ustawLadowanie] = useState(true)
  const [blad, ustawBlad] = useState('')
  const [ostrzezeniePamieci, ustawOstrzezeniePamieci] = useState(false)
  const [odswiezenie, ustawOdswiezenie] = useState(0)
  const [fraza, ustawFraze] = useState('')
  const [kategoria, ustawKategorie] = useState('')
  const [status, ustawStatus] = useState('')
  const [wybrany, ustawWybrany] = useState<MaterialMultimedialny>()
  const [pobierany, ustawPobierany] = useState<string>()
  const [komunikat, ustawKomunikat] = useState<{ typ: 'blad' | 'sukces' | 'informacja'; tresc: string }>()
  const [adresDoSkopiowania, ustawAdresDoSkopiowania] = useState('')
  const trwaPobieranie = useRef(false)

  useEffect(() => {
    const kontroler = new AbortController()
    ustawLadowanie(true)
    ustawBlad('')
    void pobierzKatalog(kontroler.signal).then((wynik) => {
      if (kontroler.signal.aborted) return
      ustawWpis(wynik); ustawZPamieci(false); ustawOstrzezeniePamieci(!wynik.zapamietano)
    }).catch(() => {
      if (!kontroler.signal.aborted) {
        ustawBlad('Nie udało się pobrać aktualnego katalogu z GitHub. Sprawdź połączenie i spróbuj ponownie.')
        ustawZPamieci(true)
      }
    }).finally(() => { if (!kontroler.signal.aborted) ustawLadowanie(false) })
    return () => kontroler.abort()
  }, [odswiezenie])

  const materialy = wpis?.katalog.materialy ?? []
  const kategorie = [...new Set(materialy.map((material) => material.kategoria))].sort((a, b) => a.localeCompare(b, 'pl'))
  const widoczne = filtrujMaterialy(materialy, fraza, kategoria, status)

  async function pobierz(material: MaterialMultimedialny) {
    if (trwaPobieranie.current) return
    trwaPobieranie.current = true
    ustawPobierany(material.id); ustawKomunikat({ typ: 'informacja', tresc: 'Pobieranie i sprawdzanie oryginału…' })
    try {
      const plik = await pobierzOryginal(material)
      const wynik = await platforma.pliki.zapiszZWynikiem(material.sciezka.split('/').at(-1)!, plik)
      ustawKomunikat(wynik.status === 'zapisano' ? { typ: 'sukces', tresc: 'Zapisano oryginalny plik w wybranym miejscu.' }
        : wynik.status === 'pobieranie' ? { typ: 'sukces', tresc: 'Rozpoczęto pobieranie oryginału. Sprawdź pobrane pliki w przeglądarce.' }
          : wynik.status === 'anulowano' ? { typ: 'informacja', tresc: 'Anulowano zapis pliku.' }
            : { typ: 'blad', tresc: 'Nie udało się zapisać pliku. Spróbuj ponownie i sprawdź dostęp do wybranego miejsca.' })
    } catch (przyczyna) {
      ustawKomunikat({ typ: 'blad', tresc: przyczyna instanceof Error && przyczyna.name !== 'AbortError' && !(przyczyna instanceof TypeError) ? przyczyna.message : 'Nie udało się pobrać pliku. Sprawdź połączenie i spróbuj ponownie.' })
    } finally { trwaPobieranie.current = false; ustawPobierany(undefined) }
  }

  async function skopiuj(material: MaterialMultimedialny) {
    const adres = adresMaterialu(material.sciezka, 'raw', material.sha256)
    try {
      await navigator.clipboard.writeText(adres)
      ustawAdresDoSkopiowania(''); ustawKomunikat({ typ: 'sukces', tresc: 'Skopiowano odnośnik do oryginalnego pliku.' })
    } catch {
      ustawAdresDoSkopiowania(adres)
      ustawKomunikat({ typ: 'informacja', tresc: 'Schowek jest niedostępny. Skopiuj adres z pola poniżej.' })
    }
  }

  const wynikAkcji = <>{komunikat && <Komunikat typ={komunikat.typ}>{komunikat.tresc}</Komunikat>}{adresDoSkopiowania && <label className="pole multimedia__adres"><span>Odnośnik do skopiowania</span><input readOnly value={adresDoSkopiowania} onFocus={(zdarzenie) => zdarzenie.target.select()} /></label>}</>
  const akcje = (material: MaterialMultimedialny) => <div className="multimedia__akcje">
    <button type="button" className="przycisk przycisk--glowny" disabled={Boolean(pobierany)} onClick={() => void pobierz(material)}><Download aria-hidden="true" />{pobierany === material.id ? 'Pobieranie…' : 'Pobierz oryginał'}</button>
    <button type="button" className="przycisk" onClick={() => void skopiuj(material)}><Copy aria-hidden="true" />Kopiuj odnośnik</button>
    <a className="przycisk" href={adresMaterialu(material.sciezka, 'github')} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Źródło na GitHub</a>
  </div>

  return <div className="widok multimedia">
    <NaglowekWidoku tytul="Multimedia" opis="Publiczna biblioteka materiałów Ogarniacza. Podgląd i oryginały do pobrania." akcje={<button type="button" className="przycisk" disabled={ladowanie} onClick={() => ustawOdswiezenie((liczba) => liczba + 1)}><RefreshCw aria-hidden="true" />{ladowanie ? 'Ładowanie katalogu…' : 'Odśwież bibliotekę'}</button>} />
    <p className="multimedia__zrodlo">Źródło: <a href={adresKatalogu} target="_blank" rel="noopener noreferrer">GitHub · kapi1944/Ogarniacz</a>. Wyświetlamy publiczne materiały projektu.</p>
    {ladowanie && <p role="status">Ładowanie aktualnego katalogu…</p>}
    {blad && <Komunikat typ="blad">{blad} <button type="button" className="przycisk" disabled={ladowanie} onClick={() => ustawOdswiezenie((liczba) => liczba + 1)}>Ponów pobieranie</button></Komunikat>}
    {wpis && <p className="multimedia__zrodlo">{zPamieci ? 'Ostatni poprawny katalog z pamięci urządzenia' : 'Katalog pobrany z GitHub'} · {new Date(wpis.zapisanoAt).toLocaleString('pl-PL')}{zPamieci && '. Obrazy i pobieranie wymagają połączenia.'}</p>}
    {ostrzezeniePamieci && <Komunikat>Przeglądarka nie pozwoliła zapamiętać katalogu. Lista jest dostępna podczas tej wizyty.</Komunikat>}
    {!wybrany && wynikAkcji}
    {wpis && <>
      <div className="multimedia__filtry">
        <label className="pole"><span>Szukaj materiałów</span><input type="search" placeholder="Nazwa, opis lub plik…" value={fraza} onChange={(zdarzenie) => ustawFraze(zdarzenie.target.value)} /></label>
        <label className="pole"><span>Kategoria</span><select value={kategoria} onChange={(zdarzenie) => ustawKategorie(zdarzenie.target.value)}><option value="">Wszystkie kategorie</option>{kategorie.map((nazwa) => <option key={nazwa}>{nazwa}</option>)}</select></label>
        <label className="pole"><span>Status materiału</span><select value={status} onChange={(zdarzenie) => ustawStatus(zdarzenie.target.value)}><option value="">Wszystkie statusy</option>{Object.entries(etykietyStatusow).map(([wartosc, etykieta]) => <option key={wartosc} value={wartosc}>{etykieta}</option>)}</select></label>
      </div>
      <p role="status">Materiały: {widoczne.length} z {materialy.length}. Duże miniatury wczytasz na żądanie.</p>
      {!materialy.length ? <PustyStan tytul="Katalog jest pusty" opis="Po dodaniu materiałów do GitHub odśwież bibliotekę." />
        : !widoczne.length ? <PustyStan tytul="Brak pasujących materiałów" opis="Zmień wyszukiwanie lub wyczyść filtry." akcja={<button className="przycisk" onClick={() => { ustawFraze(''); ustawKategorie(''); ustawStatus('') }}>Wyczyść filtry</button>} />
          : <ul className="multimedia__galeria">{widoczne.map((material) => <li className="karta multimedia__karta" key={material.id}>
            <ObrazMaterialu key={material.sciezka + material.sha256} material={material} miniatura />
            <div className="multimedia__opis"><Znacznik wariant={material.status === 'OFICJALNE' ? 'sukces' : material.status === 'ARCHIWALNE' ? 'ostrzezenie' : 'neutralny'}>{etykietyStatusow[material.status]}</Znacznik>
              <h2>{material.nazwa}</h2><p>{material.opis}</p><small>{material.kategoria} · {material.mime === 'image/png' ? 'PNG' : material.mime === 'image/x-icon' ? 'ICO' : material.mime} · {rozmiarPliku(material.rozmiarBajtow)}</small>
              {material.wymagaKlasyfikacji && <small>Wymaga klasyfikacji</small>}
              <button type="button" className="przycisk" aria-label={`Podgląd i szczegóły: ${material.nazwa}`} onClick={() => { ustawWybrany(material); ustawKomunikat(undefined); ustawAdresDoSkopiowania('') }}>Podgląd i szczegóły</button>
              {akcje(material)}
            </div>
          </li>)}</ul>}
    </>}
    {wybrany && <PodgladMaterialu material={wybrany} zamknij={() => ustawWybrany(undefined)}>{akcje(wybrany)}{wynikAkcji}</PodgladMaterialu>}
  </div>
}
