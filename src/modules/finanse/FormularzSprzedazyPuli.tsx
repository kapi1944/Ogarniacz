import { useState, type FormEvent } from 'react'
import { Modal, Komunikat } from '../../components/Interfejs'
import { PoleKwoty } from '../../components/PoleKwoty'
import { PoleLiczbowe } from '../../components/PoleLiczbowe'
import { PoleDaty } from '../../components/PoleDaty'
import { liczbaDoModelu } from '../../domain/liczby'
import { dzisiajIso } from '../../domain/fabryki'
import type { WspolnaKasa } from '../../domain/modeleFinansowWspolnych'
import { cenaCalkowitaZJednostkowej, cenaJednostkowaZCalkowitej, sumaGroszy } from '../../../server/wspolne/ObliczeniaPul.ts'
import { groszeNaKwote, kwotaNaGrosze } from '../../services/ObliczeniaFinansowWspolnych'
import { zarejestrujSprzedazPuli, type pobierzSprzedazePuli } from '../../services/SprzedazPulService'
import { useZapisRozliczenia, kwotaDoWyswietlenia } from './pomocRozliczen'

type Widok = Awaited<ReturnType<typeof pobierzSprzedazePuli>>
const nowa = () => ({ id: String(crypto.randomUUID()), partiaId: '', sztuki: '1', tryb: 'calkowita' as 'calkowita' | 'jednostkowa', cena: '' })
export function FormularzSprzedazyPuli({ pula, widok, zamknij, zapisano }: { pula: WspolnaKasa; widok: Widok; zamknij: () => void; zapisano: () => void }) {
  const [poczatkowe] = useState({ pula, widok })
  const [id] = useState(() => crypto.randomUUID()), [platnoscId] = useState(() => crypto.randomUUID())
  const [pozycje, ustawPozycje] = useState(() => [nowa()])
  const [data, ustawDate] = useState(dzisiajIso), [opis, ustawOpis] = useState(''), [wplata, ustawWplate] = useState('')
  const zapis = useZapisRozliczenia()
  const partie = poczatkowe.widok.zakupy.flatMap((zakup) => zakup.partie.map((partia) => ({ zakup, partia, stan: poczatkowe.widok.wynik?.zapas.partie.find((stan) => stan.partiaId === partia.id) })))
  const zmien = (id: string, dane: Partial<ReturnType<typeof nowa>>) => ustawPozycje(pozycje.map((pozycja) => pozycja.id === id ? { ...pozycja, ...dane } : pozycja))
  function wylicz(pozycja: ReturnType<typeof nowa>) {
    const liczbaSztuk = liczbaDoModelu(pozycja.sztuki)
    const cenaCalkowitaGrosze = pozycja.tryb === 'jednostkowa' ? cenaCalkowitaZJednostkowej(pozycja.cena, liczbaSztuk, pula.waluta) : kwotaNaGrosze(pozycja.cena, pula.waluta)
    return { liczbaSztuk, cenaCalkowitaGrosze, ulamek: cenaJednostkowaZCalkowitej(cenaCalkowitaGrosze, liczbaSztuk) }
  }
  function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault()
    try {
      const dane = { dataSprzedazy: data, opis, platnoscId, otrzymanoGrosze: kwotaNaGrosze(wplata, pula.waluta), pozycje: pozycje.map((pozycja) => {
        const partia = partie.find((element) => element.partia.id === pozycja.partiaId)
        if (!partia) throw new Error('Wybierz partię produktu.')
        const cena = wylicz(pozycja)
        return { id: pozycja.id, zakupId: partia.zakup.id, partiaId: pozycja.partiaId, liczbaSztuk: cena.liczbaSztuk, cenaCalkowitaGrosze: cena.cenaCalkowitaGrosze, zrodloCeny: pozycja.tryb }
      }) }
      const ids = new Set(dane.pozycje.map((pozycja) => pozycja.zakupId))
      void zapis.wykonaj(dane, (polecenie) => zarejestrujSprzedazPuli(pula.id, id, dane, polecenie, poczatkowe.pula.rewizja ?? 0, poczatkowe.widok.zakupy.filter((zakup) => ids.has(zakup.id)).map((zakup) => ({ id: zakup.id, rewizja: zakup.rewizja }))), zapisano)
    } catch (blad) { zapis.ustawBlad((blad as Error).message) }
  }
  let razem: number | undefined
  try { razem = sumaGroszy(pozycje.map((pozycja) => wylicz(pozycja).cenaCalkowitaGrosze)) } catch { /* Szkic walidują pola ceny. */ }
  return <div className="pule-dialog"><Modal tytul="Nowa sprzedaż" zamknij={() => { if (!zapis.zajety) zamknij() }}><form className="pule-formularz" onSubmit={wyslij}><fieldset disabled={zapis.zajety}>
    <PoleDaty etykieta="Data sprzedaży" wymagane wartosc={data} zmien={ustawDate} />
    <label className="pole"><span>Opis sprzedaży</span><textarea value={opis} onChange={(zdarzenie) => ustawOpis(zdarzenie.target.value)} /></label>
    {pozycje.map((pozycja, indeks) => {
      let cena: ReturnType<typeof wylicz> | undefined
      try { cena = wylicz(pozycja) } catch { /* Niepełny szkic pozostaje w polu. */ }
      return <div className="pule-pozycja" key={pozycja.id}><h3>Pozycja {indeks + 1}</h3>
        <label className="pole"><span>Produkt i partia {indeks + 1}</span><select required value={pozycja.partiaId} onChange={(zdarzenie) => zmien(pozycja.id, { partiaId: zdarzenie.target.value })}><option value="">Wybierz produkt i partię</option>{partie.map(({ zakup, partia, stan }) => <option key={partia.id} value={partia.id}>{partia.nazwaProduktu} · {zakup.dataZakupu} · {partia.id.slice(0, 8)} · dostępne {stan?.liczbaSztuk ?? '—'} szt.</option>)}</select></label>
        <PoleLiczbowe etykieta={`Liczba sztuk ${indeks + 1}`} wymagane min={1} krok={1} wartosc={pozycja.sztuki} zmien={(sztuki) => zmien(pozycja.id, { sztuki })} />
        <label className="pole"><span>Tryb ceny {indeks + 1}</span><select value={pozycja.tryb} onChange={(zdarzenie) => zmien(pozycja.id, { tryb: zdarzenie.target.value as typeof pozycja.tryb, cena: '' })}><option value="calkowita">Cena całkowita</option><option value="jednostkowa">Cena jednostkowa</option></select></label>
        <PoleKwoty etykieta={`Cena ${pozycja.tryb === 'calkowita' ? 'całkowita' : 'jednostkowa'} ${indeks + 1}`} wymagane min="0" cenaDlaSztuk={pozycja.tryb === 'jednostkowa' ? Number(pozycja.sztuki) : undefined} wartosc={pozycja.cena} zmien={(cena) => zmien(pozycja.id, { cena })} waluta={pula.waluta} />
        {cena && <label className="pole"><span>{pozycja.tryb === 'calkowita' ? 'Cena jednostkowa — dokładny ułamek grosza' : 'Cena całkowita — wynik'}</span><input readOnly value={pozycja.tryb === 'calkowita' ? `${cena.ulamek.licznikGroszy}/${cena.ulamek.mianownik} grosza/szt.` : kwotaDoWyswietlenia(cena.cenaCalkowitaGrosze, pula.waluta)} /></label>}
        {pozycje.length > 1 && <button type="button" className="przycisk" onClick={() => ustawPozycje(pozycje.filter((element) => element.id !== pozycja.id))}>Usuń pozycję {indeks + 1}</button>}
      </div>
    })}
    <button className="przycisk" type="button" disabled={pozycje.length >= 100} onClick={() => ustawPozycje([...pozycje, nowa()])}>Dodaj pozycję sprzedaży</button>
    {razem !== undefined && <p>Razem: {kwotaDoWyswietlenia(razem, pula.waluta)} <button className="przycisk" type="button" onClick={() => ustawWplate(groszeNaKwote(razem!, pula.waluta))}>Potwierdź otrzymanie całej kwoty</button></p>}
    <PoleKwoty etykieta="Rzeczywiście otrzymana płatność" wymagane min="0" wartosc={wplata} zmien={ustawWplate} waluta={pula.waluta} />
    <p>Sprzedaż wymaga pełnej zapłaty. Zmiana trybu ceny rozpoczyna nowy zapis ceny bez zaokrąglania ułamka.</p>
    <div className="akcje-formularza"><button className="przycisk" type="button" onClick={zamknij}>Anuluj</button><button className="przycisk przycisk--glowny" type="submit">Zapisz sprzedaż</button></div>
  </fieldset>{zapis.blad && <Komunikat typ="blad">{zapis.blad}</Komunikat>}</form></Modal></div>
}
