import { useEffect, useState } from 'react'
import { Download, RefreshCw, RotateCcw } from 'lucide-react'
import { Karta, Znacznik } from '../../components/Interfejs'
import { platforma } from '../../platform/platforma'
import type { StanAktualizacjiWeb, WynikSprawdzeniaAktualizacjiWeb } from '../../platform/typy'

type EtapWeb = 'gotowy' | 'sprawdzanie' | 'brak' | 'dostepna' | 'pobieranie' | 'odrzucona' | 'wymaga-apk' | 'blad'

const etykiety: Record<EtapWeb, string> = {
  gotowy: 'gotowe',
  sprawdzanie: 'sprawdzanie',
  brak: 'aktualna',
  dostepna: 'dostępna',
  pobieranie: 'instalacja',
  odrzucona: 'wycofana',
  'wymaga-apk': 'wymaga APK',
  blad: 'błąd',
}

function skrocCommit(commitSha: string) {
  return commitSha.length > 12 ? commitSha.slice(0, 12) : commitSha
}

function formatujDate(wartosc: string) {
  if (!wartosc) return '—'
  const data = new Date(wartosc)
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pl-PL')
}

export function PanelAktualizacjiWeb() {
  const [stan, ustawStan] = useState<StanAktualizacjiWeb>()
  const [wynik, ustawWynik] = useState<WynikSprawdzeniaAktualizacjiWeb>()
  const [etap, ustawEtap] = useState<EtapWeb>('gotowy')
  const [komunikat, ustawKomunikat] = useState('')
  const [postep, ustawPostep] = useState<number>()
  const skonfigurowane = platforma.aktualizacjeWeb.skonfigurowane()

  const odswiezStan = () => platforma.aktualizacjeWeb.pobierzStan().then(ustawStan)

  useEffect(() => {
    void odswiezStan().catch(() => ustawKomunikat('Nie udało się odczytać wersji interfejsu.'))
  }, [])

  const sprawdz = async () => {
    ustawEtap('sprawdzanie')
    ustawKomunikat('Sprawdzanie osobnego manifestu Web OTA…')
    ustawWynik(undefined)
    try {
      const sprawdzenie = await platforma.aktualizacjeWeb.sprawdz()
      ustawWynik(sprawdzenie)
      ustawStan(sprawdzenie.stan)
      if (sprawdzenie.wymagaNowszegoApk) {
        ustawEtap('wymaga-apk')
        ustawKomunikat('Ta aktualizacja wymaga nowszej wersji aplikacji Android. Skorzystaj z sekcji aktualizacji aplikacji powyżej.')
      } else if (!sprawdzenie.czyDostepna) {
        ustawEtap('brak')
        ustawKomunikat('Masz aktualną wersję interfejsu Ogarniacza.')
      } else if (sprawdzenie.czyOdrzucona) {
        ustawEtap('odrzucona')
        ustawKomunikat('Ta wersja została wcześniej wycofana na tym urządzeniu.')
      } else {
        ustawEtap('dostepna')
        ustawKomunikat(`Dostępna szybka aktualizacja ${sprawdzenie.manifest.bundleVersion}.`)
      }
    } catch (blad) {
      ustawEtap('blad')
      ustawKomunikat(blad instanceof Error ? blad.message : 'Nie udało się sprawdzić szybkiej aktualizacji.')
    }
  }

  const zainstaluj = async (ponownaProba: boolean) => {
    if (!wynik) return
    ustawEtap('pobieranie')
    ustawPostep(0)
    ustawKomunikat('Pobieranie podpisanego Web bundle…')
    try {
      await platforma.aktualizacjeWeb.pobierzIAktywuj(wynik.manifest, ponownaProba, (nowyStan, procent) => {
        ustawPostep(procent)
        ustawKomunikat(nowyStan === 'weryfikacja'
          ? 'Weryfikacja SHA-256 i podpisu…'
          : nowyStan === 'rozpakowywanie' ? 'Bezpieczne rozpakowywanie bundle…' : `Pobieranie Web bundle… ${procent}%`)
      })
    } catch (blad) {
      ustawEtap('blad')
      ustawKomunikat(blad instanceof Error ? blad.message : 'Nie udało się zainstalować szybkiej aktualizacji.')
    }
  }

  const przywroc = async (rodzaj: 'poprzednia' | 'wbudowana') => {
    const opis = rodzaj === 'poprzednia' ? 'poprzednią wersję interfejsu' : 'wersję wbudowaną w APK'
    if (!window.confirm(`Przywrócić ${opis}? Aplikacja zostanie przeładowana.`)) return
    try {
      if (rodzaj === 'poprzednia') await platforma.aktualizacjeWeb.przywrocPoprzednia()
      else await platforma.aktualizacjeWeb.przywrocWbudowana()
    } catch (blad) {
      ustawEtap('blad')
      ustawKomunikat(blad instanceof Error ? blad.message : 'Nie udało się przywrócić wersji interfejsu.')
    }
  }

  const zajete = etap === 'sprawdzanie' || etap === 'pobieranie'
  const wariant = etap === 'blad' ? 'blad' : etap === 'dostepna' || etap === 'odrzucona' || etap === 'wymaga-apk' ? 'ostrzezenie' : etap === 'brak' ? 'sukces' : 'neutralny'

  return <Karta>
    <div className="naglowek-karty"><div><h2>Wersja interfejsu Ogarniacza</h2><p>React, CSS, HTML i assets · niezależnie od APK</p></div><Znacznik wariant={wariant}>{etykiety[etap]}</Znacznik></div>
    <div className="lista-kompaktowa">
      <div><span>Aktualny bundle</span><strong>{stan?.aktualny.bundleVersion ?? '—'}</strong></div>
      <div><span>Commit</span><strong>{stan ? skrocCommit(stan.aktualny.commitSha) : '—'}</strong></div>
      <div><span>Data instalacji</span><strong>{stan ? formatujDate(stan.aktualny.installedAt) : '—'}</strong></div>
      <div><span>Źródło</span><strong>{stan?.aktualny.source === 'web-ota' ? 'szybka aktualizacja' : 'wbudowana w APK'}</strong></div>
      <div><span>Poprzednia wersja</span><strong>{stan?.poprzedni ? `${stan.poprzedni.bundleVersion} (${skrocCommit(stan.poprzedni.commitSha)})` : '—'}</strong></div>
    </div>
    {komunikat && <p className="tekst-pomocniczy" role={etap === 'blad' ? 'alert' : 'status'}>{komunikat}</p>}
    {postep !== undefined && etap === 'pobieranie' && <progress value={postep} max="100" aria-label="Postęp szybkiej aktualizacji" />}
    {!platforma.natywna && <p className="tekst-pomocniczy">Szybkie aktualizacje są dostępne w aplikacji Android.</p>}
    {platforma.natywna && !skonfigurowane && <p className="tekst-pomocniczy">Osobny kanał Web OTA nie jest skonfigurowany w tym buildzie.</p>}
    <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={!skonfigurowane || zajete} onClick={sprawdz}><RefreshCw aria-hidden="true" />Sprawdź szybką aktualizację</button>
      {etap === 'dostepna' && <button type="button" className="przycisk przycisk--glowny" onClick={() => void zainstaluj(false)}><Download aria-hidden="true" />Pobierz i zastosuj</button>}
      {etap === 'odrzucona' && <button type="button" className="przycisk przycisk--glowny" onClick={() => void zainstaluj(true)}>Spróbuj ponownie</button>}
      {stan?.poprzedni && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => void przywroc('poprzednia')}><RotateCcw aria-hidden="true" />Przywróć poprzednią wersję</button>}
      {stan?.aktualny.source === 'web-ota' && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => void przywroc('wbudowana')}>Przywróć wersję wbudowaną w APK</button>}
    </div>
  </Karta>
}
