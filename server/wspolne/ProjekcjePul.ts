import { walidujObrazFz } from './WalidacjaPulZobowiazan.ts'
import { z } from 'zod'
import type { ObrazFz } from './WalidacjaPulZobowiazan.ts'
import { aktywneOperacjeZobowiazania, obliczBilansGotowkowy, obliczEfektywneObciazenieJednostkowe, obliczKosztNieodzyskany, obliczMarzeSprzedazy, obliczOtrzymaneWplaty, obliczZobowiazanie, sumaGroszy, type PrzeplywPuli } from './ObliczeniaPul.ts'

import { obliczMagazynPuli } from './MagazynPul.ts'
export { obliczMagazynPuli }

export function obliczPozostalyZapas(obraz: ObrazFz, pulaId: string, dataOdniesienia: string) {
  const partie = obliczMagazynPuli(obraz, pulaId, dataOdniesienia)
  return { partie, produkty: [...new Set(partie.map((partia) => partia.produktId))].sort().map((produktId) => ({ produktId, liczbaSztuk: sumaGroszy(partie.filter((partia) => partia.produktId === produktId).map((partia) => partia.liczbaSztuk)) })) }
}
export function obliczWartoscZapasu(obraz: ObrazFz, pulaId: string, dataOdniesienia: string) {
  return sumaGroszy(obliczMagazynPuli(obraz, pulaId, dataOdniesienia).map((partia) => partia.wartoscZapasuGrosze))
}
export function przeplywyPuli(obraz: ObrazFz, pulaId: string, dataOdniesienia: string): PrzeplywPuli[] {
  const przeplywy: PrzeplywPuli[] = obraz.operacjeKas.filter((operacja) => operacja.kasaId === pulaId && !operacja.usunietoAt && operacja.dataOperacji <= dataOdniesienia).map((operacja) => {
    const rodzaj = operacja.powiazaniePuli?.rodzaj
    return { id: `kasa:${operacja.id}`, waluta: operacja.waluta, kwotaGrosze: operacja.typ === 'wydatek' ? -operacja.kwotaGrosze : operacja.kwotaGrosze, kategoria: rodzaj === 'wplata' ? 'finansowanie' : rodzaj === 'zaplataSprzedazy' || rodzaj === 'zwrotKlientowi' || rodzaj === 'korekta' && !!operacja.powiazaniePuli?.sprzedazId ? 'sprzedaz' : rodzaj === 'zwrotDostawcy' ? 'zwrotDostawcy' : rodzaj === 'zakup' ? 'zakup' : rodzaj === 'koszt' ? 'koszt' : 'inne' }
  })
  for (const dlug of obraz.zobowiazania.filter((dlug) => !dlug.usunietoAt && dlug.zrodlo?.pulaId === pulaId)) for (const operacja of aktywneOperacjeZobowiazania(dlug, obraz.operacjeZobowiazan.filter((operacja) => operacja.dataOperacji <= dataOdniesienia))) if (operacja.rodzaj === 'splata' || operacja.rodzaj === 'zwrot_nadplaty') przeplywy.push({ id: `zobowiazanie:${operacja.id}`, waluta: dlug.waluta, kwotaGrosze: operacja.kwotaGrosze * (dlug.kierunek === 'do_mnie' ? 1 : -1) * (operacja.rodzaj === 'splata' ? 1 : -1), kategoria: 'sprzedaz' })
  return przeplywy
}
export function obliczNaleznosciPuli(obraz: ObrazFz, pulaId: string, dataOdniesienia: string) {
  const kwoty = obraz.zobowiazania.filter((dlug) => !dlug.usunietoAt && dlug.zrodlo?.pulaId === pulaId && dlug.dataPowstania <= dataOdniesienia).map((dlug) => obliczZobowiazanie(dlug, obraz.operacjeZobowiazan, dataOdniesienia).pozostaloGrosze * (dlug.kierunek === 'do_mnie' ? 1 : -1))
  return { doOtrzymaniaGrosze: sumaGroszy(kwoty.filter((kwota) => kwota > 0)), doOddaniaGrosze: sumaGroszy(kwoty.filter((kwota) => kwota < 0).map((kwota) => -kwota)) }
}
export function obliczKosztCalkowityPuli(obraz: ObrazFz, pulaId: string, dataOdniesienia: string) {
  const zakupy = obraz.zakupyPul.filter((zakup) => zakup.pulaId === pulaId && !zakup.usunietoAt && zakup.dataZakupu <= dataOdniesienia)
  const towarGrosze = sumaGroszy(zakupy.flatMap((zakup) => zakup.partie.filter((partia) => !partia.usunietoAt).map((partia) => partia.kosztTowaruGrosze)))
  const dodatkoweGrosze = sumaGroszy(zakupy.flatMap((zakup) => zakup.kosztyDodatkowe.filter((koszt) => !koszt.usunietoAt).map((koszt) => koszt.kwotaGrosze)))
  const korektyGrosze = sumaGroszy(zakupy.flatMap((zakup) => zakup.korekty.filter((korekta) => !korekta.usunietoAt && korekta.dataOperacji <= dataOdniesienia).flatMap((korekta) => korekta.pozycje.filter((pozycja) => korekta.rodzaj !== 'rozbieznosc' || pozycja.zmianaSztuk > 0).map((pozycja) => pozycja.zmianaKosztuGrosze ?? 0))))
  const pozostaleGrosze = sumaGroszy(obraz.operacjeKas.filter((operacja) => operacja.kasaId === pulaId && !operacja.usunietoAt && operacja.dataOperacji <= dataOdniesienia && operacja.powiazaniePuli?.rodzaj === 'koszt' && !operacja.powiazaniePuli.zakupId).map((operacja) => operacja.typ === 'wydatek' ? operacja.kwotaGrosze : -operacja.kwotaGrosze))
  return { towarGrosze, dodatkoweGrosze, korektyGrosze, pozostaleGrosze, razemGrosze: sumaGroszy([towarGrosze, dodatkoweGrosze, korektyGrosze, pozostaleGrosze]) }
}
/** Publiczny wynik nigdy nie zamienia błędnego obrazu w zerowy bilans. */
export function obliczProjekcjePuli(obraz: ObrazFz, pulaId: string, dataOdniesienia: string) {
  try {
    z.iso.date().parse(dataOdniesienia)
    walidujObrazFz(obraz)
    const pula = obraz.wspolneKasy.find((pula) => pula.id === pulaId && pula.pula && !pula.usunietoAt)
    if (!pula) throw new Error('Brak Puli.')
    const zapas = obliczPozostalyZapas(obraz, pulaId, dataOdniesienia), przeplywy = przeplywyPuli(obraz, pulaId, dataOdniesienia)
    const kosztNieodzyskanyGrosze = obliczKosztNieodzyskany(pula.waluta, przeplywy)
    const sprzedaze = obraz.sprzedazePul.filter((sprzedaz) => sprzedaz.pulaId === pulaId && !sprzedaz.usunietoAt && sprzedaz.dataSprzedazy <= dataOdniesienia)
    if ([...sprzedaze, ...obraz.zakupyPul.filter((zakup) => zakup.pulaId === pulaId), ...obraz.zobowiazania.filter((dlug) => dlug.zrodlo?.pulaId === pulaId)].some((rekord) => rekord.waluta !== pula.waluta)) throw new Error('Niezgodne waluty obrazu Puli.')
    const przychodGrosze = sumaGroszy(sprzedaze.flatMap((sprzedaz) => [...sprzedaz.pozycje.filter((pozycja) => !pozycja.usunietoAt).map((pozycja) => pozycja.cenaCalkowitaGrosze), ...sprzedaz.korekty.filter((korekta) => !korekta.usunietoAt && korekta.dataOperacji <= dataOdniesienia).flatMap((korekta) => korekta.pozycje.map((pozycja) => pozycja.zmianaCenyGrosze ?? 0))]))
    return { kompletne: true as const, wynik: { zapas, wartoscZapasuGrosze: sumaGroszy(zapas.partie.map((partia) => partia.wartoscZapasuGrosze)), koszty: obliczKosztCalkowityPuli(obraz, pulaId, dataOdniesienia), otrzymane: obliczOtrzymaneWplaty(pula.waluta, przeplywy), bilansGotowkowyGrosze: obliczBilansGotowkowy(pula.waluta, pula.saldoPoczatkoweGrosze, przeplywy), naleznosci: obliczNaleznosciPuli(obraz, pulaId, dataOdniesienia), marza: obliczMarzeSprzedazy(przychodGrosze, sumaGroszy(zapas.partie.map((partia) => partia.kosztSprzedanychGrosze))), kosztNieodzyskanyGrosze, efektywneObciazenie: obliczEfektywneObciazenieJednostkowe(kosztNieodzyskanyGrosze, zapas.produkty) } }
  } catch (blad) { return { kompletne: false as const, przyczyna: blad instanceof Error ? blad.message : 'Niepoprawny obraz Puli.' } }
}
