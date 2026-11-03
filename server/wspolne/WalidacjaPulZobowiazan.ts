import { obliczMagazynPuli } from './MagazynPul.ts'
import { schematyFz, TABELE_FZ, type ZakupPuli, type SprzedazPuli, type OsobaFinansowa, type Zobowiazanie, type OperacjaZobowiazania } from './modelePulZobowiazan.ts'
import { schematWspolnejKasy, schematOperacjiKasy, type WspolnaKasa, type OperacjaKasy } from './modeleFinansowWspolnych.ts'
import { kanonicznyZapis } from './ZapisFinansowy.ts'
import { sumaGroszy, obliczZobowiazanie } from './ObliczeniaPul.ts'
import { walidujOperacjeKasy } from './WalidacjaFinansowa.ts'
import { normalizujKwote } from './kwoty.ts'

export interface ObrazFz { wspolneKasy: WspolnaKasa[]; operacjeKas: OperacjaKasy[]; zakupyPul: ZakupPuli[]; sprzedazePul: SprzedazPuli[]; osobyFinansowe: OsobaFinansowa[]; zobowiazania: Zobowiazanie[]; operacjeZobowiazan: OperacjaZobowiazania[] }
export const TABELE_OBRAZU_FZ = ['wspolneKasy', 'operacjeKas', ...TABELE_FZ] as const
export const schematyObrazuFz = { wspolneKasy: schematWspolnejKasy, operacjeKas: schematOperacjiKasy, ...schematyFz }
export type TabelaFz = typeof TABELE_OBRAZU_FZ[number]
export function czyRekordFz(tabela: string, rekord?: unknown): boolean {
  if ((TABELE_FZ as readonly string[]).includes(tabela)) return true
  if (!rekord || typeof rekord !== 'object') return false
  const dane = rekord as Record<string, unknown>
  return tabela === 'wspolneKasy' && dane.pula !== undefined || tabela === 'operacjeKas' && dane.powiazaniePuli !== undefined || tabela === 'dokumenty' && dane.finansowe !== undefined || tabela === 'ustawienia' && dane.finanseFz !== undefined || tabela === 'przypomnienia' && (dane.finansowe !== undefined || String(dane.id).startsWith('fz:'))
}
export function stanFinansowy(rekord: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(rekord).filter(([klucz]) => !['id', 'createdAt', 'updatedAt', 'rewizja', 'historiaWersji'].includes(klucz)))
}
export function walidujObrazFz(obraz: ObrazFz): void {
  const wymagaj = <T extends { id: string; usunietoAt?: string }>(rekordy: T[], id: string | undefined, aktywne: boolean): T => {
    const rekord = rekordy.find((element) => element.id === id)
    if (!rekord || aktywne && rekord.usunietoAt) throw new Error('Brak wymaganego rodzica w obrazie finansowym.')
    return rekord
  }
  const role = new Set<string>(), osadzone = new Set<string>()
  for (const tabela of TABELE_OBRAZU_FZ) {
    const ids = new Set<string>()
    for (const rekord of obraz[tabela]) {
      schematyObrazuFz[tabela].parse(rekord)
      if (ids.has(rekord.id)) throw new Error('Powtórzone ID rekordu finansowego.')
      ids.add(rekord.id)
      if (!czyRekordFz(tabela, rekord)) continue
      const historia = rekord.historiaWersji
      if (!historia?.length || rekord.rewizja !== historia.length) throw new Error('Brak pełnej historii FZ.')
      const polecenia = new Set<string>()
      for (const [indeks, wersja] of historia.entries()) {
        if (wersja.rewizja !== indeks + 1 || wersja.oczekiwanaRewizja !== indeks || polecenia.has(wersja.idZapisu) || indeks > 0 && kanonicznyZapis(wersja.przed) !== kanonicznyZapis(historia[indeks - 1].po)) throw new Error('Niespójna historia rewizji FZ.')
        polecenia.add(wersja.idZapisu)
        if ((czyRekordFz(tabela, wersja.po)) && (!wersja.idOperacjiZrodlowej || !wersja.skladOperacji?.length || !wersja.skladOperacji.some((element) => element.tabela === tabela && element.id === rekord.id))) throw new Error('Brak składu atomowej operacji w historii FZ.')
        const podpis = JSON.parse(wersja.podpisPolecenia) as { operacja?: string; oczekiwanaRewizja?: number }
        if (podpis.operacja !== wersja.operacja || podpis.oczekiwanaRewizja !== wersja.oczekiwanaRewizja) throw new Error('Niezgodny podpis rewizji finansowej.')
        schematyObrazuFz[tabela].parse({ ...wersja.po, id: rekord.id, createdAt: rekord.createdAt, updatedAt: wersja.znacznikCzasu, rewizja: wersja.rewizja, historiaWersji: [wersja] })
        if (wersja.skladOperacji) for (const czlonek of wersja.skladOperacji) {
          if (!(TABELE_OBRAZU_FZ as readonly string[]).includes(czlonek.tabela) || !obraz[czlonek.tabela as TabelaFz].some((element) => element.id === czlonek.id && element.historiaWersji?.some((slad) => slad.idZapisu === wersja.idZapisu && slad.idOperacjiZrodlowej === wersja.idOperacjiZrodlowej && kanonicznyZapis(slad.skladOperacji) === kanonicznyZapis(wersja.skladOperacji)))) throw new Error('Niekompletna grupa operacji finansowej.')
        }
      }
      if (kanonicznyZapis(historia.at(-1)!.po) !== kanonicznyZapis(stanFinansowy(rekord))) throw new Error('Rekord różni się od ostatniej rewizji.')
      const dane = rekord as Record<string, unknown>
      const powiazanie = tabela === 'operacjeKas' ? dane.powiazaniePuli as Record<string, unknown> : dane
      if (powiazanie?.idOperacjiZrodlowej && powiazanie.rolaZapisu) {
        const klucz = `${powiazanie.idOperacjiZrodlowej}:${powiazanie.rolaZapisu}`
        if (role.has(klucz)) throw new Error('Podwójna rola zapisu tej samej operacji.')
        role.add(klucz)
      }
      if (tabela === 'zakupyPul' || tabela === 'sprzedazePul') {
        const elementy = tabela === 'zakupyPul' ? [...(rekord as ZakupPuli).partie, ...(rekord as ZakupPuli).kosztyDodatkowe, ...(rekord as ZakupPuli).korekty] : [...(rekord as SprzedazPuli).pozycje, ...(rekord as SprzedazPuli).korekty]
        for (const element of elementy) { if (osadzone.has(element.id)) throw new Error('Powtórzone ID elementu osadzonego.'); osadzone.add(element.id) }
      }
    }
  }
  for (const pula of obraz.wspolneKasy.filter((kasa) => kasa.pula)) {
    normalizujKwote('0', pula.waluta)
    obliczMagazynPuli(obraz, pula.id, '9999-12-31')
  }
  for (const zakup of obraz.zakupyPul) {
    const pula = wymagaj(obraz.wspolneKasy, zakup.pulaId, !zakup.usunietoAt)
    if (pula.pula?.rodzaj !== 'zakupowa' || pula.waluta !== zakup.waluta) throw new Error('Zakup wymaga Puli zakupowej tej samej waluty.')
    for (const koszt of zakup.kosztyDodatkowe) {
      if (sumaGroszy(koszt.alokacja.map((pozycja) => pozycja.kwotaGrosze)) !== koszt.kwotaGrosze || new Set(koszt.alokacja.map((pozycja) => pozycja.partiaId)).size !== koszt.alokacja.length || koszt.alokacja.some((pozycja) => !zakup.partie.some((partia) => partia.id === pozycja.partiaId))) throw new Error('Niepoprawna alokacja kosztu.')
    }
    for (const korekta of zakup.korekty) for (const pozycja of korekta.pozycje) if (korekta.dataOperacji < zakup.dataZakupu || !zakup.partie.some((partia) => partia.id === pozycja.partiaId)) throw new Error('Korekta zakupu wskazuje obcą partię lub poprzedza zakup.')
    const kosztPierwotny = sumaGroszy([...zakup.partie.map((partia) => partia.kosztTowaruGrosze), ...zakup.kosztyDodatkowe.map((koszt) => koszt.kwotaGrosze)])
    const zaplacono = sumaGroszy(obraz.operacjeKas.filter((operacja) => operacja.powiazaniePuli?.zakupId === zakup.id && operacja.powiazaniePuli.rodzaj === 'zakup' && operacja.powiazaniePuli.idOperacjiZrodlowej === zakup.idOperacjiZrodlowej && (zakup.usunietoAt || !operacja.usunietoAt)).map((operacja) => operacja.typ === 'wydatek' ? operacja.kwotaGrosze : -operacja.kwotaGrosze))
    if (!zakup.usunietoAt && zaplacono !== kosztPierwotny) throw new Error('Opłacony zakup wymaga rzeczywistego rozchodu gotówki w tej samej operacji.')
  }
  for (const operacja of obraz.operacjeKas) {
    const pula = obraz.wspolneKasy.find((element) => element.id === operacja.kasaId)
    if (!pula?.pula && !operacja.powiazaniePuli) continue
    wymagaj(obraz.wspolneKasy, operacja.kasaId, !operacja.usunietoAt)
    walidujOperacjeKasy(operacja)
    if (!pula?.pula || operacja.waluta !== pula.waluta) throw new Error('Operacja Puli ma błędnego rodzica lub walutę.')
    const relacja = operacja.powiazaniePuli
    if (relacja && (['wplata', 'zaplataSprzedazy', 'zwrotDostawcy'].includes(relacja.rodzaj) && operacja.typ !== 'wplyw' || ['zakup', 'koszt', 'zwrotKlientowi'].includes(relacja.rodzaj) && operacja.typ !== 'wydatek' || relacja.rodzaj === 'korekta' && operacja.typ !== 'korekta')) throw new Error('Rodzaj operacji Puli jest niezgodny z kierunkiem gotówki.')
    if (relacja?.zakupId && wymagaj(obraz.zakupyPul, relacja.zakupId, !operacja.usunietoAt).pulaId !== pula.id || relacja?.sprzedazId && wymagaj(obraz.sprzedazePul, relacja.sprzedazId, !operacja.usunietoAt).pulaId !== pula.id) throw new Error('Operacja wskazuje źródło w innej Puli.')
    if (relacja?.sprzedazId) {
      const sprzedaz = wymagaj(obraz.sprzedazePul, relacja.sprzedazId, !operacja.usunietoAt)
      if (relacja.rodzaj === 'zaplataSprzedazy' && sprzedaz.operacjaPierwszejZaplatyId !== operacja.id || relacja.rodzaj === 'zwrotKlientowi' && sprzedaz.zobowiazanieId) throw new Error('Płatność sprzedaży ma już kanoniczne źródło w zobowiązaniu.')
    }
  }
  for (const dlug of obraz.zobowiazania) {
    wymagaj(obraz.osobyFinansowe, dlug.osobaId, !dlug.usunietoAt)
    if (dlug.zrodlo?.rodzaj === 'sprzedaz_puli') {
      const sprzedaz = wymagaj(obraz.sprzedazePul, dlug.zrodlo.id, !dlug.usunietoAt)
      if (sprzedaz.zobowiazanieId !== dlug.id || sprzedaz.pulaId !== dlug.zrodlo.pulaId || sprzedaz.kupujacyId !== dlug.osobaId || sprzedaz.waluta !== dlug.waluta) throw new Error('Niespójne źródło zobowiązania sprzedaży.')
    }
    obliczZobowiazanie(dlug, obraz.operacjeZobowiazan, '9999-12-31')
  }
  for (const operacja of obraz.operacjeZobowiazan) {
    const dlug = wymagaj(obraz.zobowiazania, operacja.zobowiazanieId, !operacja.usunietoAt)
    if (operacja.dataOperacji < dlug.dataPowstania) throw new Error('Operacja poprzedza powstanie zobowiązania.')
    if (dlug.waluta !== operacja.waluta || operacja.pulaId !== dlug.zrodlo?.pulaId || operacja.sprzedazId !== (dlug.zrodlo?.rodzaj === 'sprzedaz_puli' ? dlug.zrodlo.id : undefined)) throw new Error('Operacja jest niezgodna ze źródłem zobowiązania.')
  }
  for (const sprzedaz of obraz.sprzedazePul) {
    const pula = wymagaj(obraz.wspolneKasy, sprzedaz.pulaId, !sprzedaz.usunietoAt)
    if (pula.pula?.rodzaj !== 'zakupowa' || pula.waluta !== sprzedaz.waluta) throw new Error('Sprzedaż wymaga zgodnej Puli zakupowej.')
    if (sprzedaz.kupujacyId) wymagaj(obraz.osobyFinansowe, sprzedaz.kupujacyId, !sprzedaz.usunietoAt)
    for (const pozycja of sprzedaz.pozycje) {
      const zakup = wymagaj(obraz.zakupyPul, pozycja.zakupId, !sprzedaz.usunietoAt)
      if (zakup.pulaId !== sprzedaz.pulaId || !zakup.partie.some((partia) => partia.id === pozycja.partiaId)) throw new Error('Sprzedaż wskazuje obcą partię.')
    }
    for (const korekta of sprzedaz.korekty) for (const pozycja of korekta.pozycje) {
      if (!obraz.zakupyPul.some((zakup) => zakup.pulaId === sprzedaz.pulaId && zakup.partie.some((partia) => partia.id === pozycja.partiaId)) || pozycja.pozycjaId && !sprzedaz.pozycje.some((oryginalna) => oryginalna.id === pozycja.pozycjaId)) throw new Error('Korekta sprzedaży wskazuje obcą partię lub pozycję.')
    }
    const zaplata = sprzedaz.operacjaPierwszejZaplatyId ? wymagaj(obraz.operacjeKas, sprzedaz.operacjaPierwszejZaplatyId, !sprzedaz.usunietoAt) : undefined
    if (zaplata && (zaplata.powiazaniePuli?.sprzedazId !== sprzedaz.id || zaplata.powiazaniePuli.rolaZapisu !== 'pierwsza_zaplata' || zaplata.powiazaniePuli.rodzaj !== 'zaplataSprzedazy' || zaplata.typ !== 'wplyw')) throw new Error('Błędna pierwsza zapłata sprzedaży.')
    const cena = sumaGroszy(sprzedaz.pozycje.map((pozycja) => pozycja.cenaCalkowitaGrosze))
    const roznica = sumaGroszy([cena, -(zaplata?.kwotaGrosze ?? 0)])
    if (sprzedaz.zobowiazanieId) {
      const dlug = wymagaj(obraz.zobowiazania, sprzedaz.zobowiazanieId, !sprzedaz.usunietoAt)
      if (dlug.zrodlo?.id !== sprzedaz.id) throw new Error('Obcy dług sprzedaży.')
      if (!sprzedaz.korekty.length && (dlug.kwotaPoczatkowaGrosze !== Math.abs(roznica) || dlug.kierunek !== (roznica > 0 ? 'do_mnie' : 'ode_mnie'))) throw new Error('Początkowy dług nie odpowiada pierwszej wpłacie.')
      const korektyCeny = sumaGroszy(sprzedaz.korekty.filter((korekta) => !korekta.usunietoAt).flatMap((korekta) => korekta.pozycje.map((pozycja) => pozycja.zmianaCenyGrosze ?? 0)))
      const korektyDlugu = sumaGroszy(obraz.operacjeZobowiazan.filter((operacja) => operacja.zobowiazanieId === dlug.id && operacja.rodzaj === 'korekta_kwoty' && !operacja.usunietoAt).map((operacja) => operacja.kwotaGrosze))
      if (sumaGroszy([dlug.kwotaPoczatkowaGrosze, korektyDlugu]) * (dlug.kierunek === 'do_mnie' ? 1 : -1) !== sumaGroszy([roznica, korektyCeny])) throw new Error('Korekta ceny i należności musi stanowić spójną grupę.')
    } else if (roznica !== 0) throw new Error('Sprzedaż wymaga powiązanego zobowiązania.')
  }
}
