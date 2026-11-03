import { z } from 'zod'
import { baza } from '../data/BazaOgarniacza'
import { schematSprzedazyPuli, type SprzedazPuli } from '../../server/wspolne/modelePulZobowiazan.ts'
import { stanFinansowy } from '../../server/wspolne/WalidacjaPulZobowiazan.ts'
import { cenaJednostkowaZCalkowitej, sumaGroszy } from '../../server/wspolne/ObliczeniaPul.ts'
import { obliczProjekcjePuli } from '../../server/wspolne/ProjekcjePul.ts'
import { obrazPul, pobierzWidokPuli } from './WspolneKasyService'
import { wymagajRekordu, wTransakcjiFinansowej, zapiszGrupeFinansowa, type PolecenieZapisuFinansowego } from './ZapisFinansowWspolnych'

const schematPozycji = z.object(schematSprzedazyPuli.shape.pozycje.element.shape).omit({ createdAt: true, updatedAt: true, usunietoAt: true, cenaJednostkowa: true }).strict()
const schematDanych = schematSprzedazyPuli.pick({ dataSprzedazy: true, opis: true }).extend({ pozycje: z.array(schematPozycji).min(1).max(100), otrzymanoGrosze: z.number().int().safe().nonnegative(), platnoscId: z.uuid() }).strict()
export type DaneSprzedazyPuli = z.infer<typeof schematDanych>

export async function zarejestrujSprzedazPuli(pulaId: string, id: string, dane: DaneSprzedazyPuli, polecenie: PolecenieZapisuFinansowego, rewizjaPuli: number, rewizjeZakupow: { id: string; rewizja: number }[]) {
  const poprawne = schematDanych.parse(dane)
  const cena = sumaGroszy(poprawne.pozycje.map((pozycja) => pozycja.cenaCalkowitaGrosze))
  if (cena !== poprawne.otrzymanoGrosze) throw new Error('FZ-5 wymaga pełnej zapłaty równej cenie sprzedaży.')
  await wTransakcjiFinansowej('edycja', async () => {
    const widok = await pobierzWidokPuli(pulaId)
    const stary = await baza.tabela('sprzedazePul').get(id)
    const ponowienie = stary?.historiaWersji.some((wersja) => wersja.idZapisu === polecenie.idZapisu)
    if (widok.pula.pula?.rodzaj !== 'zakupowa' || !ponowienie && widok.pula.status !== 'aktywna' || widok.ograniczenie) throw new Error(widok.ograniczenie || 'Sprzedaż wymaga aktywnej Puli zakupowej.')
    const teraz = stary?.pozycje[0].createdAt ?? new Date().toISOString()
    const { platnoscId, otrzymanoGrosze: _otrzymano, ...tresc } = poprawne
    const pozycje = poprawne.pozycje.map((pozycja) => ({ ...pozycja, createdAt: teraz, updatedAt: teraz, cenaJednostkowa: cenaJednostkowaZCalkowitej(pozycja.cenaCalkowitaGrosze, pozycja.liczbaSztuk) }))
    await zapiszGrupeFinansowa({
      idZapisu: polecenie.idZapisu, idOperacjiZrodlowej: polecenie.idZapisu,
      oczekiwaneRewizje: [{ tabela: 'wspolneKasy', id: pulaId, rewizja: rewizjaPuli }, { tabela: 'sprzedazePul', id, rewizja: polecenie.oczekiwanaRewizja }, ...rewizjeZakupow.map((zakup) => ({ tabela: 'zakupyPul' as const, ...zakup })), ...(cena ? [{ tabela: 'operacjeKas' as const, id: platnoscId, rewizja: 0 }] : [])],
      zapisy: [{ tabela: 'sprzedazePul', id, operacja: 'utworzenie', dane: { ...tresc, pozycje, pulaId, waluta: widok.pula.waluta, korekty: [], idOperacjiZrodlowej: polecenie.idZapisu, rolaZapisu: 'sprzedaz', ...(cena ? { operacjaPierwszejZaplatyId: platnoscId } : {}) } }, ...(cena ? [{ tabela: 'operacjeKas' as const, id: platnoscId, operacja: 'utworzenie' as const, dane: { kasaId: pulaId, typ: 'wplyw', kwotaGrosze: cena, waluta: widok.pula.waluta, dataOperacji: poprawne.dataSprzedazy, opis: poprawne.opis || 'Zapłata za sprzedaż', zrodlo: '', kategoria: '', powiazaniePuli: { wersja: 1, rodzaj: 'zaplataSprzedazy', sprzedazId: id, rolaZapisu: 'pierwsza_zaplata', idOperacjiZrodlowej: polecenie.idZapisu } } }] : [])],
    })
    const projekcja = obliczProjekcjePuli(await obrazPul(), pulaId, '9999-12-31')
    if (!projekcja.kompletne) throw new Error(projekcja.przyczyna)
  })
}

export async function pobierzSprzedazePuli(pulaId: string) {
  return wTransakcjiFinansowej('odczyt', async () => {
    const widok = await pobierzWidokPuli(pulaId), obraz = await obrazPul()
    const projekcja = obliczProjekcjePuli(obraz, pulaId, '9999-12-31')
    return { sprzedaze: obraz.sprzedazePul.filter((sprzedaz) => sprzedaz.pulaId === pulaId).sort((pierwsza, druga) => druga.dataSprzedazy.localeCompare(pierwsza.dataSprzedazy) || pierwsza.id.localeCompare(druga.id)), zakupy: obraz.zakupyPul.filter((zakup) => zakup.pulaId === pulaId), wynik: !widok.ograniczenie && projekcja.kompletne ? projekcja.wynik : undefined, ograniczenie: widok.ograniczenie || (!projekcja.kompletne ? projekcja.przyczyna : '') }
  })
}

export function pozostalePozycjeSprzedazy(sprzedaz: SprzedazPuli) {
  return sprzedaz.pozycje.map((pozycja) => {
    const korekty = sprzedaz.korekty.filter((korekta) => !korekta.usunietoAt)
    const przeniesienie = korekty.filter((korekta) => korekta.rodzaj === 'pomylka_partii').flatMap((korekta) => korekta.pozycje).filter((element) => element.pozycjaId === pozycja.id && element.zmianaSztuk < 0).at(-1)
    return { ...pozycja, partiaId: przeniesienie?.partiaId ?? pozycja.partiaId, pozostaloSztuk: sumaGroszy([pozycja.liczbaSztuk, ...korekty.filter((korekta) => korekta.rodzaj !== 'pomylka_partii').flatMap((korekta) => korekta.pozycje.filter((element) => element.pozycjaId === pozycja.id).map((element) => -element.zmianaSztuk))]), pozostalaCenaGrosze: sumaGroszy([pozycja.cenaCalkowitaGrosze, ...korekty.flatMap((korekta) => korekta.pozycje.filter((element) => element.pozycjaId === pozycja.id).map((element) => element.zmianaCenyGrosze ?? 0))]) }
  })
}

const schematKorekty = z.object({ rodzaj: z.enum(['cena', 'zwrot_towaru', 'pomylka_partii', 'anulowanie']), pozycjaId: z.uuid(), dataOperacji: z.iso.date(), uzasadnienie: z.string().trim().min(1, 'Wpisz uzasadnienie.'), liczbaSztuk: z.number().int().safe().nonnegative(), uszkodzoneSztuki: z.number().int().safe().nonnegative(), partiaDocelowaId: z.string(), zmianaCenyGrosze: z.number().int().safe(), rozliczonoGrosze: z.number().int().safe() }).strict()
export type DaneKorektySprzedazy = z.infer<typeof schematKorekty>

export async function skorygujSprzedazPuli(id: string, korektaId: string, dane: DaneKorektySprzedazy, polecenie: PolecenieZapisuFinansowego, rewizjaPuli: number, rewizjeZakupow: { id: string; rewizja: number }[]) {
  const poprawne = schematKorekty.parse(dane)
  await wTransakcjiFinansowej('edycja', async () => {
    const aktualna = wymagajRekordu(await baza.tabela('sprzedazePul').get(id))
    const poprzednia = aktualna.historiaWersji.find((wersja) => wersja.idZapisu === polecenie.idZapisu)
    const sprzedaz = poprzednia?.przed ? { ...aktualna, ...poprzednia.przed } as SprzedazPuli : aktualna
    const widok = await pobierzWidokPuli(sprzedaz.pulaId)
    if (!poprzednia && widok.pula.status !== 'aktywna' || widok.ograniczenie || sprzedaz.zobowiazanieId) throw new Error('Korekta wymaga aktywnej, kompletnej Puli bez odroczonej płatności.')
    if (sprzedaz.korekty.some((korekta) => !korekta.usunietoAt && korekta.rodzaj === 'anulowanie')) throw new Error('Sprzedaż jest już anulowana.')
    const pozostale = pozostalePozycjeSprzedazy(sprzedaz), wybrana = pozostale.find((pozycja) => pozycja.id === poprawne.pozycjaId)
    if (!wybrana) throw new Error('Wybierz pozycję tej sprzedaży.')
    let pozycje: SprzedazPuli['korekty'][number]['pozycje']
    if (poprawne.rodzaj === 'anulowanie') {
      pozycje = pozostale.map((pozycja) => ({ partiaId: pozycja.partiaId, pozycjaId: pozycja.id, zmianaSztuk: pozycja.pozostaloSztuk, sztukiDoSprzedazy: pozycja.pozostaloSztuk, sztukiUszkodzone: 0, zmianaCenyGrosze: -pozycja.pozostalaCenaGrosze }))
    } else if (poprawne.rodzaj === 'pomylka_partii') {
      if (poprawne.zmianaCenyGrosze || poprawne.rozliczonoGrosze) throw new Error('Korekta partii nie zmienia ceny ani gotówki.')
      pozycje = [{ partiaId: wybrana.partiaId, pozycjaId: wybrana.id, zmianaSztuk: wybrana.pozostaloSztuk }, { partiaId: poprawne.partiaDocelowaId, pozycjaId: wybrana.id, zmianaSztuk: -wybrana.pozostaloSztuk }]
    } else {
      if (poprawne.rodzaj === 'zwrot_towaru' && (poprawne.liczbaSztuk < 1 || poprawne.liczbaSztuk > wybrana.pozostaloSztuk || poprawne.uszkodzoneSztuki > poprawne.liczbaSztuk || poprawne.zmianaCenyGrosze > 0)) throw new Error('Niepoprawna ilość lub cena zwrotu.')
      if (sumaGroszy([wybrana.pozostalaCenaGrosze, poprawne.zmianaCenyGrosze]) < 0) throw new Error('Korekta przekracza cenę pozycji.')
      pozycje = [{ partiaId: wybrana.partiaId, pozycjaId: wybrana.id, zmianaSztuk: poprawne.rodzaj === 'cena' ? 0 : poprawne.liczbaSztuk, zmianaCenyGrosze: poprawne.zmianaCenyGrosze, ...(poprawne.rodzaj === 'zwrot_towaru' ? { sztukiDoSprzedazy: poprawne.liczbaSztuk - poprawne.uszkodzoneSztuki, sztukiUszkodzone: poprawne.uszkodzoneSztuki } : {}) }]
    }
    const roznica = sumaGroszy(pozycje.map((pozycja) => pozycja.zmianaCenyGrosze ?? 0))
    const obraz = await obrazPul()
    for (const pozycja of pozycje) {
      const zakup = obraz.zakupyPul.find((zakup) => zakup.pulaId === sprzedaz.pulaId && zakup.partie.some((partia) => partia.id === pozycja.partiaId))
      if (!zakup || zakup.usunietoAt || zakup.dataZakupu > poprawne.dataOperacji || !rewizjeZakupow.some((warunek) => warunek.id === zakup.id)) throw new Error('Korekta wymaga zgodnej partii i rewizji jej zakupu.')
    }
    if (roznica !== poprawne.rozliczonoGrosze) throw new Error('Nierozliczona dopłata lub zwrot wymaga FZ-6. Potwierdź rzeczywistą pełną dopłatę/zwrot.')
    const teraz = (poprzednia?.po.korekty as SprzedazPuli['korekty'] | undefined)?.find((korekta) => korekta.id === korektaId)?.createdAt ?? new Date().toISOString()
    const korekta = { id: korektaId, createdAt: teraz, updatedAt: teraz, rodzaj: poprawne.rodzaj, dataOperacji: poprawne.dataOperacji, uzasadnienie: poprawne.uzasadnienie, pozycje, powiazaneOperacjeIds: roznica ? [korektaId] : [], idOperacjiZrodlowej: polecenie.idZapisu }
    const po = schematSprzedazyPuli.parse({ ...sprzedaz, korekty: [...sprzedaz.korekty, korekta] })
    await zapiszGrupeFinansowa({ idZapisu: polecenie.idZapisu, idOperacjiZrodlowej: polecenie.idZapisu, oczekiwaneRewizje: [{ tabela: 'sprzedazePul', id, rewizja: polecenie.oczekiwanaRewizja }, { tabela: 'wspolneKasy', id: sprzedaz.pulaId, rewizja: rewizjaPuli }, ...rewizjeZakupow.map((zakup) => ({ tabela: 'zakupyPul' as const, ...zakup })), ...(roznica ? [{ tabela: 'operacjeKas' as const, id: korektaId, rewizja: 0 }] : [])], zapisy: [{ tabela: 'sprzedazePul', id, operacja: 'aktualizacja', dane: stanFinansowy(po) }, ...(roznica ? [{ tabela: 'operacjeKas' as const, id: korektaId, operacja: 'utworzenie' as const, dane: { kasaId: sprzedaz.pulaId, waluta: sprzedaz.waluta, typ: 'korekta', kwotaGrosze: roznica, dataOperacji: poprawne.dataOperacji, opis: poprawne.uzasadnienie, kategoria: '', zrodlo: '', powiazaniePuli: { wersja: 1, rodzaj: 'korekta', sprzedazId: id, korektaId, idOperacjiZrodlowej: polecenie.idZapisu, rolaZapisu: 'rozliczenie_korekty' } } }] : [])] })
    const wynik = obliczProjekcjePuli(await obrazPul(), sprzedaz.pulaId, '9999-12-31')
    if (!wynik.kompletne) throw new Error(wynik.przyczyna)
  })
}
