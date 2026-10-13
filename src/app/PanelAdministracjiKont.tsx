import { useState } from 'react'
import { ModalPotwierdzenia } from '../components/Interfejs'
import { pobierzUzytkownikow, zapiszUzytkownika, resetujHasloUzytkownika, type KontoAdministracyjne } from '../services/KontaService'

const STATUSY = { aktywne: 'Aktywne', nieaktywne: 'Zablokowane', zarchiwizowane: 'Zarchiwizowane' }
const ROLE = { administrator: 'Administrator systemu', uzytkownik: 'Użytkownik' }
const PUSTE = { email: '', login: '', nazwa: '', rolaSystemowa: 'uzytkownik', statusKonta: 'aktywne' } as const

export function PanelAdministracjiKont() {
  const [konta, ustawKonta] = useState<KontoAdministracyjne[]>([])
  const [formularz, ustawFormularz] = useState<Partial<KontoAdministracyjne>>(PUSTE)
  const [haslo, ustawHaslo] = useState('')
  const [blad, ustawBlad] = useState('')
  const [zajety, ustawZajety] = useState(false)
  const [resetDoPotwierdzenia, ustawResetDoPotwierdzenia] = useState<{ id: string; haslo: string }>()
  const [komunikat, ustawKomunikat] = useState('')
  const wykonaj = async (operacja: () => Promise<void>) => {
    if (zajety) return
    ustawZajety(true); ustawBlad(''); ustawKomunikat('')
    try { await operacja(); ustawKonta(await pobierzUzytkownikow()); ustawKomunikat('Dane kont zostały odświeżone.') }
    catch (przyczyna) { ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Operacja nie powiodła się.') }
    finally { ustawZajety(false); ustawHaslo('') }
  }
  return <section><h3>Zarządzanie użytkownikami</h3>
    <p>Administrator zarządza kontami. Dostęp do danych wymaga osobnego udostępnienia przez Właściciela.</p>
    {blad && <p role="alert">{blad}</p>}
    {komunikat && <p role="status">{komunikat}</p>}
    <button type="button" className="przycisk" disabled={zajety} onClick={() => void wykonaj(async () => {})}>Pokaż konta</button>
    {konta.map((konto) => <div key={konto.id} className="wiersz-konta"><span>{konto.nazwa || konto.email} · {ROLE[konto.rolaSystemowa]} · {STATUSY[konto.statusKonta]}</span><button type="button" disabled={zajety} onClick={() => { ustawFormularz(konto); ustawHaslo('') }}>Edytuj konto</button></div>)}
    <button type="button" disabled={zajety} onClick={() => ustawFormularz(PUSTE)}>Dodaj użytkownika</button>
    <form className="formularz" onSubmit={(zdarzenie) => { zdarzenie.preventDefault(); void wykonaj(async () => { await zapiszUzytkownika({ ...formularz, haslo }); ustawFormularz(PUSTE) }) }}>
      <label className="pole"><span>E-mail użytkownika</span><input type="email" required value={formularz.email ?? ''} onChange={(zdarzenie) => ustawFormularz({ ...formularz, email: zdarzenie.target.value })} /></label>
      <label className="pole"><span>Login</span><input maxLength={254} value={formularz.login ?? ''} onChange={(zdarzenie) => ustawFormularz({ ...formularz, login: zdarzenie.target.value })} /></label>
      <label className="pole"><span>Nazwa użytkownika</span><input maxLength={200} value={formularz.nazwa ?? ''} onChange={(zdarzenie) => ustawFormularz({ ...formularz, nazwa: zdarzenie.target.value })} /></label>
      <label className="pole"><span>Rola systemowa</span><select value={formularz.rolaSystemowa} onChange={(zdarzenie) => ustawFormularz({ ...formularz, rolaSystemowa: zdarzenie.target.value as KontoAdministracyjne['rolaSystemowa'] })}>{Object.entries(ROLE).map(([klucz, nazwa]) => <option key={klucz} value={klucz}>{nazwa}</option>)}</select></label>
      <label className="pole"><span>Status konta</span><select value={formularz.statusKonta} onChange={(zdarzenie) => ustawFormularz({ ...formularz, statusKonta: zdarzenie.target.value as KontoAdministracyjne['statusKonta'] })}>{Object.entries(STATUSY).map(([klucz, nazwa]) => <option key={klucz} value={klucz}>{nazwa}</option>)}</select></label>
      <label className="pole"><span>Hasło tymczasowe</span><input type="password" autoComplete="new-password" minLength={8} maxLength={200} required={!formularz.id} value={haslo} onChange={(zdarzenie) => ustawHaslo(zdarzenie.target.value)} /></label>
      <button type="submit" className="przycisk" disabled={zajety}>Zapisz konto</button>
      {formularz.id && <button type="button" className="przycisk przycisk--niebezpieczny" disabled={zajety || haslo.length < 8} onClick={() => { ustawResetDoPotwierdzenia({ id: formularz.id!, haslo }); ustawHaslo('') }}>Resetuj hasło i wyloguj sesje</button>}
    </form>
    {resetDoPotwierdzenia && <ModalPotwierdzenia tytul="Reset hasła użytkownika" opis="Wszystkie sesje i dotychczasowe kody odzyskiwania tego użytkownika zostaną unieważnione. Przekaż hasło tymczasowe bezpiecznym kanałem. Użytkownik będzie musiał je zmienić." etykietaAkcji="Potwierdź reset hasła" niebezpieczne anuluj={() => ustawResetDoPotwierdzenia(undefined)} potwierdz={() => {
      const dane = resetDoPotwierdzenia
      ustawResetDoPotwierdzenia(undefined)
      return wykonaj(() => resetujHasloUzytkownika(dane.id, dane.haslo))
    }} />}
  </section>
}
