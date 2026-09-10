import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { KeyRound, LogOut, ShieldCheck, UserPlus } from 'lucide-react'
import { Komunikat, Modal } from '../components/Interfejs'
import { pobierzKonfiguracjeSynchronizacji } from '../services/KonfiguracjaSynchronizacji'
import {
  BladKonta,
  cofnijEdytora,
  cofnijGrant,
  odzyskajDostep,
  pobierzKontoOffline,
  pobierzSesjeKonta,
  przyjmijZaproszenie,
  utworzKontoWlasciciela,
  wyloguj,
  zaloguj,
  zapiszGrant,
  zaprosEdytora,
  type KontoUzytkownika,
} from '../services/KontaService'

interface WartoscKontekstuKonta {
  konto?: KontoUzytkownika
  offline: boolean
}

const KontekstKonta = createContext<WartoscKontekstuKonta>({ offline: false })
const MODULY_GRANTOW = ['zadania', 'projekty', 'skrzynka', 'planer', 'grafik', 'nawyki', 'leki', 'wizyty', 'zdrowie', 'skierowania', 'przypomnienia', 'zakupy', 'rachunki', 'miasto', 'miejsca', 'cele', 'notatki', 'pomysly', 'na_pozniej', 'kontakty', 'dokumenty', 'finanse', 'samochod', 'terminy']

function powiadomOSesji(): void {
  window.dispatchEvent(new Event('ogarniacz:konto'))
}

function EkranLogowania({ poZalogowaniu, pracujLokalnie }: { poZalogowaniu: (konto: KontoUzytkownika) => void; pracujLokalnie: () => void }) {
  const tokenZaproszenia = new URLSearchParams(window.location.search).get('invite') ?? ''
  const [tryb, ustawTryb] = useState<'logowanie' | 'bootstrap' | 'odzyskiwanie' | 'zaproszenie'>(tokenZaproszenia ? 'zaproszenie' : 'logowanie')
  const [email, ustawEmail] = useState('')
  const [haslo, ustawHaslo] = useState('')
  const [token, ustawToken] = useState(tokenZaproszenia)
  const [kod, ustawKod] = useState('')
  const [blad, ustawBlad] = useState('')
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

  return <main className="ekran-konta"><section className="karta ekran-konta__panel">
    <div className="tytul-karty"><KeyRound aria-hidden="true" /><span>Konto Ogarniacza</span></div>
    <h1>{tryb === 'bootstrap' ? 'Pierwsze konto Właściciela' : tryb === 'odzyskiwanie' ? 'Odzyskaj dostęp' : tryb === 'zaproszenie' ? 'Przyjmij zaproszenie' : 'Zaloguj się'}</h1>
    <p>Dane lokalne pozostają na urządzeniu. Konto zabezpiecza synchronizację i współdzielenie.</p>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <form className="formularz" onSubmit={wykonaj}>
      {tryb !== 'zaproszenie' && <label className="pole pole--pelne"><span>E-mail</span><input type="email" autoComplete="email" required value={email} onChange={(e) => ustawEmail(e.target.value)} /></label>}
      {(tryb === 'bootstrap' || tryb === 'zaproszenie') && <label className="pole pole--pelne"><span>{tryb === 'bootstrap' ? 'Token bootstrapu' : 'Token zaproszenia'}</span><input required value={token} onChange={(e) => ustawToken(e.target.value)} /></label>}
      {tryb === 'odzyskiwanie' && <label className="pole pole--pelne"><span>Kod odzyskiwania</span><input required value={kod} onChange={(e) => ustawKod(e.target.value)} /></label>}
      <label className="pole pole--pelne"><span>{tryb === 'odzyskiwanie' ? 'Nowe hasło' : 'Hasło'}</span><input type="password" autoComplete={tryb === 'logowanie' ? 'current-password' : 'new-password'} minLength={12} required value={haslo} onChange={(e) => ustawHaslo(e.target.value)} /></label>
      <button className="przycisk przycisk--glowny pole--pelne" disabled={zajety} type="submit">{zajety ? 'Proszę czekać…' : tryb === 'odzyskiwanie' ? 'Ustaw nowe hasło' : tryb === 'zaproszenie' ? 'Przyjmij zaproszenie' : tryb === 'bootstrap' ? 'Utwórz konto' : 'Zaloguj'}</button>
    </form>
    <div className="akcje-formularza ekran-konta__tryby">
      {tryb !== 'logowanie' && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawTryb('logowanie')}>Logowanie</button>}
      {tryb !== 'odzyskiwanie' && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawTryb('odzyskiwanie')}>Odzyskaj dostęp</button>}
      {tryb !== 'bootstrap' && <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawTryb('bootstrap')}>Pierwsze uruchomienie</button>}
      <button type="button" className="przycisk przycisk--tekstowy" onClick={pracujLokalnie}>Pracuj lokalnie bez synchronizacji</button>
    </div>
  </section></main>
}

function PanelKonta({ konto, zamknij, odswiez, wyczysc }: { konto: KontoUzytkownika; zamknij: () => void; odswiez: () => Promise<void>; wyczysc: () => void }) {
  const [email, ustawEmail] = useState('')
  const [link, ustawLink] = useState('')
  const [editorId, ustawEditorId] = useState(konto.edytorzy[0]?.id ?? '')
  const [modul, ustawModul] = useState('zadania')
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

  return <Modal tytul="Konto i współdzielenie" opis={`${konto.email} · ${konto.rola === 'wlasciciel' ? 'Właściciel' : 'Edytor'}`} zamknij={zamknij} szeroki>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {konto.rola === 'wlasciciel' && <>
      <section><h3>Zaproszenie Edytora</h3><form className="szybki-wpis" onSubmit={zapros}><input type="email" required value={email} onChange={(e) => ustawEmail(e.target.value)} placeholder="edytor@example.com" /><button className="przycisk przycisk--glowny" type="submit"><UserPlus aria-hidden="true" />Zaproś</button></form>{link && <label className="pole"><span>Link ważny 7 dni — przekaż go bezpiecznym kanałem</span><input readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></label>}</section>
      <section><h3>Edytorzy</h3>{konto.edytorzy.length === 0 ? <p className="tekst-pomocniczy">Brak przyjętych zaproszeń.</p> : konto.edytorzy.map((edytor) => <div className="wiersz-konta" key={edytor.id}><span>{edytor.email} · {edytor.status}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => void cofnijEdytora(edytor.id).then(odswiez)}>Cofnij dostęp</button></div>)}</section>
      {konto.edytorzy.length > 0 && <section><h3>Grant modułu</h3><form className="formularz" onSubmit={(e) => { e.preventDefault(); void zapiszGrant(editorId, modul, odczyt, edycja).then(odswiez).catch((przyczyna) => ustawBlad(String(przyczyna))) }}><label className="pole"><span>Edytor</span><select value={editorId} onChange={(e) => ustawEditorId(e.target.value)}>{konto.edytorzy.filter((x) => x.status === 'aktywne').map((x) => <option key={x.id} value={x.id}>{x.email}</option>)}</select></label><label className="pole"><span>Moduł</span><select value={modul} onChange={(e) => ustawModul(e.target.value)}>{MODULY_GRANTOW.map((x) => <option key={x} value={x}>{x}</option>)}</select></label><label className="pole pole-checkbox"><input type="checkbox" checked={odczyt} onChange={(e) => ustawOdczyt(e.target.checked)} /><span>Odczyt</span></label><label className="pole pole-checkbox"><input type="checkbox" checked={edycja} onChange={(e) => ustawEdycja(e.target.checked)} /><span>Edycja</span></label><button className="przycisk przycisk--glowny" type="submit">Zapisz grant</button></form></section>}
      <section><h3>Aktywne granty</h3>{konto.granty.filter((x) => x.status === 'aktywne').map((grant) => <div className="wiersz-konta" key={grant.id}><span>{grant.modul}: {grant.odczyt ? 'odczyt' : ''}{grant.edycja ? ' + edycja' : ''}</span><button type="button" className="przycisk przycisk--tekstowy" onClick={() => void cofnijGrant(grant.id).then(odswiez)}>Cofnij</button></div>)}</section>
    </>}
    <div className="akcje-formularza"><button type="button" className="przycisk przycisk--drugorzedny" onClick={() => void wyloguj().finally(wyczysc)}><LogOut aria-hidden="true" />Wyloguj</button></div>
  </Modal>
}

export function DostawcaKonta({ children }: { children: ReactNode }) {
  const wymagaKonta = Boolean(pobierzKonfiguracjeSynchronizacji().adresApi)
  const [konto, ustawKonto] = useState<KontoUzytkownika | undefined>(() => wymagaKonta ? pobierzKontoOffline() : undefined)
  const [ladowanie, ustawLadowanie] = useState(wymagaKonta)
  const [offline, ustawOffline] = useState(false)
  const [panel, ustawPanel] = useState(false)

  const odswiez = async () => { ustawKonto(await pobierzSesjeKonta()) }
  useEffect(() => {
    if (!wymagaKonta) return
    void pobierzSesjeKonta()
      .then((sesja) => { ustawKonto(sesja); ustawOffline(false) })
      .catch((przyczyna) => ustawOffline(!(przyczyna instanceof BladKonta && przyczyna.status === 401)))
      .finally(() => ustawLadowanie(false))
  }, [wymagaKonta])

  if (!wymagaKonta) return children
  if (ladowanie && !konto) return <main className="ekran-konta"><div role="status">Sprawdzam sesję…</div></main>
  if (!konto && !offline) return <EkranLogowania poZalogowaniu={(sesja) => { ustawKonto(sesja); ustawOffline(false) }} pracujLokalnie={() => ustawOffline(true)} />
  if (!konto) return <KontekstKonta.Provider value={{ offline: true }}>
    {children}
    <button type="button" className="przycisk-konta" onClick={() => ustawOffline(false)} title="Połącz konto i synchronizację"><ShieldCheck aria-hidden="true" /><span>Tryb lokalny</span></button>
  </KontekstKonta.Provider>
  return <KontekstKonta.Provider value={{ konto, offline }}>
    {children}
    <button type="button" className="przycisk-konta" onClick={() => ustawPanel(true)} title="Konto i współdzielenie"><ShieldCheck aria-hidden="true" /><span>{offline ? 'Konto offline' : konto.rola === 'wlasciciel' ? 'Właściciel' : 'Edytor'}</span></button>
    {panel && <PanelKonta konto={konto} zamknij={() => ustawPanel(false)} odswiez={odswiez} wyczysc={() => { ustawPanel(false); ustawKonto(undefined) }} />}
  </KontekstKonta.Provider>
}

// oxlint-disable-next-line react/only-export-components -- Hook jest publicznym interfejsem kontekstu konta.
export function useKonto(): WartoscKontekstuKonta {
  return useContext(KontekstKonta)
}
