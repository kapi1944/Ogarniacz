import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Karta, Komunikat, Modal, ModalPotwierdzenia } from '../../components/Interfejs'
import type { WspolnaKasa } from '../../domain/modeleFinansowWspolnych'
import type { ZakupPuli } from '../../../server/wspolne/modelePulZobowiazan.ts'
import { sumaGroszy } from '../../../server/wspolne/ObliczeniaPul.ts'
import { pobierzZakupyPuli, stornujKorekteZakupu } from '../../services/PuleService'
import { FormularzZakupuPuli, FormularzKorektyZakupu } from './FormularzeZakupowPuli'
import { dataDoWyswietlenia, kwotaDoWyswietlenia, useZapisRozliczenia } from './pomocRozliczen'

const nazwyKorekt = { cena: 'Korekta kosztu', pomylka_partii: 'Pomyłka w partii', rozbieznosc: 'Rozbieżność ilości', anulowanie: 'Anulowanie zakupu', zwrot_towaru: 'Zwrot towaru' }

export default function WidokZakupowPuli({ pula, edycja }: { pula: WspolnaKasa; edycja: boolean }) {
  const [nowy, ustawNowy] = useState(false)
  const [korygowany, ustawKorygowany] = useState<ZakupPuli>()
  const [produktId, ustawProdukt] = useState<string>()
  const [partiaId, ustawPartie] = useState<string>()
  const [storno, ustawStorno] = useState<{ zakup: ZakupPuli; korektaId: string }>()
  const [komunikat, ustawKomunikat] = useState('')
  const [proba, ustawProbe] = useState(0)
  const zapis = useZapisRozliczenia(storno?.zakup.rewizja ?? 0)
  const dane = useLiveQuery(async () => {
    try { return { widok: await pobierzZakupyPuli(pula.id), blad: '' } } catch (blad) { return { widok: undefined, blad: (blad as Error).message } }
  }, [pula.id, proba])
  if (!dane) return <p role="status">Ładowanie zakupów…</p>
  if (!dane.widok) return <><Komunikat typ="blad">{dane.blad}</Komunikat><button className="przycisk" onClick={() => ustawProbe(proba + 1)}>Ponów odczyt zakupów</button></>
  const { zakupy, wynik, ograniczenie } = dane.widok
  const partie = zakupy.flatMap((zakup) => zakup.partie.map((partia) => ({ zakup, partia, stan: wynik?.zapas.partie.find((stan) => stan.partiaId === partia.id) })))
  const produkty = [...new Set(partie.map(({ partia }) => partia.produktId))].map((id) => ({ id, partie: partie.filter(({ partia }) => partia.produktId === id) }))
  const wybranyProdukt = produkty.find((produkt) => produkt.id === produktId)
  const wybranaPartia = partie.find(({ partia }) => partia.id === partiaId)
  const kwota = (grosze: number) => kwotaDoWyswietlenia(grosze, pula.waluta)
  const zapisano = () => { ustawNowy(false); ustawKorygowany(undefined); ustawKomunikat('Zakup i zapas zostały odświeżone lokalnie.') }
  function szczegolyPartii(wiersz: typeof partie[number]) {
    const { zakup, partia, stan } = wiersz
    return <>
      <p>Zakup: {zakup.nazwa} · {dataDoWyswietlenia(zakup.dataZakupu)}</p>
      <dl className="pule-podsumowanie"><dt>Przyjęto pierwotnie</dt><dd>{partia.liczbaSztuk} szt.</dd><dt>Koszt towaru</dt><dd>{kwota(partia.kosztTowaruGrosze)}</dd><dt>Udział kosztów dodatkowych</dt><dd>{kwota(sumaGroszy(zakup.kosztyDodatkowe.flatMap((koszt) => koszt.alokacja.filter((element) => element.partiaId === partia.id).map((element) => element.kwotaGrosze))))}</dd>
        {stan && <><dt>Dostępne</dt><dd>{stan.liczbaSztuk} szt.</dd><dt>Wartość zapasu</dt><dd>{kwota(stan.wartoscZapasuGrosze)}</dd><dt>Koszt nabycia po korektach</dt><dd>{kwota(stan.kosztNabyciaGrosze)}</dd><dt>Koszt strat</dt><dd>{kwota(stan.kosztStratGrosze)}</dd></>}
      </dl>
      {stan?.przeliczono && <p>Koszt i zapas przeliczono po korektach zakupu.</p>}
      <p>Partia: {partia.id}</p><p>Produkt: {partia.produktId}</p>
      {!!partia.dokumentyIds?.length && <p>Dokumenty partii: {partia.dokumentyIds.join(', ')}</p>}
      <h3>Historia partii</h3><p>Przyjęcie: {dataDoWyswietlenia(zakup.dataZakupu)}, {partia.liczbaSztuk} szt., {kwota(partia.kosztTowaruGrosze)}</p>
      {zakup.korekty.filter((korekta) => korekta.pozycje.some((pozycja) => pozycja.partiaId === partia.id)).map((korekta) => <p key={korekta.id}>{dataDoWyswietlenia(korekta.dataOperacji)} · {nazwyKorekt[korekta.rodzaj]}{korekta.usunietoAt && ' · Stornowana'} · {korekta.uzasadnienie}{korekta.pozycje.filter((pozycja) => pozycja.partiaId === partia.id).map((pozycja) => ` · ${pozycja.zmianaSztuk} szt. · ${kwota(pozycja.zmianaKosztuGrosze ?? 0)}`)}</p>)}
    </>
  }
  return <>
    {komunikat && <Komunikat typ="sukces">{komunikat}</Komunikat>}
    {ograniczenie && <Komunikat typ="blad">Zapas i koszty niedostępne: {ograniczenie}</Komunikat>}
    {wynik && <Karta><h2>Zestawienie kosztów i zapasu</h2><dl className="pule-podsumowanie"><dt>Towar — koszt pierwotny</dt><dd>{kwota(wynik.koszty.towarGrosze)}</dd><dt>Koszty dodatkowe</dt><dd>{kwota(wynik.koszty.dodatkoweGrosze)}</dd><dt>Korekty kosztów</dt><dd>{kwota(wynik.koszty.korektyGrosze)}</dd><dt>Pozostałe koszty Puli</dt><dd>{kwota(wynik.koszty.pozostaleGrosze)}</dd><dt>Łączny koszt</dt><dd>{kwota(wynik.koszty.razemGrosze)}</dd><dt>Dostępne sztuki</dt><dd>{sumaGroszy(wynik.zapas.produkty.map((produkt) => produkt.liczbaSztuk))}</dd><dt>Wartość posiadanego zapasu</dt><dd>{kwota(wynik.wartoscZapasuGrosze)}</dd></dl></Karta>}
    <Karta><h2>Katalog produktów</h2>{!produkty.length && <p>Produkty pojawią się po pierwszym zakupie.</p>}<div className="pule-lista">{produkty.map((produkt) => <article key={produkt.id}><h3>{produkt.partie[0].partia.nazwaProduktu}</h3><p>Partie: {produkt.partie.length}</p>{wynik && <p>Dostępne: {sumaGroszy(produkt.partie.map(({ stan }) => stan?.liczbaSztuk ?? 0))} szt. · Wartość: {kwota(sumaGroszy(produkt.partie.map(({ stan }) => stan?.wartoscZapasuGrosze ?? 0)))}</p>}<button className="przycisk" onClick={() => ustawProdukt(produkt.id)}>Szczegóły produktu: {produkt.partie[0].partia.nazwaProduktu}</button></article>)}</div></Karta>
    <Karta><h2>Historia zakupów</h2>{edycja && !ograniczenie && <button className="przycisk przycisk--glowny" onClick={() => ustawNowy(true)}>Nowy zakup</button>}{!zakupy.length && <p>Brak zakupów.</p>}
      {zakupy.map((zakup) => <article className="pule-operacja" key={zakup.id}><h3>{zakup.nazwa}{zakup.korekty.some((korekta) => korekta.rodzaj === 'anulowanie' && !korekta.usunietoAt) && ' · Anulowany'}</h3><p>{dataDoWyswietlenia(zakup.dataZakupu)} · Pierwotny koszt: {kwota(sumaGroszy([...zakup.partie.map((partia) => partia.kosztTowaruGrosze), ...zakup.kosztyDodatkowe.map((koszt) => koszt.kwotaGrosze)]))}</p><p>{zakup.opis}</p>
        <details><summary>Szczegóły zakupu: {zakup.nazwa}</summary><p>Identyfikator: {zakup.id}</p><p>Dokumenty: {zakup.dokumentyIds.join(', ') || 'brak'}</p>{zakup.partie.map((partia, indeks) => <p key={partia.id}><button className="przycisk" onClick={() => ustawPartie(partia.id)}>Partia {indeks + 1}: {partia.nazwaProduktu}</button> · {partia.liczbaSztuk} szt. · {kwota(partia.kosztTowaruGrosze)}</p>)}
          <h4>Koszty dodatkowe i alokacja</h4>{!zakup.kosztyDodatkowe.length && <p>Brak kosztów dodatkowych.</p>}{zakup.kosztyDodatkowe.map((koszt) => <p key={koszt.id}>{koszt.nazwa}: {kwota(koszt.kwotaGrosze)} · {koszt.alokacja.map((alokacja) => `${zakup.partie.find((partia) => partia.id === alokacja.partiaId)?.nazwaProduktu}: ${kwota(alokacja.kwotaGrosze)}`).join(' · ')}</p>)}
          <h4>Korekty i storna</h4>{!zakup.korekty.length && <p>Brak korekt.</p>}{zakup.korekty.map((korekta) => <div key={korekta.id}><p>{nazwyKorekt[korekta.rodzaj]} · {dataDoWyswietlenia(korekta.dataOperacji)} · {korekta.uzasadnienie}{korekta.usunietoAt && ' · Stornowana'}</p>{korekta.pozycje.map((pozycja) => <p key={pozycja.partiaId}>{zakup.partie.find((partia) => partia.id === pozycja.partiaId)?.nazwaProduktu}: {pozycja.zmianaSztuk} szt. · {kwota(pozycja.zmianaKosztuGrosze ?? 0)}</p>)}{edycja && !ograniczenie && !korekta.usunietoAt && <button className="przycisk" onClick={() => ustawStorno({ zakup, korektaId: korekta.id })}>Stornuj korektę: {korekta.uzasadnienie}</button>}</div>)}
          <details><summary>Historia zmian zakupu ({zakup.historiaWersji.length})</summary>{zakup.historiaWersji.map((wersja) => <p key={wersja.rewizja}>Rewizja {wersja.rewizja} · {new Date(wersja.znacznikCzasu).toLocaleString('pl-PL')} · Korekty: {Array.isArray(wersja.po.korekty) ? wersja.po.korekty.length : 0}</p>)}</details>
        </details>
        {edycja && !ograniczenie && !zakup.korekty.some((korekta) => korekta.rodzaj === 'anulowanie' && !korekta.usunietoAt) && <button className="przycisk" onClick={() => ustawKorygowany(zakup)}>Korekta zakupu: {zakup.nazwa}</button>}
      </article>)}
    </Karta>
    {nowy && <FormularzZakupuPuli pula={pula} zakupy={zakupy} zamknij={() => ustawNowy(false)} zapisano={zapisano} />}
    {korygowany && <FormularzKorektyZakupu pula={pula} zakup={korygowany} zamknij={() => ustawKorygowany(undefined)} zapisano={zapisano} />}
    {wybranyProdukt && !wybranaPartia && <div className="pule-dialog"><Modal tytul={`Produkt: ${wybranyProdukt.partie[0].partia.nazwaProduktu}`} zamknij={() => ustawProdukt(undefined)}><div className="pule-formularz"><p>Produkt: {wybranyProdukt.id}</p>{wybranyProdukt.partie.map((wiersz, indeks) => <div key={wiersz.partia.id}><button className="przycisk" onClick={() => ustawPartie(wiersz.partia.id)}>Partia {indeks + 1} · {wiersz.zakup.nazwa} · {dataDoWyswietlenia(wiersz.zakup.dataZakupu)}</button>{wiersz.stan && <p>{wiersz.stan.liczbaSztuk} szt. · {kwota(wiersz.stan.wartoscZapasuGrosze)}</p>}</div>)}</div></Modal></div>}
    {wybranaPartia && <div className="pule-dialog"><Modal tytul={`Partia: ${wybranaPartia.partia.nazwaProduktu}`} zamknij={() => ustawPartie(undefined)}><div className="pule-formularz">{szczegolyPartii(wybranaPartia)}</div></Modal></div>}
    {storno && <div className="pule-dialog"><ModalPotwierdzenia tytul="Stornuj korektę zakupu" opis={`Skutki korekty zostaną wycofane po sprawdzeniu dostępności sztuk. Historia pozostanie zachowana. ${zapis.blad}`} anuluj={() => { if (!zapis.zajety) ustawStorno(undefined) }} potwierdz={() => zapis.wykonaj(storno, (polecenie) => stornujKorekteZakupu(storno.zakup.id, storno.korektaId, { ...polecenie, oczekiwanaRewizja: storno.zakup.rewizja }, pula.rewizja ?? 0), () => { ustawStorno(undefined); ustawKomunikat('Korekta została stornowana.') })} /></div>}
  </>
}
