import { PRYWATNE_SEKCJE_ZDROWIA } from '../services/UprawnieniaService'
import { createContext, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { KeyRound, LogOut, ShieldCheck, UserPlus } from 'lucide-react'
import { Komunikat, Modal } from '../components/Interfejs'
import { PanelAdministracjiKont } from './PanelAdministracjiKont'
import { FormularzLinkuResetowania } from './OdzyskiwanieHasla'
import { pobierzKonfiguracjeSynchronizacji } from '../services/KonfiguracjaSynchronizacji'
import {
  BladKonta,
  czyBootstrapDostepny,
  cofnijEdytora,
  cofnijGrant,
  odzyskajDostep,
  pobierzKontoOffline,
  pobierzSesjeKonta,
  pobierzListeSesji,
  przyjmijZaproszenie,
  utworzKontoWlasciciela,
  wyczyscKontoLokalne,
  wyloguj,
  wylogujSesje,
  wylogujWszystkieSesje,
  wylogujPozostaleSesje,
  zmienHaslo,
  zaloguj,
  zapiszGrant,
  zaprosEdytora,
  type KontoUzytkownika,
  type SesjaKonta,
} from '../services/KontaService'

interface WartoscKontekstuKonta {
  konto?: KontoUzytkownika
  offline: boolean
  odswiez?: () => Promise<void>
  wyczysc?: () => void
}

const KontekstKonta = createContext<WartoscKontekstuKonta>({ offline: false })
const ETYKIETY_MODULOW: Record<string, string> = {
  zadania: 'Zadania', projekty: 'Projekty', skrzynka: 'Poczekalnia', planer: 'Planer', grafik: 'Grafik',
  nawyki: 'Nawyki', leki: 'Leki', wizyty: 'Wizyty', zdrowie: 'Zdrowie', skierowania: 'Skierowania',
  przypomnienia: 'Przypomnienia', zakupy: 'Zakupy', rachunki: 'Rachunki', miasto: 'Sprawy na mieście',
  miejsca: 'Miejsca', cele: 'Cele', notatki: 'Notatki', pomysly: 'Pomysły', na_pozniej: 'Na później',
  kontakty: 'Kontakty', dokumenty: 'Dokumenty', finanse: 'Finanse', samochod: 'Samochód', terminy: 'Terminy',
}
const MODULY_GRANTOW = Object.keys(ETYKIETY_MODULOW)

function powiadomOSesji(): void {
  window.dispatchEvent(new Event('ogarniacz:konto'))
}

function PanelHaslaISesji({ odswiez, wyczysc, widok = 'wszystko' }: { odswiez: () => Promise<void>; wyczysc: () => void; widok?: 'wszystko' | 'haslo' | 'sesje' }) {
  const idWymagan = useId()
  const [aktualneHaslo, ustawAktualneHaslo] = useState('')
  const [noweHaslo, ustawNoweHaslo] = useState('')
  const [powtorzoneHaslo, ustawPowtorzoneHaslo] = useState('')
  const [sesje, ustawSesje] = useState<SesjaKonta[]>()
  const [blad, ustawBlad] = useState('')
  const [komunikat, ustawKomunikat] = useState('')
  const [zajety, ustawZajety] = useState(false)
  const [pokazHasla, ustawPokazHasla] = useState(false)

  const wykonaj = async (operacja: () => Promise<void>) => {
    if (zajety) return
    ustawZajety(true)
    ustawBlad('')
    ustawKomunikat('')
    try { await operacja() }
    catch (przyczyna) { ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się wykonać operacji.') }
    finally { ustawZajety(false) }
  }

  return <section>
    <h3>{widok === 'sesje' ? 'Aktywne sesje' : widok === 'haslo' ? 'Zmień hasło' : 'Hasło i sesje'}</h3>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {komunikat && <p role="status">{komunikat}</p>}
    {widok !== 'sesje' && <form className="formularz" onSubmit={(zdarzenie) => {
      zdarzenie.preventDefault()
      if (zajety) return
      ustawKomunikat('')
      if (noweHaslo.length < 8) { ustawBlad('Nowe hasło musi mieć minimum 8 znaków.'); return }
      if (noweHaslo !== powtorzoneHaslo) { ustawBlad('Nowe hasła muszą być jednakowe.'); return }
      void wykonaj(async () => {
        const aktualne = aktualneHaslo
        const nowe = noweHaslo
        ustawAktualneHaslo(''); ustawNoweHaslo(''); ustawPowtorzoneHaslo('')
        ustawPokazHasla(false)
        await zmienHaslo(aktualne, nowe)
        ustawKomunikat('Hasło zmienione. Pozostałe sesje zostały wylogowane.')
        ustawSesje(undefined)
        try { await odswiez() }
        catch { ustawBlad('Hasło zapisano, ale nie udało się odświeżyć danych sesji. Sprawdź połączenie z serwerem.') }
      })
    }}>
      <label className="pole pole--pelne"><span>Aktualne hasło</span><input type={pokazHasla ? 'text' : 'password'} disabled={zajety} autoComplete="current-password" required maxLength={200} value={aktualneHaslo} onChange={(zdarzenie) => ustawAktualneHaslo(zdarzenie.target.value)} /></label>
      <label className="pole pole--pelne"><span>Nowe hasło</span><input type={pokazHasla ? 'text' : 'password'} disabled={zajety} autoComplete="new-password" aria-describedby={idWymagan} required minLength={8} maxLength={200} value={noweHaslo} onChange={(zdarzenie) => ustawNoweHaslo(zdarzenie.target.value)} /></label>
      <label className="pole pole--pelne"><span>Powtórz nowe hasło</span><input type={pokazHasla ? 'text' : 'password'} disabled={zajety} autoComplete="new-password" required minLength={8} maxLength={200} value={powtorzoneHaslo} onChange={(zdarzenie) => ustawPowtorzoneHaslo(zdarzenie.target.value)} /></label>
      <label className="pole pole-checkbox pole--pelne"><input type="checkbox" disabled={zajety} checked={pokazHasla} onChange={(zdarzenie) => ustawPokazHasla(zdarzenie.target.checked)} /><span>Pokaż hasła</span></label>
      <p id={idWymagan} className="tekst-pomocniczy pole--pelne">Minimum 8 znaków. Zmiana hasła wyloguje pozostałe sesje. Ta sesja pozostanie aktywna.</p>
      <button className="przycisk przycisk--glowny" type="submit" disabled={zajety}>Zmień hasło</button>
    </form>}
    {widok !== 'haslo' && <>
    <button className="przycisk przycisk--drugorzedny" type="button" disabled={zajety} onClick={() => void wykonaj(async () => ustawSesje(await pobierzListeSesji()))}>Pokaż aktywne sesje</button>
    {sesje?.length === 0 && <p>Brak aktywnych sesji.</p>}
    {sesje?.map((sesja) => <div className="wiersz-konta" key={sesja.id}>
      <span>Wygasa: {sesja.wygasaAt ? new Date(sesja.wygasaAt).toLocaleString('pl-PL') : 'Brak informacji w starszym serwerze'}</span>
      <span>{sesja.biezaca ? 'Bieżąca sesja' : 'Inna sesja'} · Utworzona: {new Date(sesja.utworzonoAt).toLocaleString('pl-PL')} · Ostatnia aktywność: {new Date(sesja.ostatniaAktywnoscAt).toLocaleString('pl-PL')}</span>
      <button className="przycisk przycisk--tekstowy" type="button" disabled={zajety} onClick={() => void wykonaj(async () => {
        if (await wylogujSesje(sesja.id)) wyczysc()
        else ustawSesje(await pobierzListeSesji())
      })}>Wyloguj sesję</button>
    </div>)}
    <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={zajety} onClick={() => void wykonaj(async () => { await wylogujPozostaleSesje(); ustawSesje(await pobierzListeSesji()); ustawKomunikat('Pozostałe sesje zostały wylogowane. Bieżąca sesja pozostaje aktywna.') })}>Wyloguj pozostałe sesje</button>
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={zajety} onClick={() => void wykonaj(async () => { await wyloguj(); wyczysc() })}><LogOut aria-hidden="true" />Wyloguj bieżącą sesję</button>
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={zajety} onClick={() => void wykonaj(async () => { await wylogujWszystkieSesje(); wyczysc() })}>Wyloguj wszystkie sesje</button>
    </div>
    </>}
  </section>
}

function EkranLogowania({ bootstrapDostepny, poZalogowaniu, pracujLokalnie }: { bootstrapDostepny: boolean; poZalogowaniu: (konto: KontoUzytkownika) => void; pracujLokalnie: () => void }) {
  const [wysylkaLinku, ustawWysylkeLinku] = useState(false)
  const tokenZaproszenia = new URLSearchParams(window.location.search).get('invite') ?? ''
  const [tryb, ustawTryb] = useState<'logowanie' | 'bootstrap' | 'odzyskiwanie' | 'zaproszenie'>(tokenZaproszenia ? 'zaproszenie' : bootstrapDostepny ? 'bootstrap' : 'logowanie')
  const [email, ustawEmail] = useState('')
  const [haslo, ustawHaslo] = useState('')
  const [token, ustawToken] = useState(tokenZaproszenia)
  const [kod, ustawKod] = useState('')
  const [blad, ustawBlad] = useState(() => sessionStorage.getItem('ogarniacz-blad-zmiany-konta') ?? '')
  const [zajety, ustawZajety] = useState(false)

  const wykonaj = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (zajety) return
    ustawZajety(true)
    ustawBlad('')
    try {
      if (tryb === 'odzyskiwanie') {
        await odzyskajDostep(email, kod, haslo)
        ustawTryb('logowanie')
        ustawKod('')
        return
      }
      const konto = tryb === 'bootstrap'
        ? await utworzKontoWlasciciela(email, haslo, token)
        : tryb === 'zaproszenie'
          ? await przyjmijZaproszenie(token, haslo)
          : await zaloguj(email, haslo)
      poZalogowaniu(konto)
      powiadomOSesji()
    } catch (przyczyna) {
      ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się zalogować.')
    } finally {
      ustawZajety(false)
    }
  }

  if (wysylkaLinku) return <main className="ekran-konta"><section className="karta ekran-konta__panel"><FormularzLinkuResetowania powrot={() => ustawWysylkeLinku(false)} /></section></main>
  return <main className="ekran-konta"><section className="karta ekran-konta__panel">
    <div className="tytul-karty"><KeyRound aria-hidden="true" /><span>Konto Ogarniacza</span></div>
    <h1>{tryb === 'bootstrap' ? 'Pierwsze konto Właściciela' : tryb === 'odzyskiwanie' ? 'Odzyskaj dostęp' : tryb === 'zaproszenie' ? 'Przyjmij zaproszenie' : 'Zaloguj się'}</h1>
    <p>Dane lokalne pozostają na urządzeniu. Konto zabezpiecza synchronizację i współdzielenie.</p>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <form className="formularz" onSubmit={wykonaj}>
      {tryb !== 'zaproszenie' && <label className="pole pole--pelne"><span>{tryb === 'logowanie' ? 'E-mail lub login' : 'E-mail'}</span><input type={tryb === 'logowanie' ? 'text' : 'email'} autoComplete="username" required value={email} onChange={(e) => ustawEmail(e.target.value)} /></label>}
      {(tryb === 'bootstrap' || tryb === 'zaproszenie') && <label className="pole pole--pelne"><span>{tryb === 'bootstrap' ? 'Token bootstrapu' : 'Token zaproszenia'}</span><input required value={token} onChange={(e) => ustawToken(e.target.value)} /></label>}
      {tryb === 'odzyskiwanie' && <label className="pole pole--pelne"><span>Kod odzyskiwania</span><input required value={kod} onChange={(e) => ustawKod(e.target.value)} /></label>}
      <label className="pole pole--pelne"><span>{tryb === 'odzyskiwanie' ? 'Nowe hasło' : 'Hasło'}</span><input type="password" autoComplete={tryb === 'logowanie' ? 'current-password' : 'new-password'} minLength={8} required value={haslo} onChange={(e) => ustawHaslo(e.target.value)} /><small className="tekst-pomocniczy">Minimum 8 znaków.</small></label>
      <button className="przycisk przycisk--glowny pole--pelne" disabled={zajety} type="submit">{zajety ? 'Proszę czekać…' : tryb === 'odzyskiwanie' ? 'Ustaw nowe hasło' : tryb === 'zaproszenie' ? 'Przyjmij zaproszenie' : tryb === 'bootstrap' ? 'Utwórz konto' : 'Zaloguj'}</button>
    </form>
    <div className="akcje-formularza ekran-konta__tryby">
      <button type="button" className="przycisk przycisk--tekstowy" disabled={zajety} onClick={() => { ustawHaslo(''); ustawWysylkeLinku(true) }}>Nie pamiętasz hasła?</button>
      {tryb !== 'logowanie' && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawTryb('logowanie')}>Logowanie</button>}
      {tryb !== 'odzyskiwanie' && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawTryb('odzyskiwanie')}>Odzyskaj dostęp</button>}
      {bootstrapDostepny && tryb !== 'bootstrap' && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawTryb('bootstrap')}>Pierwsze uruchomienie</button>}
      <button type="button" className="przycisk przycisk--tekstowy" onClick={pracujLokalnie}>Pracuj lokalnie bez synchronizacji</button>
    </div>
  </section></main>
}

function DaneMojegoKonta({ konto, offline }: { konto: KontoUzytkownika; offline: boolean }) {
  return <section><h3>Moje konto</h3><dl className="lista-kompaktowa">
    <div><dt>Nazwa użytkownika</dt><dd>{konto.nazwa || 'Nie ustawiono'}</dd></div>
    <div><dt>Login</dt><dd>{konto.login || 'Logowanie e-mailem'}</dd></div>
    <div><dt>E-mail</dt><dd>{konto.email}</dd></div>
    <div><dt>Rola systemowa</dt><dd>{konto.rolaSystemowa === 'administrator' ? 'Administrator systemu' : konto.rolaSystemowa === 'uzytkownik' ? 'Użytkownik' : 'Brak informacji w starszym serwerze'}</dd></div>
    <div><dt>Dostęp do zbioru danych</dt><dd>{konto.rola === 'wlasciciel' ? 'Właściciel' : 'Edytor'}</dd></div>
    <div><dt>Status sesji</dt><dd>{offline ? 'Brak połączenia — dane zapamiętanego konta' : 'Sesja potwierdzona przez serwer'}</dd></div>
  </dl></section>
}

export function KontoIBezpieczenstwo() {
  const { konto, offline, odswiez, wyczysc } = useKonto()
  const [panel, ustawPanel] = useState<'haslo' | 'sesje' | 'odzyskiwanie'>()
  const trescPanelu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!panel) return
    const elementPowrotu = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const okno = trescPanelu.current?.closest('[role="dialog"]')
    okno?.querySelector<HTMLButtonElement>('button')?.focus()
    const obsluzKlawiature = (zdarzenie: KeyboardEvent) => {
      if (zdarzenie.key === 'Escape') { zdarzenie.preventDefault(); ustawPanel(undefined); return }
      if (zdarzenie.key !== 'Tab' || !okno) return
      const pola = [...okno.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
      const cel = zdarzenie.shiftKey && document.activeElement === pola[0] ? pola.at(-1)
        : !zdarzenie.shiftKey && document.activeElement === pola.at(-1) ? pola[0] : undefined
      if (cel) { zdarzenie.preventDefault(); cel.focus() }
    }
    document.addEventListener('keydown', obsluzKlawiature)
    return () => { document.removeEventListener('keydown', obsluzKlawiature); elementPowrotu?.focus() }
  }, [panel])
  return <section className="karta konta-uzytkownicy">
    <h2>Konto i bezpieczeństwo</h2>
    {konto ? <DaneMojegoKonta konto={konto} offline={offline} /> : <p>Pracujesz lokalnie. Połącz konto przez przycisk Tryb lokalny.</p>}
    {konto && odswiez && wyczysc && <div className="akcje-formularza">
      <button type="button" className="przycisk przycisk--glowny" disabled={offline} onClick={() => ustawPanel('haslo')}>Zmień hasło</button>
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={offline} onClick={() => ustawPanel('sesje')}>Aktywne sesje</button>
    </div>}
    <section><h3>Odzyskiwanie dostępu</h3>
      <details><summary>Dostępne metody odzyskiwania</summary>
      <ul>
        <li>Znam aktualne hasło — wybieram „Zmień hasło”.</li>
        <li>Nie znam hasła, ale mam dostęp do e-maila — wybieram „Nie pamiętasz hasła?”. Wysyłka zależy od konfiguracji poczty na serwerze; aplikacja nie potwierdza jej dostępności.</li>
        <li>Mam zapisany kod odzyskiwania — używam „Odzyskaj dostęp” na ekranie logowania.</li>
        <li>Nie znam hasła ani kodu, a poczta nie działa — administrator Raspberry Pi może przez SSH odczytać konto i wydać link ważny 15 minut. Ta operacja wymaga chronionego lokalnego dostępu do bazy.</li>
      </ul>
      <p>Reset linkiem wylogowuje wszystkie wcześniejsze sesje. Następnie zaloguj się nowym hasłem. Konto zachowuje dane i uprawnienia.</p>
      </details>
      <button type="button" className="przycisk przycisk--drugorzedny" disabled={offline} onClick={() => ustawPanel('odzyskiwanie')}>Nie pamiętasz hasła?</button>
    </section>
    {panel && createPortal(<Modal tytul={panel === 'haslo' ? 'Zmień hasło' : panel === 'sesje' ? 'Aktywne sesje' : 'Odzyskiwanie dostępu'} zamknij={() => ustawPanel(undefined)}>
      <div ref={trescPanelu} className="konta-uzytkownicy">{panel === 'odzyskiwanie'
        ? <FormularzLinkuResetowania powrot={() => ustawPanel(undefined)} etykietaPowrotu="Wróć do Ustawień" />
        : odswiez && wyczysc && <PanelHaslaISesji widok={panel} odswiez={odswiez} wyczysc={wyczysc} />}</div>
    </Modal>, document.body)}
  </section>
}

function ZawartoscKonta({ konto, odswiez, wyczysc }: { konto: KontoUzytkownika; odswiez: () => Promise<void>; wyczysc: () => void }) {
  const { offline } = useKonto()
  const [email, ustawEmail] = useState('')
  const [link, ustawLink] = useState('')
  const [editorId, ustawEditorId] = useState(konto.edytorzy[0]?.id ?? '')
  const [modul, ustawModul] = useState('zadania')
  const [sekcja, ustawSekcje] = useState('')
  const [odczyt, ustawOdczyt] = useState(true)
  const [edycja, ustawEdycja] = useState(false)
  const [blad, ustawBlad] = useState('')

  const zapros = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    try {
      const zaproszenie = await zaprosEdytora(email)
      ustawLink(`${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(zaproszenie.token)}`)
      ustawEmail('')
    } catch (przyczyna) { ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się utworzyć zaproszenia.') }
  }

  return <div className="konta-uzytkownicy">
    <DaneMojegoKonta konto={konto} offline={offline} />
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {konto.rola === 'wlasciciel' && <>
      <section><h3>Zaproszenie Edytora</h3><form className="szybki-wpis" onSubmit={zapros}><input type="email" required value={email} onChange={(e) => ustawEmail(e.target.value)} placeholder="edytor@example.com" /><button className="przycisk przycisk--glowny" type="submit"><UserPlus aria-hidden="true" />Zaproś</button></form>{link && <label className="pole"><span>Link ważny 7 dni — przekaż go bezpiecznym kanałem</span><input readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></label>}</section>
      <section><h3>Edytorzy</h3>{konto.edytorzy.length === 0 ? <p className="tekst-pomocniczy">Brak przyjętych zaproszeń.</p> : konto.edytorzy.map((edytor) => <div className="wiersz-konta" key={edytor.id}><span>{edytor.email} · {edytor.status === 'aktywne' ? 'Aktywny' : 'Dostęp cofnięty'}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => void cofnijEdytora(edytor.id).then(odswiez)}>Cofnij dostęp</button></div>)}</section>
      {konto.edytorzy.length > 0 && <section><h3>Grant modułu</h3><form className="formularz" onSubmit={(e) => { e.preventDefault(); void zapiszGrant(editorId, modul, odczyt, edycja, modul === 'zdrowie' ? sekcja || undefined : undefined).then(odswiez).catch((przyczyna) => ustawBlad(String(przyczyna))) }}><label className="pole"><span>Edytor</span><select value={editorId} onChange={(e) => ustawEditorId(e.target.value)}>{konto.edytorzy.filter((x) => x.status === 'aktywne').map((x) => <option key={x.id} value={x.id}>{x.email}</option>)}</select></label><label className="pole"><span>Moduł</span><select value={modul} onChange={(e) => ustawModul(e.target.value)}>{MODULY_GRANTOW.map((x) => <option key={x} value={x}>{ETYKIETY_MODULOW[x]}</option>)}</select></label>{modul === 'zdrowie' && <label className="pole"><span>Kategoria danych</span><select value={sekcja} onChange={(e) => ustawSekcje(e.target.value)}><option value="">Ogólne dane zdrowotne</option>{Object.entries(PRYWATNE_SEKCJE_ZDROWIA).filter(([klucz]) => klucz !== 'nagrania').map(([klucz, etykieta]) => <option key={klucz} value={klucz}>{etykieta}</option>)}</select></label>}<label className="pole pole-checkbox"><input type="checkbox" checked={odczyt} onChange={(e) => ustawOdczyt(e.target.checked)} /><span>Odczyt</span></label><label className="pole pole-checkbox"><input type="checkbox" checked={edycja} onChange={(e) => ustawEdycja(e.target.checked)} /><span>Edycja</span></label><button className="przycisk przycisk--glowny" type="submit">Zapisz grant</button></form></section>}
      <section><h3>Aktywne granty</h3>{konto.granty.filter((x) => x.status === 'aktywne').map((grant) => <div className="wiersz-konta" key={grant.id}><span>{ETYKIETY_MODULOW[grant.modul] ?? 'Moduł'}{grant.sekcja && ` · ${PRYWATNE_SEKCJE_ZDROWIA[grant.sekcja as keyof typeof PRYWATNE_SEKCJE_ZDROWIA] ?? 'Wybrana sekcja'}`}: {grant.odczyt ? 'odczyt' : ''}{grant.edycja ? ' + edycja' : ''}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => void cofnijGrant(grant.id).then(odswiez)}>Cofnij</button></div>)}</section>
    </>}
    <PanelHaslaISesji odswiez={odswiez} wyczysc={wyczysc} />
    {konto.rolaSystemowa === 'administrator' && <PanelAdministracjiKont />}
    <PrzelaczKonto />
  </div>
}

function PanelKonta({ zamknij, ...wlasciwosci }: { konto: KontoUzytkownika; zamknij: () => void; odswiez: () => Promise<void>; wyczysc: () => void }) {
  return <Modal tytul="Konta i użytkownicy" zamknij={zamknij} szeroki><ZawartoscKonta {...wlasciwosci} /></Modal>
}

function PrzelaczKonto() {
  const [login, ustawLogin] = useState('')
  const [haslo, ustawHaslo] = useState('')
  const [blad, ustawBlad] = useState('')
  const [zajety, ustawZajety] = useState(false)
  return <section><h3>Przełącz konto</h3><p>Zapisane dane pozostaną w oddzielnym profilu. Zmiana wymaga połączenia z serwerem.</p>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <form className="formularz" onSubmit={(zdarzenie) => {
      zdarzenie.preventDefault()
      if (zajety) return
      ustawZajety(true); ustawBlad('')
      const hasloLogowania = haslo
      ustawHaslo('')
      void zaloguj(login, hasloLogowania).catch((przyczyna) => ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Zmiana konta nie powiodła się.')).finally(() => ustawZajety(false))
    }}>
      <label className="pole"><span>E-mail lub login nowego konta</span><input autoComplete="username" required value={login} onChange={(zdarzenie) => ustawLogin(zdarzenie.target.value)} /></label>
      <label className="pole"><span>Hasło nowego konta</span><input type="password" autoComplete="current-password" required maxLength={200} value={haslo} onChange={(zdarzenie) => ustawHaslo(zdarzenie.target.value)} /></label>
      <button type="submit" className="przycisk" disabled={zajety}>Zaloguj na inne konto</button>
    </form>
  </section>
}

export function KontaIUzytkownicy() {
  const { konto, odswiez, wyczysc } = useKonto()
  if (!konto || !odswiez || !wyczysc) return <section className="karta"><h2>Konta i użytkownicy</h2><p>Pracujesz lokalnie. Połącz konto przez przycisk Tryb lokalny.</p></section>
  return <section className="karta"><h2>Konta i użytkownicy</h2><ZawartoscKonta konto={konto} odswiez={odswiez} wyczysc={wyczysc} /></section>
}

export function DostawcaKonta({ children }: { children: ReactNode }) {
  const wymagaKonta = Boolean(pobierzKonfiguracjeSynchronizacji().adresApi)
  const [konto, ustawKonto] = useState<KontoUzytkownika | undefined>(() => wymagaKonta ? pobierzKontoOffline() : undefined)
  const [ladowanie, ustawLadowanie] = useState(wymagaKonta)
  const [offline, ustawOffline] = useState(false)
  const [bootstrapDostepny, ustawBootstrapDostepny] = useState(false)
  const [panel, ustawPanel] = useState(false)
  const [bladZmiany] = useState(() => sessionStorage.getItem('ogarniacz-blad-zmiany-konta') ?? '')
  useEffect(() => { sessionStorage.removeItem('ogarniacz-blad-zmiany-konta') }, [])

  const odswiez = async () => { ustawKonto(await pobierzSesjeKonta()) }
  useEffect(() => {
    if (!wymagaKonta) return
    void pobierzSesjeKonta()
      .then((sesja) => { ustawKonto(sesja); ustawOffline(false); ustawBootstrapDostepny(false) })
      .catch(async (przyczyna) => {
        if (przyczyna instanceof BladKonta && przyczyna.status === 401) {
          wyczyscKontoLokalne()
          ustawKonto(undefined)
          ustawOffline(false)
          ustawBootstrapDostepny(await czyBootstrapDostepny().catch(() => false))
        } else {
          ustawOffline(true)
        }
      })
      .finally(() => ustawLadowanie(false))
  }, [wymagaKonta])

  if (!wymagaKonta) return children
  if (ladowanie && !konto) return <main className="ekran-konta"><div role="status">Sprawdzam sesję…</div></main>
  if (!konto && !offline) return <EkranLogowania bootstrapDostepny={bootstrapDostepny} poZalogowaniu={(sesja) => { ustawKonto(sesja); ustawOffline(false); ustawBootstrapDostepny(false) }} pracujLokalnie={() => ustawOffline(true)} />
  if (!konto) return <KontekstKonta.Provider value={{ offline: true }}>
    {children}
    <button type="button" className="przycisk-konta" onClick={() => ustawOffline(false)} title="Połącz konto i synchronizację"><ShieldCheck aria-hidden="true" /><span>Tryb lokalny</span></button>
  </KontekstKonta.Provider>
  if (konto.wymaganaZmianaHasla) return <main className="ekran-konta"><section className="karta"><h1>Wymagana zmiana hasła</h1><PanelHaslaISesji odswiez={odswiez} wyczysc={() => ustawKonto(undefined)} /></section></main>
  return <KontekstKonta.Provider value={{ konto, offline, odswiez, wyczysc: () => { ustawPanel(false); ustawKonto(undefined) } }}>
    {bladZmiany && <Komunikat typ="blad">{bladZmiany}</Komunikat>}
    {children}
    <button type="button" className="przycisk-konta" onClick={() => ustawPanel(true)} title="Konto i współdzielenie"><ShieldCheck aria-hidden="true" /><span>{offline ? 'Konto offline' : konto.rola === 'wlasciciel' ? 'Właściciel' : 'Edytor'}</span></button>
    {panel && <PanelKonta konto={konto} zamknij={() => ustawPanel(false)} odswiez={odswiez} wyczysc={() => { ustawPanel(false); ustawKonto(undefined) }} />}
  </KontekstKonta.Provider>
}

// oxlint-disable-next-line react/only-export-components -- Hook jest publicznym interfejsem kontekstu konta.
export function useKonto(): WartoscKontekstuKonta {
  return useContext(KontekstKonta)
}
