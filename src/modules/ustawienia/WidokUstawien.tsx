import { useEffect, useState, type FormEvent } from 'react'
import { Bell, Database, Download, History as IkonaHistorii, Shield, Sparkles, Upload, UserCog } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { WidokRejestru } from '../../components/WidokRejestru'
import { Karta, Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { inicjalizujBaze } from '../../data/BazaOgarniacza'
import { terazIso, utworzMetadane } from '../../domain/fabryki'
import type { NazwaModulu, PamiecEcho, ProfilEdytora, Uprawnienie } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { PODSTAWOWE_SEKCJE_BACKUPU, przygotujBackupDoPrzywracania, przywrocBackup, SEKCJE_BACKUPU, utworzBackup, wyczyscDane, type NazwaSekcjiBackupu, type OgarniaczBackup } from '../../services/BackupService'
import { czyMoznaWczytacDemo, wczytajDaneDemonstracyjne } from '../../services/DaneDemonstracyjneService'
import { importujUstawienia, utworzEksportUstawien } from '../../services/TransferUstawienService'
import { pobierzNajnowszaHistorie } from '../../services/HistoriaZmianService'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { PanelUstawienAplikacji } from './PanelUstawienAplikacji'

const modulyUprawnien: { wartosc: NazwaModulu; etykieta: string }[] = [
  ['zadania', 'Zadania'], ['projekty', 'Projekty'], ['skrzynka', 'Skrzynka'], ['planer', 'Planer'], ['grafik', 'Grafik'], ['nawyki', 'Nawyki'], ['leki', 'Leki'], ['wizyty', 'Wizyty'], ['przypomnienia', 'Przypomnienia'], ['zakupy', 'Zakupy'], ['rachunki', 'Rachunki'], ['miasto', 'Sprawy na mieście'], ['cele', 'Cele'], ['notatki', 'Notatki'], ['pomysly', 'Pomysły'], ['na_pozniej', 'Na później'], ['kontakty', 'Kontakty'], ['dokumenty', 'Dokumenty'], ['finanse', 'Finanse'], ['samochod', 'Samochód'], ['terminy', 'Terminy'],
].map(([wartosc, etykieta]) => ({ wartosc: wartosc as NazwaModulu, etykieta }))

export function WidokUstawien() {
  const { ustawienia, zapiszUstawienia } = useAplikacja()
  const { dane: pamiec, repozytorium: repoPamieci } = useRepozytorium('pamiecEcho')
  const { dane: edytorzy, repozytorium: repoEdytorow } = useRepozytorium('edytorzy')
  const { dane: uprawnienia, repozytorium: repoUprawnien } = useRepozytorium('uprawnienia')
  const historia = useLiveQuery(() => pobierzNajnowszaHistorie(50), [], [])
  const [komunikat, ustawKomunikat] = useState('')
  const [blad, ustawBlad] = useState('')
  const [wybraneSekcje, ustawWybraneSekcje] = useState<NazwaSekcjiBackupu[]>(PODSTAWOWE_SEKCJE_BACKUPU)
  const [backup, ustawBackup] = useState<OgarniaczBackup>()
  const [backupDoPrzywracania, ustawBackupDoPrzywracania] = useState<OgarniaczBackup>()
  const [sekcjePrzywracania, ustawSekcjePrzywracania] = useState<NazwaSekcjiBackupu[]>([])
  const [backupPrzedPrzywracaniem, ustawBackupPrzedPrzywracaniem] = useState<OgarniaczBackup>()
  const [potwierdzeniePrzywracania, ustawPotwierdzeniePrzywracania] = useState(false)
  const [tworzenieBackupu, ustawTworzenieBackupu] = useState(false)
  const [czyszczenie, ustawCzyszczenie] = useState(false)
  const [moznaDemo, ustawMoznaDemo] = useState(false)
  const [zajete, ustawZajete] = useState('—')
  const [nowyEdytor, ustawNowegoEdytora] = useState('')
  const [grant, ustawGrant] = useState({ editorId: '', modul: 'zadania' as NazwaModulu, odczyt: true, edycja: false })

  useEffect(() => { czyMoznaWczytacDemo().then(ustawMoznaDemo); navigator.storage?.estimate().then((wynik) => ustawZajete(wynik.usage ? `${(wynik.usage / 1024 / 1024).toFixed(2)} MB` : '0 MB')) }, [])

  const przygotujBackup = async () => {
    ustawTworzenieBackupu(true)
    ustawBlad('')
    ustawBackup(undefined)
    try {
      const nowyBackup = await utworzBackup(wybraneSekcje)
      ustawBackup(nowyBackup)
      ustawKomunikat('Backup został bezpiecznie utworzony. Możesz pobrać plik JSON.')
    } catch (bladBackupu) {
      ustawBlad(bladBackupu instanceof Error ? bladBackupu.message : 'Nie udało się utworzyć backupu.')
    } finally {
      ustawTworzenieBackupu(false)
    }
  }

  const pobierzJson = (dane: unknown, nazwa: string) => {
    const plik = new Blob([JSON.stringify(dane, null, 2)], { type: 'application/json' })
    const adres = URL.createObjectURL(plik)
    const link = document.createElement('a'); link.href = adres; link.download = nazwa; link.click(); URL.revokeObjectURL(adres)
  }

  const zmienSekcjeBackupu = (nazwa: NazwaSekcjiBackupu, zaznaczona: boolean) => {
    ustawBackup(undefined)
    ustawWybraneSekcje((obecne) => zaznaczona ? [...obecne, nazwa] : obecne.filter((sekcja) => sekcja !== nazwa))
  }

  const wybierzPlikBackupu = async (plik?: File) => {
    if (!plik) return
    ustawBlad('')
    ustawBackupDoPrzywracania(undefined)
    ustawBackupPrzedPrzywracaniem(undefined)
    try {
      const przygotowany = await przygotujBackupDoPrzywracania(await plik.text())
      ustawBackupDoPrzywracania(przygotowany)
      ustawSekcjePrzywracania(przygotowany.manifest.sections)
      ustawKomunikat('Backup przeszedł walidację. Sprawdź manifest i wybierz sekcje do przywrócenia.')
    } catch (bladBackupu) {
      ustawBlad(bladBackupu instanceof Error ? bladBackupu.message : 'Nie udało się zwalidować backupu.')
    }
  }

  const zmienSekcjePrzywracania = (nazwa: NazwaSekcjiBackupu, zaznaczona: boolean) => {
    ustawSekcjePrzywracania((obecne) => zaznaczona ? [...obecne, nazwa] : obecne.filter((sekcja) => sekcja !== nazwa))
  }

  const wykonajPrzywracanie = async () => {
    if (!backupDoPrzywracania) return
    try {
      const wynik = await przywrocBackup(backupDoPrzywracania, sekcjePrzywracania, {
        poUtworzeniuKopii: ustawBackupPrzedPrzywracaniem,
      })
      ustawBackupPrzedPrzywracaniem(wynik.backupPrzedPrzywracaniem)
      ustawPotwierdzeniePrzywracania(false)
      ustawKomunikat(`Przywrócono ${wynik.liczbaRekordow} rekordów. Kopia before-restore jest gotowa do pobrania.`)
    } catch (bladPrzywracania) {
      ustawPotwierdzeniePrzywracania(false)
      ustawBlad(bladPrzywracania instanceof Error ? bladPrzywracania.message : 'Nie udało się przywrócić danych.')
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
    if (!('Notification' in window)) return ustawBlad('Ta przeglądarka nie obsługuje Notification API.')
    const zgoda = await Notification.requestPermission()
    await zapiszUstawienia({ powiadomienia: zgoda === 'granted' })
    ustawKomunikat(zgoda === 'granted' ? 'Powiadomienia przeglądarki są włączone. Przy zamkniętej PWA ich działanie nie jest gwarantowane.' : 'Nie przyznano dostępu do powiadomień.')
  }

  const dodajEdytora = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault(); if (!nowyEdytor.trim()) return
    const profil: ProfilEdytora = { ...utworzMetadane(), nazwa: nowyEdytor.trim(), aktywny: true }
    await repoEdytorow.zapisz(profil); ustawNowegoEdytora(''); ustawGrant({ ...grant, editorId: profil.id })
  }

  const dodajGrant = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault(); if (!grant.editorId) return ustawBlad('Najpierw wybierz Edytora.')
    const uprawnienie: Uprawnienie = { ...utworzMetadane(), owner: 'wlasciciel', editorId: grant.editorId, modul: grant.modul, odczyt: grant.odczyt || grant.edycja, edycja: grant.edycja, status: 'aktywne' }
    await repoUprawnien.zapisz(uprawnienie); ustawKomunikat('Uprawnienie zapisane w lokalnym permission engine.')
  }

  return <div className="widok widok-ustawien">
    <NaglowekWidoku tytul="Ustawienia" opis="Wygląd, nawigacja, Pulpit, harmonogram i pozostałe preferencje lokalnej aplikacji." />
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}{blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <PanelUstawienAplikacji />
    <section className="siatka-ustawien">
      <Karta><div className="tytul-karty"><Bell aria-hidden="true" /><span>Powiadomienia</span></div><h2>Notification API</h2><p>Reminder engine i centrum przypomnień działają w aplikacji. Przeglądarka może dodatkowo pokazać systemowy komunikat, ale nie gwarantuje alarmu po całkowitym zamknięciu.</p><button type="button" className="przycisk przycisk--drugorzedny" onClick={wlaczPowiadomienia}>{ustawienia.powiadomienia ? 'Sprawdź uprawnienie' : 'Włącz powiadomienia'}</button></Karta>
      <Karta><div className="tytul-karty"><Sparkles aria-hidden="true" /><span>Echo</span></div><h2>Proaktywność</h2><label className="ustawienie-wiersz"><span><strong>Proaktywność</strong><small>Pozwala Echo prezentować lokalne sugestie.</small></span><input type="checkbox" checked={ustawienia.proaktywnoscEcho} onChange={(e) => zapiszUstawienia({ proaktywnoscEcho: e.target.checked })} /></label><label className="ustawienie-wiersz"><span><strong>Wyciszenie</strong><small>Ukrywa inicjowane sugestie bez wyłączania panelu.</small></span><input type="checkbox" checked={ustawienia.echoWyciszone} onChange={(e) => zapiszUstawienia({ echoWyciszone: e.target.checked })} /></label></Karta>
      <Karta><div className="tytul-karty"><Database aria-hidden="true" /><span>Dane lokalne</span></div><h2>IndexedDB</h2><p>Szacowane użycie pamięci tej witryny: <strong>{zajete}</strong>. Dane pozostają w profilu tej przeglądarki.</p><Link to="/grafik" className="przycisk przycisk--drugorzedny">Ustaw grafik pracy</Link></Karta>
    </section>

    <Karta><div className="naglowek-karty"><div><h2>Dane / Backup</h2><p>Eksport i restore korzystają z wersjonowanego formatu, walidacji checksum oraz automatycznej kopii before-restore.</p></div></div>
      <div className="lista-sekcji-backupu">{SEKCJE_BACKUPU.map((sekcja) => <label key={sekcja.nazwa}><input type="checkbox" checked={wybraneSekcje.includes(sekcja.nazwa)} onChange={(e) => zmienSekcjeBackupu(sekcja.nazwa, e.target.checked)} /><span>{sekcja.etykieta}</span></label>)}</div>
      <div className="akcje-backupu"><button type="button" className="przycisk przycisk--glowny" disabled={wybraneSekcje.length === 0 || tworzenieBackupu} onClick={przygotujBackup}>{tworzenieBackupu ? 'Tworzenie…' : 'Utwórz backup'}</button>{backup && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => pobierzJson(backup, `ogarniacz-backup-${backup.manifest.createdAt.slice(0, 10)}.json`)}><Download aria-hidden="true" />Pobierz plik JSON</button>}<label className="przycisk przycisk--drugorzedny"><Upload aria-hidden="true" />Wybierz backup do restore<input className="sr-only" type="file" accept="application/json,.json" onChange={(e) => { wybierzPlikBackupu(e.target.files?.[0]); e.target.value = '' }} /></label></div>
      {backup && <p className="tekst-pomocniczy">Utworzono: <strong>{new Date(backup.manifest.createdAt).toLocaleString('pl-PL')}</strong> · rekordów: <strong>{Object.values(backup.manifest.recordCounts).reduce((suma, liczba) => suma + (liczba ?? 0), 0)}</strong> · checksum: <code>{backup.manifest.checksum}</code></p>}
      {backupDoPrzywracania && <div className="podglad-manifestu"><h3>Zweryfikowany manifest przed restore</h3><p>Format v{backupDoPrzywracania.manifest.formatVersion} · aplikacja {backupDoPrzywracania.manifest.appVersion} · Dexie v{backupDoPrzywracania.manifest.dexieSchemaVersion} · {new Date(backupDoPrzywracania.manifest.createdAt).toLocaleString('pl-PL')}</p><code>{backupDoPrzywracania.manifest.checksum}</code><div className="lista-sekcji-backupu">{backupDoPrzywracania.manifest.sections.map((nazwa) => <label key={nazwa}><input type="checkbox" checked={sekcjePrzywracania.includes(nazwa)} onChange={(e) => zmienSekcjePrzywracania(nazwa, e.target.checked)} /><span>{SEKCJE_BACKUPU.find((sekcja) => sekcja.nazwa === nazwa)?.etykieta} ({backupDoPrzywracania.manifest.recordCounts[nazwa] ?? 0})</span></label>)}</div><button type="button" className="przycisk przycisk--niebezpieczny" disabled={sekcjePrzywracania.length === 0} onClick={() => ustawPotwierdzeniePrzywracania(true)}>Przywróć wybrane sekcje</button></div>}
      {backupPrzedPrzywracaniem && <div className="kopia-before-restore"><strong>Kopia before-restore</strong><span>Pełny stan sprzed ostatniego przywracania.</span><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => pobierzJson(backupPrzedPrzywracaniem, `ogarniacz-before-restore-${backupPrzedPrzywracaniem.manifest.createdAt.slice(0, 10)}.json`)}><Download aria-hidden="true" />Pobierz kopię</button></div>}
      <div className="transfer-ustawien"><h3>Import / eksport samych ustawień</h3><p className="tekst-pomocniczy">Oddzielny format przechodzi przez normalizator AppSettings i nie uruchamia pełnego restore.</p><div className="akcje-backupu"><button type="button" className="przycisk przycisk--drugorzedny" onClick={eksportujSameUstawienia}><Download aria-hidden="true" />Eksportuj ustawienia</button><label className="przycisk przycisk--drugorzedny"><Upload aria-hidden="true" />Importuj ustawienia<input className="sr-only" type="file" accept="application/json,.json" onChange={(e) => { wybierzPlikUstawien(e.target.files?.[0]); e.target.value = '' }} /></label></div></div>
    </Karta>

    <Karta><div className="naglowek-karty"><div><h2><IkonaHistorii aria-hidden="true" />Dane / Historia</h2><p>Najnowsze ważne zmiany danych finansowych, zdrowotnych, samochodu i Zadań. Widok jest tylko do odczytu.</p></div></div>
      {historia.length === 0 ? <PustyStan tytul="Brak ważnych zmian" opis="Historia pojawi się po utworzeniu, aktualizacji lub usunięciu chronionego rekordu." /> : <div className="lista-historii">{historia.map((wpis) => <div key={wpis.id}><time dateTime={wpis.znacznikCzasu}>{new Date(wpis.znacznikCzasu).toLocaleString('pl-PL')}</time><strong>{wpis.modul} · {wpis.operacja}</strong><span>{wpis.typEncji} · {wpis.zmienionePola.join(', ')}</span></div>)}</div>}
    </Karta>

    <section className="siatka-dwie-kolumny siatka-dwie-kolumny--rowne">
      <Karta><div className="tytul-karty"><UserCog aria-hidden="true" /><span>Edytor</span></div><h2>Profile i lokalny podgląd</h2><p>To wyłącznie mechanizm developerski do testowania permission engine. Bez backendu nie jest zdalnym współdzieleniem ani zabezpieczeniem kont.</p><form className="szybki-wpis" onSubmit={dodajEdytora}><input value={nowyEdytor} onChange={(e) => ustawNowegoEdytora(e.target.value)} placeholder="Nazwa Edytora" /><button type="submit" className="przycisk przycisk--glowny">Dodaj</button></form>{edytorzy.length === 0 ? <PustyStan tytul="Brak Edytorów" opis="Dodaj profil testowy." /> : <div className="lista-kompaktowa">{edytorzy.map((edytor) => <div key={edytor.id}><div><strong>{edytor.nazwa}</strong><small>{edytor.aktywny ? 'aktywny' : 'nieaktywny'}</small></div><button type="button" className="przycisk przycisk--maly" onClick={() => zapiszUstawienia({ trybUzytkownika: 'edytor', aktywnyEdytorId: edytor.id })}>Podgląd jako Edytor</button><button type="button" className="przycisk-ikona" onClick={() => repoEdytorow.zapisz({ ...edytor, aktywny: !edytor.aktywny })}>{edytor.aktywny ? '×' : '✓'}</button></div>)}</div>}</Karta>
      <Karta><div className="tytul-karty"><Shield aria-hidden="true" /><span>Uprawnienia</span></div><h2>PermissionGrant</h2><form className="formularz" onSubmit={dodajGrant}><label className="pole pole--pelne"><span>Edytor</span><select value={grant.editorId} onChange={(e) => ustawGrant({ ...grant, editorId: e.target.value })}><option value="">Wybierz</option>{edytorzy.map((x) => <option value={x.id} key={x.id}>{x.nazwa}</option>)}</select></label><label className="pole pole--pelne"><span>Moduł</span><select value={grant.modul} onChange={(e) => ustawGrant({ ...grant, modul: e.target.value as NazwaModulu })}>{modulyUprawnien.map((x) => <option value={x.wartosc} key={x.wartosc}>{x.etykieta}</option>)}</select></label><label className="pole pole-checkbox"><input type="checkbox" checked={grant.odczyt} onChange={(e) => ustawGrant({ ...grant, odczyt: e.target.checked })} /><span>Odczyt</span></label><label className="pole pole-checkbox"><input type="checkbox" checked={grant.edycja} onChange={(e) => ustawGrant({ ...grant, edycja: e.target.checked })} /><span>Edycja</span></label><button className="przycisk przycisk--glowny pole--pelne" type="submit">Nadaj uprawnienie</button></form><div className="lista-uprawnien">{uprawnienia.map((x) => <div key={x.id}><span>{edytorzy.find((e) => e.id === x.editorId)?.nazwa ?? 'Usunięty Edytor'} · {x.modul}</span><span>{x.odczyt ? 'odczyt' : ''}{x.edycja ? ' + edycja' : ''}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => repoUprawnien.zapisz({ ...x, status: x.status === 'aktywne' ? 'cofniete' : 'aktywne' })}>{x.status === 'aktywne' ? 'Cofnij' : 'Przywróć'}</button></div>)}</div></Karta>
    </section>

    <WidokRejestru tytul="Pamięć Echo" opis="Właściciel może zobaczyć, edytować i usunąć każdy lokalny fakt, preferencję lub regułę." etykietaDodawania="Dodaj wpis pamięci" dane={pamiec} repozytorium={repoPamieci} pola={[{ klucz: 'tresc', etykieta: 'Treść', typ: 'textarea', wymagane: true }, { klucz: 'typ', etykieta: 'Typ', typ: 'select', wymagane: true, opcje: [{ wartosc: 'fakt', etykieta: 'Fakt' }, { wartosc: 'preferencja', etykieta: 'Preferencja' }, { wartosc: 'regula', etykieta: 'Reguła' }] }, { klucz: 'zrodlo', etykieta: 'Źródło', wymagane: true }, { klucz: 'wrazliwosc', etykieta: 'Wrażliwość', typ: 'select', wymagane: true, opcje: [{ wartosc: 'zwykla', etykieta: 'Zwykła' }, { wartosc: 'wrazliwa', etykieta: 'Wrażliwa' }] }, { klucz: 'sposob', etykieta: 'Sposób zapisu', typ: 'select', wymagane: true, opcje: [{ wartosc: 'reczne', etykieta: 'Ręczne' }, { wartosc: 'zaproponowane', etykieta: 'Zaproponowane przez Echo' }] }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), tresc: f.tresc.trim(), typ: (f.typ || 'fakt') as PamiecEcho['typ'], zrodlo: f.zrodlo, wrazliwosc: (f.wrazliwosc || 'zwykla') as PamiecEcho['wrazliwosc'], sposob: (f.sposob || 'reczne') as PamiecEcho['sposob'], updatedAt: terazIso() })} etykieta={(x) => x.tresc.slice(0, 80)} szczegoly={(x) => <><Znacznik wariant={x.wrazliwosc === 'wrazliwa' ? 'ostrzezenie' : 'neutralny'}>{x.wrazliwosc}</Znacznik><span>{x.typ} · {x.zrodlo} · {x.sposob}</span></>} />

    <section className="siatka-dwie-kolumny siatka-dwie-kolumny--rowne"><Karta><h2>Dane demonstracyjne</h2><p>Przykładowe rekordy można wczytać tylko do całkowicie pustej bazy, aby nie mieszać ich z prawdziwymi danymi.</p><button type="button" className="przycisk przycisk--drugorzedny" disabled={!moznaDemo} onClick={async () => { try { await wczytajDaneDemonstracyjne(); ustawMoznaDemo(false); ustawKomunikat('Dane demonstracyjne zostały wczytane.') } catch (e) { ustawBlad(e instanceof Error ? e.message : 'Błąd danych demonstracyjnych.') } }}>Wczytaj dane demonstracyjne</button>{!moznaDemo && <p className="tekst-pomocniczy">Baza zawiera już dane — opcja jest wyłączona.</p>}</Karta><Karta klasa="karta--niebezpieczna"><h2>Wyczyść dane lokalne</h2><p>Operacja trwale usuwa całą bazę na tym urządzeniu. Najpierw wykonaj backup.</p><button type="button" className="przycisk przycisk--niebezpieczny" onClick={() => ustawCzyszczenie(true)}>Wyczyść wszystkie dane</button></Karta></section>
    <Karta><h2>Informacje o aplikacji</h2><p><strong>Ogarniacz v1.0.0</strong> · local-first PWA · schemat IndexedDB v5 · bez backendu i zewnętrznego API.</p><p className="tekst-pomocniczy">Systemowe alarmy po całkowitym zamknięciu aplikacji, zdalne współdzielenie i synchronizacja wymagają przyszłej warstwy platformowej/backendowej.</p></Karta>

    {potwierdzeniePrzywracania && <ModalPotwierdzenia tytul="Przywrócić wybrane dane?" opis={`Wybrane sekcje (${sekcjePrzywracania.length}) zastąpią bieżące dane tych kategorii. Pozostałe kategorie nie zostaną zmienione. Przed zapisem system utworzy pełną kopię before-restore.`} etykietaAkcji="Utwórz kopię i przywróć" niebezpieczne anuluj={() => ustawPotwierdzeniePrzywracania(false)} potwierdz={wykonajPrzywracanie} />}
    {czyszczenie && <PotwierdzenieCzyszczenia anuluj={() => ustawCzyszczenie(false)} wykonaj={async () => { await wyczyscDane(); await inicjalizujBaze(); window.location.assign('/') }} />}
  </div>
}

function PotwierdzenieCzyszczenia({ anuluj, wykonaj }: { anuluj: () => void; wykonaj: () => Promise<void> }) {
  const [fraza, ustawFraze] = useState('')
  return <Modal tytul="Trwałe czyszczenie danych" opis="Tej operacji nie można cofnąć bez wcześniej pobranej kopii." zamknij={anuluj}><label className="pole pole--pelne"><span>Wpisz WYCZYŚĆ, aby potwierdzić</span><input autoFocus value={fraza} onChange={(e) => ustawFraze(e.target.value)} /></label><div className="akcje-formularza"><button type="button" className="przycisk przycisk--drugorzedny" onClick={anuluj}>Anuluj</button><button type="button" className="przycisk przycisk--niebezpieczny" disabled={fraza !== 'WYCZYŚĆ'} onClick={wykonaj}>Usuń całą bazę</button></div></Modal>
}
