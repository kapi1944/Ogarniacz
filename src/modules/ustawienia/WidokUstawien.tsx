import { useEffect, useState, type FormEvent } from 'react'
import { Bell, Database, Download, Shield, Sparkles, Upload, UserCog } from 'lucide-react'
import { Link } from 'react-router-dom'
import { WidokRejestru } from '../../components/WidokRejestru'
import { Karta, Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { inicjalizujBaze } from '../../data/BazaOgarniacza'
import { terazIso, utworzMetadane } from '../../domain/fabryki'
import type { NazwaModulu, PamiecEcho, ProfilEdytora, Uprawnienie } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { eksportujKopie, importujKopie, walidujKopie, wyczyscDane, type KopiaOgarniacza } from '../../services/BackupService'
import { czyMoznaWczytacDemo, wczytajDaneDemonstracyjne } from '../../services/DaneDemonstracyjneService'
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
  const [komunikat, ustawKomunikat] = useState('')
  const [blad, ustawBlad] = useState('')
  const [kopiaDoImportu, ustawKopieDoImportu] = useState<KopiaOgarniacza>()
  const [trybImportu, ustawTrybImportu] = useState<'scal' | 'nadpisz'>('scal')
  const [czyszczenie, ustawCzyszczenie] = useState(false)
  const [moznaDemo, ustawMoznaDemo] = useState(false)
  const [zajete, ustawZajete] = useState('—')
  const [nowyEdytor, ustawNowegoEdytora] = useState('')
  const [grant, ustawGrant] = useState({ editorId: '', modul: 'zadania' as NazwaModulu, odczyt: true, edycja: false })

  useEffect(() => { czyMoznaWczytacDemo().then(ustawMoznaDemo); navigator.storage?.estimate().then((wynik) => ustawZajete(wynik.usage ? `${(wynik.usage / 1024 / 1024).toFixed(2)} MB` : '0 MB')) }, [])

  const pobierzBackup = async () => {
    const kopia = await eksportujKopie()
    const plik = new Blob([JSON.stringify(kopia, null, 2)], { type: 'application/json' })
    const adres = URL.createObjectURL(plik)
    const link = document.createElement('a'); link.href = adres; link.download = `ogarniacz-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(adres)
    ustawKomunikat('Pełna kopia danych została przygotowana do pobrania.')
  }

  const wybierzBackup = async (plik?: File) => {
    if (!plik) return
    try { ustawKopieDoImportu(walidujKopie(JSON.parse(await plik.text()))); ustawBlad('') } catch { ustawBlad('Plik nie jest prawidłową kopią Ogarniacza v1.') }
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

    <Karta><div className="naglowek-karty"><div><h2>Backup i import</h2><p>Wersjonowany JSON obejmuje wszystkie lokalne encje, ustawienia, powiązania i pliki Blob.</p></div></div><div className="akcje-backupu"><button type="button" className="przycisk przycisk--glowny" onClick={pobierzBackup}><Download aria-hidden="true" />Eksportuj pełną kopię</button><label className="przycisk przycisk--drugorzedny"><Upload aria-hidden="true" />Wybierz kopię do importu<input className="sr-only" type="file" accept="application/json,.json" onChange={(e) => wybierzBackup(e.target.files?.[0])} /></label><select aria-label="Tryb importu" value={trybImportu} onChange={(e) => ustawTrybImportu(e.target.value as typeof trybImportu)}><option value="scal">Scal po ID</option><option value="nadpisz">Nadpisz całą bazę</option></select></div></Karta>

    <section className="siatka-dwie-kolumny siatka-dwie-kolumny--rowne">
      <Karta><div className="tytul-karty"><UserCog aria-hidden="true" /><span>Edytor</span></div><h2>Profile i lokalny podgląd</h2><p>To wyłącznie mechanizm developerski do testowania permission engine. Bez backendu nie jest zdalnym współdzieleniem ani zabezpieczeniem kont.</p><form className="szybki-wpis" onSubmit={dodajEdytora}><input value={nowyEdytor} onChange={(e) => ustawNowegoEdytora(e.target.value)} placeholder="Nazwa Edytora" /><button type="submit" className="przycisk przycisk--glowny">Dodaj</button></form>{edytorzy.length === 0 ? <PustyStan tytul="Brak Edytorów" opis="Dodaj profil testowy." /> : <div className="lista-kompaktowa">{edytorzy.map((edytor) => <div key={edytor.id}><div><strong>{edytor.nazwa}</strong><small>{edytor.aktywny ? 'aktywny' : 'nieaktywny'}</small></div><button type="button" className="przycisk przycisk--maly" onClick={() => zapiszUstawienia({ trybUzytkownika: 'edytor', aktywnyEdytorId: edytor.id })}>Podgląd jako Edytor</button><button type="button" className="przycisk-ikona" onClick={() => repoEdytorow.zapisz({ ...edytor, aktywny: !edytor.aktywny })}>{edytor.aktywny ? '×' : '✓'}</button></div>)}</div>}</Karta>
      <Karta><div className="tytul-karty"><Shield aria-hidden="true" /><span>Uprawnienia</span></div><h2>PermissionGrant</h2><form className="formularz" onSubmit={dodajGrant}><label className="pole pole--pelne"><span>Edytor</span><select value={grant.editorId} onChange={(e) => ustawGrant({ ...grant, editorId: e.target.value })}><option value="">Wybierz</option>{edytorzy.map((x) => <option value={x.id} key={x.id}>{x.nazwa}</option>)}</select></label><label className="pole pole--pelne"><span>Moduł</span><select value={grant.modul} onChange={(e) => ustawGrant({ ...grant, modul: e.target.value as NazwaModulu })}>{modulyUprawnien.map((x) => <option value={x.wartosc} key={x.wartosc}>{x.etykieta}</option>)}</select></label><label className="pole pole-checkbox"><input type="checkbox" checked={grant.odczyt} onChange={(e) => ustawGrant({ ...grant, odczyt: e.target.checked })} /><span>Odczyt</span></label><label className="pole pole-checkbox"><input type="checkbox" checked={grant.edycja} onChange={(e) => ustawGrant({ ...grant, edycja: e.target.checked })} /><span>Edycja</span></label><button className="przycisk przycisk--glowny pole--pelne" type="submit">Nadaj uprawnienie</button></form><div className="lista-uprawnien">{uprawnienia.map((x) => <div key={x.id}><span>{edytorzy.find((e) => e.id === x.editorId)?.nazwa ?? 'Usunięty Edytor'} · {x.modul}</span><span>{x.odczyt ? 'odczyt' : ''}{x.edycja ? ' + edycja' : ''}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => repoUprawnien.zapisz({ ...x, status: x.status === 'aktywne' ? 'cofniete' : 'aktywne' })}>{x.status === 'aktywne' ? 'Cofnij' : 'Przywróć'}</button></div>)}</div></Karta>
    </section>

    <WidokRejestru tytul="Pamięć Echo" opis="Właściciel może zobaczyć, edytować i usunąć każdy lokalny fakt, preferencję lub regułę." etykietaDodawania="Dodaj wpis pamięci" dane={pamiec} repozytorium={repoPamieci} pola={[{ klucz: 'tresc', etykieta: 'Treść', typ: 'textarea', wymagane: true }, { klucz: 'typ', etykieta: 'Typ', typ: 'select', wymagane: true, opcje: [{ wartosc: 'fakt', etykieta: 'Fakt' }, { wartosc: 'preferencja', etykieta: 'Preferencja' }, { wartosc: 'regula', etykieta: 'Reguła' }] }, { klucz: 'zrodlo', etykieta: 'Źródło', wymagane: true }, { klucz: 'wrazliwosc', etykieta: 'Wrażliwość', typ: 'select', wymagane: true, opcje: [{ wartosc: 'zwykla', etykieta: 'Zwykła' }, { wartosc: 'wrazliwa', etykieta: 'Wrażliwa' }] }, { klucz: 'sposob', etykieta: 'Sposób zapisu', typ: 'select', wymagane: true, opcje: [{ wartosc: 'reczne', etykieta: 'Ręczne' }, { wartosc: 'zaproponowane', etykieta: 'Zaproponowane przez Echo' }] }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), tresc: f.tresc.trim(), typ: (f.typ || 'fakt') as PamiecEcho['typ'], zrodlo: f.zrodlo, wrazliwosc: (f.wrazliwosc || 'zwykla') as PamiecEcho['wrazliwosc'], sposob: (f.sposob || 'reczne') as PamiecEcho['sposob'], updatedAt: terazIso() })} etykieta={(x) => x.tresc.slice(0, 80)} szczegoly={(x) => <><Znacznik wariant={x.wrazliwosc === 'wrazliwa' ? 'ostrzezenie' : 'neutralny'}>{x.wrazliwosc}</Znacznik><span>{x.typ} · {x.zrodlo} · {x.sposob}</span></>} />

    <section className="siatka-dwie-kolumny siatka-dwie-kolumny--rowne"><Karta><h2>Dane demonstracyjne</h2><p>Przykładowe rekordy można wczytać tylko do całkowicie pustej bazy, aby nie mieszać ich z prawdziwymi danymi.</p><button type="button" className="przycisk przycisk--drugorzedny" disabled={!moznaDemo} onClick={async () => { try { await wczytajDaneDemonstracyjne(); ustawMoznaDemo(false); ustawKomunikat('Dane demonstracyjne zostały wczytane.') } catch (e) { ustawBlad(e instanceof Error ? e.message : 'Błąd danych demonstracyjnych.') } }}>Wczytaj dane demonstracyjne</button>{!moznaDemo && <p className="tekst-pomocniczy">Baza zawiera już dane — opcja jest wyłączona.</p>}</Karta><Karta klasa="karta--niebezpieczna"><h2>Wyczyść dane lokalne</h2><p>Operacja trwale usuwa całą bazę na tym urządzeniu. Najpierw wykonaj backup.</p><button type="button" className="przycisk przycisk--niebezpieczny" onClick={() => ustawCzyszczenie(true)}>Wyczyść wszystkie dane</button></Karta></section>
    <Karta><h2>Informacje o aplikacji</h2><p><strong>Ogarniacz v1.0.0</strong> · local-first PWA · schemat IndexedDB v2 · bez backendu i zewnętrznego API.</p><p className="tekst-pomocniczy">Systemowe alarmy po całkowitym zamknięciu aplikacji, zdalne współdzielenie i synchronizacja wymagają przyszłej warstwy platformowej/backendowej.</p></Karta>

    {kopiaDoImportu && <ModalPotwierdzenia tytul={trybImportu === 'nadpisz' ? 'Nadpisać całą bazę?' : 'Scalić kopię z bazą?'} opis={trybImportu === 'nadpisz' ? 'Wszystkie obecne rekordy zostaną trwale zastąpione zawartością kopii.' : 'Rekordy o tych samych ID zostaną zaktualizowane, a pozostałe dodane. Przed importem warto wykonać własny backup.'} etykietaAkcji={trybImportu === 'nadpisz' ? 'Nadpisz bazę' : 'Scal dane'} niebezpieczne={trybImportu === 'nadpisz'} anuluj={() => ustawKopieDoImportu(undefined)} potwierdz={async () => { await importujKopie(kopiaDoImportu, trybImportu); ustawKopieDoImportu(undefined); ustawKomunikat('Import zakończony pomyślnie.') }} />}
    {czyszczenie && <PotwierdzenieCzyszczenia anuluj={() => ustawCzyszczenie(false)} wykonaj={async () => { await wyczyscDane(); await inicjalizujBaze(); window.location.assign('/') }} />}
  </div>
}

function PotwierdzenieCzyszczenia({ anuluj, wykonaj }: { anuluj: () => void; wykonaj: () => Promise<void> }) {
  const [fraza, ustawFraze] = useState('')
  return <Modal tytul="Trwałe czyszczenie danych" opis="Tej operacji nie można cofnąć bez wcześniej pobranej kopii." zamknij={anuluj}><label className="pole pole--pelne"><span>Wpisz WYCZYŚĆ, aby potwierdzić</span><input autoFocus value={fraza} onChange={(e) => ustawFraze(e.target.value)} /></label><div className="akcje-formularza"><button type="button" className="przycisk przycisk--drugorzedny" onClick={anuluj}>Anuluj</button><button type="button" className="przycisk przycisk--niebezpieczny" disabled={fraza !== 'WYCZYŚĆ'} onClick={wykonaj}>Usuń całą bazę</button></div></Modal>
}
