import { baza } from '../data/BazaOgarniacza'
import { noweId } from '../domain/fabryki'
import type { EncjaBazowa, ModulHistorii, NazwaTabeli, OperacjaHistorii, WpisHistoriiZmian } from '../domain/typy'

const konfiguracjaHistorii: Partial<Record<NazwaTabeli, {
  modul: ModulHistorii
  pola: readonly string[]
}>> = {
  zadania: { modul: 'zadania', pola: ['tytul', 'status', 'priorytet', 'termin', 'dataStartu', 'dataElementu', 'godzinaElementu', 'szacowanyCzasMin', 'usunietoAt'] },
  leki: { modul: 'leki', pola: ['nazwa', 'dawkaInstrukcja', 'godziny', 'aktywny', 'usunietoAt'] },
  dziennikLekow: { modul: 'leki', pola: ['lekId', 'data', 'planowanaGodzina', 'status', 'reakcjaAt', 'odroczoneDo', 'usunietoAt'] },
  wizyty: { modul: 'wizyty', pola: ['nazwa', 'status', 'data', 'godzina', 'terminGraniczny', 'miejsce', 'lekarzPlacowka', 'usunietoAt'] },
  rachunki: { modul: 'finanse', pola: ['nazwa', 'kwota', 'termin', 'status', 'usunietoAt'] },
  platnosciRachunkow: { modul: 'finanse', pola: ['rachunekId', 'kwota', 'zaplaconoAt', 'usunietoAt'] },
  wydatki: { modul: 'finanse', pola: ['kwota', 'data', 'kategoria', 'opis', 'usunietoAt'] },
  budzety: { modul: 'finanse', pola: ['nazwa', 'kategoria', 'okres', 'limit', 'usunietoAt'] },
  pojazdy: { modul: 'samochod', pola: ['nazwa', 'marka', 'model', 'rok', 'numerRejestracyjny', 'vin', 'przebieg', 'historiaPrzebiegu', 'historiaSerwisowa', 'ocDo', 'ubezpieczyciel', 'numerPolisy', 'przegladDo', 'wymianaOlejuDo', 'wymianaOlejuPrzebieg', 'planowanySerwisData', 'planowanySerwisGodzina', 'usunietoAt'] },
}

const niedozwolonyKlucz = /^(access_?token|refresh_?token|token|secret|sekret|password|haslo|session|sesja|credentials|daneLogowania)$/i

function bezpiecznaWartosc(wartosc: unknown): unknown {
  if (wartosc instanceof Blob) return undefined
  if (Array.isArray(wartosc)) return wartosc.map(bezpiecznaWartosc).filter((element) => element !== undefined)
  if (wartosc && typeof wartosc === 'object') {
    return Object.fromEntries(
      Object.entries(wartosc)
        .filter(([klucz]) => !niedozwolonyKlucz.test(klucz))
        .map(([klucz, element]) => [klucz, bezpiecznaWartosc(element)])
        .filter(([, element]) => element !== undefined),
    )
  }
  return wartosc
}

function wybranePola(encja: EncjaBazowa | undefined, pola: readonly string[]): Record<string, unknown> {
  if (!encja) return {}
  const rekord = encja as unknown as Record<string, unknown>
  return Object.fromEntries(
    pola
      .filter((pole) => rekord[pole] !== undefined && !niedozwolonyKlucz.test(pole))
      .map((pole) => [pole, bezpiecznaWartosc(rekord[pole])])
      .filter(([, wartosc]) => wartosc !== undefined),
  )
}

function wartosciSaRowne(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function czyHistoriaWlaczona(nazwaTabeli: NazwaTabeli): boolean {
  return Boolean(konfiguracjaHistorii[nazwaTabeli])
}

export function zbudujWpisHistorii(
  nazwaTabeli: NazwaTabeli,
  przed: EncjaBazowa | undefined,
  po: EncjaBazowa | undefined,
  operacja: OperacjaHistorii,
  znacznikCzasu: string,
): WpisHistoriiZmian | undefined {
  const konfiguracja = konfiguracjaHistorii[nazwaTabeli]
  const encja = po ?? przed
  if (!konfiguracja || !encja) return undefined

  const stanPrzed = wybranePola(przed, konfiguracja.pola)
  const stanPo = wybranePola(po, konfiguracja.pola)
  const zmienionePola = operacja === 'utworzenie'
    ? Object.keys(stanPo)
    : [...new Set([...Object.keys(stanPrzed), ...Object.keys(stanPo)])]
      .filter((pole) => !wartosciSaRowne(stanPrzed[pole], stanPo[pole]))

  if (zmienionePola.length === 0) return undefined
  const ogranicz = (stan: Record<string, unknown>) => Object.fromEntries(
    zmienionePola.filter((pole) => stan[pole] !== undefined).map((pole) => [pole, stan[pole]]),
  )
  const metadane = { id: noweId(), createdAt: znacznikCzasu, updatedAt: znacznikCzasu }
  return {
    ...metadane,
    modul: konfiguracja.modul,
    typEncji: nazwaTabeli,
    encjaId: encja.id,
    operacja,
    znacznikCzasu,
    zmienionePola,
    ...(Object.keys(ogranicz(stanPrzed)).length > 0 ? { przed: ogranicz(stanPrzed) } : {}),
    ...(Object.keys(ogranicz(stanPo)).length > 0 ? { po: ogranicz(stanPo) } : {}),
  }
}

export async function pobierzNajnowszaHistorie(limit = 50): Promise<WpisHistoriiZmian[]> {
  const bezpiecznyLimit = Math.min(200, Math.max(1, Math.trunc(limit)))
  return baza.tabela('historiaZmian').orderBy('znacznikCzasu').reverse().limit(bezpiecznyLimit).toArray()
}
