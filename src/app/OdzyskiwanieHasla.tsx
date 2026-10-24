import { useState, type FormEvent } from 'react'
import { Komunikat } from '../components/Interfejs'
import { poprosOLinkResetowaniaHasla, ustawHasloPrzezLink } from '../services/KontaService'

// oxlint-disable-next-line react/only-export-components -- Odczyt linku musi poprzedzać uruchomienie profili w main.tsx.
export function pobierzTokenResetuZAdresu(): string | undefined {
  if (!window.location.hash.startsWith('#reset-hasla=')) return undefined
  const token = window.location.hash.slice('#reset-hasla='.length)
  // Fragment nie trafia do serwera; usuwamy go także z bieżącego wpisu historii.
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  return token
}

export function FormularzLinkuResetowania({ powrot, etykietaPowrotu = 'Wróć do logowania i kodów odzyskiwania' }: { powrot: () => void; etykietaPowrotu?: string }) {
  const [email, ustawEmail] = useState('')
  const [komunikat, ustawKomunikat] = useState('')
  const [blad, ustawBlad] = useState('')
  const [zajety, ustawZajety] = useState(false)
  const wyslij = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (zajety) return
    ustawZajety(true); ustawBlad(''); ustawKomunikat('')
    try { ustawKomunikat(await poprosOLinkResetowaniaHasla(email)) }
    catch { ustawBlad('Nie udało się połączyć z serwerem. Spróbuj ponownie później.') }
    finally { ustawZajety(false) }
  }
  return <>
    <h1>Nie pamiętasz hasła?</h1>
    <p>Podaj adres e-mail swojego konta. Otrzymany link otwórz przy połączeniu z prywatną siecią Tailscale.</p>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {komunikat && <p role="status">{komunikat}</p>}
    <form className="formularz" onSubmit={wyslij}>
      <label className="pole pole--pelne"><span>E-mail konta</span><input type="email" autoComplete="email" maxLength={254} required value={email} onChange={(zdarzenie) => ustawEmail(zdarzenie.target.value)} /></label>
      <button className="przycisk przycisk--glowny" disabled={zajety || Boolean(komunikat)}>{zajety ? 'Proszę czekać…' : 'Wyślij link'}</button>
    </form>
    <button type="button" className="przycisk przycisk--tekstowy" disabled={zajety} onClick={powrot}>{etykietaPowrotu}</button>
  </>
}

export function EkranResetowaniaHasla({ token: poczatkowyToken }: { token: string }) {
  const [token, ustawToken] = useState(poczatkowyToken)
  const [haslo, ustawHaslo] = useState('')
  const [powtorzoneHaslo, ustawPowtorzoneHaslo] = useState('')
  const [blad, ustawBlad] = useState('')
  const [gotowe, ustawGotowe] = useState(false)
  const [zajety, ustawZajety] = useState(false)
  const zapisz = async (zdarzenie: FormEvent) => {
    zdarzenie.preventDefault()
    if (zajety) return
    if (haslo !== powtorzoneHaslo) { ustawBlad('Nowe hasła muszą być jednakowe.'); return }
    ustawZajety(true); ustawBlad('')
    const noweHaslo = haslo
    ustawHaslo(''); ustawPowtorzoneHaslo('')
    try { await ustawHasloPrzezLink(token, noweHaslo); ustawToken(''); ustawGotowe(true) }
    catch (przyczyna) { ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Nie udało się ustawić hasła.') }
    finally { ustawZajety(false) }
  }
  return <main className="ekran-konta"><section className="karta ekran-konta__panel">
    <h1>Ustaw nowe hasło</h1>
    {gotowe ? <p role="status">Hasło zostało zmienione. Wszystkie dotychczasowe sesje zostały wylogowane. Zaloguj się nowym hasłem.</p> : <>
      <p>Link jest jednorazowy i ważny 15 minut. Zmiana hasła wyloguje wszystkie sesje tego konta.</p>
      {blad && <Komunikat typ="blad">{blad}</Komunikat>}
      <form className="formularz" onSubmit={zapisz}>
        <label className="pole pole--pelne"><span>Nowe hasło</span><input type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={haslo} onChange={(zdarzenie) => ustawHaslo(zdarzenie.target.value)} /></label>
        <label className="pole pole--pelne"><span>Powtórz nowe hasło</span><input type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={powtorzoneHaslo} onChange={(zdarzenie) => ustawPowtorzoneHaslo(zdarzenie.target.value)} /></label>
        <button className="przycisk przycisk--glowny" disabled={zajety}>{zajety ? 'Proszę czekać…' : 'Ustaw nowe hasło'}</button>
      </form>
    </>}
    <button type="button" className="przycisk przycisk--tekstowy" disabled={zajety} onClick={() => window.location.replace('/')}>Przejdź do logowania</button>
  </section></main>
}
