import type { ObrazFz } from './WalidacjaPulZobowiazan.ts'
import { sumaGroszy, obliczStanPartii, type ZdarzeniePartii } from './ObliczeniaPul.ts'

export function obliczMagazynPuli(obraz: ObrazFz, pulaId: string, dataOdniesienia: string) {
  const partie = obraz.zakupyPul.filter((zakup) => zakup.pulaId === pulaId && !zakup.usunietoAt && zakup.dataZakupu <= dataOdniesienia).flatMap((zakup) => zakup.partie.filter((partia) => !partia.usunietoAt).map((partia) => {
    const korektyZakupu = zakup.korekty.filter((korekta) => !korekta.usunietoAt && korekta.dataOperacji <= dataOdniesienia)
    const dodatkoweGrosze = sumaGroszy(zakup.kosztyDodatkowe.filter((koszt) => !koszt.usunietoAt).flatMap((koszt) => koszt.alokacja.filter((alokacja) => alokacja.partiaId === partia.id).map((alokacja) => alokacja.kwotaGrosze)))
    const zmianaKosztu = sumaGroszy(korektyZakupu.filter((korekta) => korekta.rodzaj === 'cena' || korekta.rodzaj === 'rozbieznosc').flatMap((korekta) => korekta.pozycje.filter((pozycja) => pozycja.partiaId === partia.id && (korekta.rodzaj === 'cena' || pozycja.zmianaSztuk > 0)).map((pozycja) => pozycja.zmianaKosztuGrosze ?? 0)))
    const kosztGrosze = sumaGroszy([partia.kosztTowaruGrosze, dodatkoweGrosze, zmianaKosztu])
    // Pomyłka przyjęcia zmienia przypisanie ilości, zachowując osobny koszt każdej partii.
    const przyjeteSztuki = sumaGroszy([partia.liczbaSztuk, ...korektyZakupu.filter((korekta) => korekta.rodzaj === 'pomylka_partii').flatMap((korekta) => korekta.pozycje.filter((pozycja) => pozycja.partiaId === partia.id).map((pozycja) => pozycja.zmianaSztuk))])
    if (przyjeteSztuki < 0 || przyjeteSztuki === 0 && kosztGrosze !== 0) throw new Error('Korekta przyjęcia wymaga nieujemnej ilości i zerowego kosztu pustej partii.')
    const zdarzenia: ZdarzeniePartii[] = []
    for (const sprzedaz of obraz.sprzedazePul.filter((sprzedaz) => sprzedaz.pulaId === pulaId && !sprzedaz.usunietoAt && sprzedaz.dataSprzedazy <= dataOdniesienia)) {
      for (const pozycja of sprzedaz.pozycje.filter((pozycja) => !pozycja.usunietoAt && pozycja.partiaId === partia.id)) {
        if (sprzedaz.dataSprzedazy < zakup.dataZakupu) throw new Error('Wydanie poprzedza przyjęcie partii.')
        const idWydania = `${sprzedaz.id}:${pozycja.id}`
        zdarzenia.push({ id: idWydania, data: sprzedaz.dataSprzedazy, rodzaj: 'wydanie', liczbaSztuk: pozycja.liczbaSztuk })
      }
      for (const korekta of sprzedaz.korekty.filter((korekta) => !korekta.usunietoAt && korekta.dataOperacji <= dataOdniesienia)) {
        if (korekta.dataOperacji < sprzedaz.dataSprzedazy) throw new Error('Korekta poprzedza sprzedaż.')
        for (const [indeks, pozycja] of korekta.pozycje.entries()) {
          if (pozycja.partiaId !== partia.id || pozycja.zmianaSztuk === 0) continue
          if (!sprzedaz.pozycje.some((oryginalna) => oryginalna.id === pozycja.pozycjaId)) throw new Error('Korekta nie wskazuje oryginalnej pozycji sprzedaży.')
          const poprzedniWpis = sprzedaz.korekty.slice(0, sprzedaz.korekty.indexOf(korekta)).filter((element) => !element.usunietoAt && element.dataOperacji <= korekta.dataOperacji).flatMap((element) => element.pozycje.map((wiersz, indeks) => ({ element, wiersz, indeks }))).filter(({ wiersz }) => wiersz.partiaId === partia.id && wiersz.pozycjaId === pozycja.pozycjaId && wiersz.zmianaSztuk !== 0).at(-1)
          const poprzednikId = poprzedniWpis ? poprzedniWpis.element.id + ':' + poprzedniWpis.indeks : undefined
          if (pozycja.zmianaSztuk > 0) zdarzenia.push({ id: `${korekta.id}:${indeks}`, data: korekta.dataOperacji, rodzaj: 'zwrot', poprzednikId, liczbaSztuk: pozycja.zmianaSztuk, zrodloId: (() => {
            const poprzednie = sprzedaz.korekty.filter((element, indeks) => !element.usunietoAt && element.rodzaj === 'pomylka_partii' && (element.dataOperacji < korekta.dataOperacji || element.dataOperacji === korekta.dataOperacji && indeks < sprzedaz.korekty.indexOf(korekta)))
            const przeniesienie = poprzednie.flatMap((element) => element.pozycje.map((wiersz, indeks) => ({ element, wiersz, indeks }))).filter(({ wiersz }) => wiersz.partiaId === partia.id && wiersz.pozycjaId === pozycja.pozycjaId && wiersz.zmianaSztuk < 0).at(-1)
            return przeniesienie ? `${przeniesienie.element.id}:${przeniesienie.indeks}` : `${sprzedaz.id}:${pozycja.pozycjaId}`
          })(), uszkodzoneSztuki: pozycja.sztukiUszkodzone ?? 0 })
          else zdarzenia.push({ id: `${korekta.id}:${indeks}`, data: korekta.dataOperacji, rodzaj: 'wydanie', poprzednikId, liczbaSztuk: -pozycja.zmianaSztuk })
        }
      }
    }
    for (const korekta of korektyZakupu.filter((korekta) => korekta.rodzaj !== 'cena' && korekta.rodzaj !== 'pomylka_partii')) for (const [indeks, pozycja] of korekta.pozycje.entries()) if (pozycja.partiaId === partia.id && pozycja.zmianaSztuk) {
      zdarzenia.push({ id: `${korekta.id}:${indeks}`, data: korekta.dataOperacji, rodzaj: pozycja.zmianaSztuk > 0 ? 'przyjecie' : korekta.rodzaj === 'rozbieznosc' ? 'strata' : 'zwrot_dostawcy', liczbaSztuk: Math.abs(pozycja.zmianaSztuk), odSztuki: pozycja.odSztuki })
    }
    const wszystkieSztuki = sumaGroszy([przyjeteSztuki, ...zdarzenia.filter((zdarzenie) => zdarzenie.rodzaj === 'przyjecie').map((zdarzenie) => zdarzenie.liczbaSztuk)])
    return { partiaId: partia.id, produktId: partia.produktId, zakupId: zakup.id, kosztNabyciaGrosze: kosztGrosze, przeliczono: korektyZakupu.length > 0, ...obliczStanPartii(kosztGrosze, wszystkieSztuki || 1, zdarzenia, przyjeteSztuki) }
  }))
  return partie
}
