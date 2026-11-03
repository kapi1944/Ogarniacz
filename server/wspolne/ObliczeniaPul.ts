import type { OperacjaZobowiazania, Zobowiazanie } from './modelePulZobowiazan.ts'
import { normalizujKwote } from './kwoty.ts'

export function cenaJednostkowaZCalkowitej(cenaCalkowitaGrosze: number, liczbaSztuk: number) {
  if (!Number.isSafeInteger(cenaCalkowitaGrosze) || cenaCalkowitaGrosze < 0 || !Number.isSafeInteger(liczbaSztuk) || liczbaSztuk < 1) throw new Error('Niepoprawna cena lub ilość.')
  let dzielnik = BigInt(cenaCalkowitaGrosze), reszta = BigInt(liczbaSztuk)
  while (reszta) { const kolejna = dzielnik % reszta; dzielnik = reszta; reszta = kolejna }
  return { licznikGroszy: bezpiecznaLiczba(BigInt(cenaCalkowitaGrosze) / dzielnik), mianownik: bezpiecznaLiczba(BigInt(liczbaSztuk) / dzielnik) }
}
export function cenaCalkowitaZJednostkowej(tekst: string, liczbaSztuk: number, waluta: string): number {
  normalizujKwote('0', waluta)
  if (!/^\d+(?:[.,]\d{1,6})?$/.test(tekst) || !Number.isSafeInteger(liczbaSztuk) || liczbaSztuk < 1) throw new Error('Wpisz cenę do sześciu cyfr po przecinku i całkowitą liczbę sztuk.')
  const [calosc, ulamek = ''] = tekst.replace(',', '.').split('.')
  const licznik = BigInt(calosc + ulamek) * 100n * BigInt(liczbaSztuk), mianownik = 10n ** BigInt(ulamek.length)
  if (licznik % mianownik) throw new Error('Cena daje ułamkowy grosz. Zmień cenę albo jawnie zatwierdź cenę całkowitą.')
  return bezpiecznaLiczba(licznik / mianownik)
}

export function bezpiecznaLiczba(wartosc: bigint): number {
  if (wartosc > BigInt(Number.MAX_SAFE_INTEGER) || wartosc < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Wynik przekracza bezpieczny zakres.')
  return Number(wartosc)
}
export function sumaGroszy(kwoty: readonly number[]): number {
  return bezpiecznaLiczba(kwoty.reduce((suma, kwota) => {
    if (!Number.isSafeInteger(kwota)) throw new Error('Kwota musi być bezpieczną liczbą całkowitą.')
    return suma + BigInt(kwota)
  }, 0n))
}
export function kosztZakresu(kosztGrosze: number, liczbaSztuk: number, od: number, ile: number): number {
  if (![kosztGrosze, liczbaSztuk, od, ile].every(Number.isSafeInteger) || kosztGrosze < 0 || liczbaSztuk < 1 || od < 0 || ile < 0 || BigInt(od) + BigInt(ile) > BigInt(liczbaSztuk)) throw new Error('Niepoprawny zakres sztuk.')
  return bezpiecznaLiczba(BigInt(kosztGrosze) * (BigInt(od) + BigInt(ile)) / BigInt(liczbaSztuk) - BigInt(kosztGrosze) * BigInt(od) / BigInt(liczbaSztuk))
}
const porownaj = (pierwszy: string, drugi: string) => pierwszy < drugi ? -1 : pierwszy > drugi ? 1 : 0

export function alokujKoszt(kwotaGrosze: number, partie: readonly { id: string; kosztTowaruGrosze: number; liczbaSztuk: number }[]): { partiaId: string; kwotaGrosze: number }[] {
  sumaGroszy([kwotaGrosze, ...partie.flatMap((partia) => [partia.kosztTowaruGrosze, partia.liczbaSztuk])])
  if (kwotaGrosze < 0 || !partie.length || new Set(partie.map((partia) => partia.id)).size !== partie.length || partie.some((partia) => partia.kosztTowaruGrosze < 0 || partia.liczbaSztuk <= 0)) throw new Error('Niepoprawna alokacja kosztu.')
  const koszt = partie.reduce((suma, partia) => suma + BigInt(partia.kosztTowaruGrosze), 0n)
  const wagi = partie.map((partia) => BigInt(koszt ? partia.kosztTowaruGrosze : partia.liczbaSztuk))
  const sumaWag = wagi.reduce((suma, waga) => suma + waga, 0n)
  const wynik = partie.map((partia, indeks) => ({ partiaId: partia.id, kwotaGrosze: bezpiecznaLiczba(BigInt(kwotaGrosze) * wagi[indeks] / sumaWag), reszta: BigInt(kwotaGrosze) * wagi[indeks] % sumaWag }))
  let pozostalo = BigInt(kwotaGrosze) - wynik.reduce((suma, pozycja) => suma + BigInt(pozycja.kwotaGrosze), 0n)
  for (const pozycja of [...wynik].sort((pierwsza, druga) => pierwsza.reszta === druga.reszta ? porownaj(pierwsza.partiaId, druga.partiaId) : pierwsza.reszta > druga.reszta ? -1 : 1)) if (pozostalo > 0n) { pozycja.kwotaGrosze++; pozostalo-- }
  return wynik.sort((pierwsza, druga) => porownaj(pierwsza.partiaId, druga.partiaId)).map(({ partiaId, kwotaGrosze }) => ({ partiaId, kwotaGrosze }))
}

export function aktywneOperacjeZobowiazania(zobowiazanie: Zobowiazanie, operacje: readonly OperacjaZobowiazania[]): OperacjaZobowiazania[] {
  const wlasne = operacje.filter((operacja) => operacja.zobowiazanieId === zobowiazanie.id)
  const ids = new Set<string>(), storna = new Set<string>()
  for (const operacja of wlasne) {
    if (ids.has(operacja.id) || operacja.waluta !== zobowiazanie.waluta) throw new Error('Powtórzone ID lub niezgodna waluta zobowiązania.')
    ids.add(operacja.id)
    if (operacja.rodzaj !== 'storno' || operacja.usunietoAt) continue
    const cel = wlasne.find((element) => element.id === operacja.operacjaKorygowanaId)
    if (!cel || cel.rodzaj === 'storno' || cel.usunietoAt || storna.has(cel.id) || cel.dataOperacji > operacja.dataOperacji) throw new Error('Niepoprawne lub podwójne storno.')
    storna.add(cel.id)
  }
  return wlasne.filter((operacja) => !operacja.usunietoAt && operacja.rodzaj !== 'storno' && !storna.has(operacja.id))
}
export function obliczZobowiazanie(zobowiazanie: Zobowiazanie, operacje: readonly OperacjaZobowiazania[], dataOdniesienia: string) {
  const aktywne = aktywneOperacjeZobowiazania(zobowiazanie, operacje.filter((operacja) => operacja.dataOperacji <= dataOdniesienia))
  const suma = (rodzaj: OperacjaZobowiazania['rodzaj']) => sumaGroszy(aktywne.filter((operacja) => operacja.rodzaj === rodzaj).map((operacja) => operacja.kwotaGrosze))
  const splaty = suma('splata'), zwroty = suma('zwrot_nadplaty'), umorzenia = suma('umorzenie')
  const przedUmorzeniem = sumaGroszy([zobowiazanie.kwotaPoczatkowaGrosze, suma('korekta_kwoty'), -splaty, zwroty])
  let saldo = zobowiazanie.kwotaPoczatkowaGrosze
  for (const operacja of [...aktywne].sort((pierwsza, druga) => porownaj(pierwsza.dataOperacji, druga.dataOperacji) || porownaj(pierwsza.id, druga.id))) {
    if (operacja.rodzaj === 'umorzenie' && operacja.kwotaGrosze > saldo) throw new Error('Umorzenie przekracza dodatnią pozostałą kwotę.')
    saldo = sumaGroszy([saldo, operacja.kwotaGrosze * (operacja.rodzaj === 'splata' || operacja.rodzaj === 'umorzenie' ? -1 : 1)])
  }
  const pozostaloGrosze = sumaGroszy([przedUmorzeniem, -umorzenia])
  return { pozostaloGrosze, zaplaconoGrosze: sumaGroszy([splaty, -zwroty]), umorzonoGrosze: umorzenia, przeterminowane: !!zobowiazanie.termin && zobowiazanie.termin < dataOdniesienia && pozostaloGrosze > 0,
    status: pozostaloGrosze < 0 ? 'nadplata' : pozostaloGrosze === 0 ? umorzenia ? 'zamkniete_z_umorzeniem' : 'splacone' : splaty ? 'czesciowo_splacone' : 'otwarte' }
}

export interface PrzeplywPuli { id: string; waluta: string; kwotaGrosze: number; kategoria: 'finansowanie' | 'sprzedaz' | 'zwrotDostawcy' | 'zakup' | 'koszt' | 'inne' }
export function obliczBilansGotowkowy(waluta: string, saldoOtwarciaGrosze: number, przeplywy: readonly PrzeplywPuli[]): number {
  if (new Set(przeplywy.map((wiersz) => wiersz.id)).size !== przeplywy.length || przeplywy.some((wiersz) => wiersz.waluta !== waluta)) throw new Error('Powtórzony fakt gotówki lub niezgodna waluta.')
  return sumaGroszy([saldoOtwarciaGrosze, ...przeplywy.map((wiersz) => wiersz.kwotaGrosze)])
}
export function obliczOtrzymaneWplaty(waluta: string, przeplywy: readonly PrzeplywPuli[]) {
  obliczBilansGotowkowy(waluta, 0, przeplywy)
  const kategorie = (['finansowanie', 'sprzedaz', 'zwrotDostawcy', 'inne'] as const).map((kategoria) => ({ kategoria, bruttoGrosze: sumaGroszy(przeplywy.filter((wiersz) => wiersz.kategoria === kategoria && wiersz.kwotaGrosze > 0).map((wiersz) => wiersz.kwotaGrosze)), nettoGrosze: sumaGroszy(przeplywy.filter((wiersz) => wiersz.kategoria === kategoria).map((wiersz) => wiersz.kwotaGrosze)) }))
  return { kategorie, bruttoGrosze: sumaGroszy(kategorie.map((wiersz) => wiersz.bruttoGrosze)), nettoGrosze: sumaGroszy(kategorie.map((wiersz) => wiersz.nettoGrosze)) }
}
export function obliczKosztNieodzyskany(waluta: string, przeplywy: readonly PrzeplywPuli[]): number {
  obliczBilansGotowkowy(waluta, 0, przeplywy)
  return sumaGroszy(przeplywy.filter((wiersz) => ['zakup', 'koszt', 'sprzedaz', 'zwrotDostawcy'].includes(wiersz.kategoria)).map((wiersz) => -wiersz.kwotaGrosze))
}
export function obliczMarzeSprzedazy(przychodGrosze: number, kosztSprzedazyGrosze: number) {
  const marzaGrosze = sumaGroszy([przychodGrosze, -kosztSprzedazyGrosze])
  return { marzaGrosze, procent: przychodGrosze > 0 ? { licznik: bezpiecznaLiczba(BigInt(marzaGrosze) * 100n), mianownik: przychodGrosze } : undefined }
}
export function obliczEfektywneObciazenieJednostkowe(kosztNieodzyskanyGrosze: number, zapas: readonly { produktId: string; liczbaSztuk: number }[], jednorodnyZestaw = false) {
  const sztuki = sumaGroszy(zapas.map((pozycja) => pozycja.liczbaSztuk))
  if (sztuki < 0 || zapas.some((pozycja) => pozycja.liczbaSztuk < 0)) throw new Error('Ujemny zapas.')
  sumaGroszy([kosztNieodzyskanyGrosze])
  return sztuki && (jednorodnyZestaw || new Set(zapas.map((pozycja) => pozycja.produktId)).size === 1) ? { licznikGroszy: kosztNieodzyskanyGrosze, mianownik: sztuki } : undefined
}
export function obliczSaldoZobowiazanOsoby(osobaId: string, zobowiazania: readonly Zobowiazanie[], operacje: readonly OperacjaZobowiazania[], dataOdniesienia: string) {
  const pozycje = zobowiazania.filter((dlug) => dlug.osobaId === osobaId && !dlug.usunietoAt && dlug.dataPowstania <= dataOdniesienia).map((dlug) => ({ id: dlug.id, waluta: dlug.waluta, kierunek: dlug.kierunek, ...obliczZobowiazanie(dlug, operacje, dataOdniesienia) }))
  const sumy = [...new Set(pozycje.map((dlug) => dlug.waluta))].sort().map((waluta) => {
    const kwoty = pozycje.filter((dlug) => dlug.waluta === waluta).map((dlug) => dlug.kierunek === 'do_mnie' ? dlug.pozostaloGrosze : -dlug.pozostaloGrosze)
    const doOtrzymaniaGrosze = sumaGroszy(kwoty.filter((kwota) => kwota > 0)), doOddaniaGrosze = sumaGroszy(kwoty.filter((kwota) => kwota < 0).map((kwota) => -kwota))
    return { waluta, doOtrzymaniaGrosze, doOddaniaGrosze, saldoGrosze: sumaGroszy([doOtrzymaniaGrosze, -doOddaniaGrosze]) }
  })
  return { pozycje, sumy }
}

/** Zakresy numerów sztuk są projekcją; nie tworzymy rekordów dla każdej sztuki. */
export interface ZdarzeniePartii { id: string; data: string; rodzaj: 'przyjecie' | 'wydanie' | 'zwrot' | 'strata' | 'zwrot_dostawcy'; liczbaSztuk: number; zrodloId?: string; poprzednikId?: string; uszkodzoneSztuki?: number; odSztuki?: number }
type Zakres = { od: number; ile: number }
export function obliczStanPartii(kosztGrosze: number, liczbaSztuk: number, zdarzenia: readonly ZdarzeniePartii[], przyjetePoczatkowo = liczbaSztuk) {
  kosztZakresu(kosztGrosze, liczbaSztuk, 0, liczbaSztuk)
  if (!Number.isSafeInteger(przyjetePoczatkowo) || przyjetePoczatkowo < 0 || przyjetePoczatkowo > liczbaSztuk) throw new Error('Niepoprawna ilość przyjęcia.')
  let przyjeto = przyjetePoczatkowo
  let dostepne: Zakres[] = przyjeto ? [{ od: 0, ile: przyjeto }] : []
  const wydania = new Map<string, Zakres[]>()
  let kosztStratGrosze = 0, kosztZwrotowDostawcyGrosze = 0
  const koszt = (zakresy: Zakres[]) => sumaGroszy(zakresy.map((zakres) => kosztZakresu(kosztGrosze, liczbaSztuk, zakres.od, zakres.ile)))
  const pobierz = (zakresy: Zakres[], ile: number, odKonca = false): Zakres[] => {
    const wynik: Zakres[] = []
    while (ile > 0) {
      const indeks = odKonca ? zakresy.length - 1 : 0, zakres = zakresy[indeks]
      if (!zakres) throw new Error('Niedostępne sztuki lub zwrot przekraczający wydanie.')
      const pobrano = Math.min(ile, zakres.ile)
      wynik.push({ od: odKonca ? zakres.od + zakres.ile - pobrano : zakres.od, ile: pobrano })
      if (!odKonca) zakres.od += pobrano
      zakres.ile -= pobrano; ile -= pobrano
      if (!zakres.ile) zakresy.splice(indeks, 1)
    }
    return wynik
  }
  const ids = new Set<string>()
  const oczekujace = [...zdarzenia].sort((pierwsze, drugie) => porownaj(pierwsze.data, drugie.data) || porownaj(pierwsze.id, drugie.id))
  while (oczekujace.length) {
    const dzien = oczekujace[0].data
    const indeks = oczekujace.findIndex((zdarzenie) => zdarzenie.data === dzien && (!zdarzenie.zrodloId || wydania.has(zdarzenie.zrodloId)) && (!zdarzenie.poprzednikId || ids.has(zdarzenie.poprzednikId)))
    if (indeks < 0) throw new Error('Cykl lub zwrot przed wydaniem.')
    const zdarzenie = oczekujace.splice(indeks, 1)[0]
    if (ids.has(zdarzenie.id) || !Number.isSafeInteger(zdarzenie.liczbaSztuk) || zdarzenie.liczbaSztuk <= 0) throw new Error('Niepoprawne zdarzenie magazynowe.')
    ids.add(zdarzenie.id)
    if (zdarzenie.rodzaj === 'przyjecie') {
      if (BigInt(przyjeto) + BigInt(zdarzenie.liczbaSztuk) > BigInt(liczbaSztuk)) throw new Error('Przyjęcie przekracza skorygowaną partię.')
      dostepne.push({ od: przyjeto, ile: zdarzenie.liczbaSztuk }); przyjeto += zdarzenie.liczbaSztuk
    } else if (zdarzenie.rodzaj === 'zwrot') {
      const wydanie = wydania.get(zdarzenie.zrodloId ?? '')
      if (!wydanie) throw new Error('Brak oryginalnego wydania.')
      const zwrocone = pobierz(wydanie, zdarzenie.liczbaSztuk, true).sort((pierwszy, drugi) => pierwszy.od - drugi.od)
      const uszkodzone = zdarzenie.uszkodzoneSztuki ?? 0
      if (!Number.isSafeInteger(uszkodzone) || uszkodzone < 0 || uszkodzone > zdarzenie.liczbaSztuk) throw new Error('Niepoprawna liczba uszkodzonych sztuk.')
      kosztStratGrosze = sumaGroszy([kosztStratGrosze, koszt(pobierz(zwrocone, uszkodzone, true))])
      dostepne.push(...zwrocone); dostepne.sort((pierwszy, drugi) => pierwszy.od - drugi.od)
    } else {
      let zakresy: Zakres[]
      if (zdarzenie.odSztuki !== undefined) {
        const od = zdarzenie.odSztuki, ile = zdarzenie.liczbaSztuk
        kosztZakresu(kosztGrosze, liczbaSztuk, od, ile)
        zakresy = dostepne.flatMap((zakres) => {
          const poczatek = Math.max(od, zakres.od), koniec = Math.min(od + ile, zakres.od + zakres.ile)
          return koniec > poczatek ? [{ od: poczatek, ile: koniec - poczatek }] : []
        })
        if (sumaGroszy(zakresy.map((zakres) => zakres.ile)) !== ile) throw new Error('Wskazany zakres obejmuje niedostępne sztuki.')
        dostepne = dostepne.flatMap((zakres) => {
          const wynik: Zakres[] = []
          if (zakres.od < od) wynik.push({ od: zakres.od, ile: Math.min(zakres.ile, od - zakres.od) })
          if (zakres.od + zakres.ile > od + ile) wynik.push({ od: Math.max(zakres.od, od + ile), ile: zakres.od + zakres.ile - Math.max(zakres.od, od + ile) })
          return wynik
        })
      } else zakresy = pobierz(dostepne, zdarzenie.liczbaSztuk)
      if (zdarzenie.rodzaj === 'wydanie') wydania.set(zdarzenie.id, zakresy)
      if (zdarzenie.rodzaj === 'strata') kosztStratGrosze = sumaGroszy([kosztStratGrosze, koszt(zakresy)])
      if (zdarzenie.rodzaj === 'zwrot_dostawcy') kosztZwrotowDostawcyGrosze = sumaGroszy([kosztZwrotowDostawcyGrosze, koszt(zakresy)])
    }
  }
  return { liczbaSztuk: sumaGroszy(dostepne.map((zakres) => zakres.ile)), wartoscZapasuGrosze: koszt(dostepne), kosztSprzedanychGrosze: sumaGroszy([...wydania.values()].map(koszt)), kosztStratGrosze, kosztZwrotowDostawcyGrosze }
}
