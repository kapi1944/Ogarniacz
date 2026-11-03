import { useState, type FormEvent } from 'react'
import { Modal, Komunikat } from '../../components/Interfejs'
import { PoleKwoty } from '../../components/PoleKwoty'
import { PoleDaty } from '../../components/PoleDaty'
import { PoleLiczbowe } from '../../components/PoleLiczbowe'
import { liczbaDoModelu } from '../../domain/liczby'
import { dzisiajIso } from '../../domain/fabryki'
import type { WspolnaKasa } from '../../domain/modeleFinansowWspolnych'
import type { ZakupPuli } from '../../../server/wspolne/modelePulZobowiazan.ts'
import { alokujKoszt, sumaGroszy } from '../../../server/wspolne/ObliczeniaPul.ts'
import { kwotaNaGrosze } from '../../services/ObliczeniaFinansowWspolnych'
import { zarejestrujZakupPuli, skorygujZakupPuli, type DaneKorektyZakupu } from '../../services/PuleService'
import { useZapisRozliczenia, kwotaDoWyswietlenia } from './pomocRozliczen'

const nowaPartia = () => ({ id: String(crypto.randomUUID()), produktId: String(crypto.randomUUID()), nazwaProduktu: '', sztuki: '1', kwota: '', nowyProdukt: true })
type SzkicPartii = ReturnType<typeof nowaPartia>

export function FormularzZakupuPuli({ pula, zakupy, zamknij, zapisano }: { pula: WspolnaKasa; zakupy: ZakupPuli[]; zamknij: () => void; zapisano: () => void }) {
  const [poczatkowa] = useState(pula)
  const [id] = useState(() => crypto.randomUUID())
  const [operacjaGotowkiId] = useState(() => crypto.randomUUID())
  const [nazwa, ustawNazwe] = useState('')
  const [data, ustawDate] = useState(dzisiajIso)
  const [opis, ustawOpis] = useState('')
  const [dokumenty, ustawDokumenty] = useState('')
  const [partie, ustawPartie] = useState(() => [nowaPartia()])
  const [koszty, ustawKoszty] = useState<{ id: string; nazwa: string; kwota: string }[]>([])
  const zapis = useZapisRozliczenia()
  const produkty = [...new Map(zakupy.flatMap((zakup) => zakup.partie).map((partia) => [partia.produktId, partia])).values()]
  const zmienPartie = (id: string, zmiana: Partial<SzkicPartii>) => ustawPartie((poprzednie) => poprzednie.map((partia) => partia.id === id ? { ...partia, ...zmiana } : partia))
  const zamknijBezZapisu = () => { if (!zapis.zajety) zamknij() }
  let podglad: { razem: number; alokacje: { nazwa: string; kwoty: { partiaId: string; kwotaGrosze: number }[] }[] } | undefined
  try {
    const wagi = partie.map((partia) => ({ id: partia.id, kosztTowaruGrosze: kwotaNaGrosze(partia.kwota, pula.waluta), liczbaSztuk: liczbaDoModelu(partia.sztuki) }))
    podglad = { razem: sumaGroszy([...wagi.map((partia) => partia.kosztTowaruGrosze), ...koszty.map((koszt) => kwotaNaGrosze(koszt.kwota, pula.waluta))]), alokacje: koszty.map((koszt) => ({ nazwa: koszt.nazwa, kwoty: alokujKoszt(kwotaNaGrosze(koszt.kwota, pula.waluta), wagi) })) }
  } catch { /* Szkic kwot i ilości walidują wspólne pola. */ }
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    try {
      const dane = { nazwa, dataZakupu: data, opis, operacjaGotowkiId, dokumentyIds: dokumenty.split(/[\s,;]+/).filter(Boolean), partie: partie.map((partia) => ({ id: partia.id, produktId: partia.produktId, nazwaProduktu: partia.nazwaProduktu, liczbaSztuk: liczbaDoModelu(partia.sztuki), kosztTowaruGrosze: kwotaNaGrosze(partia.kwota, pula.waluta) })), kosztyDodatkowe: koszty.map((koszt) => ({ id: koszt.id, nazwa: koszt.nazwa, kwotaGrosze: kwotaNaGrosze(koszt.kwota, pula.waluta) })) }
      void zapis.wykonaj(dane, (polecenie) => zarejestrujZakupPuli(pula.id, id, dane, polecenie, poczatkowa.rewizja ?? 0), zapisano)
    } catch (blad) { zapis.ustawBlad((blad as Error).message) }
  }
  return <div className="pule-dialog"><Modal tytul="Nowy zakup" zamknij={zamknijBezZapisu}><form className="pule-formularz" onSubmit={wyslij}><fieldset disabled={zapis.zajety}>
    <label className="pole"><span>Nazwa zakupu</span><input required value={nazwa} onChange={(zdarzenie) => ustawNazwe(zdarzenie.target.value)} /></label>
    <PoleDaty etykieta="Data zakupu" wymagane wartosc={data} zmien={ustawDate} />
    <label className="pole"><span>Opis zakupu</span><textarea value={opis} onChange={(zdarzenie) => ustawOpis(zdarzenie.target.value)} /></label>
    <h3>Partie produktów</h3>
    {partie.map((partia, indeks) => <div className="pule-pozycja" key={partia.id}><h4>Partia {indeks + 1}</h4>
      <label className="pole"><span>Produkt — partia {indeks + 1}</span><select value={partia.nowyProdukt ? '' : partia.produktId} onChange={(zdarzenie) => {
        const produkt = produkty.find((element) => element.produktId === zdarzenie.target.value)
        zmienPartie(partia.id, produkt ? { nowyProdukt: false, produktId: produkt.produktId, nazwaProduktu: produkt.nazwaProduktu } : { nowyProdukt: true, produktId: crypto.randomUUID(), nazwaProduktu: '' })
      }}><option value="">Nowy produkt</option>{produkty.map((produkt) => <option key={produkt.produktId} value={produkt.produktId}>{produkt.nazwaProduktu} · {produkt.produktId.slice(0, 8)}</option>)}</select></label>
      {partia.nowyProdukt && <label className="pole"><span>Nazwa produktu — partia {indeks + 1}</span><input required value={partia.nazwaProduktu} onChange={(zdarzenie) => zmienPartie(partia.id, { nazwaProduktu: zdarzenie.target.value })} /></label>}
      <PoleLiczbowe etykieta={`Liczba sztuk — partia ${indeks + 1}`} wymagane min={1} max={Number.MAX_SAFE_INTEGER} krok={1} wartosc={partia.sztuki} zmien={(sztuki) => zmienPartie(partia.id, { sztuki })} />
      <PoleKwoty etykieta={`Koszt całej partii ${indeks + 1}`} wymagane min="0" waluta={pula.waluta} wartosc={partia.kwota} zmien={(kwota) => zmienPartie(partia.id, { kwota })} />
      {partie.length > 1 && <button type="button" className="przycisk" onClick={() => ustawPartie(partie.filter((element) => element.id !== partia.id))}>Usuń partię {indeks + 1} ze szkicu</button>}
    </div>)}
    <button type="button" className="przycisk" disabled={partie.length >= 100} onClick={() => ustawPartie([...partie, nowaPartia()])}>Dodaj partię</button>
    <h3>Koszty dodatkowe</h3>
    {koszty.map((koszt, indeks) => <div className="pule-pozycja" key={koszt.id}>
      <label className="pole"><span>Nazwa kosztu {indeks + 1}</span><input required list="pule-rodzaje-kosztow" value={koszt.nazwa} onChange={(zdarzenie) => ustawKoszty(koszty.map((element) => element.id === koszt.id ? { ...element, nazwa: zdarzenie.target.value } : element))} /></label>
      <PoleKwoty etykieta={`Kwota kosztu ${indeks + 1}`} wymagane min="0" waluta={pula.waluta} wartosc={koszt.kwota} zmien={(kwota) => ustawKoszty(koszty.map((element) => element.id === koszt.id ? { ...element, kwota } : element))} />
      <button type="button" className="przycisk" onClick={() => ustawKoszty(koszty.filter((element) => element.id !== koszt.id))}>Usuń koszt {indeks + 1} ze szkicu</button>
    </div>)}
    <datalist id="pule-rodzaje-kosztow">{['Dostawa', 'Transport', 'Opakowania', 'Prowizja', 'Pozostałe koszty'].map((nazwa) => <option key={nazwa} value={nazwa} />)}</datalist>
    <button type="button" className="przycisk" disabled={koszty.length >= 100} onClick={() => ustawKoszty([...koszty, { id: crypto.randomUUID(), nazwa: 'Dostawa', kwota: '' }])}>Dodaj koszt dodatkowy</button>
    <label className="pole"><span>Identyfikatory dokumentów (opcjonalne)</span><textarea value={dokumenty} onChange={(zdarzenie) => ustawDokumenty(zdarzenie.target.value)} /></label>
    <small>UUID istniejących dokumentów z ochroną finansową, oddzielone przecinkami. Dodawanie plików będzie dostępne w późniejszym etapie.</small>
    {podglad && <div><p>Łączny wydatek: <strong>{kwotaDoWyswietlenia(podglad.razem, pula.waluta)}</strong></p>{podglad.alokacje.map((koszt, indeks) => <p key={indeks}>{koszt.nazwa}: {koszt.kwoty.map((kwota) => `partia ${partie.findIndex((partia) => partia.id === kwota.partiaId) + 1}: ${kwotaDoWyswietlenia(kwota.kwotaGrosze, pula.waluta)}`).join(' · ')}</p>)}</div>}
    <p>Zakup jest opłacony. Towar i koszty dodatkowe zostaną ujęte w jednym wydatku Puli.</p>
    <div className="akcje-formularza"><button type="button" className="przycisk" onClick={zamknijBezZapisu}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny">{zapis.zajety ? 'Zapisywanie…' : 'Zapisz zakup'}</button></div>
  </fieldset>{zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}</form></Modal></div>
}

export function FormularzKorektyZakupu({ pula, zakup, zamknij, zapisano }: { pula: WspolnaKasa; zakup: ZakupPuli; zamknij: () => void; zapisano: () => void }) {
  const [poczatkowe] = useState({ pula, zakup })
  const [id] = useState(() => crypto.randomUUID())
  const [rodzaj, ustawRodzaj] = useState('cena')
  const [partiaId, ustawPartie] = useState(zakup.partie[0].id)
  const [drugaPartiaId, ustawDrugaPartie] = useState(zakup.partie[1]?.id ?? '')
  const [kwota, ustawKwote] = useState('')
  const [sztuki, ustawSztuki] = useState('')
  const [data, ustawDate] = useState(dzisiajIso)
  const [powod, ustawPowod] = useState('')
  const zapis = useZapisRozliczenia(poczatkowe.zakup.rewizja)
  const zamknijBezZapisu = () => { if (!zapis.zajety) zamknij() }
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    try {
      const kwotaGrosze = ['cena', 'koszty', 'rozbieznosc'].includes(rodzaj) ? kwotaNaGrosze(kwota, pula.waluta) : 0
      const liczbaSztuk = ['pomylka_partii', 'rozbieznosc'].includes(rodzaj) ? liczbaDoModelu(sztuki) : 0
      const dane: DaneKorektyZakupu = { rodzaj: rodzaj === 'koszty' ? 'cena' : rodzaj as DaneKorektyZakupu['rodzaj'], dataOperacji: data, uzasadnienie: rodzaj === 'koszty' ? `Koszty dodatkowe: ${powod}` : powod, pozycje: rodzaj === 'anulowanie' ? [] : rodzaj === 'koszty' ? alokujKoszt(Math.abs(kwotaGrosze), zakup.partie).filter((pozycja) => pozycja.kwotaGrosze).map((pozycja) => ({ partiaId: pozycja.partiaId, zmianaSztuk: 0, zmianaKosztuGrosze: pozycja.kwotaGrosze * Math.sign(kwotaGrosze) })) : rodzaj === 'pomylka_partii' ? [{ partiaId, zmianaSztuk: -liczbaSztuk }, { partiaId: drugaPartiaId, zmianaSztuk: liczbaSztuk }] : [{ partiaId, zmianaSztuk: liczbaSztuk, zmianaKosztuGrosze: kwotaGrosze }] }
      if (!powod.trim()) throw new Error('Wpisz uzasadnienie korekty.')
      void zapis.wykonaj(dane, (polecenie) => skorygujZakupPuli(zakup.id, id, dane, polecenie, poczatkowe.pula.rewizja ?? 0), zapisano)
    } catch (blad) { zapis.ustawBlad((blad as Error).message) }
  }
  return <div className="pule-dialog"><Modal tytul={`Korekta zakupu: ${zakup.nazwa}`} zamknij={zamknijBezZapisu}><form className="pule-formularz" onSubmit={wyslij}><fieldset disabled={zapis.zajety}>
    <label className="pole"><span>Rodzaj korekty</span><select value={rodzaj} onChange={(zdarzenie) => ustawRodzaj(zdarzenie.target.value)}><option value="cena">Cena zakupu partii</option><option value="koszty">Koszty dodatkowe — alokacja na partie</option><option value="pomylka_partii" disabled={zakup.partie.length < 2}>Pomyłka w partii</option><option value="rozbieznosc">Udokumentowana rozbieżność ilości</option><option value="anulowanie">Anulowanie błędnego zakupu</option></select></label>
    {!['koszty', 'anulowanie'].includes(rodzaj) && <label className="pole"><span>Partia źródłowa</span><select value={partiaId} onChange={(zdarzenie) => ustawPartie(zdarzenie.target.value)}>{zakup.partie.map((partia, indeks) => <option key={partia.id} value={partia.id}>{indeks + 1}. {partia.nazwaProduktu} · {partia.id.slice(0, 8)}</option>)}</select></label>}
    {rodzaj === 'pomylka_partii' && <label className="pole"><span>Właściwa partia</span><select required value={drugaPartiaId} onChange={(zdarzenie) => ustawDrugaPartie(zdarzenie.target.value)}>{zakup.partie.map((partia, indeks) => <option key={partia.id} value={partia.id}>{indeks + 1}. {partia.nazwaProduktu} · {partia.id.slice(0, 8)}</option>)}</select></label>}
    {['pomylka_partii', 'rozbieznosc'].includes(rodzaj) && <PoleLiczbowe etykieta="Zmiana liczby sztuk" wymagane min={rodzaj === 'pomylka_partii' ? 1 : undefined} krok={1} wartosc={sztuki} zmien={ustawSztuki} />}
    {['cena', 'koszty', 'rozbieznosc'].includes(rodzaj) && <PoleKwoty etykieta="Zmiana kosztu (ze znakiem)" wymagane wartosc={kwota} zmien={ustawKwote} waluta={pula.waluta} />}
    {rodzaj === 'rozbieznosc' && <p>Dla straty wpisz ujemną ilość i zmianę kosztu 0. Dla dodatkowych sztuk podaj ich koszt nabycia.</p>}
    {rodzaj === 'anulowanie' ? <Komunikat>Anulowanie służy wyłącznie błędnemu zapisowi: wycofa dostępne sztuki i stornuje pierwotny wydatek. Faktycznego zwrotu pieniędzy od dostawcy nie rejestruj jako anulowania.</Komunikat> : <p>Korekta zachowuje oryginalne dane. Zmiana kosztu nie oznacza dopłaty ani zwrotu gotówki.</p>}
    <PoleDaty etykieta="Data korekty" wymagane wartosc={data} zmien={ustawDate} />
    <label className="pole"><span>Uzasadnienie korekty</span><textarea required value={powod} onChange={(zdarzenie) => ustawPowod(zdarzenie.target.value)} /></label>
    <div className="akcje-formularza"><button type="button" className="przycisk" onClick={zamknijBezZapisu}>Anuluj</button><button type="submit" className="przycisk przycisk--glowny">{zapis.zajety ? 'Zapisywanie…' : 'Zapisz korektę'}</button></div>
  </fieldset>{zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}</form></Modal></div>
}
