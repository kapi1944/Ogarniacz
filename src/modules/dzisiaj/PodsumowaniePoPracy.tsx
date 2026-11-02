import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat, Znacznik } from '../../components/Interfejs'
import { pobierzDanePodsumowaniaPoPracy, utworzPodsumowaniePoPracy, czyDostepPodsumowaniaPoPracy, czyPodsumowaniePoPracyWlaczone } from '../../services/PodsumowaniePoPracyService'
import { useSzybkieDzialaniaDnia } from './useSzybkieDzialaniaDnia'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { profilPodsumowaniaPoPracy } from '../../services/PodsumowaniePoPracyService'

export function PodsumowaniePoPracy({ teraz }: { teraz: Date }) {
  const { ustawienia, moze, gotowyDostep } = useAplikacja()
  const [parametry] = useSearchParams()
  const dataZLinku = parametry.get('poPracy')
  const data = /^\d{4}-\d{2}-\d{2}$/.test(dataZLinku ?? '') ? dataZLinku : undefined
  const dzialania = useSzybkieDzialaniaDnia(() => czyDostepPodsumowaniaPoPracy() && moze('zadania', 'edycja'))
  const wynik = useLiveQuery(async () => {
    if (!gotowyDostep || !czyDostepPodsumowaniaPoPracy()) return undefined
    const dane = await pobierzDanePodsumowaniaPoPracy(ustawienia)
    if (!dane) return undefined
    if (data) {
      const przypomnienia = await pobierzRepozytorium('przypomnienia').lista()
      const historyczne = przypomnienia.find((element) => element.echoPoPracy?.data === data && element.echoPoPracy.profilId === profilPodsumowaniaPoPracy())
      return utworzPodsumowaniePoPracy(data, dane, historyczne?.czas)
    }
    if (!czyPodsumowaniePoPracyWlaczone(ustawienia)) return undefined
    return [format(teraz, 'yyyy-MM-dd'), format(addDays(teraz, -1), 'yyyy-MM-dd')]
      .map((dzien) => utworzPodsumowaniePoPracy(dzien, dane))
      .find((podsumowanie) => podsumowanie && Date.parse(podsumowanie.termin) <= teraz.getTime())
  }, [ustawienia, gotowyDostep, data, teraz.getTime()])

  if (!gotowyDostep || !wynik || !czyDostepPodsumowaniaPoPracy()) return null
  const etykiety = { krytyczny: 'Krytyczny', wysoki: 'Wysoki', normalny: 'Normalny', niski: 'Niski' }
  return <Karta klasa="podsumowanie-po-pracy">
    <h2>🏠 Podsumowanie po pracy</h2>
    <p>{wynik.data} · Zaległe: {wynik.liczbaZaleglych} · Na dzisiaj: {wynik.liczbaNaDzisiaj}</p>
    {dzialania.komunikat && <Komunikat typ={dzialania.komunikat.typ}>{dzialania.komunikat.tresc}</Komunikat>}
    {wynik.liczbaRazem === 0 ? <p>Nie masz już zadań w tym podsumowaniu.</p> : ([['Zaległe', wynik.zalegle], ['Na dzisiaj', wynik.dzisiaj]] as const).map(([tytul, zadania]) => <section key={tytul} aria-label={tytul}>
      <h3>{tytul} ({zadania.length})</h3>
      <div className="lista-kompaktowa" role="list">{zadania.map(({ element, priorytet }) => <div role="listitem" key={element.id}>
        <div><Link to={`/zadania?element=${encodeURIComponent(element.id)}`}>{element.tytul}</Link><small>{element.data ?? element.terminGraniczny?.slice(0, 10)}{element.godzina ? `, ${element.godzina}` : ' · bez godziny'}</small></div>
        <Znacznik wariant={priorytet === 'krytyczny' || priorytet === 'wysoki' ? 'ostrzezenie' : 'neutralny'}>{etykiety[priorytet]}</Znacznik>
        <button type="button" className="przycisk przycisk--maly" aria-label={`Wykonaj: ${element.tytul}`} disabled={!moze('zadania', 'edycja') || dzialania.zapisywane.has(element.id)} onClick={() => void dzialania.zmien(element, 'wykonaj')}>{dzialania.zapisywane.has(element.id) ? 'Zapisywanie…' : 'Wykonaj'}</button>
      </div>)}</div>
    </section>)}
  </Karta>
}
