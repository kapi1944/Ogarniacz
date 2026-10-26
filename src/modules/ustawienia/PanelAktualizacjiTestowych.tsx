import { useEffect, useRef, useState } from 'react'
import { Karta, Znacznik } from '../../components/Interfejs'
import { platforma } from '../../platform/platforma'
import {
  aktualizacjeTestowe, BladAktualizacjiTestowej, czyTeSameSha, wykryjPlatformeTestowa,
  type CommitTestowy, type StanCiTestowego, type WynikBuilduTestowego,
} from '../../platform/AktualizacjeTestoweService'

const etykietyCi: Record<StanCiTestowego['stan'], string> = {
  sukces: 'zakończone sukcesem', trwa: 'w toku', blad: 'nieudane lub anulowane', brak: 'brak przebiegu dla SHA',
}

export function PanelAktualizacjiTestowych() {
  const [wersja, ustawWersje] = useState(__WERSJA_APLIKACJI__)
  const [commit, ustawCommit] = useState<CommitTestowy>()
  const [ci, ustawCi] = useState<StanCiTestowego>()
  const [wynik, ustawWynik] = useState<WynikBuilduTestowego>()
  const [stan, ustawStan] = useState<'gotowy' | 'sprawdzanie' | 'sprawdzono' | 'blad' | 'anulowano'>('gotowy')
  const [komunikat, ustawKomunikat] = useState('Sprawdzanie GitHub uruchamiasz ręcznie. Sam odczyt nie pobiera ani nie instaluje aplikacji.')
  const operacja = useRef<AbortController | null>(null)
  const wykrytaPlatforma = wykryjPlatformeTestowa()

  useEffect(() => {
    let aktywny = true
    void platforma.aktualizacje.pobierzInformacje().then((informacje) => {
      if (aktywny) ustawWersje(`${informacje.wersja} (kod: ${informacje.kod})`)
    }).catch(() => { if (aktywny && platforma.natywna) ustawWersje('Nie udało się odczytać wersji natywnej.') })
    return () => { aktywny = false; operacja.current?.abort(); operacja.current = null }
  }, [])

  const sprawdz = async (rodzaj: 'commit' | 'build') => {
    if (operacja.current) return
    const kontroler = new AbortController()
    operacja.current = kontroler
    ustawStan('sprawdzanie')
    ustawKomunikat(rodzaj === 'commit' ? 'Sprawdzanie commita main i CI…' : 'Sprawdzanie main, CI i manifestu testowego…')
    ustawWynik(undefined)
    ustawCommit(undefined)
    ustawCi(undefined)
    try {
      const sprawdzonyBuild = rodzaj === 'build' ? await aktualizacjeTestowe.sprawdzBuild(kontroler.signal) : undefined
      const odpowiedz = sprawdzonyBuild ?? await aktualizacjeTestowe.sprawdzCommit(kontroler.signal)
      if (operacja.current !== kontroler) return
      ustawCommit(odpowiedz.commit)
      ustawCi(odpowiedz.ci)
      ustawStan('sprawdzono')
      if (sprawdzonyBuild) {
        ustawWynik(sprawdzonyBuild)
        ustawKomunikat(!sprawdzonyBuild.manifest
          ? 'Nie ma opublikowanego, zweryfikowanego buildu testowego.'
          : !czyTeSameSha(sprawdzonyBuild.manifest.sha, odpowiedz.commit.sha)
            ? 'Najnowszy main nie ma gotowego buildu. Pokazany artefakt pochodzi ze starszego commita i nie jest proponowany do aktualizacji.'
            : odpowiedz.ci.stan !== 'sukces'
              ? 'CI najnowszego main nie zakończyło się sukcesem. Aktualizacja jest zablokowana.'
              : 'Potwierdzono manifest i pomyślny build dla najnowszego main. Pobieranie i uruchamianie wymagają kolejnego etapu wdrożenia kanału Beta.')
      } else ustawKomunikat('Sprawdzono commit i status CI. Dostępność artefaktu sprawdź osobnym przyciskiem.')
    } catch (blad) {
      if (operacja.current !== kontroler) return
      ustawStan(kontroler.signal.aborted ? 'anulowano' : 'blad')
      ustawKomunikat(blad instanceof BladAktualizacjiTestowej ? blad.message : 'Nie udało się sprawdzić GitHub. Spróbuj ponownie.')
    } finally { if (operacja.current === kontroler) operacja.current = null }
  }

  const manifest = wynik?.manifest
  const opisZmian = manifest ? manifest.opis : commit?.opis
  const zajete = stan === 'sprawdzanie'
  const ograniczenie = 'Pobieranie i uruchamianie kanału Beta nie zostały jeszcze wdrożone na tej platformie.'
  return <Karta>
    <div className="naglowek-karty"><div><h2>Aktualizacje testowe</h2><p>Publiczne metadane GitHub, niezależne od synchronizacji i Tailscale.</p></div>
      <Znacznik wariant={stan === 'blad' ? 'blad' : 'neutralny'}>{stan === 'gotowy' ? 'gotowe do sprawdzenia' : stan === 'anulowano' ? 'anulowano' : stan === 'blad' ? 'błąd' : stan}</Znacznik>
    </div>
    <div className="lista-kompaktowa" style={{ overflowWrap: 'anywhere' }}>
      <div><span>Wykryta platforma</span><strong>{wykrytaPlatforma.etykieta}</strong></div>
      <div><span>Obecna wersja aplikacji</span><strong>{wersja}</strong></div>
      <div><span>SHA uruchomionego buildu</span><strong>{__METADANE_BUILDU__.sha ?? 'Nieustalony w tym buildzie'}</strong></div>
      <div><span>Data uruchomionego buildu</span><strong>{__METADANE_BUILDU__.data}</strong></div>
      <div><span>Najnowszy SHA main</span><strong>{commit?.sha ?? 'Nie sprawdzono'}</strong></div>
      <div><span>CI dla main</span><strong>{ci ? etykietyCi[ci.stan] : 'Nie sprawdzono'}</strong></div>
      <div><span>SHA ostatniego zweryfikowanego artefaktu</span><strong>{manifest?.sha ?? (wynik ? 'Brak' : 'Nie sprawdzono')}</strong></div>
      <div><span>Wersja / numer testowego buildu</span><strong>{manifest ? `${manifest.wersja} / ${manifest.numerBuildu} (Beta)` : '—'}</strong></div>
      <div><span>Data testowego buildu</span><strong>{manifest?.data ?? '—'}</strong></div>
      <div><span>Platformy testowego buildu</span><strong>{manifest?.artefakty.map((artefakt) => artefakt.platforma).join(', ') ?? '—'}</strong></div>
      <div><span>Artefakt dla najnowszego main</span><strong>{wynik ? wynik.dostepnyDlaMain ? 'Potwierdzony' : 'Niedostępny' : 'Nie sprawdzono'}</strong></div>
      <div><span>Porównanie z uruchomionym buildem</span><strong>{!manifest || !__METADANE_BUILDU__.sha || __METADANE_BUILDU__.zmodyfikowany !== false ? 'Nie można potwierdzić' : czyTeSameSha(manifest.sha, __METADANE_BUILDU__.sha) ? 'Ten sam commit' : 'Inny commit'}</strong></div>
      <div><span>Pobieranie / weryfikacja pliku / instalacja</span><strong>Niedostępne w tym etapie</strong></div>
    </div>
    {__METADANE_BUILDU__.zmodyfikowany === true && <p className="tekst-pomocniczy">Build zawiera lokalne zmiany. SHA wskazuje bazowy commit, a nie dokładny zestaw uruchomionych plików.</p>}
    {__METADANE_BUILDU__.zmodyfikowany === null && <p className="tekst-pomocniczy">Nie można potwierdzić czystości źródeł tego buildu.</p>}
    {opisZmian && <div><h3>Skrót zmian {manifest ? 'testowego buildu' : 'main'}</h3><p className="tekst-pomocniczy" style={{ whiteSpace: 'pre-wrap' }}>{opisZmian}</p></div>}
    <p className="tekst-pomocniczy" role={stan === 'blad' ? 'alert' : 'status'}>{komunikat}</p>
    <p className="tekst-pomocniczy">Zapytania trafiają bez tokenu do api.github.com. GitHub otrzymuje adres IP i metadane połączenia, bez danych Ogarniacza. Nie ma sprawdzania w tle.</p>
    {wykrytaPlatforma.rodzaj === 'web' && <p className="tekst-pomocniczy">Przeglądarka uruchamia Web/PWA, również przy dostępie do Raspberry Pi. Nie wykryto natywnego instalatora Windows.</p>}
    <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={zajete} onClick={() => void sprawdz('commit')}>Sprawdź najnowszy commit</button>
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={zajete} onClick={() => void sprawdz('build')}>Sprawdź build testowy</button>
      {zajete && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => operacja.current?.abort()}>Anuluj sprawdzanie</button>}
      <button type="button" className="przycisk przycisk--drugorzedny" disabled title={ograniczenie}>Pobierz wersję testową</button>
      <button type="button" className="przycisk przycisk--drugorzedny" disabled title={ograniczenie}>Uruchom / zainstaluj wersję testową</button>
    </div>
    <p className="tekst-pomocniczy">{ograniczenie}</p>
  </Karta>
}
