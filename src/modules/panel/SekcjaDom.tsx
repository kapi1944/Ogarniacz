import { useState } from 'react'
import { useKonto } from '../../app/DostawcaKonta'
import { Komunikat, ModalPotwierdzenia } from '../../components/Interfejs'
import { BladKonta, pobierzStanDomu, sterujDomem, type StanDomu } from '../../services/KontaService'

function UrzadzeniaDomu() {
  const [stan, ustawStan] = useState<StanDomu>()
  const [blad, ustawBlad] = useState('')
  const [zajety, ustawZajety] = useState(false)
  const [wybor, ustawWybor] = useState<{ id: string; nazwa: string; akcja: 'wlacz' | 'wylacz' }>()

  const wykonaj = async (dzialanie: () => Promise<void>) => {
    if (zajety) return
    ustawZajety(true)
    ustawBlad('')
    ustawStan(undefined)
    try { await dzialanie() }
    catch (przyczyna) { ustawBlad(przyczyna instanceof BladKonta ? przyczyna.message : 'Nie udało się połączyć z serwerem Ogarniacza.') }
    finally { ustawZajety(false) }
  }

  return <>
    <p className="tekst-pomocniczy">Home Assistant: wybrane urządzenia. Odczyt na żądanie, bez automatyzacji.</p>
    <button type="button" className="przycisk przycisk--drugorzedny" disabled={zajety} onClick={() => void wykonaj(async () => ustawStan(await pobierzStanDomu()))}>{zajety ? 'Sprawdzanie…' : 'Sprawdź połączenie i odśwież urządzenia'}</button>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    {stan && <>
      <p>{!stan.skonfigurowany ? 'Home Assistant nie jest skonfigurowany na serwerze.' : !stan.dostepny ? 'Home Assistant jest niedostępny.' : 'Home Assistant: połączono przy ostatnim sprawdzeniu.'}</p>
      {stan.dostepny && !stan.encje.length && <p>Nie wybrano urządzeń na serwerze.</p>}
      <ul>{stan.encje.map((encja) => <li key={encja.id}>
        <strong>{encja.nazwa}</strong>: {encja.stan}{encja.jednostka ? ` ${encja.jednostka}` : ''}{!encja.dostepna && ' (niedostępne)'}
        {encja.dostepna && encja.akcje.map((akcja) => <button type="button" className="przycisk przycisk--drugorzedny" key={akcja} disabled={zajety} onClick={() => ustawWybor({ id: encja.id, nazwa: encja.nazwa, akcja })}>{akcja === 'wlacz' ? 'Włącz' : 'Wyłącz'}: {encja.nazwa}</button>)}
      </li>)}</ul>
    </>}
    {wybor && <ModalPotwierdzenia tytul="Sterowanie urządzeniem" opis={`${wybor.akcja === 'wlacz' ? 'Włączyć' : 'Wyłączyć'} urządzenie „${wybor.nazwa}”? To wyśle polecenie do Home Assistant.`} anuluj={() => ustawWybor(undefined)} potwierdz={async () => {
      const polecenie = wybor
      ustawWybor(undefined)
      await wykonaj(async () => {
        await sterujDomem(polecenie.id, polecenie.akcja)
        ustawStan(await pobierzStanDomu())
      })
    }} />}
  </>
}

export function SekcjaDom() {
  const { konto, offline } = useKonto()
  if (!konto || offline) return <p>Zaloguj się online jako właściciel, aby sprawdzić Home Assistant.</p>
  if (konto.rola !== 'wlasciciel') return <p>Dom jest dostępny wyłącznie dla właściciela instalacji.</p>
  return <UrzadzeniaDomu key={`${konto.uzytkownikId}:${konto.wlascicielId}`} />
}
