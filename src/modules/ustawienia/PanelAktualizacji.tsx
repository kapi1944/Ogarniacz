import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Karta, Znacznik } from '../../components/Interfejs'
import { platforma } from '../../platform/platforma'
import { pobierzDiagnostykeRuntime } from '../../services/RuntimeConfigService'
import { nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, sprawdzAktualizacjeApk } from '../../services/KontrolaAktualizacjiAplikacji'
import type { PobranaAktualizacja, StatusInstalacjiAktualizacji, WynikSprawdzeniaAktualizacji } from '../../platform/typy'
import { PanelAktualizacjiWeb } from './PanelAktualizacjiWeb'

type EtapAktualizacji = 'gotowy' | 'sprawdzanie' | 'brak' | 'dostepna' | 'pobieranie' | 'weryfikacja' | 'brak_miejsca' | 'zgoda' | 'uruchamianie' | 'gotowe' | 'blad_instalatora' | 'blad_pobierania' | 'bledny_sha' | 'blad_finalizacji' | 'blad'

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
  blad_pobierania: 'błąd pobierania',
  bledny_sha: 'błędny SHA-256',
  blad_finalizacji: 'błąd zapisu APK',
  blad: 'błąd',
}

function kodBledu(blad: unknown) {
  return typeof blad === 'object' && blad !== null && 'code' in blad ? String(blad.code) : ''
}

function daneBledu(blad: unknown) {
  if (typeof blad !== 'object' || blad === null) return {}
  const dane = 'data' in blad && typeof blad.data === 'object' && blad.data !== null ? blad.data : blad
  return dane as { wolneBajty?: number, wymaganeBajty?: number, brakujaceBajty?: number }
}

export function komunikatBleduAktualizacji(blad: unknown, domyslny: string) {
  const kod = kodBledu(blad)
  if (kod === 'BRAK_MIEJSCA') {
    const { wolneBajty, wymaganeBajty, brakujaceBajty } = daneBledu(blad)
    const format = (bajty: number) => bajty >= 1024 ** 3
      ? `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(bajty / 1024 ** 3)} GB`
      : `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(bajty / 1024 ** 2)} MB`
    if ([wolneBajty, wymaganeBajty, brakujaceBajty].every((wartosc) => typeof wartosc === 'number')) {
      return `Za mało wolnego miejsca na aktualizację. Dostępne: ${format(wolneBajty!)}. Wymagane: około ${format(wymaganeBajty!)}. Zwolnij co najmniej ${format(brakujaceBajty!)} i spróbuj ponownie.`
    }
    return 'Za mało wolnego miejsca na aktualizację. Zwolnij około 2 GB w pamięci wewnętrznej i spróbuj ponownie.'
  }
  const wiadomosci: Record<string, string> = {
    BLAD_POBIERANIA: 'Nie udało się pobrać APK. Sprawdź połączenie z internetem i spróbuj ponownie.',
    BLEDNY_SHA: 'Pobrany APK nie przeszedł weryfikacji SHA-256 i został usunięty. Spróbuj ponownie później.',
    BLAD_FINALIZACJI: 'APK został pobrany, ale nie udało się bezpiecznie zapisać zweryfikowanego pliku. Spróbuj ponownie.',
    BRAK_INSTALATORA: 'Nie udało się uruchomić systemowego instalatora Androida. Sprawdź ustawienia urządzenia i spróbuj ponownie.',
  }
  return wiadomosci[kod] ?? (blad instanceof Error ? blad.message : domyslny)
}

function etapBleduPobierania(blad: unknown): EtapAktualizacji {
  const kod = kodBledu(blad)
  if (kod === 'BRAK_MIEJSCA') return 'brak_miejsca'
  if (kod === 'BLEDNY_SHA') return 'bledny_sha'
  if (kod === 'BLAD_FINALIZACJI') return 'blad_finalizacji'
  return kod === 'BLAD_POBIERANIA' ? 'blad_pobierania' : 'blad'
}

function opisStatusuInstalacji(status: StatusInstalacjiAktualizacji): [EtapAktualizacji, string] {
  const opisy: Record<StatusInstalacjiAktualizacji, [EtapAktualizacji, string]> = {
    OCZEKUJE_NA_UZYTKOWNIKA: ['zgoda', 'Czeka na potwierdzenie Androida.'], INSTALOWANIE: ['uruchamianie', 'Instalowanie aktualizacji…'],
    SUKCES: ['gotowe', 'Aktualizacja zakończona.'], ANULOWANO: ['blad_instalatora', 'Instalacja została anulowana.'],
    BRAK_MIEJSCA: ['brak_miejsca', 'Za mało wolnego miejsca na aktualizację.'], NIEZGODNY_PODPIS: ['blad_instalatora', 'APK jest podpisane innym kluczem.'],
    NIEPRAWIDLOWY_APK: ['blad_instalatora', 'Pakiet aktualizacji jest nieprawidłowy.'], KONFLIKT_PAKIETU: ['blad_instalatora', 'Wystąpił konflikt pakietu aktualizacji.'],
    BLOKADA_SYSTEMOWA: ['blad_instalatora', 'Android zablokował instalację.'], NIEZNANY_BLAD: ['blad_instalatora', 'Android nie mógł zainstalować aktualizacji.'],
  }
  return opisy[status]
}

export function PanelAktualizacji() {
  const [wersja, ustawWersje] = useState('—')
  const [etap, ustawEtap] = useState<EtapAktualizacji>('gotowy')
  const [komunikat, ustawKomunikat] = useState('')
  const [postep, ustawPostep] = useState<number>()
  const [dostepna, ustawDostepna] = useState<WynikSprawdzeniaAktualizacji>()
  const [pobrana, ustawPobrana] = useState<PobranaAktualizacja>()
  const [czyLokalnyPrzebieg, ustawCzyLokalnyPrzebieg] = useState(false)
  const stanKontroli = useSyncExternalStore(nasluchujKontroliAktualizacji, pobierzStanKontroliAktualizacji, pobierzStanKontroliAktualizacji)
  const skonfigurowane = platforma.aktualizacje.skonfigurowane()

  useEffect(() => {
    platforma.aktualizacje.pobierzInformacje()
      .then((informacje) => ustawWersje(`${informacje.wersja} (${informacje.kod})`))
      .catch(() => ustawWersje(__WERSJA_APLIKACJI__))
  }, [])

  useEffect(() => {
    const zastosuj = (stan: { status?: StatusInstalacjiAktualizacji, komunikatAndroida?: string }) => {
      if (!stan.status) return
      const [nowyEtap, nowyKomunikat] = opisStatusuInstalacji(stan.status)
      ustawCzyLokalnyPrzebieg(true)
      ustawEtap(nowyEtap); ustawKomunikat(stan.komunikatAndroida || nowyKomunikat)
    }
    void platforma.aktualizacje.pobierzStanInstalacji().then(zastosuj)
    let usun: () => void = () => undefined
    void platforma.aktualizacje.nasluchujStanuInstalacji(zastosuj).then((odsubskrybuj) => { usun = odsubskrybuj })
    return () => usun()
  }, [])

  useEffect(() => {
    if (!stanKontroli.wynikApk || czyLokalnyPrzebieg) return
    ustawDostepna(stanKontroli.wynikApk)
    ustawEtap(stanKontroli.wynikApk.czyNowsza ? 'dostepna' : 'brak')
    ustawKomunikat(stanKontroli.wynikApk.czyNowsza
      ? `Dostępna wersja ${stanKontroli.wynikApk.manifest.versionName}.`
      : 'Brak aktualizacji. Masz najnowszą wersję Ogarniacza.')
  }, [czyLokalnyPrzebieg, stanKontroli.wynikApk])

  useEffect(() => {
    if (!stanKontroli.bladApk || czyLokalnyPrzebieg) return
    ustawEtap('blad')
    ustawKomunikat(stanKontroli.bladApk)
  }, [czyLokalnyPrzebieg, stanKontroli.bladApk])

  const sprawdzAktualizacje = async () => {
    ustawCzyLokalnyPrzebieg(true)
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

  const uruchomInstalator = async (aktualizacja: PobranaAktualizacja, manifest: WynikSprawdzeniaAktualizacji['manifest']) => {
    ustawCzyLokalnyPrzebieg(true)
    ustawEtap('uruchamianie')
    ustawKomunikat('Przekazywanie APK do systemowego instalatora…')
    try {
      const wynik = await platforma.aktualizacje.uruchomInstalator(aktualizacja, manifest)
      if (wynik.wymagaZgody) {
        ustawEtap('zgoda')
        ustawKomunikat('Android otworzył zgodę „Instaluj nieznane aplikacje”. Włącz ją dla Ogarniacza, wróć tutaj i ponów instalację.')
      } else if (wynik.status) {
        const [nowyEtap, nowyKomunikat] = opisStatusuInstalacji(wynik.status)
        ustawEtap(nowyEtap)
        ustawKomunikat(wynik.komunikatAndroida || nowyKomunikat)
      }
    } catch (blad) {
      ustawEtap(kodBledu(blad) === 'BRAK_MIEJSCA' ? 'brak_miejsca' : 'blad_instalatora')
      ustawKomunikat(komunikatBleduAktualizacji(blad, 'Nie udało się uruchomić instalatora Androida.'))
    }
  }

  const pobierzAktualizacje = async () => {
    if (!dostepna) return
    ustawCzyLokalnyPrzebieg(true)
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
      await uruchomInstalator(aktualizacja, dostepna.manifest)
    } catch (blad) {
      ustawEtap(etapBleduPobierania(blad))
      ustawKomunikat(komunikatBleduAktualizacji(blad, 'Nie udało się pobrać lub zweryfikować APK.'))
    }
  }

  const zajete = etap === 'sprawdzanie' || etap === 'pobieranie' || etap === 'weryfikacja' || etap === 'uruchamianie'
  const czyEtapBledu = etap === 'blad' || etap === 'brak_miejsca' || etap === 'blad_instalatora' || etap === 'blad_pobierania' || etap === 'bledny_sha' || etap === 'blad_finalizacji'
  const wariant = czyEtapBledu ? 'blad' : etap === 'dostepna' || etap === 'zgoda' ? 'ostrzezenie' : etap === 'brak' || etap === 'gotowe' ? 'sukces' : 'neutralny'

  return <><Karta>
    <div className="naglowek-karty"><div><h2>Aktualizacja aplikacji</h2><p>Warstwa natywna Android · OTA APK</p></div><Znacznik wariant={wariant}>{etykietyEtapu[etap]}</Znacznik></div>
    <div className="lista-kompaktowa">
      <div><span>Aktualnie zainstalowana wersja</span><strong>{wersja}</strong></div>
      <div><span>Dostępna wersja</span><strong>{dostepna?.manifest.versionName ?? '—'}</strong></div>
    </div>
    {dostepna?.manifest.releaseNotes && <div><h3>Informacje o wydaniu</h3><p className="tekst-pomocniczy" style={{ whiteSpace: 'pre-wrap' }}>{dostepna.manifest.releaseNotes}</p></div>}
    {komunikat && <p className="tekst-pomocniczy" role={czyEtapBledu ? 'alert' : 'status'}>{komunikat}</p>}
    {postep !== undefined && (etap === 'pobieranie' || etap === 'weryfikacja') && <progress value={postep} max="100" aria-label="Postęp pobierania aktualizacji" />}
    {!platforma.natywna && <p className="tekst-pomocniczy">Aktualizacje APK są dostępne w aplikacji Android.</p>}
    {platforma.natywna && <p className="tekst-pomocniczy">APK pobierane przez Ogarniacza trafia do prywatnej pamięci aplikacji, więc nie musi być widoczne w systemowym folderze „Pobrane”.</p>}
    {platforma.natywna && !skonfigurowane && <p className="tekst-pomocniczy">{pobierzDiagnostykeRuntime() || 'Źródło aktualizacji nie jest skonfigurowane w tym APK.'}</p>}
    <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={!skonfigurowane || zajete} onClick={sprawdzAktualizacje}><RefreshCw aria-hidden="true" />Sprawdź aktualizacje</button>
      {etap === 'dostepna' && <button type="button" className="przycisk przycisk--glowny" onClick={pobierzAktualizacje}><Download aria-hidden="true" />Pobierz i zainstaluj</button>}
      {etap === 'zgoda' && pobrana && dostepna && <button type="button" className="przycisk przycisk--glowny" onClick={() => uruchomInstalator(pobrana, dostepna.manifest)}>Uruchom instalator</button>}
      {(etap === 'brak_miejsca' || etap === 'blad_instalatora') && pobrana && dostepna && <button type="button" className="przycisk przycisk--glowny" onClick={() => uruchomInstalator(pobrana, dostepna.manifest)}>Ponów instalację</button>}
      {czyEtapBledu && !pobrana && dostepna && <button type="button" className="przycisk przycisk--glowny" onClick={pobierzAktualizacje}><Download aria-hidden="true" />Ponów pobieranie</button>}
    </div>
  </Karta><PanelAktualizacjiWeb /></>
}
