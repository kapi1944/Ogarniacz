import { z } from 'zod'
import { baza } from '../data/BazaOgarniacza'
import { schematZakupuPuli, type ZakupPuli } from '../../server/wspolne/modelePulZobowiazan.ts'
import { alokujKoszt, sumaGroszy } from '../../server/wspolne/ObliczeniaPul.ts'
import { obliczProjekcjePuli, obliczMagazynPuli } from '../../server/wspolne/ProjekcjePul.ts'
import { stanFinansowy } from '../../server/wspolne/WalidacjaPulZobowiazan.ts'
import { obrazPul, pobierzWidokPuli } from './WspolneKasyService'
import { kanonicznyZapis, wymagajRekordu, wTransakcjiFinansowej, zapiszGrupeFinansowa, type PolecenieZapisuFinansowego, type PolecenieGrupyFinansowej } from './ZapisFinansowWspolnych'

const schematPartii = schematZakupuPuli.shape.partie.element.omit({ createdAt: true, updatedAt: true, usunietoAt: true })
const schematKosztu = schematZakupuPuli.shape.kosztyDodatkowe.element.omit({ createdAt: true, updatedAt: true, usunietoAt: true, alokacja: true })
const schematDanychZakupu = schematZakupuPuli.pick({ nazwa: true, dataZakupu: true, opis: true, dokumentyIds: true }).extend({
  partie: z.array(schematPartii).min(1).max(100), kosztyDodatkowe: z.array(schematKosztu).max(100), operacjaGotowkiId: z.uuid(),
}).strict()
export type DaneZakupuPuli = z.infer<typeof schematDanychZakupu>
export interface DaneKorektyZakupu {
  rodzaj: 'cena' | 'pomylka_partii' | 'rozbieznosc' | 'anulowanie'
  dataOperacji: string
  uzasadnienie: string
  pozycje: { partiaId: string; zmianaSztuk: number; zmianaKosztuGrosze?: number }[]
}

async function wymagajPuliZakupowej(id: string, ponowienie = false) {
  const pula = wymagajRekordu(await baza.tabela('wspolneKasy').get(id))
  if (pula.pula?.rodzaj !== 'zakupowa') throw new Error('Zakup wymaga Puli zakupowej.')
  if (!ponowienie && pula.status !== 'aktywna') throw new Error('Najpierw przywróć zarchiwizowaną Pulę.')
  return pula
}

async function sprawdzWynik(pulaId: string) {
  const wynik = obliczProjekcjePuli(await obrazPul(), pulaId, '9999-12-31')
  if (!wynik.kompletne) throw new Error(wynik.przyczyna)
}

export async function zarejestrujZakupPuli(pulaId: string, id: string, dane: DaneZakupuPuli, polecenie: PolecenieZapisuFinansowego, rewizjaPuli: number): Promise<void> {
  const poprawne = schematDanychZakupu.parse(dane)
  await wTransakcjiFinansowej('edycja', async () => {
    const stary = await baza.tabela('zakupyPul').get(id)
    const pula = await wymagajPuliZakupowej(pulaId, !!stary?.historiaWersji.find((wersja) => wersja.idZapisu === polecenie.idZapisu))
    const teraz = stary?.partie[0].createdAt ?? new Date().toISOString()
    const metadane = { createdAt: teraz, updatedAt: teraz }
    const partie = poprawne.partie.map((partia) => ({ ...partia, ...metadane }))
    const kosztyDodatkowe = poprawne.kosztyDodatkowe.map((koszt) => ({ ...koszt, ...metadane, alokacja: alokujKoszt(koszt.kwotaGrosze, partie) }))
    const kwotaGrosze = sumaGroszy([...partie.map((partia) => partia.kosztTowaruGrosze), ...kosztyDodatkowe.map((koszt) => koszt.kwotaGrosze)])
    const { operacjaGotowkiId, ...tresc } = poprawne
    await zapiszGrupeFinansowa({
      idZapisu: polecenie.idZapisu, idOperacjiZrodlowej: polecenie.idZapisu,
      oczekiwaneRewizje: [{ tabela: 'wspolneKasy', id: pulaId, rewizja: rewizjaPuli }, { tabela: 'zakupyPul', id, rewizja: polecenie.oczekiwanaRewizja }, ...(kwotaGrosze ? [{ tabela: 'operacjeKas' as const, id: operacjaGotowkiId, rewizja: 0 }] : [])],
      zapisy: [
        { tabela: 'zakupyPul', id, operacja: 'utworzenie', dane: { ...tresc, partie, kosztyDodatkowe, pulaId, waluta: pula.waluta, korekty: [], idOperacjiZrodlowej: polecenie.idZapisu, rolaZapisu: 'zakup' } },
        ...(kwotaGrosze ? [{ tabela: 'operacjeKas' as const, id: operacjaGotowkiId, operacja: 'utworzenie' as const, dane: { kasaId: pulaId, typ: 'wydatek', kwotaGrosze, waluta: pula.waluta, dataOperacji: poprawne.dataZakupu, opis: poprawne.nazwa, kategoria: '', zrodlo: '', powiazaniePuli: { wersja: 1, rodzaj: 'zakup', zakupId: id, idOperacjiZrodlowej: polecenie.idZapisu, rolaZapisu: 'zaplata_zakupu' } } }] : []),
      ],
    })
    await sprawdzWynik(pulaId)
  })
}

export async function skorygujZakupPuli(id: string, korektaId: string, dane: DaneKorektyZakupu, polecenie: PolecenieZapisuFinansowego, rewizjaPuli: number): Promise<void> {
  await wTransakcjiFinansowej('edycja', async () => {
    const zakup = wymagajRekordu(await baza.tabela('zakupyPul').get(id))
    const proba = zakup.historiaWersji.find((wersja) => wersja.idZapisu === polecenie.idZapisu)
    if (proba) {
      const grupa: PolecenieGrupyFinansowej = JSON.parse(proba.podpisPolecenia).tresc
      const zapisany = (proba.po.korekty as ZakupPuli['korekty']).find((korekta) => korekta.id === korektaId)
      if (!zapisany || polecenie.oczekiwanaRewizja !== proba.oczekiwanaRewizja || zapisany.rodzaj !== dane.rodzaj || zapisany.dataOperacji !== dane.dataOperacji || zapisany.uzasadnienie !== dane.uzasadnienie.trim() || (dane.rodzaj === 'anulowanie' ? dane.pozycje.length !== 0 : kanonicznyZapis(zapisany.pozycje) !== kanonicznyZapis(dane.pozycje)) || !grupa.oczekiwaneRewizje.some((warunek) => warunek.tabela === 'wspolneKasy' && warunek.id === zakup.pulaId && warunek.rewizja === rewizjaPuli)) throw new Error('Ten identyfikator korekty został użyty z innymi danymi.')
      await zapiszGrupeFinansowa(grupa)
      return
    }
    const poprzedni = zakup
    await wymagajPuliZakupowej(zakup.pulaId)
    if (poprzedni.korekty.some((korekta) => !korekta.usunietoAt && korekta.rodzaj === 'anulowanie')) throw new Error('Zakup jest anulowany. Najpierw stornuj anulowanie.')
    if (dane.pozycje.some((pozycja) => !poprzedni.partie.some((partia) => partia.id === pozycja.partiaId)) || new Set(dane.pozycje.map((pozycja) => pozycja.partiaId)).size !== dane.pozycje.length) throw new Error('Wybierz różne partie tego zakupu.')
    if (dane.rodzaj === 'rozbieznosc' && dane.pozycje.some((pozycja) => pozycja.zmianaSztuk === 0 || pozycja.zmianaSztuk < 0 && pozycja.zmianaKosztuGrosze !== 0)) throw new Error('Rozbieżność wymaga zmiany ilości; strata zachowuje historyczny koszt (zmiana kosztu 0).')
    const teraz = new Date().toISOString()
    let pozycje = dane.pozycje
    if (dane.rodzaj === 'anulowanie') {
      if (dane.pozycje.length) throw new Error('Anulowanie wylicza wszystkie pozostałe partie automatycznie.')
      const obraz = await obrazPul()
      const partie = obliczMagazynPuli(obraz, zakup.pulaId, '9999-12-31').filter((partia) => partia.zakupId === id)
      if (obraz.sprzedazePul.some((sprzedaz) => !sprzedaz.usunietoAt && sprzedaz.pozycje.some((pozycja) => pozycja.zakupId === id))) throw new Error('Nie można anulować zakupu użytego w sprzedaży.')
      pozycje = partie.map((partia) => ({ partiaId: partia.partiaId, zmianaSztuk: -partia.liczbaSztuk, zmianaKosztuGrosze: -partia.kosztNabyciaGrosze }))
    }
    const kwotaStorna = dane.rodzaj === 'anulowanie' ? sumaGroszy([...poprzedni.partie.map((partia) => partia.kosztTowaruGrosze), ...poprzedni.kosztyDodatkowe.map((koszt) => koszt.kwotaGrosze)]) : 0
    const korekta = { ...dane, pozycje, id: korektaId, createdAt: teraz, updatedAt: teraz, idOperacjiZrodlowej: polecenie.idZapisu, powiazaneOperacjeIds: kwotaStorna ? [korektaId] : [] }
    const po = schematZakupuPuli.parse({ ...poprzedni, korekty: [...poprzedni.korekty, korekta] })
    await zapiszGrupeFinansowa({
      idZapisu: polecenie.idZapisu, idOperacjiZrodlowej: polecenie.idZapisu,
      oczekiwaneRewizje: [{ tabela: 'zakupyPul', id, rewizja: polecenie.oczekiwanaRewizja }, { tabela: 'wspolneKasy', id: zakup.pulaId, rewizja: rewizjaPuli }, ...(kwotaStorna ? [{ tabela: 'operacjeKas' as const, id: korektaId, rewizja: 0 }] : [])],
      zapisy: [{ tabela: 'zakupyPul', id, operacja: 'aktualizacja', dane: stanFinansowy(po) }, ...(kwotaStorna ? [{ tabela: 'operacjeKas' as const, id: korektaId, operacja: 'utworzenie' as const, dane: { kasaId: zakup.pulaId, waluta: zakup.waluta, typ: 'korekta', kwotaGrosze: kwotaStorna, dataOperacji: dane.dataOperacji, opis: `Storno błędnego zakupu: ${dane.uzasadnienie}`, kategoria: '', zrodlo: '', powiazaniePuli: { wersja: 1, rodzaj: 'korekta', zakupId: id, korektaId, idOperacjiZrodlowej: polecenie.idZapisu, rolaZapisu: 'storno_zakupu' } } }] : [])],
    })
    await sprawdzWynik(zakup.pulaId)
  })
}

export async function stornujKorekteZakupu(id: string, korektaId: string, polecenie: PolecenieZapisuFinansowego, rewizjaPuli: number): Promise<void> {
  await wTransakcjiFinansowej('edycja', async () => {
    const zakup = wymagajRekordu(await baza.tabela('zakupyPul').get(id))
    const proba = zakup.historiaWersji.find((wersja) => wersja.idZapisu === polecenie.idZapisu)
    await wymagajPuliZakupowej(zakup.pulaId, !!proba)
    const poprzedni = proba?.przed ? { ...zakup, ...proba.przed } as ZakupPuli : zakup
    const korekta = poprzedni.korekty.find((element) => element.id === korektaId && !element.usunietoAt)
    if (!korekta) throw new Error('Nie ma aktywnej korekty do storna.')
    if (!proba && korekta.rodzaj !== 'anulowanie' && zakup.korekty.some((element) => element.rodzaj === 'anulowanie' && !element.usunietoAt)) throw new Error('Najpierw stornuj anulowanie zakupu.')
    const teraz = (proba?.po.korekty as ZakupPuli['korekty'] | undefined)?.find((element) => element.id === korektaId)?.usunietoAt ?? new Date().toISOString()
    if (proba) {
      if (polecenie.oczekiwanaRewizja !== proba.oczekiwanaRewizja) throw new Error('Nieaktualna rewizja polecenia storna.')
      const poprzedniePolecenie = JSON.parse(proba.podpisPolecenia).tresc
      if (!poprzedniePolecenie.oczekiwaneRewizje.some((warunek: { tabela: string; id: string; rewizja: number }) => warunek.tabela === 'wspolneKasy' && warunek.id === zakup.pulaId && warunek.rewizja === rewizjaPuli)) throw new Error('Inna rewizja Puli w ponowieniu storna.')
      const zapisZakupu = poprzedniePolecenie.zapisy.find((zapis: { tabela: string; id: string }) => zapis.tabela === 'zakupyPul' && zapis.id === id)
      if (!zapisZakupu?.dane.korekty.some((element: { id: string; usunietoAt?: string }) => element.id === korektaId && element.usunietoAt === teraz)) throw new Error('Inna korekta w ponowieniu storna.')
      await zapiszGrupeFinansowa(poprzedniePolecenie)
      return
    }
    const operacje = await Promise.all(korekta.powiazaneOperacjeIds.map(async (operacjaId) => wymagajRekordu(await baza.tabela('operacjeKas').get(operacjaId))))
    await zapiszGrupeFinansowa({
      idZapisu: polecenie.idZapisu, idOperacjiZrodlowej: polecenie.idZapisu,
      oczekiwaneRewizje: [{ tabela: 'zakupyPul', id, rewizja: polecenie.oczekiwanaRewizja }, { tabela: 'wspolneKasy', id: zakup.pulaId, rewizja: rewizjaPuli }, ...operacje.map((operacja) => ({ tabela: 'operacjeKas' as const, id: operacja.id, rewizja: operacja.rewizja ?? 0 }))],
      zapisy: [{ tabela: 'zakupyPul', id, operacja: 'aktualizacja', dane: { ...stanFinansowy(poprzedni), korekty: poprzedni.korekty.map((element) => element.id === korektaId ? { ...element, updatedAt: teraz, usunietoAt: teraz } : element) } }, ...operacje.map((operacja) => ({ tabela: 'operacjeKas' as const, id: operacja.id, operacja: 'usuniecie' as const, dane: { ...stanFinansowy(operacja), usunietoAt: teraz } }))],
    })
    await sprawdzWynik(zakup.pulaId)
  })
}

export async function pobierzZakupyPuli(pulaId: string) {
  return wTransakcjiFinansowej('odczyt', async () => {
    const widok = await pobierzWidokPuli(pulaId)
    if (widok.pula.pula?.rodzaj !== 'zakupowa') throw new Error('Nie znaleziono Puli zakupowej.')
    const obraz = await obrazPul()
    const projekcja = obliczProjekcjePuli(obraz, pulaId, '9999-12-31')
    const zakupy = obraz.zakupyPul.filter((zakup) => zakup.pulaId === pulaId).sort((pierwszy, drugi) => drugi.dataZakupu.localeCompare(pierwszy.dataZakupu) || pierwszy.id.localeCompare(drugi.id))
    return { zakupy, wynik: !widok.ograniczenie && projekcja.kompletne ? projekcja.wynik : undefined, ograniczenie: widok.ograniczenie || (!projekcja.kompletne ? projekcja.przyczyna : '') }
  })
}
