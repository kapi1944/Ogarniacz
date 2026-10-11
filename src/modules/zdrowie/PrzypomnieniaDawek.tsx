import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat } from '../../components/Interfejs'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { platforma } from '../../platform/platforma'
import type { StanPowiadomienPlatformy } from '../../platform/typy'
import { czasUruchomienia } from '../../services/PrzypomnieniaService'
import { sciezkaAlarmuDawki } from '../../services/PrzypomnieniaLekow'

export function PrzypomnieniaDawek() {
  const { ustawienia, zapiszUstawienia, moze } = useAplikacja()
  const { dane: przypomnienia } = useRepozytorium('przypomnienia')
  const [stan, ustawStan] = useState<StanPowiadomienPlatformy>()
  const [blad, ustawBlad] = useState('')
  useEffect(() => {
    let aktywny = true
    void platforma.powiadomienia.sprawdzStan().then((wynik) => { if (aktywny) ustawStan(wynik) }).catch(() => { if (aktywny) ustawBlad('Nie udało się sprawdzić uprawnień powiadomień.') })
    return () => { aktywny = false }
  }, [ustawienia.updatedAt])
  const oczekujace = przypomnienia.filter((element) => element.dawkaLeku && !element.dawkaLeku.nieaktualne && ['nowe', 'odroczone', 'dostarczone'].includes(element.stan))
    .sort((pierwsze, drugie) => (czasUruchomienia(pierwsze)?.getTime() ?? Infinity) - (czasUruchomienia(drugie)?.getTime() ?? Infinity))
  const najblizsze = oczekujace.find((element) => (czasUruchomienia(element)?.getTime() ?? 0) >= Date.now())
  const zalegle = oczekujace.filter((element) => (czasUruchomienia(element)?.getTime() ?? Infinity) < Date.now())
  const etykiety = { nowe: 'Zaplanowane', odroczone: 'Odroczone', dostarczone: 'Dostarczone', eskalowane: 'Wymaga uwagi', wykonane: 'Zakończone', pominiete: 'Pominięte' }
  return <Karta><h2>Przypomnienia o dawkach</h2>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <label className="ustawienie-wiersz"><span>Powiadomienia Ogarniacza, w tym o lekach</span><input type="checkbox" checked={ustawienia.powiadomienia ?? false} disabled={!moze('ustawienia', 'edycja')} onChange={async (zdarzenie) => {
      try {
        const wlacz = zdarzenie.target.checked
        const przyznano = wlacz ? await platforma.powiadomienia.poprosOUprawnienie() : false
        await zapiszUstawienia({ powiadomienia: przyznano })
        ustawStan(await platforma.powiadomienia.sprawdzStan())
      } catch { ustawBlad('Nie udało się zmienić ustawień powiadomień.') }
    }} /></label>
    <Link to="/ustawienia">Preferencje, uprawnienia i ukrywanie nazwy leku</Link>
    {ustawienia.powiadomienia && (!stan || stan.zgoda !== 'przyznana' || !stan.systemoweWlaczone || stan.kanalyGotowe === false) && <p role="status">Powiadomienia wymagają uwagi: sprawdź zgodę systemową i kanały w Ustawieniach.</p>}
    {platforma.natywna ? <p>Android planuje alarmy na najbliższe 7 dni i odroczone dawki. Otwieraj aplikację co najmniej raz w tygodniu, aby odnowić plan. Ograniczenia baterii mogą opóźniać alarmy.{stan?.exactAlarms !== 'przyznana' && ' Brak zgody na dokładne alarmy — godzina dostarczenia może się różnić.'}</p>
      : <p>PWA przypomina podczas działania aplikacji. Po jej całkowitym zamknięciu alarmy nie są gwarantowane.</p>}
    {najblizsze ? <div><p>Najbliższa oczekująca dawka: <Link to={sciezkaAlarmuDawki(najblizsze)}>{najblizsze.tytul}</Link> — {new Date(najblizsze.dawkaLeku!.planowanyCzas).toLocaleString('pl-PL', { timeZoneName: 'short' })}</p>
      <p>Przypomnienie: {czasUruchomienia(najblizsze)?.toLocaleString('pl-PL', { timeZoneName: 'short' })} — {ustawienia.powiadomienia ? etykiety[najblizsze.stan] : 'Powiadomienia wyłączone'}{(czasUruchomienia(najblizsze)?.getTime() ?? Infinity) <= Date.now() && ' · Dawka wymaga uwagi'}</p></div>
      : <p>Brak oczekujących przypomnień o dawkach w najbliższym planie.</p>}
    {zalegle.length > 0 && <p role="status">Dawki wymagające uwagi: {zalegle.length}. <Link to={sciezkaAlarmuDawki(zalegle[0])}>Sprawdź najstarszą oczekującą dawkę</Link>.</p>}
  </Karta>
}
