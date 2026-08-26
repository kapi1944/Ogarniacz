import { Link } from 'react-router-dom'
import { AlertCircle, CalendarClock, Check, Clock3, MessageCircle, Pill, Plus, Sparkles } from 'lucide-react'
import { Karta, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { dzisiajIso } from '../../domain/fabryki'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { aktywnePrzypomnienia, zakonczPrzypomnienie } from '../../services/PrzypomnieniaService'
import { czyZadanieNaDzis, czyZadanieZalegle, ukonczZadanie } from '../../services/ZadaniaService'
import { generujDawkiDnia, zapiszStatusDawki } from '../../services/LekiService'
import { useAplikacja } from '../../app/KontekstAplikacji'

export function WidokPulpitu() {
  const data = dzisiajIso()
  const teraz = new Date()
  const { moze, otworzSzybkieDodawanie } = useAplikacja()
  const { dane: zadania, repozytorium: repoZadan } = useRepozytorium('zadania')
  const { dane: leki } = useRepozytorium('leki')
  const { dane: wpisyLekow, repozytorium: repoWpisow } = useRepozytorium('dziennikLekow')
  const { dane: przypomnienia, repozytorium: repoPrzypomnien } = useRepozytorium('przypomnienia')
  const { dane: bloki } = useRepozytorium('blokiCzasu')
  const { dane: wizyty } = useRepozytorium('wizyty')
  const { dane: rachunki } = useRepozytorium('rachunki')
  const { dane: terminy } = useRepozytorium('terminyWaznosci')
  const { dane: nawyki } = useRepozytorium('nawyki')
  const dawki = moze('leki') ? generujDawkiDnia(leki, wpisyLekow, data) : []
  const zalegle = moze('zadania') ? zadania.filter((zadanie) => czyZadanieZalegle(zadanie, data)) : []
  const dzisiejsze = moze('zadania') ? zadania.filter((zadanie) => czyZadanieNaDzis(zadanie, data)) : []
  const aktywne = moze('przypomnienia') ? aktywnePrzypomnienia(przypomnienia, teraz) : []
  const rachunkiDoReakcji = moze('rachunki') ? rachunki.filter((rachunek) => rachunek.status === 'niezaplacony' && rachunek.termin <= data) : []
  const terminyBlisko = moze('terminy') ? terminy.filter((termin) => termin.status !== 'odnowione' && termin.dataWaznosci <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)) : []
  const wizytyDzis = moze('wizyty') ? wizyty.filter((wizyta) => wizyta.status === 'umowiona' && wizyta.data === data) : []
  const blokiDzis = moze('planer') ? bloki.filter((blok) => blok.poczatek.startsWith(data) && ['zaakceptowany', 'propozycja'].includes(blok.status)) : []
  const biezacyBlok = blokiDzis.find((blok) => Date.parse(blok.poczatek) <= teraz.getTime() && Date.parse(blok.koniec) > teraz.getTime())
  const nastepnyBlok = blokiDzis.filter((blok) => Date.parse(blok.poczatek) > teraz.getTime()).sort((a, b) => a.poczatek.localeCompare(b.poczatek))[0]
  const wagaPriorytetu = { niski: 0, normalny: 1, wysoki: 2, krytyczny: 3 }
  const najwazniejsze = [...zalegle, ...dzisiejsze].sort((a, b) => wagaPriorytetu[b.priorytet] - wagaPriorytetu[a.priorytet])[0]
  const liczbaReakcji = zalegle.length + dzisiejsze.length + aktywne.length + rachunkiDoReakcji.length + terminyBlisko.length + dawki.filter((dawka) => dawka.status === 'oczekuje').length

  const osDnia = [
    ...blokiDzis.map((blok) => ({ id: blok.id, czas: new Date(blok.poczatek).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }), tytul: blok.tytul, typ: blok.typ })),
    ...wizytyDzis.map((wizyta) => ({ id: `wizyta-${wizyta.id}`, czas: wizyta.godzina ?? '—', tytul: wizyta.nazwa, typ: 'wizyta' })),
    ...dawki.map((dawka) => ({ id: dawka.idWystapienia, czas: dawka.planowanaGodzina, tytul: `${dawka.lek.nazwa} — ${dawka.lek.dawkaInstrukcja}`, typ: 'lek' })),
  ].sort((a, b) => a.czas.localeCompare(b.czas))

  const wykonaj = async (zadanie: (typeof zadania)[number]) => {
    const wynik = ukonczZadanie(zadanie)
    await repoZadan.zapisz(wynik.wykonane)
    if (wynik.nastepne) await repoZadan.zapisz(wynik.nastepne)
  }
  const zamknijReminder = async (element: (typeof przypomnienia)[number]) => {
    const wynik = zakonczPrzypomnienie(element)
    await repoPrzypomnien.zapisz(wynik.wykonane)
    if (wynik.nastepne) await repoPrzypomnien.zapisz(wynik.nastepne)
  }

  return <div className="widok widok-dzisiaj">
        <NaglowekWidoku
      tytul="Pulpit"
      opis={new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(teraz)}
      akcje={<button type="button" className="przycisk przycisk--glowny" onClick={otworzSzybkieDodawanie}><Plus aria-hidden="true" />Szybko dodaj</button>}
    />

    <section className="siatka-teraz">
      <Karta klasa="karta--akcent">
        <div className="tytul-karty"><Clock3 aria-hidden="true" /><span>Teraz</span></div>
        <h2>{biezacyBlok?.tytul ?? najwazniejsze?.tytul ?? 'Brak pilnego działania'}</h2>
        <p>{biezacyBlok ? `Do ${new Date(biezacyBlok.koniec).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : najwazniejsze ? `Priorytet: ${najwazniejsze.priorytet}` : 'Możesz spokojnie zaplanować następny krok.'}</p>
      </Karta>
      <Karta>
        <div className="tytul-karty"><CalendarClock aria-hidden="true" /><span>Następne działanie</span></div>
        <h2>{nastepnyBlok?.tytul ?? najwazniejsze?.tytul ?? 'Zaplanuj dzień'}</h2>
        <p>{nastepnyBlok ? `Start ${new Date(nastepnyBlok.poczatek).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : 'Planer przygotuje realistyczną propozycję z buforem.'}</p>
      </Karta>
      <Karta klasa={liczbaReakcji ? 'karta--ostrzezenie' : ''}>
        <div className="tytul-karty"><AlertCircle aria-hidden="true" /><span>Wymaga reakcji</span></div>
        <h2>{liczbaReakcji}</h2>
        <p>{liczbaReakcji ? 'elementów czeka na świadomą decyzję' : 'Wszystko jest pod kontrolą.'}</p>
      </Karta>
    </section>

    <section className="siatka-dashboardu">
      <Karta klasa="karta--os-dnia">
        <div className="naglowek-karty"><div><h2>Oś dnia</h2><p>Plan, wizyty i dawki w jednej kolejności.</p></div>{moze('planer') && <Link className="przycisk przycisk--drugorzedny" to="/planer?tryb=dzien">Zaplanuj mi dzień / wieczór</Link>}</div>
        {osDnia.length === 0 ? <PustyStan tytul="Brak wpisów na osi" opis="Dodaj blok, wizytę lub lek. Nie oznacza to, że cały dzień trzeba zapełnić." /> : <div className="os-dnia">{osDnia.map((element) => <div className="os-dnia__element" key={element.id}><time>{element.czas}</time><span className="os-dnia__punkt" /><div><strong>{element.tytul}</strong><small>{element.typ}</small></div></div>)}</div>}
      </Karta>

      <div className="kolumna-dashboardu">
        <Karta>
          <div className="naglowek-karty"><div><h2>Zadania wymagające reakcji</h2><p>Zaległe i dzisiejsze.</p></div>{moze('zadania') && <Link to="/zadania">Wszystkie</Link>}</div>
          {[...zalegle, ...dzisiejsze].length === 0 ? <PustyStan tytul="Brak pilnych zadań" opis="Nie ma zaległych ani dzisiejszych zadań." /> : <div className="lista-kompaktowa">{[...zalegle, ...dzisiejsze].slice(0, 6).map((zadanie) => <div key={zadanie.id}><button type="button" className="przycisk-check" disabled={!moze('zadania', 'edycja')} onClick={() => wykonaj(zadanie)} title="Wykonaj"><Check aria-hidden="true" /></button><div><strong>{zadanie.tytul}</strong><small>{czyZadanieZalegle(zadanie) ? `Zaległe od ${zadanie.termin}` : 'Na dzisiaj'}</small></div><Znacznik wariant={zadanie.priorytet === 'krytyczny' ? 'blad' : zadanie.priorytet === 'wysoki' ? 'ostrzezenie' : 'neutralny'}>{zadanie.priorytet}</Znacznik></div>)}</div>}
        </Karta>

        {moze('leki') && <Karta>
          <div className="naglowek-karty"><div><h2><Pill aria-hidden="true" /> Leki</h2><p>Wyłącznie harmonogram wpisany przez użytkownika.</p></div><Link to="/leki">Zarządzaj</Link></div>
          {dawki.length === 0 ? <PustyStan tytul="Brak dawek na dziś" opis="Nie ma aktywnego harmonogramu." /> : <div className="lista-dawek">{dawki.map((dawka) => <div key={dawka.idWystapienia}><time>{dawka.planowanaGodzina}</time><div><strong>{dawka.lek.nazwa}</strong><small>{dawka.lek.dawkaInstrukcja}</small></div><select disabled={!moze('leki', 'edycja')} aria-label={`Status dawki ${dawka.lek.nazwa}`} value={dawka.status} onChange={(e) => repoWpisow.zapisz(zapiszStatusDawki(dawka, e.target.value as typeof dawka.status))}><option value="oczekuje">Oczekuje</option><option value="zazyte">Zażyte</option><option value="odroczone">Odroczone</option><option value="pominiete">Pominięte</option></select></div>)}</div>}
        </Karta>}
      </div>
    </section>

    <section className="siatka-reakcji">
      {moze('przypomnienia') && <Karta><h2>Przypomnienia</h2>{aktywne.length === 0 ? <p className="tekst-pomocniczy">Brak aktywnych przypomnień.</p> : aktywne.slice(0, 4).map((element) => <div className="wiersz-reakcji" key={element.id}><span>{element.tytul}</span><button type="button" disabled={!moze('przypomnienia', 'edycja')} className="przycisk przycisk--maly" onClick={() => zamknijReminder(element)}>Zrobione</button></div>)}</Karta>}
      {moze('rachunki') && <Karta><h2>Płatności</h2>{rachunkiDoReakcji.length === 0 ? <p className="tekst-pomocniczy">Brak zaległych płatności.</p> : rachunkiDoReakcji.map((element) => <div className="wiersz-reakcji" key={element.id}><span>{element.nazwa}</span><strong>{element.kwota.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</strong></div>)}</Karta>}
      {moze('terminy') && <Karta><h2>Terminy ważności</h2>{terminyBlisko.length === 0 ? <p className="tekst-pomocniczy">Nic nie wygasa w ciągu 30 dni.</p> : terminyBlisko.map((element) => <div className="wiersz-reakcji" key={element.id}><span>{element.nazwa}</span><strong>{element.dataWaznosci}</strong></div>)}</Karta>}
      {moze('nawyki') && <Karta><h2>Nawyki</h2><p className="tekst-pomocniczy">Aktywne dziś: {nawyki.filter((nawyk) => nawyk.aktywny).length}. Zapisuj także minimalną wersję — pojedyncza przerwa nie zeruje postępu.</p><Link to="/nawyki">Otwórz nawyki</Link></Karta>}
    </section>

    {moze('echo') && <Karta klasa="karta-echo"><Sparkles aria-hidden="true" /><div><h2>Echo</h2><p>{liczbaReakcji > 4 ? 'Masz kilka elementów wymagających reakcji. Zacznij od jednego zadania o najwyższym priorytecie.' : 'Dzień wygląda spokojnie. Mogę podsumować zadania albo szybko zapisać nową rzecz.'}</p></div><Link className="przycisk przycisk--drugorzedny" to="/echo"><MessageCircle aria-hidden="true" />Porozmawiaj</Link></Karta>}
  </div>
}
