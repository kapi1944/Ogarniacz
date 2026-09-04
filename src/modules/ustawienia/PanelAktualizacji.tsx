import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Karta, Znacznik } from '../../components/Interfejs'
import { platforma } from '../../platform/platforma'
import type { PobranaAktualizacja, WynikSprawdzeniaAktualizacji } from '../../platform/typy'

type EtapAktualizacji = 'gotowy' | 'sprawdzanie' | 'brak' | 'dostepna' | 'pobieranie' | 'weryfikacja' | 'gotowe' | 'zgoda' | 'blad'

const etykietyEtapu: Record<EtapAktualizacji, string> = {
  gotowy: 'gotowe',
  sprawdzanie: 'sprawdzanie',
  brak: 'aktualna',
  dostepna: 'dostępna',
  pobieranie: 'pobieranie',
  weryfikacja: 'weryfikacja',
  gotowe: 'instalacja',
  zgoda: 'wymaga zgody',
  blad: 'błąd',
}

export function PanelAktualizacji() {
  const [wersja, ustawWersje] = useState('—')
  const [etap, ustawEtap] = useState<EtapAktualizacji>('gotowy')
  const [komunikat, ustawKomunikat] = useState('')
  const [postep, ustawPostep] = useState<number>()
  const [dostepna, ustawDostepna] = useState<WynikSprawdzeniaAktualizacji>()
  const [pobrana, ustawPobrana] = useState<PobranaAktualizacja>()
  const skonfigurowane = platforma.aktualizacje.skonfigurowane()

  useEffect(() => {
    platforma.aktualizacje.pobierzInformacje()
      .then((informacje) => ustawWersje(`${informacje.wersja} (${informacje.kod})`))
      .catch(() => ustawWersje(__WERSJA_APLIKACJI__))
  }, [])

  const sprawdzAktualizacje = async () => {
    ustawEtap('sprawdzanie')
    ustawKomunikat('Sprawdzanie manifestu latest.json…')
    ustawDostepna(undefined)
    ustawPobrana(undefined)
    try {
      const wynik = await platforma.aktualizacje.sprawdz()
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
    try {
      const wynik = await platforma.aktualizacje.uruchomInstalator(aktualizacja)
      if (wynik.wymagaZgody) {
        ustawEtap('zgoda')
        ustawKomunikat('Android otworzył zgodę „Instaluj nieznane aplikacje”. Włącz ją dla Ogarniacza, wróć tutaj i ponów instalację.')
      } else {
        ustawEtap('gotowe')
        ustawKomunikat('Instalator Androida został uruchomiony. Potwierdź aktualizację systemową.')
      }
    } catch (blad) {
      ustawEtap('blad')
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
      ustawEtap('blad')
      ustawKomunikat(blad instanceof Error ? blad.message : 'Nie udało się pobrać lub zweryfikować APK.')
    }
  }

  const zajete = etap === 'sprawdzanie' || etap === 'pobieranie' || etap === 'weryfikacja'
  const wariant = etap === 'blad' ? 'blad' : etap === 'dostepna' || etap === 'zgoda' ? 'ostrzezenie' : etap === 'brak' || etap === 'gotowe' ? 'sukces' : 'neutralny'

  return <Karta>
    <div className="naglowek-karty"><div><h2>Informacje o aplikacji</h2><p>Ogarniacz · local-first PWA i Android</p></div><Znacznik wariant={wariant}>{etykietyEtapu[etap]}</Znacznik></div>
    <div className="lista-kompaktowa">
      <div><span>Aktualnie zainstalowana wersja</span><strong>{wersja}</strong></div>
      <div><span>Dostępna wersja</span><strong>{dostepna?.manifest.versionName ?? '—'}</strong></div>
    </div>
    {dostepna?.manifest.releaseNotes && <div><h3>Informacje o wydaniu</h3><p className="tekst-pomocniczy" style={{ whiteSpace: 'pre-wrap' }}>{dostepna.manifest.releaseNotes}</p></div>}
    {komunikat && <p className="tekst-pomocniczy" role={etap === 'blad' ? 'alert' : 'status'}>{komunikat}</p>}
    {postep !== undefined && (etap === 'pobieranie' || etap === 'weryfikacja') && <progress value={postep} max="100" aria-label="Postęp pobierania aktualizacji" />}
    {!platforma.natywna && <p className="tekst-pomocniczy">Aktualizacje APK są dostępne w aplikacji Android.</p>}
    {platforma.natywna && !skonfigurowane && <p className="tekst-pomocniczy">Źródło aktualizacji nie jest skonfigurowane w tym buildzie.</p>}
    <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={!skonfigurowane || zajete} onClick={sprawdzAktualizacje}><RefreshCw aria-hidden="true" />Sprawdź aktualizacje</button>
      {etap === 'dostepna' && <button type="button" className="przycisk przycisk--glowny" onClick={pobierzAktualizacje}><Download aria-hidden="true" />Pobierz i zainstaluj</button>}
      {etap === 'zgoda' && pobrana && <button type="button" className="przycisk przycisk--glowny" onClick={() => uruchomInstalator(pobrana)}>Uruchom instalator</button>}
    </div>
  </Karta>
}
