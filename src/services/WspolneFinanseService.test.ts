import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import { baza, BazaOgarniacza, ustawBazePrzedUruchomieniem } from '../data/BazaOgarniacza'
import { pobierzRepozytorium } from '../data/Repozytorium'
import { RejestrProfili, aktywujProfil, otworzBazeProfilu, zarejestrujProfilSesji, zamknijKontekstProfilu } from '../data/ProfileLokalne'
import { czyTabelaSynchronizowana, dodajDoKolejkiSynchronizacji, pobierzKolejkeSynchronizacji } from '../data/KolejkaSynchronizacji'
import { RepozytoriumZdalneInMemory } from '../data/RepozytoriumZdalneInMemory'
import { SyncEngine, nazwyTabelSynchronizowanych } from './SyncEngine'
import { ustawBiezacyDostep, TABELE_FINANSOW_WSPOLNYCH } from './UprawnieniaService'
import { pobierzNajnowszaHistorie } from './HistoriaZmianService'
import { pobierzKonfiguracjeRuntime } from './RuntimeConfigService'
import type { KontoUzytkownika } from './KontaService'
import { utworzBackup, przygotujBackupDoPrzywracania, przywrocBackup, obliczChecksum, type OgarniaczBackup } from './BackupService'
import { KonfliktZapisuFinansowego, type PolecenieZapisuFinansowego } from './ZapisFinansowWspolnych'
import { utworzKase, listaKas, pobierzKase, edytujKase, archiwizujKase, przywrocKase, dodajOperacjeKasy, edytujOperacjeKasy, usunOperacjeKasy, przywrocOperacjeKasy, listaOperacjiKasy, pobierzSaldoKasy, type DaneWspolnejKasy, type DaneOperacjiKasy } from './WspolneKasyService'
import { utworzRozliczenie, dodajUczestnika, edytujNazweUczestnika, wylaczUczestnika, dodajWydatekGrupowy, edytujWydatekGrupowy, usunWydatekGrupowy, przywrocWydatekGrupowy, dodajZwrot, edytujZwrot, usunZwrot, przywrocZwrot, pobierzBilansRozliczenia, pobierzOperacjeRozliczenia, listaRozliczen, type DaneRozliczenia, type DaneWydatkuGrupowego, type DaneZwrotuRozliczenia } from './RozliczeniaService'

const polecenie = (oczekiwanaRewizja = 0): PolecenieZapisuFinansowego => ({ idZapisu: crypto.randomUUID(), oczekiwanaRewizja })
const kasa: DaneWspolnejKasy = { nazwa: 'Kasa testowa', opis: '', ikona: '', kolor: '', waluta: 'PLN', saldoPoczatkoweGrosze: 0, status: 'aktywna' }
const operacja = (kwotaGrosze = 23500, typ: DaneOperacjiKasy['typ'] = 'wplyw'): DaneOperacjiKasy => ({ kasaId: 'k', typ, kwotaGrosze, waluta: 'PLN', dataOperacji: '2026-10-28', kategoria: '', zrodlo: '', opis: 'Test syntetyczny' })
const grupa: DaneRozliczenia = { nazwa: 'Grupa testowa', opis: '', waluta: 'PLN', uczestnicy: [{ id: 'a', nazwa: 'Ala' }, { id: 'b', nazwa: 'Bartek' }], domyslnyPodzial: 'po_rowno', etap: 'aktywne', dataRozpoczecia: '2026-10-28' }
const wydatek = (): DaneWydatkuGrupowego => ({ rozliczenieId: 'r', nazwa: 'Zakup', opis: '', waluta: 'PLN', dataOperacji: '2026-10-28', kwotaGrosze: 10000, finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 10000 }], parametryPodzialu: { metoda: 'po_rowno', uczestnicyIds: ['a', 'b'] } })
const zwrot = (): DaneZwrotuRozliczenia => ({ rozliczenieId: 'r', odUczestnikaId: 'b', doUczestnikaId: 'a', kwotaGrosze: 3000, waluta: 'PLN', dataOperacji: '2026-10-28', opis: 'Rzeczywisty przelew' })

beforeEach(async () => {
  localStorage.clear()
  ustawBazePrzedUruchomieniem(new BazaOgarniacza('test-f73-' + crypto.randomUUID()))
  await baza.open()
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  await baza.delete()
})

describe('bezpieczny zapis wspólnych kas', () => {
  it('tworzy kasę i wylicza 147,50 zł oraz korektę -12,40 zł bez osobnego salda', async () => {
    const zapisana = await utworzKase('k', kasa, polecenie())
    expect(zapisana.rewizja).toBe(1)
    expect(await listaKas()).toHaveLength(1)
    await dodajOperacjeKasy('wplyw', operacja(), polecenie())
    await dodajOperacjeKasy('wydatek', operacja(8750, 'wydatek'), polecenie())
    expect(await pobierzSaldoKasy('k')).toBe(14750)
    await dodajOperacjeKasy('korekta', operacja(-1240, 'korekta'), polecenie())
    expect(await pobierzSaldoKasy('k')).toBe(13510)
    expect(await pobierzKase('k')).not.toHaveProperty('saldoGrosze')
    await dodajOperacjeKasy('duzy-wydatek', operacja(20000, 'wydatek'), polecenie())
    expect(await pobierzSaldoKasy('k')).toBe(-6490)
  })

  it('deduplikuje równoczesne ponowienia i rozpoznaje inne dane tego samego ID', async () => {
    await utworzKase('k', kasa, polecenie())
    const zapis = polecenie()
    const wyniki = await Promise.all(Array.from({ length: 5 }, () => dodajOperacjeKasy('o', operacja(), zapis)))
    expect(wyniki.every((wynik) => wynik.rewizja === 1)).toBe(true)
    expect(await listaOperacjiKasy('k')).toHaveLength(1)
    expect(await baza.tabela('historiaZmian').count()).toBe(2)
    await expect(dodajOperacjeKasy('o', operacja(100), zapis)).rejects.toBeInstanceOf(KonfliktZapisuFinansowego)
    await expect(dodajOperacjeKasy('o', operacja(100), polecenie())).rejects.toBeInstanceOf(KonfliktZapisuFinansowego)
    const inneProby = await Promise.allSettled([dodajOperacjeKasy('inny', operacja(100), polecenie()), dodajOperacjeKasy('inny', operacja(200), polecenie())])
    expect(inneProby.filter((wynik) => wynik.status === 'fulfilled')).toHaveLength(1)
  })

  it('chroni nieaktualne edycje, a identyczny zapis nie zmienia rewizji', async () => {
    await utworzKase('k', kasa, polecenie())
    const utworzenie = polecenie()
    await dodajOperacjeKasy('o', operacja(), utworzenie)
    const edycja = polecenie(1)
    const zapisana = await edytujOperacjeKasy('o', operacja(100), edycja)
    expect(zapisana.rewizja).toBe(2)
    expect(await edytujOperacjeKasy('o', operacja(100), edycja)).toEqual(zapisana)
    expect((await edytujOperacjeKasy('o', operacja(100), polecenie(2))).rewizja).toBe(2)
    await expect(edytujOperacjeKasy('o', operacja(101), polecenie(1))).rejects.toBeInstanceOf(KonfliktZapisuFinansowego)
    // Opóźnione ponowienie dawnego polecenia nie cofa późniejszej edycji.
    expect((await dodajOperacjeKasy('o', operacja(), utworzenie)).kwotaGrosze).toBe(100)
    expect(await pobierzSaldoKasy('k')).toBe(100)
  })

  it('usuwa i przywraca z kompletną, płaską historią', async () => {
    await utworzKase('k', kasa, polecenie())
    await dodajOperacjeKasy('o', operacja(), polecenie())
    await edytujOperacjeKasy('o', operacja(12000), polecenie(1))
    const usuniecie = polecenie(2)
    const usunieta = await usunOperacjeKasy('o', usuniecie)
    expect(await usunOperacjeKasy('o', usuniecie)).toEqual(usunieta)
    expect(await pobierzSaldoKasy('k')).toBe(0)
    expect(await listaOperacjiKasy('k')).toHaveLength(0)
    expect(await listaOperacjiKasy('k', true)).toHaveLength(1)
    const przywrocona = await przywrocOperacjeKasy('o', polecenie(3))
    expect(await pobierzSaldoKasy('k')).toBe(12000)
    expect(przywrocona.rewizja).toBe(4)
    expect(przywrocona.historiaWersji?.map(({ operacja }) => operacja)).toEqual(['utworzenie', 'aktualizacja', 'usuniecie', 'przywrocenie'])
    expect(przywrocona.historiaWersji?.[1].przed?.kwotaGrosze).toBe(23500)
    expect(JSON.stringify(przywrocona.historiaWersji)).not.toMatch(/historiaWersji|Blob|credentials/)
    expect((await pobierzNajnowszaHistorie()).filter((wpis) => wpis.encjaId === 'o')).toHaveLength(4)
  })

  it('atomowo wycofuje zapis przy błędzie historii i pozwala ponowić to samo UUID', async () => {
    await utworzKase('k', kasa, polecenie())
    const zapis = polecenie()
    vi.spyOn(baza.tabela('historiaZmian'), 'add').mockRejectedValueOnce(new Error('Awaria zapisu historii'))
    await expect(dodajOperacjeKasy('o', operacja(), zapis)).rejects.toThrow('Awaria')
    expect(await listaOperacjiKasy('k')).toEqual([])
    expect(await baza.tabela('historiaZmian').count()).toBe(1)
    expect((await dodajOperacjeKasy('o', operacja(), zapis)).rewizja).toBe(1)
  })

  it('rozstrzyga równoczesne edycje i blokuje nieaktualne usunięcie oraz przywrócenie', async () => {
    await utworzKase('k', kasa, polecenie())
    await dodajOperacjeKasy('o', operacja(), polecenie())
    const proby = await Promise.allSettled([edytujOperacjeKasy('o', operacja(100), polecenie(1)), edytujOperacjeKasy('o', operacja(200), polecenie(1))])
    expect(proby.filter((wynik) => wynik.status === 'fulfilled')).toHaveLength(1)
    await expect(usunOperacjeKasy('o', polecenie(1))).rejects.toBeInstanceOf(KonfliktZapisuFinansowego)
    await usunOperacjeKasy('o', polecenie(2))
    await expect(przywrocOperacjeKasy('o', polecenie(2))).rejects.toBeInstanceOf(KonfliktZapisuFinansowego)
    await przywrocOperacjeKasy('o', polecenie(3))
    expect((await listaOperacjiKasy('k'))[0].rewizja).toBe(4)
  })

  it('zachowuje spójną walutę przy równoczesnej pierwszej operacji i zmianie ustawień', async () => {
    await utworzKase('k', kasa, polecenie())
    const proby = await Promise.allSettled([edytujKase('k', { ...kasa, waluta: 'EUR' }, polecenie(1)), dodajOperacjeKasy('o', operacja(), polecenie())])
    expect(proby.filter((wynik) => wynik.status === 'fulfilled')).toHaveLength(1)
    const zapisana = (await pobierzKase('k'))!
    expect((await listaOperacjiKasy('k')).every((operacja) => operacja.waluta === zapisana.waluta)).toBe(true)
  })

  it('zapisuje poprzedni stan rekordu F7.2A bez zmiany schematu bazy', async () => {
    await baza.tabela('wspolneKasy').put({ ...kasa, id: 'k', createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z' })
    const zmieniona = await edytujKase('k', { ...kasa, nazwa: 'Zmieniona' }, polecenie())
    expect(zmieniona.rewizja).toBe(1)
    expect(zmieniona.historiaWersji?.[0].przed?.nazwa).toBe(kasa.nazwa)
    await expect(przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup(['wspolneKasy'])))).resolves.toHaveProperty('payload')
    expect(baza.verno).toBe(20)
  })

  it('edytuje ustawienia, blokuje walutę po operacji, archiwizuje i przywraca kasę', async () => {
    await utworzKase('k', kasa, polecenie())
    await edytujKase('k', { ...kasa, nazwa: 'Nowa nazwa', waluta: 'EUR' }, polecenie(1))
    await edytujKase('k', kasa, polecenie(2))
    await dodajOperacjeKasy('o', operacja(), polecenie())
    await usunOperacjeKasy('o', polecenie(1))
    await expect(edytujKase('k', { ...kasa, waluta: 'EUR' }, polecenie(3))).rejects.toThrow('waluty')
    await archiwizujKase('k', polecenie(3))
    await expect(dodajOperacjeKasy('x', operacja(), polecenie())).rejects.toThrow('zarchiwizowana')
    await expect(przywrocOperacjeKasy('o', polecenie(2))).rejects.toThrow('zarchiwizowana')
    await przywrocKase('k', polecenie(4))
    await przywrocOperacjeKasy('o', polecenie(2))
    expect(await pobierzSaldoKasy('k')).toBe(23500)
  })

  it.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 0, -100])('odrzuca nieprawidłowy wpływ %s bez częściowego zapisu', async (kwota) => {
    await utworzKase('k', kasa, polecenie())
    await expect(dodajOperacjeKasy('o', operacja(kwota), polecenie())).rejects.toThrow()
    expect(await listaOperacjiKasy('k')).toEqual([])
    expect(await baza.tabela('historiaZmian').count()).toBe(1)
  })

  it('odrzuca brak kasy, inną walutę, przepełnienie oraz pola spoza kontraktu', async () => {
    await expect(dodajOperacjeKasy('o', operacja(), polecenie())).rejects.toThrow('nie istnieje')
    await expect(utworzKase('zla', { ...kasa, waluta: 'XYZ' }, polecenie())).rejects.toThrow('walutę')
    await utworzKase('k', kasa, polecenie())
    await expect(dodajOperacjeKasy('o', { ...operacja(), waluta: 'EUR' }, polecenie())).rejects.toThrow('walutę')
    await expect(dodajOperacjeKasy('o', { ...operacja(), token: 'test' } as DaneOperacjiKasy, polecenie())).rejects.toThrow()
    await dodajOperacjeKasy('max', operacja(Number.MAX_SAFE_INTEGER), polecenie())
    await expect(dodajOperacjeKasy('nadmiar', operacja(1), polecenie())).rejects.toThrow('bezpieczny zakres')
    expect(await listaOperacjiKasy('k')).toHaveLength(1)
  })
})

describe('zapis rozliczeń z silnikiem F7.1', () => {
  it('dodaje osoby bez konta, edytuje nazwy, zachowuje historyczny podział i wyłącza osoby', async () => {
    await utworzRozliczenie('r', grupa, polecenie())
    const pierwszy = await dodajWydatekGrupowy('w', wydatek(), polecenie())
    const dodanie = polecenie(1)
    await dodajUczestnika('r', { id: 'c', nazwa: 'Celina' }, dodanie)
    await dodajUczestnika('r', { id: 'c', nazwa: 'Celina' }, dodanie)
    await edytujNazweUczestnika('r', 'a', 'Alicja', polecenie(2))
    await wylaczUczestnika('r', 'b', polecenie(3))
    expect((await listaRozliczen())[0].uczestnicy).toHaveLength(3)
    expect((await pobierzOperacjeRozliczenia('r')).wydatki[0].podzialKosztu).toEqual(pierwszy.podzialKosztu)
    await expect(dodajWydatekGrupowy('nowy', wydatek(), polecenie())).rejects.toThrow('Nieaktywny')
    // Historia pozostaje edytowalna bez usuwania dawnych osób.
    await edytujWydatekGrupowy('w', { ...wydatek(), nazwa: 'Poprawiona' }, polecenie(1))
    await expect(dodajUczestnika('r', { id: 'a', nazwa: 'Duplikat' }, polecenie(4))).rejects.toThrow('Powtórzony')
  })

  it.each(['po_rowno', 'kwotowo', 'procentowo', 'udzialy'] as const)('zapisuje wielu finansujących i podział %s', async (metoda) => {
    await utworzRozliczenie('r', grupa, polecenie())
    const podzial = metoda === 'po_rowno' ? { metoda, uczestnicyIds: ['a', 'b'] }
      : metoda === 'kwotowo' ? { metoda, pozycje: [{ uczestnikId: 'a', kwotaGrosze: 5000 }, { uczestnikId: 'b', kwotaGrosze: 5000 }] }
        : metoda === 'procentowo' ? { metoda, pozycje: [{ uczestnikId: 'a', procentSetne: 5000 }, { uczestnikId: 'b', procentSetne: 5000 }] }
          : { metoda, pozycje: [{ uczestnikId: 'a', udzialy: 1 }, { uczestnikId: 'b', udzialy: 1 }] }
    const zapisany = await dodajWydatekGrupowy('w', { ...wydatek(), finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 7000 }, { uczestnikId: 'b', kwotaGrosze: 3000 }], parametryPodzialu: podzial }, polecenie())
    expect(zapisany.podzialKosztu).toEqual([{ uczestnikId: 'a', kwotaGrosze: 5000 }, { uczestnikId: 'b', kwotaGrosze: 5000 }])
    expect((await pobierzBilansRozliczenia('r')).propozycjePrzelewow).toEqual([{ odUczestnikaId: 'b', doUczestnikaId: 'a', kwotaGrosze: 2000 }])
  })

  it('odrzuca błędne sumy, powtórzone i nieistniejące osoby oraz inną walutę', async () => {
    await utworzRozliczenie('r', grupa, polecenie())
    const bledne: DaneWydatkuGrupowego[] = [
      { ...wydatek(), finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 9999 }] },
      { ...wydatek(), finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 5000 }, { uczestnikId: 'a', kwotaGrosze: 5000 }] },
      { ...wydatek(), finansujacy: [{ uczestnikId: 'brak', kwotaGrosze: 10000 }] },
      { ...wydatek(), parametryPodzialu: { metoda: 'kwotowo', pozycje: [{ uczestnikId: 'a', kwotaGrosze: 1 }] } },
      { ...wydatek(), parametryPodzialu: { metoda: 'procentowo', pozycje: [{ uczestnikId: 'a', procentSetne: 99 }] } },
      { ...wydatek(), parametryPodzialu: { metoda: 'po_rowno', uczestnicyIds: ['a', 'a'] } },
      { ...wydatek(), waluta: 'EUR' },
    ]
    for (const dane of bledne) await expect(dodajWydatekGrupowy('w', dane, polecenie())).rejects.toThrow()
    expect((await pobierzOperacjeRozliczenia('r')).wydatki).toEqual([])
    expect(await baza.tabela('historiaZmian').count()).toBe(1)
  })

  it('zachowuje rzeczywiste zwroty po edycji i usunięciu zakupu; edytuje, usuwa i przywraca zwrot', async () => {
    await utworzRozliczenie('r', grupa, polecenie())
    await dodajWydatekGrupowy('w', wydatek(), polecenie())
    const zapis = polecenie()
    await Promise.all([dodajZwrot('z', zwrot(), zapis), dodajZwrot('z', zwrot(), zapis)])
    expect((await pobierzBilansRozliczenia('r')).propozycjePrzelewow[0].kwotaGrosze).toBe(2000)
    await edytujWydatekGrupowy('w', { ...wydatek(), kwotaGrosze: 4000, finansujacy: [{ uczestnikId: 'a', kwotaGrosze: 4000 }] }, polecenie(1))
    expect((await pobierzBilansRozliczenia('r')).propozycjePrzelewow).toEqual([{ odUczestnikaId: 'a', doUczestnikaId: 'b', kwotaGrosze: 1000 }])
    await usunWydatekGrupowy('w', polecenie(2))
    expect((await pobierzBilansRozliczenia('r')).propozycjePrzelewow[0].kwotaGrosze).toBe(3000)
    await przywrocWydatekGrupowy('w', polecenie(3))
    await edytujZwrot('z', { ...zwrot(), kwotaGrosze: 1000 }, polecenie(1))
    await usunZwrot('z', polecenie(2))
    expect((await pobierzBilansRozliczenia('r')).propozycjePrzelewow[0].kwotaGrosze).toBe(2000)
    await przywrocZwrot('z', polecenie(3))
    expect((await pobierzOperacjeRozliczenia('r')).zwroty[0].rewizja).toBe(4)
    expect((await pobierzBilansRozliczenia('r')).sumaWydatkowGrosze).toBe(4000)
    await expect(dodajZwrot('zly', { ...zwrot(), doUczestnikaId: 'brak' }, polecenie())).rejects.toThrow()
    await expect(dodajZwrot('zly', { ...zwrot(), doUczestnikaId: 'b' }, polecenie())).rejects.toThrow()
  })

  it('wycofuje wydatek grupowy przy błędzie lokalnej historii', async () => {
    await utworzRozliczenie('r', grupa, polecenie())
    vi.spyOn(baza.tabela('historiaZmian'), 'add').mockRejectedValueOnce(new Error('Awaria historii'))
    await expect(dodajWydatekGrupowy('w', wydatek(), polecenie())).rejects.toThrow('Awaria')
    expect((await pobierzOperacjeRozliczenia('r')).wydatki).toEqual([])
    expect(await baza.tabela('historiaZmian').count()).toBe(1)
  })
})

describe('offline, kopie i granice dostępu F7.3', () => {
  it('działa bez sieci i zachowuje operacje po zamknięciu i ponownym otwarciu bazy', async () => {
    const siec = vi.fn(() => { throw new Error('Sieć jest niedostępna') })
    vi.stubGlobal('fetch', siec)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await utworzKase('k', kasa, polecenie())
    await dodajOperacjeKasy('o', operacja(), polecenie())
    await utworzRozliczenie('r', grupa, polecenie())
    await dodajWydatekGrupowy('w', wydatek(), polecenie())
    const nazwa = baza.name
    baza.close()
    ustawBazePrzedUruchomieniem(new BazaOgarniacza(nazwa))
    await baza.open()
    expect(await pobierzSaldoKasy('k')).toBe(23500)
    expect((await pobierzBilansRozliczenia('r')).sumaWydatkowGrosze).toBe(10000)
    expect(siec).not.toHaveBeenCalled()
  })

  it('nie dodaje ani nie wysyła nowych danych i znaczników usunięcia przez istniejący sync', async () => {
    await utworzKase('k', kasa, polecenie())
    await dodajOperacjeKasy('o', operacja(), polecenie())
    await usunOperacjeKasy('o', polecenie(1))
    await utworzRozliczenie('r', grupa, polecenie())
    await dodajWydatekGrupowy('w', wydatek(), polecenie())
    await dodajZwrot('z', zwrot(), polecenie())
    for (const tabela of TABELE_FINANSOW_WSPOLNYCH) {
      expect(czyTabelaSynchronizowana(tabela)).toBe(false)
      expect(nazwyTabelSynchronizowanych).not.toContain(tabela)
      for (const rekord of await baza.tabela(tabela).toArray()) await dodajDoKolejkiSynchronizacji(tabela, rekord)
    }
    expect(await pobierzKolejkeSynchronizacji()).toEqual([])
    const zdalne = new RepozytoriumZdalneInMemory()
    const wyslij = vi.spyOn(zdalne, 'wyslijZmiany')
    await new SyncEngine({ czyOnline: () => true }).synchronizuj(zdalne)
    expect(wyslij).not.toHaveBeenCalled()
  })

  it('eksportuje i przywraca rewizje, historię i idempotencję, a starsza kopia nie usuwa danych', async () => {
    await utworzKase('k', kasa, polecenie())
    const zapis = polecenie()
    await dodajOperacjeKasy('o', operacja(), zapis)
    await usunOperacjeKasy('o', polecenie(1))
    await utworzRozliczenie('r', grupa, polecenie())
    await dodajWydatekGrupowy('w', wydatek(), polecenie())
    await dodajZwrot('z', zwrot(), polecenie())
    const kopia = await przygotujBackupDoPrzywracania(JSON.stringify(await utworzBackup(['wspolneKasy', 'rozliczenia', 'historia'])))
    const przed = await baza.tabela('operacjeKas').get('o')
    await edytujZwrot('z', { ...zwrot(), kwotaGrosze: 1000 }, polecenie(1))
    await przywrocBackup(kopia)
    expect(await baza.tabela('operacjeKas').get('o')).toEqual(przed)
    expect((await dodajOperacjeKasy('o', operacja(), zapis)).rewizja).toBe(2)
    expect((await pobierzOperacjeRozliczenia('r')).zwroty[0].rewizja).toBe(1)
    const starsza = await utworzBackup(['finanse'])
    starsza.manifest.dexieSchemaVersion = 19
    await podpiszKopie(starsza)
    await przywrocBackup(await przygotujBackupDoPrzywracania(JSON.stringify(starsza)))
    expect(await baza.tabela('operacjeKas').get('o')).toEqual(przed)
  })

  it('odrzuca uszkodzone relacje, podziały i historię kopii przed jakimkolwiek zapisem', async () => {
    await utworzKase('k', kasa, polecenie())
    await dodajOperacjeKasy('o', operacja(), polecenie())
    await utworzRozliczenie('r', grupa, polecenie())
    await dodajWydatekGrupowy('w', wydatek(), polecenie())
    const kopia = await utworzBackup(['wspolneKasy', 'rozliczenia'])
    for (const uszkodz of [
      (k: OgarniaczBackup) => { k.payload.wspolneKasy!.operacjeKas[0].kasaId = 'brak' },
      (k: OgarniaczBackup) => { k.payload.rozliczenia!.wydatkiGrupowe[0].podzialKosztu = [] },
      (k: OgarniaczBackup) => { k.payload.wspolneKasy!.operacjeKas[0].historiaWersji = [] },
      (k: OgarniaczBackup) => { (k.payload.wspolneKasy!.operacjeKas[0].historiaWersji as Record<string, unknown>[])[0].token = 'syntetyczny-sekret' },
    ]) {
      const zla = structuredClone(kopia)
      uszkodz(zla)
      await podpiszKopie(zla)
      await expect(przywrocBackup(zla)).rejects.toMatchObject({ kod: 'MODEL_DANYCH' })
    }
    expect(await pobierzSaldoKasy('k')).toBe(23500)
    expect((await pobierzBilansRozliczenia('r')).sumaWydatkowGrosze).toBe(10000)
  })

  it('blokuje ogólne CRUD oraz lokalny podgląd Edytora z uprawnieniem do Finansów', async () => {
    await utworzKase('k', kasa, polecenie())
    for (const tabela of TABELE_FINANSOW_WSPOLNYCH) expect(() => pobierzRepozytorium(tabela)).toThrow('dedykowanego')
    ustawBiezacyDostep((modul) => modul === 'finanse')
    await expect(listaKas()).rejects.toThrow('Brak dostępu')
    await expect(dodajOperacjeKasy('o', operacja(), polecenie())).rejects.toThrow('Brak dostępu')
    expect(await pobierzNajnowszaHistorie()).toEqual([])
    expect(await pobierzRepozytorium('historiaZmian').lista()).toEqual([])
  })

  // Rzeczywiste bazy profili, a nie podmiana wyników kontroli uprawnień.
  it('izoluje właścicieli, odmawia Edytorowi z grantem oraz przerywa zapis po zmianie profilu', async () => {
    const lokalna = baza
    const poprzedniAdres = pobierzKonfiguracjeRuntime().syncApiUrl
    pobierzKonfiguracjeRuntime().syncApiUrl = 'https://finanse.example.test'
    const rejestr = new RejestrProfili('test-profile-f73-' + crypto.randomUUID())
    const konto = (id: string): KontoUzytkownika => ({ zalogowany: true, uzytkownikId: id, wlascicielId: id, email: id + '@example.test', rola: 'wlasciciel', granty: [], edytorzy: [] })
    const a = await zarejestrujProfilSesji('https://finanse.example.test', konto('a'), rejestr)
    const b = await zarejestrujProfilSesji('https://finanse.example.test', konto('b'), rejestr)
    const edytor = await zarejestrujProfilSesji('https://finanse.example.test', { ...konto('edytor'), wlascicielId: 'a', rola: 'edytor', granty: [{ id: 'grant', editorId: 'edytor', modul: 'finanse', odczyt: true, edycja: true, status: 'aktywne' }] }, rejestr)
    const bazy = await Promise.all([a, b, edytor].map(otworzBazeProfilu))
    try {
      ustawBazePrzedUruchomieniem(bazy[0]); await aktywujProfil(a, rejestr)
      const kasaA = await utworzKase('k', kasa, polecenie())
      await dodajOperacjeKasy('o', operacja(), polecenie())
      const kopiaA = await utworzBackup(['wspolneKasy', 'historia'])
      ustawBazePrzedUruchomieniem(bazy[1]); await aktywujProfil(b, rejestr)
      expect(await listaKas()).toEqual([])
      await expect(przywrocBackup(kopiaA)).rejects.toMatchObject({ kod: 'KONTEKST_PROFILU' })
      ustawBazePrzedUruchomieniem(bazy[2]); await aktywujProfil(edytor, rejestr)
      // Nawet syntetyczne rekordy w bazie Edytora nie mogą zostać odczytane.
      await baza.tabela('wspolneKasy').put(kasaA)
      for (const wywolaj of [() => listaKas(), () => pobierzKase('k'), () => listaRozliczen(), () => utworzKase('x', kasa, polecenie()), () => edytujKase('k', kasa, polecenie(1)), () => usunOperacjeKasy('o', polecenie(1)), () => przywrocOperacjeKasy('o', polecenie(1)), () => utworzRozliczenie('r', grupa, polecenie()), () => pobierzBilansRozliczenia('r'), () => utworzBackup(['wspolneKasy']), () => przywrocBackup(kopiaA)]) await expect(wywolaj()).rejects.toThrow()
      ustawBazePrzedUruchomieniem(bazy[0]); await baza.open(); await aktywujProfil(a, rejestr)
      const bledna = vi.spyOn(baza.tabela('historiaZmian'), 'add').mockImplementationOnce(() => {
        zamknijKontekstProfilu(bazy[0])
        return Dexie.Promise.reject(new Error('Profil zamknięty podczas zapisu'))
      })
      await expect(dodajOperacjeKasy('przerwana', operacja(), polecenie())).rejects.toThrow()
      bledna.mockRestore()
      await bazy[0].open()
      expect(await bazy[0].tabela('operacjeKas').get('przerwana')).toBeUndefined()
      await aktywujProfil(a, rejestr)
      expect(await pobierzSaldoKasy('k')).toBe(23500)
      // Niedopasowana baza jest odrzucana także przy poprawnej tożsamości.
      ustawBazePrzedUruchomieniem(bazy[1])
      await expect(listaKas()).rejects.toThrow('Brak dostępu')
    } finally {
      pobierzKonfiguracjeRuntime().syncApiUrl = poprzedniAdres
      for (const testowa of bazy) await testowa.delete()
      await lokalna.delete(); await rejestr.delete()
    }
  })
})

async function podpiszKopie(kopia: OgarniaczBackup): Promise<void> {
  const { checksum: _checksum, ...manifest } = kopia.manifest
  kopia.manifest.checksum = await obliczChecksum({ manifest, payload: kopia.payload })
}
