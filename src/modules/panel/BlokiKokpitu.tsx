import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckSquare, MessageCircle } from 'lucide-react'
import { SekcjaDom } from './SekcjaDom'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { pobierzKonfiguracjeSynchronizacji } from '../../services/KonfiguracjaSynchronizacji'
import { skrotyKokpitu, type BlokKokpitu, type TrybKokpitu } from '../../domain/kokpit'
import type { Przypomnienie, Zadanie } from '../../domain/typy'
import type { KontoUzytkownika } from '../../services/KontaService'
import { ukonczZadanie } from '../../services/ZadaniaService'
import { aktywnePrzypomnienia, odroczPrzypomnienie } from '../../services/PrzypomnieniaService'
import { obliczWykorzystanieBudzetow } from '../../services/FinanseService'
import { useAkcjaKokpitu } from './useAkcjaKokpitu'
const odmowPrywatnychDanych = () => false
const zrodlaWrazliwe = new Set(['zdrowie', 'leki', 'wizyty', 'skierowania', 'dokumenty', 'recepty', 'terapie', 'wpisyTerapii', 'wynikiBadan', 'wpisySamopoczucia'])

function czyZwykleZadanie(zadanie: Zadanie) {
  return !zadanie.sesjaTerapiiId && !zadanie.powiazania?.some((relacja) => zrodlaWrazliwe.has(relacja.typ))
}

function SkrotZadan({ data, filtr, sesja }: { data: string; filtr: BlokKokpitu['filtr']; sesja?: KontoUzytkownika }) {
  const { dane: zadania, repozytorium } = useRepozytorium('zadania', odmowPrywatnychDanych)
  const akcja = useAkcjaKokpitu('zadania', sesja)
  const otwarte = zadania.filter((zadanie) => czyZwykleZadanie(zadanie) && zadanie.status !== 'wykonane')
  const dzisiaj = otwarte.filter((zadanie) => zadanie.termin?.slice(0, 10) === data)
  const zalegle = otwarte.filter((zadanie) => zadanie.termin && zadanie.termin.slice(0, 10) < data)
  const pilne = otwarte.filter((zadanie) => ['wysoki', 'krytyczny'].includes(zadanie.priorytet))
  const wybrane = { dzisiaj, zalegle, priorytet: pilne }[filtr]
  return <>
    <p><strong>{wybrane.length}</strong> {{ dzisiaj: 'zadań na dziś', zalegle: 'zadań zaległych', priorytet: 'zadań o wysokim priorytecie' }[filtr]}</p>
    {filtr === 'dzisiaj' && <p className="kokpit__szczegoly">Zaległe: {zalegle.length}</p>}
    {sesja && <ul className="kokpit__lista">{wybrane.slice(0, 3).map((zadanie) => <li key={zadanie.id}>
      <span>{zadanie.tytul}</span>
      {akcja.mozna && <button className="przycisk-ikona" type="button" disabled={akcja.zajety} aria-label={`Wykonaj zadanie: ${zadanie.tytul}`}
        onClick={() => void akcja.wykonaj(zadanie.id, async () => {
          const aktualne = await repozytorium.pobierz(zadanie.id)
          if (!aktualne || aktualne.status === 'wykonane' || !czyZwykleZadanie(aktualne)) return
          const { wykonane, nastepne } = ukonczZadanie(aktualne)
          await repozytorium.zapiszWiele(nastepne ? [wykonane, nastepne] : [wykonane])
        })}>✓</button>}
    </li>)}</ul>}
    {akcja.blad && <p role="alert">{akcja.blad}</p>}
    <Link className="przycisk przycisk--drugorzedny" to="/zadania"><CheckSquare aria-hidden="true" />Otwórz zadania</Link>
  </>
}

function czyZwyklePrzypomnienie(przypomnienie: Przypomnienie) {
  return !przypomnienie.dawkaLeku && !przypomnienie.echoPoPracy
    && (!przypomnienie.zrodlo || !zrodlaWrazliwe.has(przypomnienie.zrodlo.typ))
}

function SkrotPrzypomnien({ sesja }: { sesja?: KontoUzytkownika }) {
  const { dane, repozytorium } = useRepozytorium('przypomnienia', odmowPrywatnychDanych)
  const akcja = useAkcjaKokpitu('przypomnienia', sesja)
  const przypomnienia = aktywnePrzypomnienia(dane.filter(czyZwyklePrzypomnienie))
  return <>
    <p>{przypomnienia.length} aktywnych</p>
    {sesja && <ul className="kokpit__lista">{przypomnienia.slice(0, 3).map((przypomnienie) => <li key={przypomnienie.id}>
      <span>{przypomnienie.tytul}</span>
      {akcja.mozna && <button className="przycisk" type="button" disabled={akcja.zajety} aria-label={`Odłóż przypomnienie: ${przypomnienie.tytul}`}
        onClick={() => void akcja.wykonaj(przypomnienie.id, async () => {
          const aktualne = await repozytorium.pobierz(przypomnienie.id)
          if (aktualne && czyZwyklePrzypomnienie(aktualne) && aktywnePrzypomnienia([aktualne]).length) await repozytorium.zapisz(odroczPrzypomnienie(aktualne, 15))
        })}>+15 min</button>}
    </li>)}</ul>}
    {akcja.blad && <p role="alert">{akcja.blad}</p>}
  </>
}

function SkrotKalendarza({ data, prywatny }: { data: string; prywatny: boolean }) {
  const { dane } = useRepozytorium('terminyWaznosci', odmowPrywatnychDanych)
  const najblizszy = dane.filter((termin) => !termin.dokumentId && termin.status !== 'odnowione' && termin.dataWaznosci >= data)
    .sort((a, b) => a.dataWaznosci.localeCompare(b.dataWaznosci))[0]
  return najblizszy ? <><p>Najbliższy termin: <time dateTime={najblizszy.dataWaznosci}>{najblizszy.dataWaznosci}</time></p>{prywatny && <p>{najblizszy.nazwa}</p>}</>
    : <p>Brak nadchodzących terminów.</p>
}

const formatPLN = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })
function SkrotFinansow({ miesiac, prywatny }: { miesiac: string; prywatny: boolean }) {
  const { dane: budzety } = useRepozytorium('budzety')
  const { dane: wydatki } = useRepozytorium('wydatki')
  const podsumowanie = obliczWykorzystanieBudzetow(budzety, wydatki, miesiac)
  if (!podsumowanie.length) return <p>Brak budżetów na ten miesiąc.</p>
  if (!prywatny) return <p>{podsumowanie.some((budzet) => budzet.przekroczony) ? 'Osiągnięto limit budżetu.' : 'Budżety w granicach limitów.'}</p>
  return <ul className="kokpit__lista">{podsumowanie.slice(0, 3).map(({ budzet, wydano }) =>
    <li key={budzet.id}>{budzet.kategoria || 'Budżet ogólny'}: <strong className="kokpit__wartosc">{formatPLN.format(wydano)}</strong></li>)}</ul>
}

function SkrotPlanu({ data }: { data: string }) {
  const { dane: bloki } = useRepozytorium('blokiCzasu')
  const zwykle = bloki.filter((blok) => ['praca', 'przerwa', 'wolne'].includes(blok.typ) && !blok.powiazanie
    && ['zaakceptowany', 'wykonany'].includes(blok.status) && blok.poczatek.slice(0, 10) <= data && blok.koniec.slice(0, 10) >= data)
  return <>
    <p><strong>{zwykle.length}</strong> bloków pracy, przerw i czasu wolnego na dziś</p>
    <Link className="przycisk przycisk--drugorzedny" to="/planer"><CalendarDays aria-hidden="true" />Otwórz planer</Link>
  </>
}

function StanPolaczenia() {
  const { dane } = useRepozytorium('stanSynchronizacji')
  const stan = dane.find((element) => element.id === 'glowny')
  const konfiguracja = pobierzKonfiguracjeSynchronizacji()
  const [polaczenieSieciowe, ustawPolaczenieSieciowe] = useState(navigator.onLine)
  useEffect(() => {
    const odswiez = () => ustawPolaczenieSieciowe(navigator.onLine)
    window.addEventListener('online', odswiez)
    window.addEventListener('offline', odswiez)
    return () => { window.removeEventListener('online', odswiez); window.removeEventListener('offline', odswiez) }
  }, [])
  const serwer = konfiguracja.blad ? 'Błąd konfiguracji' : !konfiguracja.adresApi ? 'Nie skonfigurowano' : !polaczenieSieciowe || stan?.polaczenie === 'offline' ? 'Offline'
    : stan?.polaczenie === 'dostepne' ? 'Dostępny przy ostatnim sprawdzeniu' : stan?.polaczenie === 'niedostepne' ? 'Niedostępny przy ostatnim sprawdzeniu' : 'Nie sprawdzono'
  const etykiety = { zsynchronizowano: 'Zsynchronizowano', synchronizacja: 'W toku', oczekuje: 'Oczekuje', offline: 'Offline', konflikt: 'Wymaga uwagi', blad: 'Wymaga uwagi' }
  return <div role="status">
    <p>Serwer: <strong>{serwer}</strong></p>
    <p>Synchronizacja: <strong>{!konfiguracja.adresApi ? 'Dane lokalne' : !polaczenieSieciowe ? 'Offline' : stan?.sesjaWymagaLogowania ? 'Wymaga zalogowania' : stan ? etykiety[stan.stan] : 'Brak informacji'}</strong></p>
  </div>
}


const sluchaczeZegara = new Set<() => void>()
let zegarKokpitu: number | undefined
const aktualnaMinuta = () => Math.floor(Date.now() / 60_000)

function odswiezZegar() {
  window.clearTimeout(zegarKokpitu)
  for (const sluchacz of sluchaczeZegara) sluchacz()
  if (sluchaczeZegara.size) zegarKokpitu = window.setTimeout(odswiezZegar, 60_000 - Date.now() % 60_000)
}

function nasluchujZegara(sluchacz: () => void) {
  sluchaczeZegara.add(sluchacz)
  if (sluchaczeZegara.size === 1) {
    document.addEventListener('visibilitychange', odswiezZegar)
    odswiezZegar()
  }
  return () => {
    sluchaczeZegara.delete(sluchacz)
    if (sluchaczeZegara.size === 0) {
      document.removeEventListener('visibilitychange', odswiezZegar)
      window.clearTimeout(zegarKokpitu)
    }
  }
}

function Czas({ data }: { data?: boolean }) {
  const minuta = useSyncExternalStore(nasluchujZegara, aktualnaMinuta)
  const teraz = new Date(minuta * 60_000)
  return <time className={data ? 'kokpit__data' : 'kokpit__godzina'} dateTime={teraz.toISOString()}>
    {data ? teraz.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : teraz.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
  </time>
}

export function TrescBloku({ blok, data, tryb, sesja, zmienPlansze }: {
  blok: BlokKokpitu; data: string; tryb: TrybKokpitu; sesja?: KontoUzytkownika; zmienPlansze?: (kierunek: number) => void
}) {
  const prywatnaSesja = tryb === 'prywatny' ? sesja : undefined
  switch (blok.typ) {
    case 'zegar': return <Czas />
    case 'data': return <Czas data />
    case 'plan': return <SkrotPlanu data={data} />
    case 'zadania': return <SkrotZadan data={data} filtr={blok.filtr} sesja={prywatnaSesja} />
    case 'przypomnienia': return <SkrotPrzypomnien sesja={prywatnaSesja} />
    case 'kalendarz': return <SkrotKalendarza data={data} prywatny={Boolean(prywatnaSesja)} />
    case 'finanse': return prywatnaSesja || (sesja && blok.podgladPubliczny)
      ? <SkrotFinansow miesiac={data.slice(0, 7)} prywatny={Boolean(prywatnaSesja)} /> : <p>Szczegóły w trybie prywatnym.</p>
    case 'polaczenie': return <StanPolaczenia />
    case 'echo': return <Link className="przycisk przycisk--glowny" to="/echo"><MessageCircle aria-hidden="true" />Otwórz Echo</Link>
    case 'dom': return prywatnaSesja?.rola === 'wlasciciel' ? <SekcjaDom /> : <p>Zaloguj się online jako właściciel, aby sprawdzić Home Assistant.</p>
    case 'pogoda': return <p>Brak skonfigurowanego źródła pogody.</p>
    case 'akcja':
      if (blok.akcja === 'nastepna' || blok.akcja === 'poprzednia') return zmienPlansze ? <button className="przycisk" type="button"
        onClick={() => zmienPlansze(blok.akcja === 'nastepna' ? 1 : -1)}>{blok.akcja === 'nastepna' ? 'Następna plansza' : 'Poprzednia plansza'}</button>
        : <p>Akcja dostępna w widoku plansz.</p>
      return <Link className="przycisk" to={`/${blok.skrot}`}>{skrotyKokpitu[blok.skrot]}</Link>
    case 'skrot': return <Link className="przycisk" to={`/${blok.skrot}`}>{skrotyKokpitu[blok.skrot]}</Link>
    default: return <p>Ten blok jest niedostępny w tej wersji.</p>
  }
}
