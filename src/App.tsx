import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DostawcaAplikacji } from './app/KontekstAplikacji'
import { StraznikModulu, UkladAplikacji } from './app/UkladAplikacji'
import { WidokPulpitu } from './modules/pulpit/WidokPulpitu'
import { NawigacjaPlatformy } from './platform/NawigacjaPlatformy'
import type { NazwaModulu } from './domain/typy'

const WidokSkrzynki = lazy(() => import('./modules/praca/WidokiPracy').then((modul) => ({ default: modul.WidokSkrzynki })))
const WidokZadan = lazy(() => import('./modules/praca/WidokiPracy').then((modul) => ({ default: modul.WidokZadan })))
const WidokProjektow = lazy(() => import('./modules/praca/WidokiPracy').then((modul) => ({ default: modul.WidokProjektow })))
const WidokPlanera = lazy(() => import('./modules/czas/WidokiCzasu').then((modul) => ({ default: modul.WidokPlanera })))
const WidokGrafiku = lazy(() => import('./modules/czas/WidokiCzasu').then((modul) => ({ default: modul.WidokGrafiku })))
const WidokZdrowia = lazy(() => import('./modules/zdrowie/WidokiZdrowia').then((modul) => ({ default: modul.WidokZdrowia })))
const WidokLekow = lazy(() => import('./modules/zdrowie/WidokiZdrowia').then((modul) => ({ default: modul.WidokLekow })))
const WidokWizyt = lazy(() => import('./modules/zdrowie/WidokiZdrowia').then((modul) => ({ default: modul.WidokWizyt })))
const WidokSkierowan = lazy(() => import('./modules/zdrowie/WidokiZdrowia').then((modul) => ({ default: modul.WidokSkierowan })))
const WidokDziennikaTerapii = lazy(() => import('./modules/zdrowie/WidokiZdrowia').then((modul) => ({ default: modul.WidokDziennikaTerapii })))
const WidokRecept = lazy(() => import('./modules/zdrowie/WidokiZdrowia').then((modul) => ({ default: modul.WidokRecept })))
const WidokHistoriiZdrowia = lazy(() => import('./modules/zdrowie/WidokiZdrowia').then((modul) => ({ default: modul.WidokHistoriiZdrowia })))
const WidokiOrganizacji = () => import('./modules/organizacja/WidokiOrganizacji')
const WidokNawykow = lazy(() => WidokiOrganizacji().then((modul) => ({ default: modul.WidokNawykow })))
const WidokPrzypomnien = lazy(() => WidokiOrganizacji().then((modul) => ({ default: modul.WidokPrzypomnien })))
const WidokZakupow = lazy(() => WidokiOrganizacji().then((modul) => ({ default: modul.WidokZakupow })))
const WidokRachunkow = lazy(() => WidokiOrganizacji().then((modul) => ({ default: modul.WidokRachunkow })))
const WidokMiasta = lazy(() => WidokiOrganizacji().then((modul) => ({ default: modul.WidokMiasta })))
const WidokiWiedzy = () => import('./modules/wiedza/WidokiWiedzy')
const WidokCelow = lazy(() => WidokiWiedzy().then((modul) => ({ default: modul.WidokCelow })))
const WidokNotatek = lazy(() => WidokiWiedzy().then((modul) => ({ default: modul.WidokNotatek })))
const WidokPomyslow = lazy(() => WidokiWiedzy().then((modul) => ({ default: modul.WidokPomyslow })))
const WidokNaPozniej = lazy(() => WidokiWiedzy().then((modul) => ({ default: modul.WidokNaPozniej })))
const WidokKontaktow = lazy(() => WidokiWiedzy().then((modul) => ({ default: modul.WidokKontaktow })))
const WidokDokumentow = lazy(() => WidokiWiedzy().then((modul) => ({ default: modul.WidokDokumentow })))
const WidokTerminow = lazy(() => WidokiWiedzy().then((modul) => ({ default: modul.WidokTerminow })))
const WidokFinansow = lazy(() => import('./modules/finanse/WidokFinansow').then((modul) => ({ default: modul.WidokFinansow })))
const WidokSamochodu = lazy(() => import('./modules/samochod/WidokSamochodu').then((modul) => ({ default: modul.WidokSamochodu })))
const WidokEcho = lazy(() => import('./modules/echo/WidokEcho').then((modul) => ({ default: modul.WidokEcho })))
const WidokUstawien = lazy(() => import('./modules/ustawienia/WidokUstawien').then((modul) => ({ default: modul.WidokUstawien })))
const EdytorPersonalizacji = lazy(() => import('./modules/ustawienia/EdytorPersonalizacji').then((modul) => ({ default: modul.EdytorPersonalizacji })))

const chron = (modul: NazwaModulu, element: React.ReactNode) => <StraznikModulu modul={modul}>{element}</StraznikModulu>

function NieZnaleziono() {
  return <div className="brak-dostepu"><h1>Nie znaleziono strony</h1><p>Sprawdź adres albo wybierz moduł z menu.</p></div>
}

function LadowanieWidoku() {
  return <div className="pusty-stan" role="status"><span>Ładowanie widoku…</span></div>
}

export default function App() {
  return <BrowserRouter><DostawcaAplikacji><NawigacjaPlatformy /><UkladAplikacji><Suspense fallback={<LadowanieWidoku />}><Routes>
    <Route path="/" element={<WidokPulpitu />} />
    <Route path="/skrzynka" element={chron('skrzynka', <WidokSkrzynki />)} />
    <Route path="/zadania" element={chron('zadania', <WidokZadan />)} />
    <Route path="/projekty" element={chron('projekty', <WidokProjektow />)} />
    <Route path="/planer" element={chron('planer', <WidokPlanera />)} />
    <Route path="/grafik" element={chron('grafik', <WidokGrafiku />)} />
    <Route path="/zdrowie" element={chron('zdrowie', <WidokZdrowia />)} />
    <Route path="/zdrowie/leki" element={chron('leki', <WidokLekow />)} />
    <Route path="/zdrowie/wizyty" element={chron('wizyty', <WidokWizyt />)} />
    <Route path="/zdrowie/skierowania" element={chron('skierowania', <WidokSkierowan />)} />
    <Route path="/zdrowie/dziennik-terapii" element={chron('zdrowie', <WidokDziennikaTerapii />)} />
    <Route path="/zdrowie/recepty" element={chron('zdrowie', <WidokRecept />)} />
    <Route path="/zdrowie/historia" element={chron('zdrowie', <WidokHistoriiZdrowia />)} />
    <Route path="/leki" element={chron('leki', <WidokLekow />)} />
    <Route path="/wizyty" element={chron('wizyty', <WidokWizyt />)} />
    <Route path="/nawyki" element={chron('nawyki', <WidokNawykow />)} />
    <Route path="/przypomnienia" element={chron('przypomnienia', <WidokPrzypomnien />)} />
    <Route path="/zakupy" element={chron('zakupy', <WidokZakupow />)} />
    <Route path="/rachunki" element={chron('rachunki', <WidokRachunkow />)} />
    <Route path="/miasto" element={chron('miasto', <WidokMiasta />)} />
    <Route path="/cele" element={chron('cele', <WidokCelow />)} />
    <Route path="/notatki" element={chron('notatki', <WidokNotatek />)} />
    <Route path="/pomysly" element={chron('pomysly', <WidokPomyslow />)} />
    <Route path="/na-pozniej" element={chron('na_pozniej', <WidokNaPozniej />)} />
    <Route path="/kontakty" element={chron('kontakty', <WidokKontaktow />)} />
    <Route path="/dokumenty" element={chron('dokumenty', <WidokDokumentow />)} />
    <Route path="/terminy" element={chron('terminy', <WidokTerminow />)} />
    <Route path="/finanse" element={chron('finanse', <WidokFinansow />)} />
    <Route path="/samochod" element={chron('samochod', <WidokSamochodu />)} />
    <Route path="/echo" element={chron('echo', <WidokEcho />)} />
    <Route path="/ustawienia" element={chron('ustawienia', <WidokUstawien />)} />
    <Route path="/ustawienia/personalizacja" element={chron('ustawienia', <EdytorPersonalizacji />)} />
    <Route path="*" element={<NieZnaleziono />} />
  </Routes></Suspense></UkladAplikacji></DostawcaAplikacji></BrowserRouter>
}
