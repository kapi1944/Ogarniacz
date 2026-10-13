import { useState } from 'react'
import type { ProfilLokalny } from '../data/ProfileLokalne'
import { rejestrProfili } from '../data/ProfileLokalne'
import { migrujDaneDoProfilu, utworzZaszyfrowanaKopieMigracji } from '../services/MigracjaProfili'
import { platforma } from '../platform/platforma'
import { wyloguj } from '../services/KontaService'

export function EkranMigracjiProfilu({ profil }: { profil: ProfilLokalny }) {
  const [potwierdzone, ustawPotwierdzone] = useState(false)
  const [haslo, ustawHaslo] = useState('')
  const [blad, ustawBlad] = useState('')
  const [zajety, ustawZajety] = useState(false)
  const [kopia, ustawKopie] = useState(false)
  const wykonaj = async (operacja: () => Promise<void>) => {
    ustawZajety(true); ustawBlad('')
    try { await operacja() } catch (przyczyna) { ustawBlad(przyczyna instanceof Error ? przyczyna.message : 'Operacja nie powiodła się.') }
    finally { ustawZajety(false); ustawHaslo('') }
  }
  return <main className="ekran-konta"><section className="karta"><h1>Przypisanie dotychczasowych danych</h1>
    <p>Zalogowano: {profil.konto.email}. Stara baza zostanie zachowana. Dane nie zostaną przypisane automatycznie.</p>
    {blad && <p role="alert">{blad}</p>}
    <label className="pole pole-checkbox"><input type="checkbox" checked={potwierdzone} onChange={(zdarzenie) => ustawPotwierdzone(zdarzenie.target.checked)} /><span>Potwierdzam, że dotychczasowe dane na tym urządzeniu należą do mojego konta.</span></label>
    <label className="pole"><span>Hasło kopii bezpieczeństwa</span><input type="password" autoComplete="new-password" value={haslo} onChange={(zdarzenie) => ustawHaslo(zdarzenie.target.value)} /></label>
    <button type="button" className="przycisk" disabled={zajety || !haslo} onClick={() => void wykonaj(async () => {
      const plik = await utworzZaszyfrowanaKopieMigracji(haslo)
      const zapisano = await platforma.pliki.zapisz('ogarniacz-przed-migracja.json', new Blob([JSON.stringify(plik)], { type: 'application/json' }))
      if (!zapisano) throw new Error('Nie zapisano kopii. Migracja pozostaje zablokowana.')
      ustawKopie(true)
    })}>Zapisz zaszyfrowaną kopię</button>
    <button type="button" className="przycisk przycisk--glowny" disabled={zajety || !potwierdzone || !kopia} onClick={() => void wykonaj(async () => {
      await migrujDaneDoProfilu(profil, { wlascicielId: profil.wlascicielId, potwierdzonoPrzypisanie: true })
      await rejestrProfili.stan.put({ id: 'zrodlo-legacy', profilId: profil.id })
      window.location.reload()
    })}>Skopiuj i zweryfikuj dane</button>
    <p>Jeżeli to nie są Twoje dane, wyloguj się i użyj konta ich Właściciela.</p>
    <button type="button" className="przycisk" disabled={zajety} onClick={() => void wykonaj(async () => {
      await rejestrProfili.stan.put({ id: 'bez-migracji:' + profil.id })
      window.location.reload()
    })}>Rozpocznij z pustą bazą, zachowując stare dane</button>
    <button type="button" className="przycisk" disabled={zajety} onClick={() => void wykonaj(wyloguj)}>Wyloguj</button>
  </section></main>
}
