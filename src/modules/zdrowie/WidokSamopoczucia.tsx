import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { useAplikacja } from '../../app/KontekstAplikacji'
import { Karta, Komunikat, Modal, ModalPotwierdzenia, NaglowekWidoku, PustyStan } from '../../components/Interfejs'
import { pobierzRepozytorium } from '../../data/Repozytorium'
import { noweId, utworzMetadane } from '../../domain/fabryki'
import { biezaceWskazniki, domyslneUstawieniaSamopoczucia, sekcjeSamopoczucia, type ObserwacjaWskaznika, type SekcjaSamopoczucia, type UstawieniaSamopoczucia, type WpisSamopoczucia, type WskaznikSamopoczucia } from '../../domain/samopoczucie'
import { chwileObserwacji, dodajWersjeWskaznika, usunWpisSamopoczucia, zapiszWpisSamopoczucia } from '../../services/SamopoczucieService'

function opisBledu(przyczyna: unknown): string {
  return przyczyna instanceof Error && !('issues' in przyczyna) ? przyczyna.message : 'Sprawdź datę obserwacji, zakresy skal i uzupełnione pola.'
}

function PoleWskaznika({ definicja, wartosc, zmien }: { definicja: WskaznikSamopoczucia; wartosc?: ObserwacjaWskaznika['wartosc']; zmien: (wartosc?: ObserwacjaWskaznika['wartosc']) => void }) {
  const wybrana = wartosc !== undefined
  return <fieldset className="samopoczucie-wskaznik"><legend>{definicja.nazwa}</legend>
    {definicja.typ === 'liczba' ? <>
      <p className="tekst-pomocniczy">{definicja.minimum} — {definicja.etykietaMinimum} · {definicja.maksimum} — {definicja.etykietaMaksimum}</p>
      <input aria-label={definicja.nazwa} type="range" min={definicja.minimum} max={definicja.maksimum} step={definicja.krok} value={typeof wartosc === 'number' ? wartosc : definicja.minimum} onChange={(zdarzenie) => zmien(Number(zdarzenie.target.value))} />
      <p>{wybrana ? `${wartosc} ${definicja.jednostka}` : 'Brak obserwacji — suwak nie jest jeszcze zapisem.'}</p>
      {!wybrana && <button type="button" className="przycisk przycisk--maly" onClick={() => zmien(definicja.minimum)}>Wybierz {definicja.minimum} {definicja.jednostka}</button>}
    </> : definicja.typ === 'tekst' ? <input aria-label={definicja.nazwa} value={typeof wartosc === 'string' ? wartosc : ''} onChange={(zdarzenie) => zmien(zdarzenie.target.value || undefined)} />
      : <div className="akcje-formularza"><button type="button" className="przycisk" aria-pressed={wartosc === true} onClick={() => zmien(true)}>Tak</button><button type="button" className="przycisk" aria-pressed={wartosc === false} onClick={() => zmien(false)}>Nie</button><span>{wybrana ? wartosc ? 'Tak' : 'Nie' : 'Brak obserwacji'}</span></div>}
    {wybrana && <button type="button" className="przycisk przycisk--maly" onClick={() => zmien(undefined)}>Usuń obserwację {definicja.nazwa}</button>}
  </fieldset>
}

function FormularzSamopoczucia({ wpis, ustawienia, dostep, zamknij }: { wpis?: WpisSamopoczucia; ustawienia: UstawieniaSamopoczucia; dostep: () => boolean; zamknij: () => void }) {
  const [metadane] = useState(() => wpis ?? utworzMetadane())
  const [wartosci, ustawWartosci] = useState<Record<string, ObserwacjaWskaznika>>(() => Object.fromEntries(wpis?.wskazniki.map((pole) => [pole.definicja.id, pole]) ?? []))
  const [notatka, ustawNotatke] = useState(wpis?.notatka ?? '')
  const [szczegoly, ustawSzczegoly] = useState(wpis?.szczegoly ?? {})
  const [doOmowienia, ustawDoOmowienia] = useState(wpis?.doOmowienia ?? false)
  const [data, ustawDate] = useState(wpis?.dataObserwacji ?? format(new Date(), 'yyyy-MM-dd'))
  const [godzina, ustawGodzine] = useState(wpis?.godzinaObserwacji ?? format(new Date(), 'HH:mm'))
  const [strefa, ustawStrefe] = useState(wpis?.strefaCzasowa ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [chwila, ustawChwile] = useState(wpis?.czasObserwacji ?? '')
  const [rozszerzony, ustawRozszerzony] = useState(Boolean(wpis) || ustawienia.tryb === 'rozszerzony')
  const [blad, ustawBlad] = useState('')
  const [zapisuje, ustawZapisuje] = useState(false)
  const aktualne = biezaceWskazniki(ustawienia).filter((pole) => pole.aktywny)
  const definicje = [...new Map([...aktualne, ...(wpis?.wskazniki.map((pole) => pole.definicja) ?? [])].map((pole) => [pole.id, pole])).values()]
  const ulubione = ustawienia.ulubione.map((id) => definicje.find((pole) => pole.id === id)).filter((pole): pole is WskaznikSamopoczucia => Boolean(pole))
  const chwile = chwileObserwacji(data, godzina, strefa)
  const zmien = (definicja: WskaznikSamopoczucia, wartosc?: ObserwacjaWskaznika['wartosc']) => ustawWartosci((obecne) => {
    const nowe = { ...obecne }; if (wartosc === undefined) delete nowe[definicja.id]; else nowe[definicja.id] = { definicja, wartosc }; return nowe
  })
  return <form className="formularz samopoczucie-formularz" onSubmit={async (zdarzenie) => {
    zdarzenie.preventDefault(); ustawBlad(''); ustawZapisuje(true)
    try {
      const wybranaChwila = chwile.length === 1 ? chwile[0] : chwila
      if (!wybranaChwila || !chwile.includes(wybranaChwila)) throw new Error(chwile.length > 1 ? 'Wybierz konkretne wystąpienie powtórzonej godziny.' : 'Ta godzina nie istnieje w podanej strefie. Sprawdź datę i godzinę.')
      await zapiszWpisSamopoczucia({ ...metadane, dataObserwacji: data, godzinaObserwacji: godzina, czasObserwacji: wybranaChwila, strefaCzasowa: strefa,
        notatka: notatka.trim() || undefined, wskazniki: Object.values(wartosci), doOmowienia,
        szczegoly: Object.fromEntries(Object.entries(szczegoly).filter(([, tekst]) => tekst?.trim())), powiazania: wpis?.powiazania }, dostep)
      zamknij()
    } catch (przyczyna) { ustawBlad(opisBledu(przyczyna)) } finally { ustawZapisuje(false) }
  }}>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <div className="samopoczucie-szybkie pole--pelne">{ulubione.map((pole) => <PoleWskaznika key={pole.id} definicja={pole} wartosc={wartosci[pole.id]?.wartosc} zmien={(wartosc) => zmien(pole, wartosc)} />)}</div>
    <label className="pole pole--pelne"><span>Krótka notatka (opcjonalna)</span><textarea rows={2} value={notatka} onChange={(zdarzenie) => ustawNotatke(zdarzenie.target.value)} /></label>
    <label className="pole pole--pelne"><span><input type="checkbox" checked={doOmowienia} onChange={(zdarzenie) => ustawDoOmowienia(zdarzenie.target.checked)} /> Do omówienia na terapii</span></label>
    <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawRozszerzony(!rozszerzony)}>{rozszerzony ? 'Ukryj szczegóły' : '+ Dodaj szczegóły'}</button>
    <details className="pole--pelne"><summary>Data i godzina obserwacji: {data}, {godzina} · {strefa}</summary><div className="formularz">
      <label className="pole"><span>Data obserwacji</span><input type="date" required value={data} onChange={(zdarzenie) => { ustawDate(zdarzenie.target.value); ustawChwile('') }} /></label>
      <label className="pole"><span>Godzina obserwacji</span><input type="time" required value={godzina} onChange={(zdarzenie) => { ustawGodzine(zdarzenie.target.value); ustawChwile('') }} /></label>
      <label className="pole"><span>Strefa czasowa</span><input required value={strefa} onChange={(zdarzenie) => { ustawStrefe(zdarzenie.target.value); ustawChwile('') }} /></label>
    </div></details>
    {chwile.length > 1 && <label className="pole"><span>Wystąpienie powtórzonej godziny obserwacji</span><select required value={chwila} onChange={(zdarzenie) => ustawChwile(zdarzenie.target.value)}><option value="">Wybierz wystąpienie</option>{chwile.map((czas, indeks) => <option key={czas} value={czas}>{indeks + 1}. wystąpienie — {new Date(czas).toLocaleTimeString('pl-PL', { timeZone: strefa, timeZoneName: 'short' })}</option>)}</select></label>}
    {rozszerzony && <div className="pole--pelne">{(Object.keys(sekcjeSamopoczucia) as SekcjaSamopoczucia[]).filter((sekcja) => ustawienia.sekcje.includes(sekcja) || szczegoly[sekcja] || definicje.some((pole) => pole.sekcja === sekcja && wartosci[pole.id])).map((sekcja) => <details key={sekcja} className="samopoczucie-sekcja"><summary>{sekcjeSamopoczucia[sekcja]}</summary>
      {definicje.filter((pole) => pole.sekcja === sekcja && !ustawienia.ulubione.includes(pole.id)).map((pole) => <PoleWskaznika key={pole.id} definicja={pole} wartosc={wartosci[pole.id]?.wartosc} zmien={(wartosc) => zmien(pole, wartosc)} />)}
      <label className="pole"><span>{sekcjeSamopoczucia[sekcja]} — notatka (opcjonalna)</span><textarea rows={3} value={szczegoly[sekcja] ?? ''} onChange={(zdarzenie) => ustawSzczegoly({ ...szczegoly, [sekcja]: zdarzenie.target.value })} /></label>
    </details>)}</div>}
    <div className="akcje-formularza pole--pelne"><button type="button" className="przycisk" onClick={zamknij}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny" disabled={zapisuje || !dostep()}>Zapisz obserwację</button></div>
  </form>
}

function UstawieniaDziennika({ ustawienia, zapisz, zamknij }: { ustawienia: UstawieniaSamopoczucia; zapisz: (ustawienia: UstawieniaSamopoczucia) => Promise<void>; zamknij: () => void }) {
  const [szkic, ustawSzkic] = useState(() => structuredClone(ustawienia))
  const [pole, ustawPole] = useState<WskaznikSamopoczucia>({ ...domyslneUstawieniaSamopoczucia.definicje[0], id: '', nazwa: '', opis: '', sekcja: 'objawy' })
  const [blad, ustawBlad] = useState('')
  const definicje = biezaceWskazniki(szkic)
  const ustaw = (zmiany: Partial<WskaznikSamopoczucia>) => ustawPole({ ...pole, ...zmiany })
  return <div className="formularz">
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <label className="pole"><span>Domyślny formularz</span><select value={szkic.tryb} onChange={(zdarzenie) => ustawSzkic({ ...szkic, tryb: zdarzenie.target.value as UstawieniaSamopoczucia['tryb'] })}><option value="szybki">Szybki</option><option value="rozszerzony">Rozszerzony</option></select></label>
    <fieldset className="pole--pelne"><legend>Ulubione wskaźniki w szybkim formularzu</legend>{definicje.filter((definicja) => definicja.aktywny).map((definicja) => <label key={definicja.id} className="ustawienie-wiersz"><span>{definicja.nazwa}</span><input type="checkbox" checked={szkic.ulubione.includes(definicja.id)} onChange={(zdarzenie) => ustawSzkic({ ...szkic, ulubione: zdarzenie.target.checked ? [...szkic.ulubione, definicja.id] : szkic.ulubione.filter((id) => id !== definicja.id) })} /></label>)}
      {szkic.ulubione.map((id, indeks) => <div key={id} className="ustawienie-wiersz"><span>{indeks + 1}. {definicje.find((definicja) => definicja.id === id)?.nazwa}</span><button type="button" className="przycisk przycisk--maly" disabled={indeks === 0} onClick={() => { const nowe = [...szkic.ulubione]; [nowe[indeks - 1], nowe[indeks]] = [nowe[indeks], nowe[indeks - 1]]; ustawSzkic({ ...szkic, ulubione: nowe }) }}>Wyżej</button></div>)}
    </fieldset>
    <fieldset className="pole--pelne"><legend>Widoczne sekcje szczegółów</legend>{(Object.keys(sekcjeSamopoczucia) as SekcjaSamopoczucia[]).map((sekcja) => <label key={sekcja} className="ustawienie-wiersz"><span>{sekcjeSamopoczucia[sekcja]}</span><input type="checkbox" checked={szkic.sekcje.includes(sekcja)} onChange={(zdarzenie) => ustawSzkic({ ...szkic, sekcje: zdarzenie.target.checked ? [...szkic.sekcje, sekcja] : szkic.sekcje.filter((id) => id !== sekcja) })} /></label>)}</fieldset>
    <details className="pole--pelne"><summary>Własne wskaźniki i wersje skal</summary>
      <label className="pole"><span>Edytowany wskaźnik</span><select value={pole.id} onChange={(zdarzenie) => ustawPole(definicje.find((definicja) => definicja.id === zdarzenie.target.value) ?? { ...domyslneUstawieniaSamopoczucia.definicje[0], id: '', nazwa: '', opis: '', sekcja: 'objawy' })}><option value="">Nowy własny wskaźnik</option>{definicje.map((definicja) => <option key={definicja.id} value={definicja.id}>{definicja.nazwa} — wersja {definicja.wersja}{definicja.aktywny ? '' : ' (nieaktywny)'}</option>)}</select></label>
      <div className="formularz"><label className="pole"><span>Nazwa wskaźnika</span><input value={pole.nazwa} onChange={(zdarzenie) => ustaw({ nazwa: zdarzenie.target.value })} /></label>
        <label className="pole"><span>Opis wskaźnika</span><input value={pole.opis} onChange={(zdarzenie) => ustaw({ opis: zdarzenie.target.value })} /></label>
        <label className="pole"><span>Typ wartości</span><select value={pole.typ} onChange={(zdarzenie) => ustaw({ typ: zdarzenie.target.value as WskaznikSamopoczucia['typ'] })}><option value="liczba">Liczba lub skala</option><option value="tekst">Tekst</option><option value="tak_nie">Tak / nie</option></select></label>
        <label className="pole"><span>Sekcja wskaźnika</span><select value={pole.sekcja} onChange={(zdarzenie) => ustaw({ sekcja: zdarzenie.target.value as SekcjaSamopoczucia })}>{Object.entries(sekcjeSamopoczucia).map(([id, nazwa]) => <option key={id} value={id}>{nazwa}</option>)}</select></label>
        {pole.typ === 'liczba' && <>{(['minimum', 'maksimum', 'krok'] as const).map((klucz) => <label className="pole" key={klucz}><span>{{ minimum: 'Minimum skali', maksimum: 'Maksimum skali', krok: 'Krok skali' }[klucz]}</span><input type="number" step="any" value={pole[klucz]} onChange={(zdarzenie) => ustaw({ [klucz]: Number(zdarzenie.target.value) })} /></label>)}
          <label className="pole"><span>Opis minimum</span><input value={pole.etykietaMinimum} onChange={(zdarzenie) => ustaw({ etykietaMinimum: zdarzenie.target.value })} /></label>
          <label className="pole"><span>Opis maksimum</span><input value={pole.etykietaMaksimum} onChange={(zdarzenie) => ustaw({ etykietaMaksimum: zdarzenie.target.value })} /></label>
          <label className="pole"><span>Jednostka</span><input value={pole.jednostka} onChange={(zdarzenie) => ustaw({ jednostka: zdarzenie.target.value })} /></label>
          <label className="pole"><span>Znaczenie kierunku skali</span><select value={pole.kierunek} onChange={(zdarzenie) => ustaw({ kierunek: zdarzenie.target.value as WskaznikSamopoczucia['kierunek'] })}><option value="wyzej_lepiej">Wyżej oznacza korzystniejszą obserwację</option><option value="nizej_lepiej">Niżej oznacza korzystniejszą obserwację</option><option value="neutralny">Bez oceny kierunku</option></select></label>
        </>}
        <label className="pole"><span><input type="checkbox" checked={pole.aktywny} onChange={(zdarzenie) => ustaw({ aktywny: zdarzenie.target.checked })} /> Wskaźnik aktywny</span></label>
      </div>
      <p>Zmiana tworzy kolejną wersję. Wcześniejsze wpisy zachowują poprzednie znaczenie skali.</p>
      <button type="button" className="przycisk" onClick={() => { try { const nowePole = { ...pole, id: pole.id || noweId() }; ustawSzkic(dodajWersjeWskaznika(szkic, nowePole)); ustawPole(nowePole); ustawBlad('') } catch (przyczyna) { ustawBlad(opisBledu(przyczyna)) } }}>Dodaj wersję wskaźnika do ustawień</button>
    </details>
    <div className="akcje-formularza pole--pelne"><button type="button" className="przycisk" onClick={zamknij}>Anuluj</button><button type="button" className="przycisk przycisk--glowny" onClick={async () => { try { await zapisz(szkic); zamknij() } catch (przyczyna) { ustawBlad(opisBledu(przyczyna)) } }}>Zapisz ustawienia dziennika</button></div>
  </div>
}

export default function WidokSamopoczucia() {
  const { ustawienia, zapiszUstawienia, moze } = useAplikacja()
  const odczyt = moze('zdrowie', 'odczyt', 'samopoczucie')
  const edycja = () => moze('zdrowie', 'edycja', 'samopoczucie')
  const wpisy = useLiveQuery(() => odczyt ? pobierzRepozytorium('wpisySamopoczucia').lista() : [], [odczyt], []) ?? []
  const [formularz, ustawFormularz] = useState<{ wpis?: WpisSamopoczucia }>()
  const [konfiguracja, ustawKonfiguracje] = useState(false)
  const [doUsuniecia, ustawDoUsuniecia] = useState<WpisSamopoczucia>()
  const [od, ustawOd] = useState('')
  const [doDaty, ustawDo] = useState('')
  const [tylkoOmowienie, ustawTylkoOmowienie] = useState(false)
  const [blad, ustawBlad] = useState('')
  const preferencje = ustawienia.samopoczucie ?? domyslneUstawieniaSamopoczucia
  if (!odczyt) return <Komunikat typ="blad">Brak uprawnienia do dziennika samopoczucia.</Komunikat>
  const wybrane = wpisy.filter((wpis) => (!od || wpis.dataObserwacji >= od) && (!doDaty || wpis.dataObserwacji <= doDaty) && (!tylkoOmowienie || wpis.doOmowienia))
    .sort((pierwszy, drugi) => Date.parse(drugi.czasObserwacji) - Date.parse(pierwszy.czasObserwacji) || pierwszy.id.localeCompare(drugi.id))
  const dni = [...new Set(wybrane.map((wpis) => wpis.dataObserwacji))]
  return <div className="widok">
    <NaglowekWidoku tytul="Dziennik samopoczucia" opis="Twoje obserwacje, bez automatycznej oceny i diagnoz." akcje={edycja() && <button type="button" className="przycisk przycisk--glowny" onClick={() => ustawFormularz({})}>Jak się czujesz? Dodaj wpis</button>} />
    <Link to="/zdrowie">Wróć do Zdrowia</Link>
    <Karta><p>Dziennik i definicje wskaźników pozostają lokalne. Nie trafiają do Echo, powiadomień ani synchronizacji. Kopia zapasowa może zawierać pełną treść; baza i backup nie są szyfrowane.</p>{moze('ustawienia', 'edycja') && <button type="button" className="przycisk przycisk--drugorzedny" onClick={() => ustawKonfiguracje(true)}>Ustawienia dziennika</button>}</Karta>
    {blad && <Komunikat typ="blad">{blad}</Komunikat>}
    <Karta><h2>Historia obserwacji</h2><div className="formularz"><label className="pole"><span>Obserwacje od</span><input type="date" value={od} onChange={(zdarzenie) => ustawOd(zdarzenie.target.value)} /></label><label className="pole"><span>Obserwacje do</span><input type="date" value={doDaty} onChange={(zdarzenie) => ustawDo(zdarzenie.target.value)} /></label><label className="pole"><span><input type="checkbox" checked={tylkoOmowienie} onChange={(zdarzenie) => ustawTylkoOmowienie(zdarzenie.target.checked)} /> Tylko do omówienia na terapii</span></label></div>
      {dni.length === 0 && <PustyStan tytul="Brak obserwacji w wybranym zakresie" opis="Możesz zapisać jeden wskaźnik lub krótką notatkę." />}
      {dni.map((dzien) => <section key={dzien}><h3>{dzien}</h3>{wybrane.filter((wpis) => wpis.dataObserwacji === dzien).map((wpis) => <article key={wpis.id} className="samopoczucie-wpis">
        <strong><time dateTime={wpis.czasObserwacji}>{wpis.godzinaObserwacji}</time> · {wpis.strefaCzasowa}</strong>{wpis.doOmowienia && <p>Do omówienia na terapii</p>}
        <div className="samopoczucie-obserwacje">{wpis.wskazniki.map(({ definicja, wartosc }) => <span key={definicja.id}>{definicja.nazwa}: {typeof wartosc === 'boolean' ? wartosc ? 'Tak' : 'Nie' : wartosc} {definicja.jednostka}<small>{definicja.typ === 'liczba' ? `${definicja.minimum} — ${definicja.etykietaMinimum}; ${definicja.maksimum} — ${definicja.etykietaMaksimum}` : definicja.opis} · wersja {definicja.wersja}</small></span>)}</div>
        {wpis.notatka && <p>Notatka: {wpis.notatka}</p>}
        <details><summary>Szczegóły obserwacji i zapisu</summary>{Object.entries(wpis.szczegoly ?? {}).map(([sekcja, tekst]) => <p key={sekcja}><strong>{sekcjeSamopoczucia[sekcja as SekcjaSamopoczucia]}:</strong> {tekst}</p>)}<p>Pełna chwila: {new Date(wpis.czasObserwacji).toLocaleString('pl-PL', { timeZone: wpis.strefaCzasowa, timeZoneName: 'short' })}</p><p>Utworzono: {new Date(wpis.createdAt).toLocaleString('pl-PL')} · Edytowano: {new Date(wpis.updatedAt).toLocaleString('pl-PL')}</p></details>
        {edycja() && <div className="akcje-formularza"><button type="button" className="przycisk" onClick={() => ustawFormularz({ wpis })}>Edytuj obserwację</button><button type="button" className="przycisk" onClick={() => ustawDoUsuniecia(wpis)}>Usuń obserwację</button></div>}
      </article>)}</section>)}
    </Karta>
    {formularz && edycja() && <Modal tytul={formularz.wpis ? 'Edytuj obserwację' : 'Jak się czujesz?'} zamknij={() => ustawFormularz(undefined)}><FormularzSamopoczucia wpis={formularz.wpis} ustawienia={preferencje} dostep={edycja} zamknij={() => ustawFormularz(undefined)} /></Modal>}
    {konfiguracja && moze('ustawienia', 'edycja') && <Modal tytul="Ustawienia Zdrowia — samopoczucie" zamknij={() => ustawKonfiguracje(false)}><UstawieniaDziennika ustawienia={preferencje} zapisz={async (samopoczucie) => { if (!moze('ustawienia', 'edycja')) throw new Error('Brak uprawnienia do ustawień.'); await zapiszUstawienia({ samopoczucie }) }} zamknij={() => ustawKonfiguracje(false)} /></Modal>}
    {doUsuniecia && <ModalPotwierdzenia tytul="Usuń obserwację" opis="Wpis zostanie oznaczony jako usunięty zgodnie z repozytorium." anuluj={() => ustawDoUsuniecia(undefined)} potwierdz={async () => { try { await usunWpisSamopoczucia(doUsuniecia.id, edycja); ustawDoUsuniecia(undefined) } catch (przyczyna) { ustawBlad(opisBledu(przyczyna)) } }} />}
  </div>
}
