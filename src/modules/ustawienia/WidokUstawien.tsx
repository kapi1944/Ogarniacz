import { PRYWATNE_SEKCJE_ZDROWIA } from '../../services/UprawnieniaService'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bell, Cloud, Database, Download, History as IkonaHistorii, RefreshCw, Share2, Shield, Sparkles, Upload, UserCog } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { WidokRejestru } from '../../components/WidokRejestru'
import { Karta, Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { inicjalizujBaze } from '../../data/BazaOgarniacza'
import { terazIso, utworzMetadane } from '../../domain/fabryki'
import type { NazwaModulu, PamiecEcho, ProfilEdytora, StatusSynchronizacji, Uprawnienie } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { czyBackupZaszyfrowany, PODSTAWOWE_SEKCJE_BACKUPU, przygotujBackupDoPrzywracania, przywrocBackup, SEKCJE_BACKUPU, szyfrujBackup, utworzBackup, wyczyscDane, type ManifestBackupu, type NazwaSekcjiBackupu, type OgarniaczBackup, type ZaszyfrowanyBackup } from '../../services/BackupService'
import { czyMoznaWczytacDemo, wczytajDaneDemonstracyjne } from '../../services/DaneDemonstracyjneService'
import { importujUstawienia, utworzEksportUstawien } from '../../services/TransferUstawienService'
import { pobierzNajnowszaHistorie } from '../../services/HistoriaZmianService'
import { pobierzInstallationId } from '../../services/InstallationService'
import { pobierzKonfliktySynchronizacji, pobierzStanSynchronizacji } from '../../services/SyncEngine'
import { czySynchronizacjaSkonfigurowana, rozstrzygnijKonfliktSynchronizacji, synchronizujTeraz as uruchomSynchronizacje } from '../../services/SynchronizacjaAplikacji'
import type { RozstrzygniecieKonfliktu } from '../../services/SyncEngine'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { KontoIBezpieczenstwo, useKonto } from '../../app/DostawcaKonta'
import { platforma } from '../../platform/platforma'
import type { StanPowiadomienPlatformy, StanZgody } from '../../platform/typy'
import { PanelUstawienAplikacji } from './PanelUstawienAplikacji'
import { KartaKonfliktuSynchronizacji } from './KonfliktSynchronizacji'
import { SekcjaPolaczeniaIAktualizacji } from './SekcjaPolaczeniaIAktualizacji'
import { utworzDiagnostykeSynchronizacji } from '../../services/DiagnostykaSynchronizacji'
import { pobierzKonfiguracjeSynchronizacji } from '../../services/KonfiguracjaSynchronizacji'
import { pobierzCsrfKonta } from '../../services/KontaService'

const modulyUprawnien: { wartosc: NazwaModulu; etykieta: string }[] = [
  ['zdrowie', 'Zdrowie'], ['skierowania', 'Skierowania'], ['zadania', 'Zadania'], ['projekty', 'Projekty'], ['skrzynka', 'Poczekalnia'], ['planer', 'Planer'], ['grafik', 'Grafik'], ['nawyki', 'Nawyki'], ['leki', 'Leki'], ['wizyty', 'Wizyty'], ['przypomnienia', 'Przypomnienia'], ['zakupy', 'Zakupy'], ['rachunki', 'Rachunki'], ['miasto', 'Sprawy na mieście'], ['cele', 'Cele'], ['notatki', 'Notatki'], ['pomysly', 'Pomysły'], ['na_pozniej', 'Na później'], ['kontakty', 'Kontakty'], ['dokumenty', 'Dokumenty'], ['finanse', 'Finanse'], ['samochod', 'Samochód'], ['terminy', 'Terminy'],
].map(([wartosc, etykieta]) => ({ wartosc: wartosc as NazwaModulu, etykieta }))

const etykietaZgody = (stan: StanZgody | null | undefined) => {
  if (stan === 'przyznana') return 'przyznana'
  if (stan === 'odrzucona') return 'odrzucona'
  if (stan === 'pytaj') return 'nieustalona'
  return 'niedostępne'
}

const etykietySynchronizacji: Record<StatusSynchronizacji, string> = {
  zsynchronizowano: 'zsynchronizowano',
  synchronizacja: 'synchronizowanie…',
  oczekuje: 'oczekuje na synchronizację',
  offline: 'offline',
  konflikt: 'wymaga decyzji',
  blad: 'błąd synchronizacji',
}

const wariantSynchronizacji = (stan?: StatusSynchronizacji): 'neutralny' | 'sukces' | 'ostrzezenie' | 'blad' | 'informacja' => {
  if (stan === 'zsynchronizowano') return 'sukces'
  if (stan === 'synchronizacja') return 'informacja'
  if (stan === 'offline' || stan === 'oczekuje' || stan === 'konflikt') return 'ostrzezenie'
  if (stan === 'blad') return 'blad'
  return 'neutralny'
}

export function WidokUstawien() {
  const { ustawienia, zapiszUstawienia } = useAplikacja()
  const { konto } = useKonto()
  const { dane: pamiec, repozytorium: repoPamieci } = useRepozytorium('pamiecEcho')
  const { dane: edytorzy, repozytorium: repoEdytorow } = useRepozytorium('edytorzy')
  const { dane: uprawnienia, repozytorium: repoUprawnien } = useRepozytorium('uprawnienia')
  const historia = useLiveQuery(() => pobierzNajnowszaHistorie(50), [], [])
  const stanSynchronizacji = useLiveQuery(() => pobierzStanSynchronizacji(), [], undefined)
  const konfliktySynchronizacji = useLiveQuery(() => pobierzKonfliktySynchronizacji(), [], [])
  const [komunikat, ustawKomunikat] = useState('')
  const [blad, ustawBlad] = useState('')
  const [wybraneSekcje, ustawWybraneSekcje] = useState<NazwaSekcjiBackupu[]>(PODSTAWOWE_SEKCJE_BACKUPU)
  const [backup, ustawBackup] = useState<{ manifest: ManifestBackupu; plik: ZaszyfrowanyBackup }>()
  const [operacjaHasla, ustawOperacjeHasla] = useState<{ rodzaj: 'eksport' | 'przywracanie' } | { rodzaj: 'import'; tresc: string }>()
  const [plikZaszyfrowany, ustawPlikZaszyfrowany] = useState<boolean>()
  const [backupDoPrzywracania, ustawBackupDoPrzywracania] = useState<OgarniaczBackup>()
  const [przypiszStarszaKopie, ustawPrzypiszStarszaKopie] = useState(false)
  const [sekcjePrzywracania, ustawSekcjePrzywracania] = useState<NazwaSekcjiBackupu[]>([])
  const [backupPrzedPrzywracaniem, ustawBackupPrzedPrzywracaniem] = useState<{ manifest: ManifestBackupu; plik: ZaszyfrowanyBackup }>()
  const [potwierdzenieZapisu, ustawPotwierdzenieZapisu] = useState(false)
  const [trwaPrzywracanie, ustawTrwaPrzywracanie] = useState(false)
  const rozstrzygnijZapis = useRef<((zapisano: boolean) => void) | null>(null)
  const widokAktywny = useRef(true)
  const [tworzenieBackupu, ustawTworzenieBackupu] = useState(false)
  const [czyszczenie, ustawCzyszczenie] = useState(false)
  const [moznaDemo, ustawMoznaDemo] = useState(false)
  const [zajete, ustawZajete] = useState('—')
  const [nowyEdytor, ustawNowegoEdytora] = useState('')
  const [grant, ustawGrant] = useState({ editorId: '', modul: 'zadania' as NazwaModulu, sekcja: '', odczyt: true, edycja: false })
  const [stanPowiadomien, ustawStanPowiadomien] = useState<StanPowiadomienPlatformy>()
  const installationId = pobierzInstallationId()
  const synchronizacjaSkonfigurowana = czySynchronizacjaSkonfigurowana()
  useEffect(() => {
    widokAktywny.current = true
    return () => { widokAktywny.current = false; rozstrzygnijZapis.current?.(false) }
  }, [])
  const diagnostykaSynchronizacji = utworzDiagnostykeSynchronizacji({
    czyAndroid: platforma.rodzaj === 'android',
    adresApi: pobierzKonfiguracjeSynchronizacji().adresApi,
    konto,
    csrfDostepny: Boolean(pobierzCsrfKonta()),
    installationId,
    stan: stanSynchronizacji,
  })

  useEffect(() => {
    let aktywny = true
    void Promise.allSettled([
      Promise.resolve().then(czyMoznaWczytacDemo).then((wynik) => { if (aktywny) ustawMoznaDemo(wynik) }),
      Promise.resolve().then(() => navigator.storage?.estimate?.()).then((wynik) => {
        if (aktywny && wynik) ustawZajete(wynik.usage ? `${(wynik.usage / 1024 / 1024).toFixed(2)} MB` : '0 MB')
      }),
      Promise.resolve().then(() => platforma.powiadomienia.sprawdzStan()).then((wynik) => { if (aktywny) ustawStanPowiadomien(wynik) }),
    ]).then((wyniki) => {
      if (aktywny && wyniki.some((wynik) => wynik.status === 'rejected')) ustawBlad('Nie udało się odczytać części ustawień urządzenia. Spróbuj ponownie otworzyć Ustawienia.')
    })
    return () => { aktywny = false }
  }, [])

  const przygotujBackup = async (haslo: string) => {
    ustawTworzenieBackupu(true)
    ustawBlad('')
    ustawBackup(undefined)
    try {
      const nowyBackup = await utworzBackup(wybraneSekcje)
      const plik = await szyfrujBackup(nowyBackup, haslo)
      ustawBackup({ manifest: nowyBackup.manifest, plik })
      ustawKomunikat('Backup został zaszyfrowany. Możesz zapisać lub udostępnić plik JSON.')
    } finally {
      ustawTworzenieBackupu(false)
    }
  }

  const utworzPlikJson = (dane: unknown) => new Blob([JSON.stringify(dane, null, 2)], { type: 'application/json' })

  const pobierzJson = async (dane: unknown, nazwa: string) => {
    ustawBlad('')
    ustawKomunikat('')
    const plik = utworzPlikJson(dane)
    const wynik = await platforma.pliki.zapiszZWynikiem(nazwa, plik)
    if (wynik.status === 'blad') ustawBlad('BŁĄD: Nie udało się zapisać i zweryfikować pliku. Spróbuj ponownie lub wybierz inne miejsce.')
    else ustawKomunikat(wynik.status === 'zapisano' ? 'ZAPISANO: Plik zapisano w wybranym miejscu i sprawdzono jego odczyt.' : wynik.status === 'anulowano' ? 'ANULOWANO: Zapis pliku został anulowany.' : 'Rozpoczęto pobieranie pliku. Sprawdź pobrane pliki w przeglądarce.')
  }

  const udostepnijJson = async (dane: unknown, nazwa: string) => {
    ustawBlad('')
    ustawKomunikat('')
    const adresPliku = await platforma.pliki.zapiszTymczasowo(nazwa, utworzPlikJson(dane))
    if (!adresPliku) return ustawBlad('BŁĄD: Nie udało się przygotować pliku do udostępnienia.')
    const wynik = await platforma.udostepnianie.udostepnijPlikJson(adresPliku)
    if (wynik === 'blad') ustawBlad('BŁĄD: Nie udało się odczytać lub udostępnić pliku backupu.')
    else ustawKomunikat(wynik === 'anulowano' ? 'ANULOWANO: Udostępnianie zostało anulowane.' : wynik === 'przekazano' ? 'Wybrano aplikację dla pliku JSON. Zapis nie jest potwierdzony — sprawdź plik w aplikacji docelowej.' : 'Brak potwierdzenia udostępnienia. Sprawdź plik w aplikacji docelowej lub użyj „Zapisz plik JSON”.')
  }

  const zmienSekcjeBackupu = (nazwa: NazwaSekcjiBackupu, zaznaczona: boolean) => {
    ustawBackup(undefined)
    ustawWybraneSekcje((obecne) => zaznaczona ? [...obecne, nazwa] : obecne.filter((sekcja) => sekcja !== nazwa))
  }

  const wybierzPlikBackupu = async (plik?: File) => {
    if (!plik) return
    ustawPrzypiszStarszaKopie(false)
    ustawBlad('')
    ustawBackupDoPrzywracania(undefined)
    ustawPlikZaszyfrowany(undefined)
    ustawBackupPrzedPrzywracaniem(undefined)
    ustawOperacjeHasla(undefined)
    try {
      const tresc = await plik.text()
      if (czyBackupZaszyfrowany(tresc)) {
        ustawPlikZaszyfrowany(true)
        ustawOperacjeHasla({ rodzaj: 'import', tresc })
        return
      }
      const przygotowany = await przygotujBackupDoPrzywracania(tresc)
      ustawPlikZaszyfrowany(false)
      ustawBackupDoPrzywracania(przygotowany)
      ustawSekcjePrzywracania(przygotowany.manifest.sections)
      ustawKomunikat('Kopia przeszła walidację integralności. Ten historyczny plik nie jest zabezpieczony hasłem. Wybierz sekcje do przywrócenia.')
    } catch (bladBackupu) {
      ustawBlad(bladBackupu instanceof Error ? bladBackupu.message : 'Nie udało się zwalidować backupu.')
    }
  }

  const wykonajOperacjeZHaslem = async (haslo: string) => {
    if (!operacjaHasla) return
    ustawBlad('')
    if (operacjaHasla.rodzaj === 'import') {
      const przygotowany = await przygotujBackupDoPrzywracania(operacjaHasla.tresc, haslo)
      ustawBackupDoPrzywracania(przygotowany)
      ustawSekcjePrzywracania(przygotowany.manifest.sections)
      ustawKomunikat('Kopia odszyfrowana i zwalidowana. Sprawdź manifest i wybierz sekcje do przywrócenia.')
    } else if (operacjaHasla.rodzaj === 'przywracanie') {
      await wykonajPrzywracanie(haslo)
    } else {
      await przygotujBackup(haslo)
    }
    ustawOperacjeHasla(undefined)
  }

  const zmienSekcjePrzywracania = (nazwa: NazwaSekcjiBackupu, zaznaczona: boolean) => {
    ustawSekcjePrzywracania((obecne) => zaznaczona ? [...obecne, nazwa] : obecne.filter((sekcja) => sekcja !== nazwa))
  }

  const potwierdzZapisKopii = (zapisano: boolean) => {
    const rozstrzygnij = rozstrzygnijZapis.current
    rozstrzygnijZapis.current = null
    ustawPotwierdzenieZapisu(false)
    ustawOperacjeHasla(undefined)
    rozstrzygnij?.(zapisano)
  }

  const wykonajPrzywracanie = async (haslo: string) => {
    if (!backupDoPrzywracania) return
    ustawTrwaPrzywracanie(true)
    try {
      const wynik = await przywrocBackup(backupDoPrzywracania, sekcjePrzywracania, {
        trybStarszejKopii: przypiszStarszaKopie ? 'przypisz-do-aktywnego-profilu' : undefined,
        poUtworzeniuKopii: async (kopia) => {
          const plik = await szyfrujBackup(kopia, haslo)
          const wynikZapisu = await platforma.pliki.zapiszZWynikiem(`ogarniacz-before-restore-${kopia.manifest.createdAt.replace(/[:.]/g, '-')}.json`, utworzPlikJson(plik))
          if (wynikZapisu.status === 'anulowano') throw new Error('ANULOWANO: Zapis kopii ochronnej anulowany. Przywracanie nie zostało rozpoczęte.')
          if (wynikZapisu.status !== 'zapisano' && wynikZapisu.status !== 'pobieranie') throw new Error('BŁĄD: Nie udało się zapisać szyfrowanej kopii ochronnej. Przywracanie nie zostało rozpoczęte.')
          if (!widokAktywny.current) throw new Error('Przywracanie anulowano po zamknięciu panelu.')
          ustawBackupPrzedPrzywracaniem({ manifest: kopia.manifest, plik })
          if (!platforma.natywna) {
            const potwierdzono = await new Promise<boolean>((rozwiaz) => {
              rozstrzygnijZapis.current = rozwiaz
              ustawPotwierdzenieZapisu(true)
            })
            if (!potwierdzono) throw new Error('Przywracanie anulowano przed zmianą danych.')
          }
        },
      })
      ustawKomunikat(`Przywrócono ${wynik.liczbaRekordow} rekordów. Szyfrowana kopia ochronna została zapisana przed przywracaniem.`)
    } catch (przyczyna) {
      if (widokAktywny.current) ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się przywrócić danych.')
      throw przyczyna
    } finally {
      ustawTrwaPrzywracanie(false)
    }
  }

  const eksportujSameUstawienia = async () => {
    const eksport = await utworzEksportUstawien()
    pobierzJson(eksport, `ogarniacz-ustawienia-${eksport.createdAt.slice(0, 10)}.json`)
  }

  const wybierzPlikUstawien = async (plik?: File) => {
    if (!plik) return
    try {
      await importujUstawienia(await plik.text())
      ustawKomunikat('Ustawienia zostały zaimportowane i znormalizowane.')
      ustawBlad('')
    } catch (bladUstawien) {
      ustawBlad(bladUstawien instanceof Error ? bladUstawien.message : 'Nie udało się zaimportować ustawień.')
    }
  }

  const wlaczPowiadomienia = async () => {
    if (!platforma.powiadomienia.dostepne()) return ustawBlad('Ta platforma nie obsługuje powiadomień systemowych.')
    const przyznana = await platforma.powiadomienia.poprosOUprawnienie()
    await zapiszUstawienia({ powiadomienia: przyznana })
    ustawStanPowiadomien(await platforma.powiadomienia.sprawdzStan())
    ustawKomunikat(przyznana
      ? platforma.natywna ? 'Natywne powiadomienia Androida są włączone.' : 'Powiadomienia przeglądarki są włączone. Przy zamkniętej PWA ich działanie nie jest gwarantowane.'
      : 'Nie przyznano dostępu do powiadomień.')
  }

  const synchronizujTeraz = async () => {
    ustawBlad('')
    try {
      const wynik = await uruchomSynchronizacje()
      if (wynik.stan === 'offline') ustawKomunikat('Synchronizacja czeka na połączenie z siecią.')
      else if (wynik.stan === 'oczekuje') ustawKomunikat('Pozostałe zmiany czekają na kolejny przebieg synchronizacji.')
      else ustawKomunikat(`Synchronizacja zakończona: wysłano ${wynik.wyslane}, pobrano ${wynik.pobrane}, konflikty ${wynik.konflikty}.`)
    } catch {
      ustawBlad('Nie udało się zsynchronizować danych. Spróbuj ponownie po sprawdzeniu połączenia.')
    }
  }

  const rozstrzygnijKonflikt = async (id: string, rozstrzygniecie: RozstrzygniecieKonfliktu) => {
    ustawBlad('')
    try {
      await rozstrzygnijKonfliktSynchronizacji(id, rozstrzygniecie)
      ustawKomunikat(rozstrzygniecie.typ === 'zdalny'
        ? 'Zastosowano wersję z serwera.'
        : 'Zapisano rozwiązanie. Zostanie wysłane podczas następnej synchronizacji.')
    } catch (bladRozstrzygania) {
      ustawKomunikat('')
      ustawBlad(bladRozstrzygania instanceof Error
        ? bladRozstrzygania.message
        : 'Nie udało się zapisać rozwiązania konfliktu.')
      throw bladRozstrzygania
    }
  }

  const dodajEdytora = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault(); if (!nowyEdytor.trim()) return
    const profil: ProfilEdytora = { ...utworzMetadane(), nazwa: nowyEdytor.trim(), aktywny: true }
    await repoEdytorow.zapisz(profil); ustawNowegoEdytora(''); ustawGrant({ ...grant, editorId: profil.id })
  }

  const dodajGrant = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault(); if (!grant.editorId) return ustawBlad('Najpierw wybierz Edytora.')
    const uprawnienie: Uprawnienie = { ...utworzMetadane(), owner: 'wlasciciel', editorId: grant.editorId, modul: grant.modul, sekcja: grant.modul === 'zdrowie' ? grant.sekcja || undefined : undefined, odczyt: grant.odczyt || grant.edycja, edycja: grant.edycja, status: 'aktywne' }
    await repoUprawnien.zapisz(uprawnienie); ustawKomunikat('Uprawnienie zapisane w lokalnym permission engine.')
  }

  return <div className="widok widok-ustawien">
    <NaglowekWidoku tytul="Ustawienia" opis="Wygląd, nawigacja, Pulpit, harmonogram i pozostałe preferencje lokalnej aplikacji." />
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}{blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <KontoIBezpieczenstwo />
    <PanelUstawienAplikacji />
    <Karta><h2>Konta i użytkownicy</h2><p>Moje konto, hasło, aktywne sesje, udostępnianie i bezpieczna zmiana użytkownika.</p><Link className="przycisk przycisk--drugorzedny" to="/ustawienia/konta">Otwórz konta i użytkowników</Link></Karta>
    <section className="siatka-ustawien">
      <Karta><div className="tytul-karty"><Bell aria-hidden="true" /><span>Powiadomienia</span></div><h2>{platforma.natywna ? 'Android Local Notifications' : 'Notification API'}</h2><p>Wspólny silnik Ogarniacza ustala treść i czas. Platforma jest wyłącznie kanałem dostarczenia.</p><div className="lista-kompaktowa"><div><span>Zgoda na powiadomienia</span><Znacznik wariant={stanPowiadomien?.zgoda === 'przyznana' ? 'sukces' : 'neutralny'}>{etykietaZgody(stanPowiadomien?.zgoda)}</Znacznik></div><div><span>Powiadomienia systemowe</span><Znacznik wariant={stanPowiadomien?.systemoweWlaczone ? 'sukces' : 'ostrzezenie'}>{stanPowiadomien?.systemoweWlaczone ? 'włączone' : 'wyłączone'}</Znacznik></div>{platforma.natywna && <><div><span>Kanały Androida</span><Znacznik wariant={stanPowiadomien?.kanalyGotowe ? 'sukces' : 'ostrzezenie'}>{stanPowiadomien?.kanalyGotowe ? 'gotowe' : 'niegotowe'}</Znacznik></div><div><span>Dokładne alarmy</span><Znacznik wariant={stanPowiadomien?.exactAlarms === 'przyznana' ? 'sukces' : 'neutralny'}>{etykietaZgody(stanPowiadomien?.exactAlarms)}</Znacznik><small>Używane tylko dla przypomnień krytycznych lub eskalowanych; Ogarniacz nie otwiera sam ustawień specjalnego dostępu.</small></div></>}</div><button type="button" className="przycisk przycisk--drugorzedny" onClick={wlaczPowiadomienia}>{ustawienia.powiadomienia ? 'Sprawdź uprawnienie' : 'Włącz powiadomienia'}</button></Karta>
      <Karta><div className="tytul-karty"><Bell aria-hidden="true" /><span>Prywatność zdrowia</span></div><label className="ustawienie-wiersz"><span><strong>Ukrywaj szczegóły zdrowotne w powiadomieniach</strong><small>Powiadomienia leków, wizyt i skierowań pokażą ogólny komunikat.</small></span><input type="checkbox" checked={ustawienia.ukrywajSzczegolyZdrowotneWPowiadomieniach} onChange={(e) => zapiszUstawienia({ ukrywajSzczegolyZdrowotneWPowiadomieniach: e.target.checked })} /></label></Karta>
      <Karta><div className="tytul-karty"><Sparkles aria-hidden="true" /><span>Echo</span></div><h2>Proaktywność</h2><label className="ustawienie-wiersz"><span><strong>Proaktywność</strong><small>Pozwala Echo prezentować lokalne sugestie.</small></span><input type="checkbox" checked={ustawienia.proaktywnoscEcho} onChange={(e) => zapiszUstawienia({ proaktywnoscEcho: e.target.checked })} /></label><label className="ustawienie-wiersz"><span><strong>Wyciszenie</strong><small>Ukrywa inicjowane sugestie bez wyłączania panelu.</small></span><input type="checkbox" checked={ustawienia.echoWyciszone} onChange={(e) => zapiszUstawienia({ echoWyciszone: e.target.checked })} /></label></Karta>
      <Karta><div className="tytul-karty"><Database aria-hidden="true" /><span>Dane lokalne</span></div><h2>IndexedDB</h2><p>Szacowane użycie pamięci tej witryny: <strong>{zajete}</strong>. Dane pozostają w profilu tej przeglądarki.</p><Link to="/grafik" className="przycisk przycisk--drugorzedny">Ustaw grafik pracy</Link></Karta>
    </section>

    <Karta><div className="naglowek-karty"><div><h2>Przenieś dane między urządzeniami</h2><p>Backup pozostaje awaryjną, ręczną ścieżką przenoszenia danych obok automatycznej synchronizacji.</p></div></div><p>Na urządzeniu źródłowym utwórz wspólny backup, zapisz go lub udostępnij. Na urządzeniu docelowym wybierz ten sam plik JSON i potwierdź restore po walidacji.</p><p className="tekst-pomocniczy">Id tej instalacji: <code>{installationId}</code>. Jest losowe i nie korzysta z IMEI, Android ID ani identyfikatorów sprzętowych.</p></Karta>

    <Karta><h2>Prywatność danych zdrowotnych</h2><p>Dane zapisujesz lokalnie na tym urządzeniu. Dziennik psychiatryczny i samopoczucie, wszystkie notatki sesji terapeutycznych, ćwiczenia z sesji, wyniki badań i ważne informacje zdrowotne są wykluczone z synchronizacji i ogólnej pamięci Echo.</p><p>Po świadomym włączeniu synchronizacji mogą być przesyłane leki, dziennik dawek, wizyty, skierowania, recepty, definicje terapii oraz dokumenty i ich pliki, także medyczne. Uprawnienie do Zdrowia nie udostępnia automatycznie prywatnych kategorii.</p><p>Plik kopii z Ustawień jest szyfrowany hasłem. Lokalna baza IndexedDB nie jest szyfrowana; blokada widoku nie zastępuje ochrony urządzenia. Karta zdrowotna eksportuje wybrane dane jawnie po podglądzie.</p><p>Starsze notatki mogły pozostać na serwerze. Nie usuwamy ich automatycznie. Bezpieczna procedura przeglądu i ewentualnego usunięcia znajduje się w dokumentacji prywatności projektu.</p></Karta><Karta klasa="panel-backupu"><div className="naglowek-karty"><div><h2>Dane / Backup</h2><p>Domyślnie tworzysz kopię zabezpieczoną hasłem. Możesz też odczytać starsze kopie bez hasła.</p></div></div><dl className="bezpieczenstwo-backupu"><dt>Integralność kopii</dt><dd>Walidacja wykrywa uszkodzenia i sprawdza strukturę danych przed przywróceniem.</dd><dt>Szyfrowanie pliku</dt><dd>Chroni całą zawartość kopii hasłem. Utrata hasła uniemożliwia odzyskanie tej kopii.</dd><dt>Lokalna baza</dt><dd>Ta funkcja nie szyfruje danych zapisanych w aplikacji na urządzeniu.</dd><dt>Synchronizacja</dt><dd>Ma osobne zabezpieczenia. Szyfrowanie kopii nie zmienia zabezpieczeń synchronizacji.</dd></dl>
      <div className="lista-sekcji-backupu">{SEKCJE_BACKUPU.map((sekcja) => <label key={sekcja.nazwa}><input type="checkbox" disabled={trwaPrzywracanie} checked={wybraneSekcje.includes(sekcja.nazwa)} onChange={(e) => zmienSekcjeBackupu(sekcja.nazwa, e.target.checked)} /><span>{sekcja.etykieta}</span></label>)}</div>
      <div className="akcje-backupu"><button type="button" className="przycisk przycisk--glowny" disabled={wybraneSekcje.length === 0 || tworzenieBackupu || trwaPrzywracanie} onClick={() => ustawOperacjeHasla({ rodzaj: 'eksport' })}>{tworzenieBackupu ? 'Tworzenie…' : 'Utwórz zaszyfrowany backup'}</button>{backup && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => pobierzJson(backup.plik, `ogarniacz-backup-${backup.manifest.createdAt.slice(0, 10)}.json`)}><Download aria-hidden="true" />{platforma.natywna ? 'Zapisz plik JSON' : 'Pobierz plik JSON'}</button>}{backup && platforma.natywna && platforma.udostepnianie.dostepne() && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => udostepnijJson(backup.plik, `ogarniacz-backup-${backup.manifest.createdAt.slice(0, 10)}.json`)}><Share2 aria-hidden="true" />Udostępnij backup</button>}<label className="przycisk przycisk--drugorzedny"><Upload aria-hidden="true" />Wybierz backup do restore<input className="sr-only" type="file" accept="application/json,.json" disabled={trwaPrzywracanie} onChange={(e) => { wybierzPlikBackupu(e.target.files?.[0]); e.target.value = '' }} /></label></div>
      {backup && <p className="tekst-pomocniczy">Utworzono: <strong>{new Date(backup.manifest.createdAt).toLocaleString('pl-PL')}</strong> · rekordów: <strong>{Object.values(backup.manifest.recordCounts).reduce((suma, liczba) => suma + (liczba ?? 0), 0)}</strong> · checksum: <code>{backup.manifest.checksum}</code></p>}
      {backupDoPrzywracania && !backupDoPrzywracania.manifest.kontekst && <label className="pole pole-checkbox"><input type="checkbox" checked={przypiszStarszaKopie} onChange={(zdarzenie) => ustawPrzypiszStarszaKopie(zdarzenie.target.checked)} /><span>Świadomie przypisuję starszą kopię bez kontekstu konta do aktualnego profilu.</span></label>}
      {backupDoPrzywracania && <div className="podglad-manifestu"><h3>Podgląd kopii przed przywracaniem</h3><p><strong>{plikZaszyfrowany ? 'Plik zabezpieczony hasłem — odszyfrowany i zwalidowany.' : 'Plik historyczny bez zabezpieczenia hasłem — integralność zweryfikowana.'}</strong></p><p>Format v{backupDoPrzywracania.manifest.formatVersion} · aplikacja {backupDoPrzywracania.manifest.appVersion} · Dexie v{backupDoPrzywracania.manifest.dexieSchemaVersion} · instalacja źródłowa {backupDoPrzywracania.manifest.installationId} · {new Date(backupDoPrzywracania.manifest.createdAt).toLocaleString('pl-PL')}</p><code>{backupDoPrzywracania.manifest.checksum}</code><div className="lista-sekcji-backupu">{backupDoPrzywracania.manifest.sections.map((nazwa) => <label key={nazwa}><input type="checkbox" disabled={trwaPrzywracanie} checked={sekcjePrzywracania.includes(nazwa)} onChange={(e) => zmienSekcjePrzywracania(nazwa, e.target.checked)} /><span>{SEKCJE_BACKUPU.find((sekcja) => sekcja.nazwa === nazwa)?.etykieta} ({backupDoPrzywracania.manifest.recordCounts[nazwa] ?? 0})</span></label>)}</div><button type="button" className="przycisk przycisk--niebezpieczny" disabled={sekcjePrzywracania.length === 0 || trwaPrzywracanie} onClick={() => ustawOperacjeHasla({ rodzaj: 'przywracanie' })}>Przywróć wybrane sekcje</button></div>}
      {backupPrzedPrzywracaniem && <div className="kopia-before-restore"><strong>Szyfrowana kopia ochronna</strong><span>Pełny stan sprzed próby przywracania. Zabezpieczony wybranym przez Ciebie hasłem.</span><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => pobierzJson(backupPrzedPrzywracaniem.plik, `ogarniacz-before-restore-${backupPrzedPrzywracaniem.manifest.createdAt.replace(/[:.]/g, '-')}.json`)}><Download aria-hidden="true" />Pobierz szyfrowaną kopię ochronną</button></div>}
      <div className="transfer-ustawien"><h3>Import / eksport samych ustawień</h3><p className="tekst-pomocniczy">Oddzielny format przechodzi przez normalizator AppSettings i nie uruchamia pełnego restore.</p><div className="akcje-backupu"><button type="button" className="przycisk przycisk--drugorzedny" onClick={eksportujSameUstawienia}><Download aria-hidden="true" />Eksportuj ustawienia</button><label className="przycisk przycisk--drugorzedny"><Upload aria-hidden="true" />Importuj ustawienia<input className="sr-only" type="file" accept="application/json,.json" onChange={(e) => { wybierzPlikUstawien(e.target.files?.[0]); e.target.value = '' }} /></label></div></div>
    </Karta>

    <Karta><div className="naglowek-karty"><div><h2><IkonaHistorii aria-hidden="true" />Dane / Historia</h2><p>Najnowsze ważne zmiany danych finansowych, zdrowotnych, samochodu i Zadań. Widok jest tylko do odczytu.</p></div></div>
      {historia.length === 0 ? <PustyStan tytul="Brak ważnych zmian" opis="Historia pojawi się po utworzeniu, aktualizacji lub usunięciu chronionego rekordu." /> : <div className="lista-historii">{historia.map((wpis) => <div key={wpis.id}><time dateTime={wpis.znacznikCzasu}>{new Date(wpis.znacznikCzasu).toLocaleString('pl-PL')}</time><strong>{wpis.modul} · {wpis.operacja}</strong><span>{wpis.typEncji} · {wpis.zmienionePola.join(', ')}</span></div>)}</div>}
    </Karta>

    <section className="siatka-dwie-kolumny siatka-dwie-kolumny--rowne">
      <Karta><div className="tytul-karty"><UserCog aria-hidden="true" /><span>Edytor</span></div><h2>Profile i lokalny podgląd</h2><p>To wyłącznie mechanizm developerski do testowania permission engine. Bez backendu nie jest zdalnym współdzieleniem ani zabezpieczeniem kont.</p><form className="szybki-wpis" onSubmit={dodajEdytora}><input value={nowyEdytor} onChange={(e) => ustawNowegoEdytora(e.target.value)} placeholder="Nazwa Edytora" /><button type="submit" className="przycisk przycisk--glowny">Dodaj</button></form>{edytorzy.length === 0 ? <PustyStan tytul="Brak Edytorów" opis="Dodaj profil testowy." /> : <div className="lista-kompaktowa">{edytorzy.map((edytor) => <div key={edytor.id}><div><strong>{edytor.nazwa}</strong><small>{edytor.aktywny ? 'aktywny' : 'nieaktywny'}</small></div><button type="button" className="przycisk przycisk--maly" onClick={() => zapiszUstawienia({ trybUzytkownika: 'edytor', aktywnyEdytorId: edytor.id })}>Podgląd jako Edytor</button><button type="button" className="przycisk-ikona" onClick={() => repoEdytorow.zapisz({ ...edytor, aktywny: !edytor.aktywny })}>{edytor.aktywny ? '×' : '✓'}</button></div>)}</div>}</Karta>
      <Karta><div className="tytul-karty"><Shield aria-hidden="true" /><span>Uprawnienia</span></div><h2>Zakres dostępu Edytora</h2><form className="formularz" onSubmit={dodajGrant}><label className="pole pole--pelne"><span>Edytor</span><select value={grant.editorId} onChange={(e) => ustawGrant({ ...grant, editorId: e.target.value })}><option value="">Wybierz</option>{edytorzy.map((x) => <option value={x.id} key={x.id}>{x.nazwa}</option>)}</select></label><label className="pole pole--pelne"><span>Moduł</span><select value={grant.modul} onChange={(e) => ustawGrant({ ...grant, modul: e.target.value as NazwaModulu })}>{modulyUprawnien.map((x) => <option value={x.wartosc} key={x.wartosc}>{x.etykieta}</option>)}</select></label>{grant.modul === 'zdrowie' && <label className="pole pole--pelne"><span>Kategoria danych</span><select value={grant.sekcja} onChange={(e) => ustawGrant({ ...grant, sekcja: e.target.value })}><option value="">Ogólne dane zdrowotne</option>{Object.entries(PRYWATNE_SEKCJE_ZDROWIA).filter(([sekcja]) => sekcja !== 'nagrania').map(([sekcja, etykieta]) => <option key={sekcja} value={sekcja}>{etykieta}</option>)}</select><small>Prywatne kategorie wymagają osobnego uprawnienia. Dokumentacja wymaga także dostępu do Dokumentów.</small></label>}<label className="pole pole-checkbox"><input type="checkbox" checked={grant.odczyt} onChange={(e) => ustawGrant({ ...grant, odczyt: e.target.checked })} /><span>Odczyt</span></label><label className="pole pole-checkbox"><input type="checkbox" checked={grant.edycja} onChange={(e) => ustawGrant({ ...grant, edycja: e.target.checked })} /><span>Edycja</span></label><button className="przycisk przycisk--glowny pole--pelne" type="submit">Nadaj uprawnienie</button></form><div className="lista-uprawnien">{uprawnienia.map((x) => <div key={x.id}><span>{edytorzy.find((e) => e.id === x.editorId)?.nazwa ?? 'Usunięty Edytor'} · {modulyUprawnien.find((modul) => modul.wartosc === x.modul)?.etykieta ?? 'Moduł'}{x.sekcja && ` · ${PRYWATNE_SEKCJE_ZDROWIA[x.sekcja as keyof typeof PRYWATNE_SEKCJE_ZDROWIA] ?? 'Wybrana sekcja'}`}</span><span>{x.odczyt ? 'odczyt' : ''}{x.edycja ? ' + edycja' : ''}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => repoUprawnien.zapisz({ ...x, status: x.status === 'aktywne' ? 'cofniete' : 'aktywne' })}>{x.status === 'aktywne' ? 'Cofnij' : 'Przywróć'}</button></div>)}</div></Karta>
    </section>

    <WidokRejestru tytul="Pamięć Echo" opis="Właściciel może zobaczyć, edytować i usunąć każdy lokalny fakt, preferencję lub regułę." etykietaDodawania="Dodaj wpis pamięci" dane={pamiec} repozytorium={repoPamieci} pola={[{ klucz: 'tresc', etykieta: 'Treść', typ: 'textarea', wymagane: true }, { klucz: 'typ', etykieta: 'Typ', typ: 'select', wymagane: true, opcje: [{ wartosc: 'fakt', etykieta: 'Fakt' }, { wartosc: 'preferencja', etykieta: 'Preferencja' }, { wartosc: 'regula', etykieta: 'Reguła' }] }, { klucz: 'zrodlo', etykieta: 'Źródło', wymagane: true }, { klucz: 'wrazliwosc', etykieta: 'Wrażliwość', typ: 'select', wymagane: true, opcje: [{ wartosc: 'zwykla', etykieta: 'Zwykła' }, { wartosc: 'wrazliwa', etykieta: 'Wrażliwa' }] }, { klucz: 'sposob', etykieta: 'Sposób zapisu', typ: 'select', wymagane: true, opcje: [{ wartosc: 'reczne', etykieta: 'Ręczne' }, { wartosc: 'zaproponowane', etykieta: 'Zaproponowane przez Echo' }] }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), tresc: f.tresc.trim(), typ: (f.typ || 'fakt') as PamiecEcho['typ'], zrodlo: f.zrodlo, wrazliwosc: (f.wrazliwosc || 'zwykla') as PamiecEcho['wrazliwosc'], sposob: (f.sposob || 'reczne') as PamiecEcho['sposob'], updatedAt: terazIso() })} etykieta={(x) => x.tresc.slice(0, 80)} szczegoly={(x) => <><Znacznik wariant={x.wrazliwosc === 'wrazliwa' ? 'ostrzezenie' : 'neutralny'}>{x.wrazliwosc}</Znacznik><span>{x.typ} · {x.zrodlo} · {x.sposob}</span></>} />

    <section className="siatka-dwie-kolumny siatka-dwie-kolumny--rowne"><Karta><h2>Dane demonstracyjne</h2><p>Przykładowe rekordy można wczytać tylko do całkowicie pustej bazy, aby nie mieszać ich z prawdziwymi danymi.</p><button type="button" className="przycisk przycisk--drugorzedny" disabled={!moznaDemo} onClick={async () => { try { await wczytajDaneDemonstracyjne(); ustawMoznaDemo(false); ustawKomunikat('Dane demonstracyjne zostały wczytane.') } catch (e) { ustawBlad(e instanceof Error ? e.message : 'Błąd danych demonstracyjnych.') } }}>Wczytaj dane demonstracyjne</button>{!moznaDemo && <p className="tekst-pomocniczy">Baza zawiera już dane — opcja jest wyłączona.</p>}</Karta><Karta klasa="karta--niebezpieczna"><h2>Wyczyść dane lokalne</h2><p>Operacja trwale usuwa całą bazę na tym urządzeniu. Najpierw wykonaj backup.</p><button type="button" className="przycisk przycisk--niebezpieczny" onClick={() => ustawCzyszczenie(true)}>Wyczyść wszystkie dane</button></Karta></section>
    <SekcjaPolaczeniaIAktualizacji synchronizacjaSkonfigurowana={synchronizacjaSkonfigurowana} diagnostyka={diagnostykaSynchronizacji} dzieci={<>
    <Karta><div className="naglowek-karty"><div><h2><Cloud aria-hidden="true" /> Synchronizacja</h2><p>Lokalne dane są wymieniane z serwerem Ogarniacza, gdy jest to potrzebne.</p></div><Znacznik wariant={wariantSynchronizacji(stanSynchronizacji?.stan)}>{etykietySynchronizacji[stanSynchronizacji?.stan ?? 'zsynchronizowano']}</Znacznik></div><div className="lista-kompaktowa"><div><span>Ostatni udany pull</span><strong>{diagnostykaSynchronizacji.ostatniPull ? new Date(diagnostykaSynchronizacji.ostatniPull).toLocaleString('pl-PL') : 'jeszcze nie wykonano'}</strong></div><div><span>Oczekujące zmiany</span><strong>{stanSynchronizacji?.liczbaOczekujacych ?? 0}</strong></div><div><span>Konflikty</span><strong>{konfliktySynchronizacji.length}</strong></div></div>{diagnostykaSynchronizacji.ostatniBlad && <p className="tekst-pomocniczy">Ostatni kontrolowany błąd ({diagnostykaSynchronizacji.ostatniBlad.kod}): {diagnostykaSynchronizacji.ostatniBlad.komunikat} {diagnostykaSynchronizacji.ostatniBlad.czas && new Date(diagnostykaSynchronizacji.ostatniBlad.czas).toLocaleString("pl-PL")}</p>}{synchronizacjaSkonfigurowana && diagnostykaSynchronizacji.wymaganeLogowanie && <p role="alert">Zaloguj się ponownie przez panel konta, aby zsynchronizować dane.</p>}<details className="podglad-manifestu"><summary>Diagnostyka synchronizacji</summary><div className="lista-kompaktowa">
      <div><span>Połączenie z backendem (ostatni wynik)</span><strong>{diagnostykaSynchronizacji.stanPolaczenia}</strong></div>
      <div><span>Ostatni udany push</span><strong>{diagnostykaSynchronizacji.ostatniPush ? new Date(diagnostykaSynchronizacji.ostatniPush).toLocaleString('pl-PL') : 'jeszcze nie wykonano'}</strong></div>
      <div><span>Ostatnia próba synchronizacji</span><strong>{diagnostykaSynchronizacji.ostatniaProba ? new Date(diagnostykaSynchronizacji.ostatniaProba).toLocaleString('pl-PL') : 'jeszcze nie wykonano'}</strong></div><div><span>Środowisko</span><strong>{diagnostykaSynchronizacji.srodowisko}</strong></div><div><span>Endpoint (protokół i host)</span><strong>{diagnostykaSynchronizacji.protokolApi === "brak" ? diagnostykaSynchronizacji.hostApi : `${diagnostykaSynchronizacji.protokolApi.toLowerCase()}://${diagnostykaSynchronizacji.hostApi}`}</strong></div><div><span>Protokół</span><strong>{diagnostykaSynchronizacji.protokolApi}</strong></div><div><span>Sesja</span><strong>{diagnostykaSynchronizacji.stanSesji}</strong></div><div><span>Rola</span><strong>{diagnostykaSynchronizacji.rola}</strong></div><div><span>CSRF</span><strong>{diagnostykaSynchronizacji.csrf}</strong></div><div><span>Installation ID</span><strong>{diagnostykaSynchronizacji.installationId}</strong></div><div><span>Autoryzacja klienta</span><strong>{diagnostykaSynchronizacji.trybAutoryzacji}</strong></div></div></details><p className="tekst-pomocniczy">{synchronizacjaSkonfigurowana ? 'Synchronizacja działa przy starcie, wznowieniu, odzyskaniu sieci i po lokalnych zmianach.' : 'Synchronizacja nie jest skonfigurowana na tym urządzeniu. Konfiguracja runtime aplikacji jest niepełna.'}</p><button type="button" className="przycisk przycisk--glowny" disabled={!synchronizacjaSkonfigurowana || stanSynchronizacji?.stan === 'synchronizacja'} onClick={synchronizujTeraz}><RefreshCw aria-hidden="true" />{stanSynchronizacji?.stan === 'synchronizacja' ? 'Synchronizowanie…' : stanSynchronizacji?.stan === 'blad' ? 'Ponów synchronizację' : 'Synchronizuj teraz'}</button>{konfliktySynchronizacji.length > 0 && <div className="podglad-manifestu"><h3>Konflikty wymagające decyzji</h3><div className="lista-konfliktow-synchronizacji">{konfliktySynchronizacji.map((konflikt) => <KartaKonfliktuSynchronizacji key={konflikt.id} konflikt={konflikt} rozstrzygnij={rozstrzygnijKonflikt} />)}</div></div>}</Karta>
    </>} />

    {potwierdzenieZapisu && <ModalPotwierdzenia tytul="Zachowaj kopię ochronną przed przywracaniem" opis="Rozpoczęto pobieranie szyfrowanej kopii bieżących danych. Sprawdź, czy plik został zapisany i zachowaj jego hasło. Przeglądarka nie potwierdza zakończenia pobierania. Dopiero po Twoim potwierdzeniu wybrane sekcje zostaną zastąpione." etykietaAkcji="Mam zapisaną kopię — przywróć" niebezpieczne anuluj={() => potwierdzZapisKopii(false)} potwierdz={() => potwierdzZapisKopii(true)} />}
    {operacjaHasla && !potwierdzenieZapisu && <HasloBackupu importowanie={operacjaHasla.rodzaj === 'import'} przywracanie={operacjaHasla.rodzaj === 'przywracanie'} liczbaSekcji={sekcjePrzywracania.length} anuluj={() => { if (operacjaHasla.rodzaj === 'import') ustawPlikZaszyfrowany(undefined); ustawOperacjeHasla(undefined) }} wykonaj={wykonajOperacjeZHaslem} />}
    {czyszczenie && <PotwierdzenieCzyszczenia anuluj={() => ustawCzyszczenie(false)} wykonaj={async () => { await wyczyscDane(); await inicjalizujBaze(); window.location.assign('/') }} />}
  </div>
}

function HasloBackupu({ importowanie, przywracanie, liczbaSekcji, anuluj, wykonaj }: { importowanie: boolean; przywracanie: boolean; liczbaSekcji: number; anuluj: () => void; wykonaj: (haslo: string) => Promise<void> }) {
  const poleHasla = useRef<HTMLInputElement>(null)
  const polePowtorzenia = useRef<HTMLInputElement>(null)
  const [trwaOperacja, ustawTrwaOperacje] = useState(false)
  const [blad, ustawBlad] = useState('')
  const [pokazHaslo, ustawPokazHaslo] = useState(false)
  const wyczyscPola = () => {
    if (poleHasla.current) poleHasla.current.value = ''
    if (polePowtorzenia.current) polePowtorzenia.current.value = ''
  }
  const zatwierdz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (trwaOperacja) return
    const haslo = poleHasla.current?.value ?? ''
    if (!haslo.length) { ustawBlad('Podaj hasło kopii zapasowej.'); return }
    if (!importowanie && haslo !== polePowtorzenia.current?.value) {
      ustawBlad('Hasła muszą być identyczne.')
      wyczyscPola()
      return
    }
    wyczyscPola()
    ustawPokazHaslo(false)
    ustawTrwaOperacje(true)
    ustawBlad('')
    try {
      await wykonaj(haslo)
    } catch (przyczyna) {
      ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się przetworzyć kopii.')
    } finally {
      ustawTrwaOperacje(false)
    }
  }
  return <Modal tytul={importowanie ? 'Odszyfruj kopię zapasową' : przywracanie ? 'Zabezpiecz dane przed przywracaniem' : 'Zaszyfruj kopię zapasową'} opis={importowanie ? 'Podaj hasło użyte przy tworzeniu tej kopii. Baza zostanie zmieniona dopiero po walidacji i potwierdzeniu przywracania.' : 'Użyj długiego, unikalnego hasła i zachowaj je w bezpiecznym miejscu. Utrata hasła oznacza brak możliwości odzyskania zawartości tej kopii. Ogarniacz nie zapisuje hasła.'} zamknij={() => { if (!trwaOperacja) { wyczyscPola(); anuluj() } }}>
    <form className="formularz-hasla-backupu" onSubmit={zatwierdz}>
      {przywracanie && <p role="note">Wybrane sekcje ({liczbaSekcji}) zastąpią bieżące dane tych kategorii. Najpierw powstanie pełna kopia ochronna przed przywracaniem. Podaj nowe hasło do tej kopii. Przy błędzie szyfrowania lub zapisu przywracanie zostanie zatrzymane.</p>}
      <label className="pole pole--pelne"><span>Hasło kopii zapasowej</span><input ref={poleHasla} type={pokazHaslo ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" spellCheck={false} required disabled={trwaOperacja} /></label>
      {!importowanie && <label className="pole pole--pelne"><span>Powtórz hasło</span><input ref={polePowtorzenia} type={pokazHaslo ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" spellCheck={false} required disabled={trwaOperacja} /></label>}
      <label className="pokaz-haslo-backupu"><input type="checkbox" checked={pokazHaslo} disabled={trwaOperacja} onChange={(zdarzenie) => ustawPokazHaslo(zdarzenie.target.checked)} /><span>Pokaż hasło</span></label>
      {blad && <p role="alert">{blad}</p>}
      <div className="akcje-formularza"><button type="button" className="przycisk przycisk--drugorzedny" disabled={trwaOperacja} onClick={() => { wyczyscPola(); anuluj() }}>Anuluj</button><button type="submit" className={`przycisk ${przywracanie ? 'przycisk--niebezpieczny' : 'przycisk--glowny'}`} disabled={trwaOperacja}>{trwaOperacja ? 'Przetwarzanie…' : importowanie ? 'Odszyfruj i sprawdź' : przywracanie ? 'Zapisz kopię ochronną i przywróć' : 'Zaszyfruj'}</button></div>
    </form>
  </Modal>
}

function PotwierdzenieCzyszczenia({ anuluj, wykonaj }: { anuluj: () => void; wykonaj: () => Promise<void> }) {
  const [fraza, ustawFraze] = useState('')
  return <Modal tytul="Trwałe czyszczenie danych" opis="Tej operacji nie można cofnąć bez wcześniej pobranej kopii." zamknij={anuluj}><label className="pole pole--pelne"><span>Wpisz WYCZYŚĆ, aby potwierdzić</span><input autoFocus value={fraza} onChange={(e) => ustawFraze(e.target.value)} /></label><div className="akcje-formularza"><button type="button" className="przycisk przycisk--drugorzedny" onClick={anuluj}>Anuluj</button><button type="button" className="przycisk przycisk--niebezpieczny" disabled={fraza !== 'WYCZYŚĆ'} onClick={wykonaj}>Usuń całą bazę</button></div></Modal>
}
