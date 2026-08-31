import { useState } from 'react'
import { Check, Clock3, CreditCard, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { WidokRejestru } from '../../components/WidokRejestru'
import { Karta, Modal, NaglowekWidoku, PustyStan, Znacznik } from '../../components/Interfejs'
import { dzisiajIso, terazIso, utworzMetadane } from '../../domain/fabryki'
import type { DziennikNawyku, ListaZakupow, Nawyk, PlatnoscRachunku, PozycjaZakupow, Przypomnienie, Rachunek, Zadanie } from '../../domain/typy'
import { useRepozytorium } from '../../hooks/useRepozytorium'
import { statystykaNawyku } from '../../services/NawykiService'
import { nastepnaData } from '../../services/PowtarzanieService'
import { aktywnePrzypomnienia, odroczPrzypomnienie, zakonczPrzypomnienie } from '../../services/PrzypomnieniaService'
import { ukonczZadanie, utworzZadanie } from '../../services/ZadaniaService'

export function WidokPrzypomnien() {
  const [parametryAdresu] = useSearchParams()
  const { dane, repozytorium } = useRepozytorium('przypomnienia')
  const aktywne = aktywnePrzypomnienia(dane)
  const zakoncz = async (element: Przypomnienie) => {
    const wynik = zakonczPrzypomnienie(element)
    await repozytorium.zapisz(wynik.wykonane)
    if (wynik.nastepne) await repozytorium.zapisz(wynik.nastepne)
  }
  return <div className="widok">
    <NaglowekWidoku tytul="Centrum przypomnień" opis="Wspólny system reakcji dla wszystkich modułów. Powiadomienie wewnątrz aplikacji działa niezależnie od Notification API." />
    <Karta klasa={aktywne.length ? 'karta--ostrzezenie' : ''}>
      <div className="naglowek-karty"><div><h2>Wymagają reakcji</h2><p>{aktywne.length} aktywnych przypomnień</p></div></div>
      {aktywne.length === 0 ? <PustyStan tytul="Brak aktywnych przypomnień" opis="Nic nie wymaga teraz reakcji." /> : <div className="lista-rekordow lista-rekordow--wewnetrzna">{aktywne.map((element) => <article className="rekord" key={element.id}><div className="rekord__tresc"><h3>{element.tytul}</h3><div className="rekord__szczegoly"><Znacznik wariant={element.priorytet === 'krytyczny' ? 'blad' : element.priorytet === 'wysoki' ? 'ostrzezenie' : 'neutralny'}>{element.priorytet}</Znacznik><span>{element.stan}</span></div></div><div className="rekord__akcje"><button type="button" className="przycisk przycisk--maly" onClick={() => repozytorium.zapisz(odroczPrzypomnienie(element, 15))}><Clock3 aria-hidden="true" />15 min</button><button type="button" className="przycisk przycisk--maly" onClick={() => repozytorium.zapisz(odroczPrzypomnienie(element, 60))}>1 godz.</button><button type="button" className="przycisk-ikona przycisk-ikona--sukces" title="Zrobione" onClick={() => zakoncz(element)}><Check aria-hidden="true" /></button></div></article>)}</div>}
    </Karta>
    <WidokRejestru
      tytul="Wszystkie przypomnienia"
      opis="Absolutne, względne i cykliczne. Systemowe powiadomienia zależą od przeglądarki i nie są gwarantowane po całkowitym zamknięciu PWA."
      etykietaDodawania="Nowe przypomnienie"
      dane={dane}
      repozytorium={repozytorium}
      wybranyElementId={parametryAdresu.get('element') ?? undefined}
      pola={[
        { klucz: 'tytul', etykieta: 'Treść', wymagane: true },
        { klucz: 'typ', etykieta: 'Typ', typ: 'select', wymagane: true, opcje: [{ wartosc: 'absolutne', etykieta: 'Absolutne' }, { wartosc: 'wzgledne', etykieta: 'Względne do czasu źródła' }, { wartosc: 'cykliczne', etykieta: 'Cykliczne' }] },
        { klucz: 'czas', etykieta: 'Czas / czas źródła', typ: 'text', wymagane: true, podpowiedz: 'YYYY-MM-DDTHH:mm:ss' },
        { klucz: 'przesuniecieMin', etykieta: 'Minut wcześniej (względne)', typ: 'number', min: 0 },
        { klucz: 'priorytet', etykieta: 'Priorytet', typ: 'select', wymagane: true, opcje: [{ wartosc: 'niski', etykieta: 'Niski' }, { wartosc: 'normalny', etykieta: 'Normalny' }, { wartosc: 'wysoki', etykieta: 'Wysoki' }, { wartosc: 'krytyczny', etykieta: 'Krytyczny' }] },
        { klucz: 'stan', etykieta: 'Stan', typ: 'select', wymagane: true, opcje: [{ wartosc: 'nowe', etykieta: 'Nowe' }, { wartosc: 'dostarczone', etykieta: 'Dostarczone' }, { wartosc: 'odroczone', etykieta: 'Odroczone' }, { wartosc: 'wykonane', etykieta: 'Wykonane' }, { wartosc: 'pominiete', etykieta: 'Pominięte' }, { wartosc: 'eskalowane', etykieta: 'Eskalowane' }] },
        { klucz: 'eskalacja', etykieta: 'Eskalacja', typ: 'select', wymagane: true, opcje: [{ wartosc: 'false', etykieta: 'Nie' }, { wartosc: 'true', etykieta: 'Tak' }] },
        { klucz: 'powtarzanieTyp', etykieta: 'Reguła cykliczna', typ: 'select', opcje: [{ wartosc: 'brak', etykieta: 'Brak' }, { wartosc: 'codziennie', etykieta: 'Codziennie' }, { wartosc: 'tygodniowo', etykieta: 'Tygodniowo' }, { wartosc: 'miesiecznie', etykieta: 'Miesięcznie' }, { wartosc: 'rocznie', etykieta: 'Rocznie' }] },
      ]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), tytul: formularz.tytul.trim(), typ: (formularz.typ || 'absolutne') as Przypomnienie['typ'], czas: formularz.czas || undefined, przesuniecieMin: formularz.przesuniecieMin ? Number(formularz.przesuniecieMin) : undefined, priorytet: (formularz.priorytet || 'normalny') as Przypomnienie['priorytet'], stan: (formularz.stan || 'nowe') as Przypomnienie['stan'], eskalacja: formularz.eskalacja === 'true', powtarzanie: formularz.powtarzanieTyp && formularz.powtarzanieTyp !== 'brak' ? { typ: formularz.powtarzanieTyp as NonNullable<Przypomnienie['powtarzanie']>['typ'], coIle: 1, dataStartu: formularz.czas?.slice(0, 10) } : undefined, odroczoneDo: istniejacy?.odroczoneDo, updatedAt: terazIso() })}
      etykieta={(element) => element.tytul}
      szczegoly={(element) => <><Znacznik wariant={element.stan === 'wykonane' ? 'sukces' : element.priorytet === 'krytyczny' ? 'blad' : 'neutralny'}>{element.stan}</Znacznik><span>{element.typ}</span><span>{element.czas ? new Date(element.czas).toLocaleString('pl-PL') : 'bez czasu'}</span><span>Priorytet: {element.priorytet}</span>{element.eskalacja && <Znacznik wariant="ostrzezenie">eskalacja</Znacznik>}</>}
    />
  </div>
}

export function WidokNawykow() {
  const { dane: nawyki, repozytorium } = useRepozytorium('nawyki')
  const { dane: wpisy, repozytorium: repoWpisow } = useRepozytorium('dziennikNawykow')
  const dzisiaj = dzisiajIso()
  const zapiszWpis = async (nawyk: Nawyk, status: DziennikNawyku['status']) => {
    const istniejacy = wpisy.find((wpis) => wpis.nawykId === nawyk.id && wpis.data === dzisiaj)
    await repoWpisow.zapisz({ ...(istniejacy ?? utworzMetadane(`${nawyk.id}:${dzisiaj}`)), nawykId: nawyk.id, data: dzisiaj, status, updatedAt: terazIso() })
  }
  return <div className="widok">
    <NaglowekWidoku tytul="Nawyki" opis="Regularność bez karania za pojedynczą przerwę. Możesz zapisać pełną albo minimalną wersję." />
    <div className="siatka-kart-modulow">{nawyki.filter((x) => x.aktywny).map((nawyk) => {
      const wpis = wpisy.find((x) => x.nawykId === nawyk.id && x.data === dzisiaj)
      const tydzien = statystykaNawyku(nawyk, wpisy, dzisiaj, 7)
      const miesiac = statystykaNawyku(nawyk, wpisy, dzisiaj, 30)
      return <Karta key={nawyk.id}><div className="naglowek-karty"><div><h3>{nawyk.nazwa}</h3><p>{nawyk.oknoOd && nawyk.oknoDo ? `Okno ${nawyk.oknoOd}–${nawyk.oknoDo}` : 'Elastyczne okno'}</p></div><Znacznik wariant={wpis ? 'sukces' : 'neutralny'}>{wpis?.status ?? 'czeka'}</Znacznik></div><div className="statystyki-mini"><span><strong>{tydzien.regularnosc}%</strong>7 dni</span><span><strong>{miesiac.regularnosc}%</strong>30 dni</span></div>{nawyk.minimalnaWersja && <p>Minimum: {nawyk.minimalnaWersja}</p>}<div className="akcje-karty"><button type="button" className="przycisk przycisk--maly" onClick={() => zapiszWpis(nawyk, 'pelna')}>Pełna</button><button type="button" className="przycisk przycisk--maly" onClick={() => zapiszWpis(nawyk, 'minimalna')}>Minimalna</button><button type="button" className="przycisk przycisk--tekstowy" onClick={() => zapiszWpis(nawyk, 'pominieta')}>Pomiń</button></div></Karta>
    })}</div>
    <WidokRejestru
      tytul="Definicje nawyków"
      opis="Częstotliwość, okna czasowe i minimalna wersja na słabszy dzień."
      etykietaDodawania="Nowy nawyk"
      dane={nawyki}
      repozytorium={repozytorium}
      pola={[
        { klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true },
        { klucz: 'czestotliwosc', etykieta: 'Częstotliwość', typ: 'select', wymagane: true, opcje: [{ wartosc: 'codziennie', etykieta: 'Codziennie' }, { wartosc: 'dni_robocze', etykieta: 'Dni robocze' }, { wartosc: 'wybrane_dni', etykieta: 'Wybrane dni' }, { wartosc: 'x_tygodniowo', etykieta: 'X razy w tygodniu' }, { wartosc: 'interwal', etykieta: 'Interwał' }] },
        { klucz: 'dniTygodnia', etykieta: 'Dni tygodnia (0–6)', podpowiedz: 'np. 1, 3, 5' },
        { klucz: 'razyWTygodniu', etykieta: 'Razy w tygodniu', typ: 'number', min: 1 },
        { klucz: 'interwalDni', etykieta: 'Interwał dni', typ: 'number', min: 1 },
        { klucz: 'oknoOd', etykieta: 'Okno od', typ: 'time' },
        { klucz: 'oknoDo', etykieta: 'Okno do', typ: 'time' },
        { klucz: 'preferowanyCzas', etykieta: 'Preferowana godzina', typ: 'time' },
        { klucz: 'minimalnaWersja', etykieta: 'Minimalna wersja' },
        { klucz: 'aktywny', etykieta: 'Stan', typ: 'select', wymagane: true, opcje: [{ wartosc: 'true', etykieta: 'Aktywny' }, { wartosc: 'false', etykieta: 'Nieaktywny' }] },
      ]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), czestotliwosc: (formularz.czestotliwosc || 'codziennie') as Nawyk['czestotliwosc'], dniTygodnia: formularz.dniTygodnia.split(',').map(Number).filter((x) => x >= 0 && x <= 6), razyWTygodniu: formularz.razyWTygodniu ? Number(formularz.razyWTygodniu) : undefined, interwalDni: formularz.interwalDni ? Number(formularz.interwalDni) : undefined, oknoOd: formularz.oknoOd || undefined, oknoDo: formularz.oknoDo || undefined, preferowanyCzas: formularz.preferowanyCzas || undefined, minimalnaWersja: formularz.minimalnaWersja || undefined, aktywny: formularz.aktywny !== 'false', updatedAt: terazIso() })}
      etykieta={(nawyk) => nawyk.nazwa}
      szczegoly={(nawyk) => <><Znacznik wariant={nawyk.aktywny ? 'sukces' : 'neutralny'}>{nawyk.aktywny ? 'aktywny' : 'nieaktywny'}</Znacznik><span>{nawyk.czestotliwosc.replaceAll('_', ' ')}</span>{nawyk.oknoOd && <span>{nawyk.oknoOd}–{nawyk.oknoDo}</span>}{nawyk.minimalnaWersja && <span>Minimum: {nawyk.minimalnaWersja}</span>}</>}
    />
  </div>
}

export function WidokZakupow() {
  const [parametry] = useSearchParams()
  const { dane: listy, repozytorium: repoList } = useRepozytorium('listyZakupow')
  const { dane: pozycje, repozytorium: repoPozycji } = useRepozytorium('pozycjeZakupow')
  const [aktywnaId, ustawAktywnaId] = useState<string>()
  const [listaModal, ustawListaModal] = useState<ListaZakupow | null>()
  const aktywna = listy.find((lista) => lista.id === aktywnaId)
    ?? listy.find((lista) => lista.id === parametry.get('element'))
    ?? listy.find((lista) => lista.aktywna)
    ?? listy[0]
  const elementy = pozycje.filter((pozycja) => pozycja.listaId === aktywna?.id).sort((a, b) => Number(a.kupione) - Number(b.kupione))

  return <div className="widok">
    <NaglowekWidoku tytul="Zakupy" opis="Wiele list, ilości, kategorie, sklep i opcjonalny budżet." akcje={<button type="button" className="przycisk przycisk--glowny" onClick={() => ustawListaModal({ ...utworzMetadane(), nazwa: '', aktywna: true })}><Plus aria-hidden="true" />Nowa lista</button>} />
    {listy.length === 0 ? <PustyStan tytul="Brak list zakupów" opis="Utwórz pierwszą listę, aby szybko dodawać pozycje." akcja={<button type="button" className="przycisk przycisk--glowny" onClick={() => ustawListaModal({ ...utworzMetadane(), nazwa: '', aktywna: true })}>Utwórz listę</button>} /> : <>
      <div className="zakladki-list">{listy.map((lista) => <button type="button" className={lista.id === aktywna?.id ? 'aktywna' : ''} onClick={() => ustawAktywnaId(lista.id)} key={lista.id}>{lista.nazwa}<small>{pozycje.filter((x) => x.listaId === lista.id && !x.kupione).length}</small></button>)}</div>
      {aktywna && <Karta>
        <div className="naglowek-karty"><div><h2>{aktywna.nazwa}</h2><p>{[aktywna.sklep, aktywna.lokalizacja, aktywna.budzet ? `budżet ${aktywna.budzet.toFixed(2)} zł` : ''].filter(Boolean).join(' · ') || 'Bez dodatkowych ustawień'}</p></div><div><button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawListaModal(aktywna)}>Edytuj</button><button type="button" className="przycisk-ikona przycisk-ikona--niebezpieczny" title="Usuń listę" onClick={() => repoList.usun(aktywna.id)}><Trash2 aria-hidden="true" /></button></div></div>
        <form className="szybki-wpis" onSubmit={async (e) => { e.preventDefault(); const daneForm = new FormData(e.currentTarget); const nazwa = String(daneForm.get('nazwa')).trim(); if (!nazwa) return; const pozycja: PozycjaZakupow = { ...utworzMetadane(), listaId: aktywna.id, nazwa, ilosc: String(daneForm.get('ilosc') || '1'), kategoria: String(daneForm.get('kategoria') || '') || undefined, kupione: false }; await repoPozycji.zapisz(pozycja); e.currentTarget.reset() }}><input name="nazwa" placeholder="Dodaj pozycję…" aria-label="Nazwa pozycji" /><input name="ilosc" placeholder="Ilość" defaultValue="1" aria-label="Ilość" /><input name="kategoria" placeholder="Kategoria" aria-label="Kategoria" /><button type="submit" className="przycisk przycisk--glowny">Dodaj</button></form>
        {elementy.length === 0 ? <PustyStan tytul="Lista jest pusta" opis="Dodaj pierwszą pozycję." /> : <div className="lista-zakupow">{elementy.map((pozycja) => <div className={pozycja.kupione ? 'kupione' : ''} key={pozycja.id}><button type="button" className="przycisk-check" onClick={() => repoPozycji.zapisz({ ...pozycja, kupione: !pozycja.kupione })}><Check aria-hidden="true" /></button><div><strong>{pozycja.nazwa}</strong><small>{pozycja.kategoria}</small></div><input aria-label={`Ilość ${pozycja.nazwa}`} value={pozycja.ilosc} onChange={(e) => repoPozycji.zapisz({ ...pozycja, ilosc: e.target.value })} /><button type="button" className="przycisk-ikona przycisk-ikona--niebezpieczny" onClick={() => repoPozycji.usun(pozycja.id)}><Trash2 aria-hidden="true" /></button></div>)}</div>}
      </Karta>}
    </>}
    {listaModal && <FormularzListy lista={listaModal} zamknij={() => ustawListaModal(null)} zapisz={async (lista) => { await repoList.zapisz(lista); ustawAktywnaId(lista.id); ustawListaModal(null) }} />}
  </div>
}

function FormularzListy({ lista, zamknij, zapisz }: { lista: ListaZakupow; zamknij: () => void; zapisz: (lista: ListaZakupow) => Promise<void> }) {
  const [dane, ustawDane] = useState(lista)
  return <Modal tytul={lista.nazwa ? 'Edytuj listę' : 'Nowa lista zakupów'} zamknij={zamknij}>
    <form className="formularz" onSubmit={(e) => {
      e.preventDefault()
      if (dane.nazwa.trim()) zapisz({
        ...dane,
        nazwa: dane.nazwa.trim(),
        planowanaGodzina: dane.planowanaData ? dane.planowanaGodzina : undefined,
        updatedAt: terazIso(),
      })
    }}>
      <label className="pole pole--pelne"><span>Nazwa *</span><input required value={dane.nazwa} onChange={(e) => ustawDane({ ...dane, nazwa: e.target.value })} /></label>
      <label className="pole"><span>Sklep</span><input value={dane.sklep ?? ''} onChange={(e) => ustawDane({ ...dane, sklep: e.target.value || undefined })} /></label>
      <label className="pole"><span>Lokalizacja</span><input value={dane.lokalizacja ?? ''} onChange={(e) => ustawDane({ ...dane, lokalizacja: e.target.value || undefined })} /></label>
      <label className="pole"><span>Budżet</span><input type="number" min="0" step="0.01" value={dane.budzet ?? ''} onChange={(e) => ustawDane({ ...dane, budzet: e.target.value ? Number(e.target.value) : undefined })} /></label>
      <label className="pole"><span>Planowana data</span><input type="date" value={dane.planowanaData ?? ''} onChange={(e) => ustawDane({ ...dane, planowanaData: e.target.value || undefined })} /></label>
      <label className="pole"><span>Planowana godzina</span><input type="time" value={dane.planowanaGodzina ?? ''} disabled={!dane.planowanaData} onChange={(e) => ustawDane({ ...dane, planowanaGodzina: e.target.value || undefined })} /></label>
      <label className="pole"><span>Priorytet</span><select value={dane.priorytet ?? 'normalny'} onChange={(e) => ustawDane({ ...dane, priorytet: e.target.value as ListaZakupow['priorytet'] })}><option value="normalny">Normalny</option><option value="pilny">Pilny</option><option value="asap">ASAP</option></select></label>
      <label className="pole pole-checkbox"><input type="checkbox" checked={dane.aktywna} onChange={(e) => ustawDane({ ...dane, aktywna: e.target.checked })} /><span>Lista aktywna</span></label>
      <div className="akcje-formularza pole--pelne"><button type="button" className="przycisk przycisk--drugorzedny" onClick={zamknij}>Anuluj</button><button className="przycisk przycisk--glowny" type="submit">Zapisz</button></div>
    </form>
  </Modal>
}

export function WidokRachunkow() {
  const [parametry] = useSearchParams()
  const { dane: rachunki, repozytorium } = useRepozytorium('rachunki')
  const { dane: platnosci, repozytorium: repoPlatnosci } = useRepozytorium('platnosciRachunkow')
  const [pokazHistorie, ustawPokazHistorie] = useState(false)
  const oplac = async (rachunek: Rachunek) => {
    const platnosc: PlatnoscRachunku = { ...utworzMetadane(), rachunekId: rachunek.id, kwota: rachunek.kwota, zaplaconoAt: terazIso() }
    await repoPlatnosci.zapisz(platnosc)
    const kolejnyTermin = nastepnaData(rachunek.termin, rachunek.powtarzanie)
    await repozytorium.zapisz({ ...rachunek, status: 'zaplacony' })
    if (kolejnyTermin) await repozytorium.zapisz({ ...rachunek, ...utworzMetadane(), termin: kolejnyTermin, status: 'niezaplacony' })
  }
  return <div className="widok">
    <div className="podsumowanie-finansowe"><Karta><small>Niezapłacone</small><strong>{rachunki.filter((x) => x.status === 'niezaplacony').reduce((s, x) => s + x.kwota, 0).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</strong></Karta><Karta><small>Zaległe</small><strong>{rachunki.filter((x) => x.status === 'niezaplacony' && x.termin < dzisiajIso()).length}</strong></Karta><Karta><small>Zapłacone wpisy</small><strong>{platnosci.length}</strong></Karta></div>
    <button type="button" className="przycisk przycisk--tekstowy" onClick={() => ustawPokazHistorie(!pokazHistorie)}>{pokazHistorie ? 'Ukryj historię' : 'Pokaż historię płatności'}</button>
    {pokazHistorie && <Karta><h2>Historia płatności</h2>{platnosci.map((x) => <div className="wiersz-reakcji" key={x.id}><span>{rachunki.find((r) => r.id === x.rachunekId)?.nazwa ?? 'Rachunek cykliczny'}</span><strong>{x.kwota.toFixed(2)} zł · {new Date(x.zaplaconoAt).toLocaleDateString('pl-PL')}</strong></div>)}</Karta>}
    <WidokRejestru
      tytul="Rachunki i płatności"
      opis="Terminy, status oraz wspólna reguła cykliczności. Opłacenie rachunku cyklicznego tworzy kolejne wystąpienie."
      etykietaDodawania="Nowy rachunek"
      dane={rachunki}
      repozytorium={repozytorium}
      wybranyElementId={parametry.get('element') ?? undefined}
      pola={[
        { klucz: 'nazwa', etykieta: 'Nazwa', wymagane: true }, { klucz: 'kwota', etykieta: 'Kwota', typ: 'number', wymagane: true, min: 0.01, krok: 0.01 }, { klucz: 'termin', etykieta: 'Termin', typ: 'date', wymagane: true }, { klucz: 'status', etykieta: 'Status', typ: 'select', wymagane: true, opcje: [{ wartosc: 'niezaplacony', etykieta: 'Niezapłacony' }, { wartosc: 'zaplacony', etykieta: 'Zapłacony' }] }, { klucz: 'powtarzanieTyp', etykieta: 'Cykliczność', typ: 'select', opcje: [{ wartosc: 'brak', etykieta: 'Brak' }, { wartosc: 'miesiecznie', etykieta: 'Miesięcznie' }, { wartosc: 'rocznie', etykieta: 'Rocznie' }, { wartosc: 'tygodniowo', etykieta: 'Tygodniowo' }] },
      ]}
      zbuduj={(formularz, istniejacy) => ({ ...(istniejacy ?? utworzMetadane()), nazwa: formularz.nazwa.trim(), kwota: Number(formularz.kwota), termin: formularz.termin, status: (formularz.status || 'niezaplacony') as Rachunek['status'], powtarzanie: formularz.powtarzanieTyp && formularz.powtarzanieTyp !== 'brak' ? { typ: formularz.powtarzanieTyp as NonNullable<Rachunek['powtarzanie']>['typ'], coIle: 1, dataStartu: formularz.termin } : undefined, updatedAt: terazIso() })}
      etykieta={(rachunek) => rachunek.nazwa}
      szczegoly={(rachunek) => <><Znacznik wariant={rachunek.status === 'zaplacony' ? 'sukces' : rachunek.termin < dzisiajIso() ? 'blad' : 'ostrzezenie'}>{rachunek.status === 'zaplacony' ? 'zapłacony' : rachunek.termin < dzisiajIso() ? 'zaległy' : 'niezapłacony'}</Znacznik><strong>{rachunek.kwota.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</strong><span>Termin: {rachunek.termin}</span>{rachunek.powtarzanie && <span>Cykliczność: {rachunek.powtarzanie.typ}</span>}</>}
      akcje={(rachunek) => rachunek.status === 'niezaplacony' ? <button type="button" className="przycisk przycisk--maly" onClick={() => oplac(rachunek)}><CreditCard aria-hidden="true" />Opłać</button> : <button type="button" className="przycisk-ikona" title="Przywróć jako niezapłacony" onClick={() => repozytorium.zapisz({ ...rachunek, status: 'niezaplacony' })}><RotateCcw aria-hidden="true" /></button>}
    />
  </div>
}

export function WidokMiasta() {
  const { dane: zadania, repozytorium } = useRepozytorium('zadania')
  const kontekstowe = zadania.filter((zadanie) => zadanie.status !== 'wykonane' && zadanie.kontekst)
  const grupy = kontekstowe.reduce((mapa, zadanie) => {
    const klucz = zadanie.kontekst ?? 'Inne'
    mapa.set(klucz, [...(mapa.get(klucz) ?? []), zadanie])
    return mapa
  }, new Map<string, Zadanie[]>())
  return <div className="widok"><NaglowekWidoku tytul="Sprawy na mieście" opis="Widok istniejących zadań pogrupowanych według miejsca — bez duplikowania danych." /><Karta><form className="szybki-wpis" onSubmit={async (e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const tytul = String(form.get('tytul')).trim(); const kontekst = String(form.get('kontekst')).trim(); if (!tytul || !kontekst) return; await repozytorium.zapisz(utworzZadanie({ tytul, opis: '', priorytet: 'normalny', kontekst })); e.currentTarget.reset() }}><input name="tytul" placeholder="Co trzeba załatwić?" /><input name="kontekst" placeholder="Gdzie? np. apteka" /><button className="przycisk przycisk--glowny" type="submit"><Plus aria-hidden="true" />Dodaj zadanie</button></form></Karta>{kontekstowe.length === 0 ? <PustyStan tytul="Brak spraw terenowych" opis="Dodaj zadaniu kontekst miejsca, a pojawi się tutaj." /> : <div className="siatka-kart-modulow">{Array.from(grupy.entries()).map(([kontekst, elementy]) => <Karta key={kontekst}><div className="naglowek-karty"><h2>{kontekst}</h2><Znacznik>{elementy.length}</Znacznik></div><div className="lista-kompaktowa">{elementy.map((zadanie) => <div key={zadanie.id}><button type="button" className="przycisk-check" onClick={async () => { const wynik = ukonczZadanie(zadanie); await repozytorium.zapisz(wynik.wykonane) }}><Check aria-hidden="true" /></button><div><Link to={`/zadania?element=${zadanie.id}`}><strong>{zadanie.tytul}</strong></Link><small>{zadanie.termin ?? 'bez terminu'}</small></div></div>)}</div></Karta>)}</div>}</div>
}
