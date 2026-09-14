import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Karta, Znacznik } from '../../components/Interfejs'
import { platforma } from '../../platform/platforma'
import { pobierzDiagnostykeRuntime } from '../../services/RuntimeConfigService'
import { nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, sprawdzAktualizacjeApk } from '../../services/KontrolaAktualizacjiAplikacji'
import type { PobranaAktualizacja, WynikSprawdzeniaAktualizacji } from '../../platform/typy'
import { PanelAktualizacjiWeb } from './PanelAktualizacjiWeb'

type EtapAktualizacji = 'gotowy' | 'sprawdzanie' | 'brak' | 'dostepna' | 'pobieranie' | 'weryfikacja' | 'brak_miejsca' | 'zgoda' | 'uruchamianie' | 'gotowe' | 'blad_instalatora' | 'blad'

const etykietyEtapu: Record<EtapAktualizacji, string> = {
  gotowy: 'gotowe',
  sprawdzanie: 'sprawdzanie',
  brak: 'aktualna',
  dostepna: 'dostępna',
  pobieranie: 'pobieranie',
  weryfikacja: 'weryfikacja',
  brak_miejsca: 'za mało miejsca',
  gotowe: 'instalacja',
  zgoda: 'wymaga zgody',
  uruchamianie: 'uruchamianie instalatora',
  blad_instalatora: 'błąd instalatora',
  blad: 'błąd',
}

function kodBledu(blad: unknown) {
  return typeof blad === 'object' && blad !== null && 'code' in blad ? String(blad.code) : ''
}

export function PanelAktualizacji() {
  const [wersja, ustawWersje] = useState('—')
  const [etap, ustawEtap] = useState<EtapAktualizacji>('gotowy')
  const [komunikat, ustawKomunikat] = useState('')
  const [postep, ustawPostep] = useState<number>()
  const [dostepna, ustawDostepna] = useState<WynikSprawdzeniaAktualizacji>()
  const [pobrana, ustawPobrana] = useState<PobranaAktualizacja>()
  const stanKontroli = useSyncExternalStore(nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, pobierzStanKontroliAktualizacji)
  const skonfigurowane = platforma.aktualizacje.skonfigurowane()

  useEffect(() => {
    platforma.aktualizacje.pobierzInformacje()
      .then((informacje) => ustawWersje(`${informacje.wersja} (${informacje.kod})`))
      .catch(() => ustawWersje(__WERSJA_APLIKACJI__))
  }, [])

  useEffect(() => {
    if (!stanKontroli.wynikApk || etap === 'pobieranie' || etap === 'weryfikacja' || etap === 'uruchamianie') return
    ustawDostepna(stanKontroli.wynikApk)
    ustawEtap(stanKontroli.wynikApk.czyNowsza ? 'dostepna' : 'brak')
    ustawKomunikat(stanKontroli.wynikApk.czyNowsza
      ? `Dostępna wersja ${stanKontroli.wynikApk.manifest.versionName}.`
      : 'Brak aktualizacji. Masz najnowszą wersję Ogarniacza.')
  }, [etap, stanKontroli.wynikApk])

  useEffect(() => {
    if (!stanKontroli.bladApk || etap === 'pobieranie' || etap === 'weryfikacja' || etap === 'uruchamianie') return
    ustawEtap('blad')
    ustawKomunikat(stanKontroli.bladApk)
  }, [etap, stanKontroli.bladApk])

  const sprawdzAktualizacje = async () => {
    ustawEtap('sprawdzanie')
    ustawKomunikat('Sprawdzanie manifestu latest.json…')
    ustawDostepna(undefined)
    ustawPobrana(undefined)
    try {
      const wynik = await sprawdzAktualizacjeApk()
      if (!wynik) return
      ustawDostepna(wynik)
      if (wynik.czyNowsza) {
        ustawEtap('dostepna')
        ustawKomunikat(`Dostępna wersja ${wynik.manifest.versionName}.`)
      } else {
        ustawEtap('brak')
        ustawKomunikat('Brak aktualizacji. Masz najnowszą wersję Ogarniacza.')
      }
    } catch (blad) {
      ustawEtap('blad')
      ustawKomunikat(blad instanceof Error ? blad.message : 'Nie udało się sprawdzić aktualizacji.')
    }
  }

  const uruchomInstalator = async (aktualizacja: PobranaAktualizacja) => {
    ustawEtap('uruchamianie')
    ustawKomunikat('Przekazywanie APK do systemowego instalatora…')
    try {
      const wynik = await platforma.aktualizacje.uruchomInstalator(aktualizacja)
      if (wynik.wymagaZgody) {
        ustawEtap('zgoda')
        ustawKomunikat('Android otworzył zgodę „Instaluj nieznane aplikacje”. Włącz ją dla Ogarniacza, wróć tutaj i ponów instalację.')
      } else {
        ustawEtap('gotowe')
        ustawKomunikat(wynik.przekazanoDoSystemu
          ? 'APK przekazano do systemowego instalatora. Potwierdź aktualizację na ekranie Androida.'
          : 'Nie udało się przekazać APK do systemowego instalatora.')
      }
    } catch (blad) {
      ustawEtap(kodBledu(blad) === 'BRAK_MIEJSCA' ? 'brak_miejsca' : 'blad_instalatora')
      ustawKomunikat(blad instanceof Error ? blad.message : 'Nie udało się uruchomić instalatora Androida.')
    }
  }

  const pobierzAktualizacje = async () => {
    if (!dostepna) return
    ustawEtap('pobieranie')
    ustawPostep(0)
    ustawKomunikat('Pobieranie podpisanego APK…')
    try {
      const aktualizacja = await platforma.aktualizacje.pobierz(
        dostepna.manifest,
        dostepna.adresApk,
        (stan, procent) => {
          ustawEtap(stan)
          ustawPostep(procent)
          ustawKomunikat(stan === 'weryfikacja' ? 'Weryfikacja SHA-256…' : `Pobieranie APK… ${procent}%`)
        },
      )
      ustawPobrana(aktualizacja)
      ustawEtap('gotowe')
      ustawPostep(100)
      ustawKomunikat('APK pobrano i zweryfikowano. Uruchamianie instalatora…')
      await uruchomInstalator(aktualizacja)
    } catch (blad) {
      ustawEtap(kodBledu(blad) === 'BRAK_MIEJSCA' ? 'brak_miejsca' : 'blad')
      ustawKomunikat(blad instanceof Error ? blad.message : 'Nie udało się pobrać lub zweryfikować APK.')
    }
  }

  const zajete = etap === 'sprawdzanie' || etap === 'pobieranie' || etap === 'weryfikacja' || etap === 'uruchamianie'
  const wariant = etap === 'blad' || etap === 'brak_miejsca' || etap === 'blad_instalatora' ? 'blad' : etap === 'dostepna' || etap === 'zgoda' ? 'ostrzezenie' : etap === 'brak' || etap === 'gotowe' ? 'sukces' : 'neutralny'

  return <><Karta>
    <div className="naglowek-karty"><div><h2>Aktualizacja aplikacji</h2><p>Warstwa natywna Android · OTA APK</p></div><Znacznik wariant={wariant}>{etykietyEtapu[etap]}</Znacznik></div>
    <div className="lista-kompaktowa">
      <div><span>Aktualnie zainstalowana wersja</span><strong>{wersja}</strong></div>
      <div><span>Dostępna wersja</span><strong>{dostepna?.manifest.versionName ?? '—'}</strong></div>
    </div>
    {dostepna?.manifest.releaseNotes && <div><h3>Informacje o wydaniu</h3><p className="tekst-pomocniczy" style={{ whiteSpace: 'pre-wrap' }}>{dostepna.manifest.releaseNotes}</p></div>}
    {komunikat && <p className="tekst-pomocniczy" role={etap === 'blad' ? 'alert' : 'status'}>{komunikat}</p>}
    {postep !== undefined && (etap === 'pobieranie' || etap === 'weryfikacja') && <progress value={postep} max="100" aria-label="Postęp pobierania aktualizacji" />}
    {!platforma.natywna && <p className="tekst-pomocniczy">Aktualizacje APK są dostępne w aplikacji Android.</p>}
    {platforma.natywna && !skonfigurowane && <p className="tekst-pomocniczy">{pobierzDiagnostykeRuntime() || 'Źródło aktualizacji nie jest skonfigurowane w tym APK.'}</p>}
    <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={!skonfigurowane || zajete} onClick={sprawdzAktualizacje}><RefreshCw aria-hidden="true" />Sprawdź aktualizacje</button>
      {etap === 'dostepna' && <button type="button" className="przycisk przycisk--glowny" onClick={pobierzAktualizacje}><Download aria-hidden="true" />Pobierz i zainstaluj</button>}
      {etap === 'zgoda' && pobrana && <button type="button" className="przycisk przycisk--glowny" onClick={() => uruchomInstalator(pobrana)}>Uruchom instalator</button>}
      {(etap === 'brak_miejsca' || etap === 'blad_instalatora') && pobrana && <button type="button" className="przycisk przycisk--glowny" onClick={() => uruchomInstalator(pobrana)}>Ponów instalację</button>}
    </div>
  </Karta><PanelAktualizacjiWeb /></>
}
