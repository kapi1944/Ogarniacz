import { useState } from 'react'
import { Karta, NaglowekWidoku, Znacznik } from '../../components/Interfejs'
import { WidokRejestru } from '../../components/WidokRejestru'
import { dzisiajIso, terazIso, utworzMetadane } from '../../domain/fabryki'
import type { Budzet, Wydatek } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'

export function WidokFinansow() {
  const [miesiac, ustawMiesiac] = useState(dzisiajIso().slice(0, 7))
  const { dane: wydatki, repozytorium: repoWydatkow } = useRepozytorium('wydatki')
  const { dane: budzety, repozytorium: repoBudzetow } = useRepozytorium('budzety')
  const miesieczne = wydatki.filter((wydatek) => wydatek.data.startsWith(miesiac))
  const suma = miesieczne.reduce((wynik, wydatek) => wynik + wydatek.kwota, 0)
  const limity = budzety.filter((budzet) => budzet.okres === miesiac)
  const limit = limity.reduce((wynik, budzet) => wynik + budzet.limit, 0)
  const kategorie = Object.entries(miesieczne.reduce<Record<string, number>>((wynik, wydatek) => ({ ...wynik, [wydatek.kategoria]: (wynik[wydatek.kategoria] ?? 0) + wydatek.kwota }), {})).sort((a, b) => b[1] - a[1])
  return <div className="widok">
    <NaglowekWidoku tytul="Wydatki i budżet" opis="Praktyczny rejestr i limity — bez udawania pełnej księgowości." akcje={<label className="pole-inline"><span>Miesiąc</span><input type="month" value={miesiac} onChange={(e) => ustawMiesiac(e.target.value)} /></label>} />
    <div className="podsumowanie-finansowe"><Karta><small>Wydano</small><strong>{suma.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</strong></Karta><Karta><small>Limit</small><strong>{limit ? limit.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' }) : 'brak'}</strong></Karta><Karta><small>Pozostało</small><strong className={limit && limit - suma < 0 ? 'tekst-bledu' : ''}>{limit ? (limit - suma).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' }) : '—'}</strong></Karta></div>
    {kategorie.length > 0 && <Karta><h2>Wydatki według kategorii</h2><div className="wykres-kategorii">{kategorie.map(([nazwa, kwota]) => <div key={nazwa}><div><span>{nazwa}</span><strong>{kwota.toFixed(2)} zł</strong></div><span className="wykres-kategorii__tor"><span style={{ width: `${Math.max(3, (kwota / suma) * 100)}%` }} /></span></div>)}</div></Karta>}
    <section className="siatka-dwie-kolumny siatka-dwie-kolumny--rowne">
      <WidokRejestru tytul="Wydatki" opis="Kwota, data, kategoria i opis." etykietaDodawania="Dodaj wydatek" dane={wydatki} repozytorium={repoWydatkow} pola={[{ klucz: 'opis', etykieta: 'Opis', wymagane: true }, { klucz: 'kwota', etykieta: 'Kwota', typ: 'number', wymagane: true, min: 0.01, krok: 0.01 }, { klucz: 'data', etykieta: 'Data', typ: 'date', wymagane: true }, { klucz: 'kategoria', etykieta: 'Kategoria', wymagane: true }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), opis: f.opis.trim(), kwota: Number(f.kwota), data: f.data || dzisiajIso(), kategoria: f.kategoria.trim(), updatedAt: terazIso() } as Wydatek)} etykieta={(x) => x.opis} szczegoly={(x) => <><strong>{x.kwota.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</strong><Znacznik>{x.kategoria}</Znacznik><span>{x.data}</span></>} />
      <WidokRejestru tytul="Budżety" opis="Limity kategorii lub całego okresu." etykietaDodawania="Dodaj budżet" dane={budzety} repozytorium={repoBudzetow} pola={[{ klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true }, { klucz: 'kategoria', etykieta: 'Kategoria (opcjonalna)' }, { klucz: 'okres', etykieta: 'Miesiąc', typ: 'text', wymagane: true, podpowiedz: 'YYYY-MM' }, { klucz: 'limit', etykieta: 'Limit', typ: 'number', wymagane: true, min: 0.01, krok: 0.01 }]} zbuduj={(f, e) => ({ ...(e ?? utworzMetadane()), nazwa: f.nazwa.trim(), kategoria: f.kategoria || undefined, okres: f.okres, limit: Number(f.limit), updatedAt: terazIso() } as Budzet)} etykieta={(x) => x.nazwa} szczegoly={(x) => <><strong>{x.limit.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</strong><span>{x.okres}</span>{x.kategoria && <Znacznik>{x.kategoria}</Znacznik>}</>} />
    </section>
  </div>
}
