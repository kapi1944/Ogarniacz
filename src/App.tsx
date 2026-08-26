import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DostawcaAplikacji } from './app/KontekstAplikacji'
import { StraznikModulu, UkladAplikacji } from './app/UkladAplikacji'
import { WidokPulpitu } from './modules/pulpit/WidokPulpitu'
import { WidokProjektow, WidokSkrzynki, WidokZadan } from './modules/praca/WidokiPracy'
import { WidokGrafiku, WidokPlanera } from './modules/czas/WidokiCzasu'
import { WidokLekow, WidokWizyt } from './modules/zdrowie/WidokiZdrowia'
import { WidokMiasta, WidokNawykow, WidokPrzypomnien, WidokRachunkow, WidokZakupow } from './modules/organizacja/WidokiOrganizacji'
import { WidokCelow, WidokDokumentow, WidokKontaktow, WidokNaPozniej, WidokNotatek, WidokPomyslow, WidokTerminow } from './modules/wiedza/WidokiWiedzy'
import { WidokFinansow } from './modules/finanse/WidokFinansow'
import { WidokEcho } from './modules/echo/WidokEcho'
import { WidokUstawien } from './modules/ustawienia/WidokUstawien'
import type { NazwaModulu } from './domain/typy'

const chron = (modul: NazwaModulu, element: React.ReactNode) => <StraznikModulu modul={modul}>{element}</StraznikModulu>

function NieZnaleziono() {
  return <div className="brak-dostepu"><h1>Nie znaleziono strony</h1><p>Sprawdź adres albo wybierz moduł z menu.</p></div>
}

export default function App() {
  return <BrowserRouter><DostawcaAplikacji><UkladAplikacji><Routes>
    <Route path="/" element={<WidokPulpitu />} />
    <Route path="/skrzynka" element={chron('skrzynka', <WidokSkrzynki />)} />
    <Route path="/zadania" element={chron('zadania', <WidokZadan />)} />
    <Route path="/projekty" element={chron('projekty', <WidokProjektow />)} />
    <Route path="/planer" element={chron('planer', <WidokPlanera />)} />
    <Route path="/grafik" element={chron('grafik', <WidokGrafiku />)} />
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
    <Route path="/echo" element={chron('echo', <WidokEcho />)} />
    <Route path="/ustawienia" element={chron('ustawienia', <WidokUstawien />)} />
    <Route path="*" element={<NieZnaleziono />} />
  </Routes></UkladAplikacji></DostawcaAplikacji></BrowserRouter>
}
